import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from "react";
import { useSearchParams, useParams, useNavigate, useLocation, Link } from "react-router-dom";
import {
  Grid2X2,
  List,
  SlidersHorizontal,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  X,
  ArrowUpDown,
  Check,
  Clock,
  TrendingUp,
  TrendingDown,
  ArrowDownAZ,
  Boxes,
  Trash2,
} from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Reveal from "@/components/ui/reveal";
import { catalogApi } from "@/lib/api";
import { getProductImage } from "@/lib/productImages";
import { useAppStore } from "@/store/appStore";
import { useCartStore } from "@/store/cartStore";
import {
  productName,
  productMinBoxPrice,
  productTotalStock,
  productGalleryUrls,
  variantCoverUrl,
  variantBoxPrice,
  variantPrice,
  variantLabel,
  availableBoxes,
  type Product,
  type ProductVariant,
  type Category,
  type Material,
  type Scent,
  type Shape,
} from "@/lib/catalog";
import { formatMoney, type Currency, type Lang } from "@/lib/format";
import StockIndicator from "@/components/shop/StockIndicator";
import NumberStepper from "@/components/shop/NumberStepper";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useCatalogRestore,
  useCatalogTracking,
  useProductCardRefs,
  type CatalogFilterState,
} from "@/features/catalog-restore";

type View = "grid" | "table";
type SortKey = "newest" | "price-asc" | "price-desc" | "name" | "stock";

const SORT_ITEMS: { key: SortKey; label: string; icon: ElementType }[] = [
  { key: "newest", label: "Сначала новинки", icon: Clock },
  { key: "price-asc", label: "Сначала дешевле", icon: TrendingUp },
  { key: "price-desc", label: "Сначала дороже", icon: TrendingDown },
  { key: "name", label: "По названию (А→Я)", icon: ArrowDownAZ },
  { key: "stock", label: "Больше на складе", icon: Boxes },
];
const SORT_LABEL: Record<SortKey, string> = Object.fromEntries(
  SORT_ITEMS.map((s) => [s.key, s.label]),
) as Record<SortKey, string>;

const PAGE_SIZE = 20;

/**
 * Produce a compact list of page numbers to render in the pagination bar,
 * inserting an "ellipsis" placeholder when the gap between shown pages is
 * greater than one. Always includes the first page, the last page, and the
 * window [current-1, current, current+1] so the user's context is preserved
 * without exploding the button count on very large catalogs.
 */
const getPageRange = (current: number, total: number): (number | "ellipsis")[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const unique = new Set<number>([1, total, current - 1, current, current + 1]);
  const pages = Array.from(unique)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const out: (number | "ellipsis")[] = [];
  let prev = 0;
  for (const p of pages) {
    if (prev && p - prev > 1) out.push("ellipsis");
    out.push(p);
    prev = p;
  }
  return out;
};

/**
 * Wrap the substring of `text` that matches `query` in a <mark> element so
 * it's visually emphasised inside the search-history dropdown. Case is
 * compared in lower-case but the original casing of `text` is preserved.
 */
const renderHighlighted = (text: string, query: string): ReactNode => {
  if (!query) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-primary/20 px-0.5 text-foreground">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
};

// ── Lightweight filter persistence (survives clearState) ──────────────
const FILTERS_KEY = "catalog_filters";

const readSavedFilters = (): Record<string, unknown> | null => {
  try {
    const raw = sessionStorage.getItem(FILTERS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch { return null; }
};

const writeSavedFilters = (f: Record<string, unknown>) => {
  try { sessionStorage.setItem(FILTERS_KEY, JSON.stringify(f)); } catch {}
};

const Catalog = () => {
  const { categorySlug } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const restore = useCatalogRestore(pathname);
  const cardRefs = useProductCardRefs();

  const [params, setParams] = useSearchParams();
  const { currency, lang } = useAppStore();
  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const setCartBoxes = useCartStore((s) => s.setBoxes);
  const removeFromCart = useCartStore((s) => s.remove);

  // Restore filters: prefer restore snapshot, then our lightweight
  // sessionStorage copy, then defaults.
  const saved = readSavedFilters();
  const initial = restore.initialFilters;
  const [view, setView] = useState<View>(() => (initial?.view ?? saved?.view as View) ?? "grid");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [onlyInStock, setOnlyInStock] = useState(() => initial?.onlyInStock ?? (saved?.onlyInStock as boolean | undefined) ?? true);
  const [colorIds, setColorIds] = useState<Set<string>>(() => new Set((initial?.colorIds) ?? []));
  const [materialIds, setMaterialIds] = useState<Set<string>>(() => new Set((initial?.materialIds) ?? []));
  const [scentIds, setScentIds] = useState<Set<string>>(() => new Set((initial?.scentIds) ?? []));
  const [shapeIds, setShapeIds] = useState<Set<string>>(() => new Set((initial?.shapeIds) ?? []));
  const [sort, setSort] = useState<SortKey>(() => (initial?.sort ?? saved?.sort as SortKey) ?? "newest");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [categoryIds, setCategoryIds] = useState<Set<string>>(() => new Set((initial?.categoryIds) ?? []));
  const [priceMin, setPriceMin] = useState(() => initial?.priceMin ?? "");
  const [priceMax, setPriceMax] = useState(() => initial?.priceMax ?? "");

  /*
    Live search: `searchInput` drives the filter instantly on every keystroke,
    so the catalog reacts without the user having to press Enter. The URL's
    `q` param is synced 250 ms after the user stops typing — this keeps the
    address bar shareable/bookmarkable without churning browser history on
    every character.
  */
  const [searchInput, setSearchInput] = useState(
    () => params.get("q") ?? initial?.search ?? "",
  );
  const search = searchInput.trim().toLowerCase();

  // Persist filters to a separate sessionStorage key so they survive
  // clearState() and are restored on next catalog visit.
  useEffect(() => {
    writeSavedFilters({
      view,
      sort,
      onlyInStock,
    });
  }, [view, sort, onlyInStock]);

  useEffect(() => {
    const trimmed = searchInput.trim();
    const current = params.get("q") ?? "";
    if (trimmed === current) return;
    const t = setTimeout(() => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (trimmed) next.set("q", trimmed);
          else next.delete("q");
          return next;
        },
        { replace: true },
      );
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput, params, setParams]);

  /*
    Custom, styled "recent searches" dropdown — the native browser autofill
    popup is suppressed via autoComplete="off" because it covers products and
    can't be styled. Instead we persist up to 8 recent queries to localStorage
    and render our own themed list (with per-item delete + match highlight +
    keyboard nav). Only queries of length ≥ 2 are remembered, and they are
    committed 600 ms after typing stops so we don't save every transient draft.
  */
  const SEARCH_HISTORY_KEY = "wc-catalog-search-history";
  const MAX_HISTORY = 8;
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((v): v is string => typeof v === "string").slice(0, MAX_HISTORY);
    } catch {
      return [];
    }
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Persist committed queries to localStorage after a short idle window.
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed.length < 2) return;
    const t = setTimeout(() => {
      setHistory((prev) => {
        const lower = trimmed.toLowerCase();
        const filtered = prev.filter((h) => h.toLowerCase() !== lower);
        const next = [trimmed, ...filtered].slice(0, MAX_HISTORY);
        try {
          localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
        } catch {
          /* ignore quota/security errors — history is a nice-to-have */
        }
        return next;
      });
    }, 600);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Close the dropdown when clicking outside the search box.
  useEffect(() => {
    if (!historyOpen) return;
    const onDown = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [historyOpen]);

  // Suggestions shown in the dropdown: either the full recent list (when the
  // input is empty) or only entries that match the current substring.
  const historySuggestions = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return history;
    return history.filter((h) => {
      const hl = h.toLowerCase();
      return hl.includes(q) && hl !== q;
    });
  }, [history, searchInput]);

  // Reset the active row whenever the visible list changes so keyboard nav
  // doesn't point to a stale index.
  useEffect(() => {
    setActiveIdx(-1);
  }, [historySuggestions.length, historyOpen]);

  const selectHistoryItem = (q: string) => {
    setSearchInput(q);
    setHistoryOpen(false);
  };

  const removeHistoryItem = (q: string) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h !== q);
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch {
      /* ignore */
    }
  };

  const [catQ, prodQ, matQ, scentQ, shapeQ] = useQueries({
    queries: [
      { queryKey: ["categories"], queryFn: () => catalogApi.listCategories() },
      { queryKey: ["products"], queryFn: () => catalogApi.listProducts() },
      { queryKey: ["attributes", "materials"], queryFn: () => catalogApi.listAttributes("materials") },
      { queryKey: ["attributes", "scents"], queryFn: () => catalogApi.listAttributes("scents") },
      { queryKey: ["attributes", "shapes"], queryFn: () => catalogApi.listAttributes("shapes") },
    ],
  });
  const categories: Category[] = catQ.data ?? [];
  const products: Product[] = prodQ.data ?? [];
  const materials: Material[] = matQ.data ?? [];
  const scents: Scent[] = scentQ.data ?? [];
  const shapes: Shape[] = shapeQ.data ?? [];
  const loading = catQ.isPending || prodQ.isPending;

  // Category tree
  const rootCategories = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id);

  // Auto-open the parent of the active category
  useEffect(() => {
    if (!categorySlug) return;
    const active = categories.find((c) => c.slug === categorySlug);
    if (active?.parent_id) {
      setOpenCats((s) => new Set(s).add(active.parent_id!));
    }
  }, [categorySlug, categories]);

  const activeCategoryAndDescendants = useMemo(() => {
    // Combine URL slug with manually picked categoryIds
    const seeds = new Set<string>(categoryIds);
    if (categorySlug) {
      const root = categories.find((c) => c.slug === categorySlug);
      if (root) seeds.add(root.id);
    }
    if (seeds.size === 0) return null;
    const ids = new Set<string>(seeds);
    const queue = Array.from(seeds);
    while (queue.length) {
      const id = queue.shift()!;
      categories.filter((c) => c.parent_id === id).forEach((c) => { ids.add(c.id); queue.push(c.id); });
    }
    return ids;
  }, [categorySlug, categoryIds, categories]);

  const toggleSet = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  };

  const filtered = useMemo(() => {
    const pMin = priceMin ? Number(priceMin) : null;
    const pMax = priceMax ? Number(priceMax) : null;
    const list = products
      .filter((p) => activeCategoryAndDescendants ? (p.category_id ? activeCategoryAndDescendants.has(p.category_id) : false) : true)
      .filter((p) =>
        search
          ? productName(p, lang).toLowerCase().includes(search) ||
            p.variants?.some((v) => v.sku.toLowerCase().includes(search))
          : true,
      )
      .filter((p) => (materialIds.size ? p.material_id && materialIds.has(p.material_id) : true))
      .filter((p) => (scentIds.size ? p.scent_id && scentIds.has(p.scent_id) : true))
      .filter((p) => (shapeIds.size ? p.shape_id && shapeIds.has(p.shape_id) : true))
      .map((p) => ({
        ...p,
        variants: (p.variants ?? []).filter((v) => {
          if (onlyInStock && availableBoxes(v) <= 0) return false;
          if (colorIds.size && !(v.color && colorIds.has(v.color))) return false;
          const box = variantBoxPrice(v, currency);
          if (pMin !== null && box < pMin) return false;
          if (pMax !== null && box > pMax) return false;
          return true;
        }),
      }))
      .filter((p) => (p.variants?.length ?? 0) > 0);

    const sorted = [...list];
    switch (sort) {
      case "price-asc": sorted.sort((a, b) => productMinBoxPrice(a, currency) - productMinBoxPrice(b, currency)); break;
      case "price-desc": sorted.sort((a, b) => productMinBoxPrice(b, currency) - productMinBoxPrice(a, currency)); break;
      case "name": sorted.sort((a, b) => productName(a, lang).localeCompare(productName(b, lang), "ru")); break;
      case "stock": sorted.sort((a, b) => productTotalStock(b) - productTotalStock(a)); break;
      case "newest":
      default:
        sorted.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    }
    return sorted;
  }, [products, activeCategoryAndDescendants, search, onlyInStock, colorIds, lang, materialIds, scentIds, shapeIds, sort, currency, priceMin, priceMax]);

  const allColors = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => p.variants?.forEach((v) => v.color && s.add(v.color)));
    return Array.from(s).sort();
  }, [products]);

  /*
    Pagination — each product may have multiple variants and every variant is
    rendered as its own card/row, so we paginate over the *flattened* list
    rather than the product list. `page` is plain local state (not URL) so
    that filter changes can cleanly reset to page 1 without racing the other
    URL-writing effects. The user's filter/sort/search state is already in the
    URL, which is what matters for sharing.
  */
  const flatFiltered = useMemo(
    () => filtered.flatMap((p) => (p.variants ?? []).map((v) => ({ p, v }))),
    [filtered],
  );
  const totalItems = flatFiltered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  // Pagination state — initialised from the restore snapshot so a returning
  // user lands on the same page they left.
  const [page, setPage] = useState(() => restore.initialPage);

  // Reset to page 1 whenever the active filter/search/sort set changes so the
  // user doesn't land on an empty page 5 after narrowing the catalog. The
  // first run is skipped — otherwise the snapshot-restored page would be
  // wiped on mount.
  const filterResetGuard = useRef(true);
  useEffect(() => {
    if (filterResetGuard.current) { filterResetGuard.current = false; return; }
    setPage(1);
  }, [
    search,
    categorySlug,
    onlyInStock,
    colorIds,
    priceMin,
    priceMax,
    materialIds,
    scentIds,
    shapeIds,
    sort,
  ]);

  // Clamp page if it ever exceeds the (new) total — e.g., results shrank.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedItems = useMemo(
    () => flatFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [flatFiltered, page],
  );

  // Variant ids visible on the current page — written into the snapshot so
  // we can detect CASE 3 (saved card filtered out) on the next return.
  const loadedVariantIds = useMemo(
    () => pagedItems.map(({ v }) => v.id),
    [pagedItems],
  );

  // Aggregated filter snapshot mirrored to storage by `useCatalogTracking`.
  // Memoised so the tracking effect only writes when something actually
  // changes (and not on every render).
  const filters = useMemo<CatalogFilterState>(
    () => ({
      search,
      categorySlug: categorySlug ?? null,
      categoryIds: Array.from(categoryIds),
      onlyInStock,
      colorIds: Array.from(colorIds),
      materialIds: Array.from(materialIds),
      scentIds: Array.from(scentIds),
      shapeIds: Array.from(shapeIds),
      priceMin,
      priceMax,
      sort,
      view,
    }),
    [
      search,
      categorySlug,
      categoryIds,
      onlyInStock,
      colorIds,
      materialIds,
      scentIds,
      shapeIds,
      priceMin,
      priceMax,
      sort,
      view,
    ],
  );

  // Tracking is gated on `restoreApplied` — until we've performed the
  // initial viewport restore, the tracker would otherwise overwrite the
  // snapshot with a fresh `scrollY=0` from the still-mounting page.
  const [restoreApplied, setRestoreApplied] = useState(false);
  const { trackProductClick } = useCatalogTracking({
    pathname,
    filters,
    page,
    loadedVariantIds,
    enabled: restoreApplied,
  });

  // Run the actual viewport restore after the catalog data has loaded and
  // product cards have been registered with `cardRefs`. We use
  // `useLayoutEffect` to fire before paint, then a double `rAF` + `setTimeout`
  // chain to wait until the browser has settled layout — this is necessary
  // for mobile Safari, which sometimes reports stale dimensions in the first
  // frame after a route swap.
  const restoreScheduled = useRef(false);
  useLayoutEffect(() => {
    if (loading || restoreScheduled.current) return;
    restoreScheduled.current = true;

    if (!restore.hasRestoreTarget) {
      setRestoreApplied(true);
      return;
    }

    let frame1 = 0;
    let frame2 = 0;
    let timer = 0;
    frame1 = window.requestAnimationFrame(() => {
      frame2 = window.requestAnimationFrame(() => {
        timer = window.setTimeout(() => {
          restore.applyRestore(cardRefs.getNode);
          restore.finalize();
          setRestoreApplied(true);
        }, 0);
      });
    });

    return () => {
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
      window.clearTimeout(timer);
    };
  }, [loading, restore, cardRefs.getNode]);

  const goToPage = (next: number) => {
    const clamped = Math.max(1, Math.min(totalPages, next));
    if (clamped === page) return;
    setPage(clamped);
    // Scroll near the top so the user actually sees the new page's first
    // cards; `smooth` avoids an abrupt jump. Fallback to instant if the
    // browser doesn't support scroll-behavior.
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }
  };

  // Indices used for the "X–Y из Z товаров" counter in the toolbar.
  const rangeStart = totalItems === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(totalItems, page * PAGE_SIZE);

  const handleAdd = (p: Product, v: ProductVariant, qty = 1) => {
    addItem({
      variantId: v.id,
      productId: p.id,
      sku: v.sku,
      productName: productName(p, lang),
      variantLabel: variantLabel(v),
      image: variantCoverUrl(p, v),
      piecesPerBox: v.pieces_per_box,
      priceRub: Number(v.price_per_piece_rub),
      priceUsd: Number(v.price_per_piece_usd),
      stockBoxes: availableBoxes(v),
      volumeDiscounts: (v.volume_discounts ?? []).map((vd) => ({
        min_boxes: vd.min_boxes,
        discount_percent: vd.discount_percent,
      })),
    }, qty);
    toast.success(`${v.sku} · ${qty} кор. в корзине`);
  };

  const activeFiltersCount =
    materialIds.size + scentIds.size + shapeIds.size + colorIds.size + categoryIds.size +
    (priceMin ? 1 : 0) + (priceMax ? 1 : 0);

  const clearAllFilters = () => {
    setMaterialIds(new Set());
    setScentIds(new Set());
    setShapeIds(new Set());
    setColorIds(new Set());
    setCategoryIds(new Set());
    setPriceMin("");
    setPriceMax("");
    if (categorySlug) navigate("/catalog", { replace: true });
  };

  return (
    <PublicLayout>
      <div className="border-b border-border bg-surface">
        <div className="container py-6">
          <div className="flex flex-wrap items-baseline gap-2 text-sm text-muted-foreground animate-in fade-in duration-300">
            <Link to="/" className="transition-colors hover:text-foreground">Главная</Link>
            <span>/</span>
            <Link to="/catalog" className="transition-colors hover:text-foreground">Каталог</Link>
            {categorySlug && (
              <>
                <span>/</span>
                <span className="text-foreground">
                  {categories.find((c) => c.slug === categorySlug)?.name_ru ?? categorySlug}
                </span>
              </>
            )}
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight animate-in fade-in duration-500">
            {categorySlug
              ? categories.find((c) => c.slug === categorySlug)?.name_ru ?? "Каталог"
              : "Каталог свечей"}
          </h1>
        </div>
      </div>

      <div className="container grid gap-6 py-6 sm:gap-8 sm:py-8 lg:grid-cols-[260px_1fr]">
        {/* Filters sidebar — hidden on mobile, visible on lg+ */}
        {loading ? (
          <aside className="hidden space-y-3 lg:block">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </aside>
        ) : (
        <aside className="hidden space-y-3 animate-in fade-in duration-500 lg:block">
          <div className="flex items-center justify-between">
            <h3 className="eyebrow flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Фильтры
              {activeFiltersCount > 0 && (
                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {activeFiltersCount}
                </span>
              )}
            </h3>
            {activeFiltersCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" /> Сбросить
              </button>
            )}
          </div>

          {/* "Только в наличии" — styled as a distinct toggle card */}
          <label
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg border bg-surface px-4 py-3 text-sm transition-all",
                onlyInStock
                  ? "border-primary/50 bg-primary/5 shadow-sm"
                  : "border-border hover:border-primary/30 hover:bg-accent/40",
              )}
            >
            <Checkbox
              checked={onlyInStock}
              onCheckedChange={(v) => setOnlyInStock(Boolean(v))}
              className="border-muted-foreground/40 data-[state=checked]:border-primary"
            />
            <span className="font-medium">Только в наличии</span>
          </label>

          {/* Category tree — multi-select via checkboxes */}
          <FilterCard title="Категория" defaultOpen count={categoryIds.size + (categorySlug ? 1 : 0)}>
              <ul className="space-y-0.5 text-sm">
                {rootCategories.map((c) => {
                  const subs = childrenOf(c.id);
                  const isOpen = openCats.has(c.id);
                  const checked = categoryIds.has(c.id) || categorySlug === c.slug;
                  return (
                    <li key={c.id}>
                      <div className="flex items-center gap-1 rounded-md">
                        <label className={cn(
                          "flex flex-1 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/60",
                          checked && "bg-accent font-medium",
                        )}>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => {
                              if (categorySlug === c.slug) {
                                navigate("/catalog", { replace: true });
                              } else {
                                setCategoryIds((s) => toggleSet(s, c.id));
                              }
                            }}
                            className="border-muted-foreground/40 data-[state=checked]:border-primary"
                          />
                          {c.name_ru}
                        </label>
                        {subs.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setOpenCats((s) => toggleSet(s, c.id))}
                            className="rounded-md p-1 transition-colors hover:bg-accent"
                            aria-label="Развернуть"
                          >
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 transition-transform duration-300",
                                isOpen && "rotate-180",
                              )}
                            />
                          </button>
                        )}
                      </div>
                      {subs.length > 0 && isOpen && (
                        <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
                          {subs.map((sub) => {
                            const subChecked = categoryIds.has(sub.id) || categorySlug === sub.slug;
                            return (
                              <li key={sub.id}>
                                <label className={cn(
                                  "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1 text-[13px] transition-colors hover:bg-accent/60",
                                  subChecked ? "bg-accent font-medium" : "text-muted-foreground",
                                )}>
                                  <Checkbox
                                    checked={subChecked}
                                    onCheckedChange={() => {
                                      if (categorySlug === sub.slug) {
                                        navigate("/catalog", { replace: true });
                                      } else {
                                        setCategoryIds((s) => toggleSet(s, sub.id));
                                      }
                                    }}
                                    className="border-muted-foreground/40 data-[state=checked]:border-primary"
                                  />
                                  {sub.name_ru}
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
            </ul>
          </FilterCard>

          {/* Price range filter */}
          <FilterCard
            title="Цена за коробку"
            defaultOpen
            count={(priceMin ? 1 : 0) + (priceMax ? 1 : 0)}
          >
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <input
                    type="number"
                    min={0}
                    placeholder="от"
                    value={priceMin}
                    onChange={(e) => setPriceMin(e.target.value)}
                    className="h-9 w-full min-w-0 rounded-full border border-input bg-background px-3.5 text-start text-sm tabular-nums placeholder:text-muted-foreground/60 transition-all duration-200 outline-none hover:border-primary/30 focus:border-primary/60 focus:ring-4 focus:ring-primary/15 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </div>
                <span className="text-muted-foreground">—</span>
                <div className="flex-1">
                  <input
                    type="number"
                    min={0}
                    placeholder={"до"}
                    value={priceMax}
                    onChange={(e) => setPriceMax(e.target.value)}
                    className="h-9 w-full min-w-0 rounded-full border border-input bg-background px-3.5 text-start text-sm tabular-nums placeholder:text-muted-foreground/60 transition-all duration-200 outline-none hover:border-primary/30 focus:border-primary/60 focus:ring-4 focus:ring-primary/15 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </div>
            </div>
          </FilterCard>

          {/* Color chips — multi-select */}
          {allColors.length > 0 && (
            <FilterCard title="Цвет" count={colorIds.size}>
                <div className="flex flex-wrap gap-1.5">
                  {allColors.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColorIds((s) => toggleSet(s, c))}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs transition-colors",
                        colorIds.has(c)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-accent",
                      )}
                    >
                      {c}
                    </button>
                  ))}
              </div>
            </FilterCard>
          )}

          {materials.length > 0 && (
            <FilterCard title="Материал" count={materialIds.size}>
              <FilterCheckList
                items={materials.map((m) => ({ id: m.id, label: lang === "ru" ? m.name_ru : m.name_en }))}
                selected={materialIds}
                onToggle={(id) => setMaterialIds((s) => toggleSet(s, id))}
              />
            </FilterCard>
          )}
          {scents.length > 0 && (
            <FilterCard title="Аромат" count={scentIds.size}>
              <FilterCheckList
                items={scents.map((sc) => ({ id: sc.id, label: lang === "ru" ? sc.name_ru : sc.name_en }))}
                selected={scentIds}
                onToggle={(id) => setScentIds((s) => toggleSet(s, id))}
              />
            </FilterCard>
          )}
          {shapes.length > 0 && (
            <FilterCard title="Форма" count={shapeIds.size}>
              <FilterCheckList
                items={shapes.map((sh) => ({ id: sh.id, label: lang === "ru" ? sh.name_ru : sh.name_en }))}
                selected={shapeIds}
                onToggle={(id) => setShapeIds((s) => toggleSet(s, id))}
              />
            </FilterCard>
          )}
        </aside>
        )}

        {/* Mobile filters Sheet — rendered below lg breakpoint */}
        {!loading && (
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetContent side="left" className="w-[300px] overflow-y-auto sm:w-[340px] lg:hidden">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" /> Фильтры
                  {activeFiltersCount > 0 && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {activeFiltersCount}
                    </span>
                  )}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3">
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg border bg-surface px-4 py-3 text-sm transition-all",
                    onlyInStock
                      ? "border-primary/50 bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/30 hover:bg-accent/40",
                  )}
                >
                  <Checkbox
                    checked={onlyInStock}
                    onCheckedChange={(v) => setOnlyInStock(Boolean(v))}
                    className="border-muted-foreground/40 data-[state=checked]:border-primary"
                  />
                  <span className="font-medium">Только в наличии</span>
                </label>

                <FilterCard title="Категория" defaultOpen count={categoryIds.size + (categorySlug ? 1 : 0)}>
                  <ul className="space-y-0.5 text-sm">
                    {rootCategories.map((c) => {
                      const subs = childrenOf(c.id);
                      const isOpen = openCats.has(c.id);
                      const checked = categoryIds.has(c.id) || categorySlug === c.slug;
                      return (
                        <li key={c.id}>
                          <div className="flex items-center gap-1 rounded-md">
                            <label className={cn(
                              "flex flex-1 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/60",
                              checked && "bg-accent font-medium",
                            )}>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => {
                                  if (categorySlug === c.slug) {
                                    navigate("/catalog", { replace: true });
                                  } else {
                                    setCategoryIds((s) => toggleSet(s, c.id));
                                  }
                                }}
                                className="border-muted-foreground/40 data-[state=checked]:border-primary"
                              />
                              {c.name_ru}
                            </label>
                            {subs.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setOpenCats((s) => toggleSet(s, c.id))}
                                className="rounded-md p-1.5 transition-colors hover:bg-accent"
                                aria-label="Развернуть"
                              >
                                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-300", isOpen && "rotate-180")} />
                              </button>
                            )}
                          </div>
                          {subs.length > 0 && isOpen && (
                            <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
                              {subs.map((sub) => {
                                const subChecked = categoryIds.has(sub.id) || categorySlug === sub.slug;
                                return (
                                  <li key={sub.id}>
                                    <label className={cn(
                                      "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1 text-[13px] transition-colors hover:bg-accent/60",
                                      subChecked ? "bg-accent font-medium" : "text-muted-foreground",
                                    )}>
                                      <Checkbox
                                        checked={subChecked}
                                        onCheckedChange={() => {
                                          if (categorySlug === sub.slug) {
                                            navigate("/catalog", { replace: true });
                                          } else {
                                            setCategoryIds((s) => toggleSet(s, sub.id));
                                          }
                                        }}
                                        className="border-muted-foreground/40 data-[state=checked]:border-primary"
                                      />
                                      {sub.name_ru}
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </FilterCard>

                <FilterCard title="Цена за коробку" defaultOpen count={(priceMin ? 1 : 0) + (priceMax ? 1 : 0)}>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} placeholder="от" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} className="h-9 w-full min-w-0 flex-1 rounded-full border border-input bg-background px-3.5 text-sm tabular-nums placeholder:text-muted-foreground/60 outline-none transition-all hover:border-primary/30 focus:border-primary/60 focus:ring-4 focus:ring-primary/15 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                    <span className="text-muted-foreground">—</span>
                    <input type="number" min={0} placeholder="до" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} className="h-9 w-full min-w-0 flex-1 rounded-full border border-input bg-background px-3.5 text-sm tabular-nums placeholder:text-muted-foreground/60 outline-none transition-all hover:border-primary/30 focus:border-primary/60 focus:ring-4 focus:ring-primary/15 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                  </div>
                </FilterCard>

                {allColors.length > 0 && (
                  <FilterCard title="Цвет" count={colorIds.size}>
                    <div className="flex flex-wrap gap-1.5">
                      {allColors.map((c) => (
                        <button key={c} onClick={() => setColorIds((s) => toggleSet(s, c))} className={cn("rounded-md border px-2 py-1 text-xs transition-colors", colorIds.has(c) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent")}>{c}</button>
                      ))}
                    </div>
                  </FilterCard>
                )}
                {materials.length > 0 && (
                  <FilterCard title="Материал" count={materialIds.size}>
                    <FilterCheckList items={materials.map((m) => ({ id: m.id, label: lang === "ru" ? m.name_ru : m.name_en }))} selected={materialIds} onToggle={(id) => setMaterialIds((s) => toggleSet(s, id))} />
                  </FilterCard>
                )}
                {scents.length > 0 && (
                  <FilterCard title="Аромат" count={scentIds.size}>
                    <FilterCheckList items={scents.map((sc) => ({ id: sc.id, label: lang === "ru" ? sc.name_ru : sc.name_en }))} selected={scentIds} onToggle={(id) => setScentIds((s) => toggleSet(s, id))} />
                  </FilterCard>
                )}
                {shapes.length > 0 && (
                  <FilterCard title="Форма" count={shapeIds.size}>
                    <FilterCheckList items={shapes.map((sh) => ({ id: sh.id, label: lang === "ru" ? sh.name_ru : sh.name_en }))} selected={shapeIds} onToggle={(id) => setShapeIds((s) => toggleSet(s, id))} />
                  </FilterCard>
                )}

                {activeFiltersCount > 0 && (
                  <Button variant="outline" className="w-full" onClick={() => { clearAllFilters(); setFiltersOpen(false); }}>
                    <X className="mr-1 h-3.5 w-3.5" /> Сбросить фильтры
                  </Button>
                )}

                <Button className="w-full" onClick={() => setFiltersOpen(false)}>
                  Показать {totalItems} товаров
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        )}

        {/* Content */}
        <div>
          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-2.5 shadow-sm animate-in fade-in duration-500 sm:gap-3 sm:p-3">
              <div className="flex flex-1 items-center gap-2 sm:gap-3">
                {/* Mobile filter trigger */}
                <button
                  type="button"
                  onClick={() => setFiltersOpen(true)}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium transition-all hover:border-primary/40 hover:bg-accent lg:hidden",
                    activeFiltersCount > 0 && "border-primary/40 bg-primary/5",
                  )}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline">Фильтры</span>
                  {activeFiltersCount > 0 && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>
                <div ref={searchBoxRef} className="relative max-w-sm flex-1">
                  <form
                    className="group relative"
                    autoComplete="off"
                    onSubmit={(e) => {
                      e.preventDefault();
                      // If a history row is highlighted by keyboard, pressing
                      // Enter commits it; otherwise we just dismiss focus so
                      // the mobile keyboard closes (filter already live).
                      if (activeIdx >= 0 && historySuggestions[activeIdx]) {
                        selectHistoryItem(historySuggestions[activeIdx]);
                        return;
                      }
                      (e.currentTarget.elements.namedItem("q") as HTMLInputElement)?.blur();
                    }}
                  >
                    <Search
                      className={cn(
                        "pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-all duration-300 ease-out",
                        "group-focus-within:scale-110 group-focus-within:text-primary",
                      )}
                    />
                    <input
                      name="q"
                      type="search"
                      value={searchInput}
                      onChange={(e) => {
                        setSearchInput(e.target.value);
                        setHistoryOpen(true);
                      }}
                      onFocus={() => setHistoryOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setHistoryOpen(false);
                          return;
                        }
                        if (!historyOpen || historySuggestions.length === 0) return;
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setActiveIdx((i) => (i + 1) % historySuggestions.length);
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setActiveIdx((i) =>
                            i <= 0 ? historySuggestions.length - 1 : i - 1,
                          );
                        }
                      }}
                      placeholder="Поиск по артикулу или названию"
                      // Suppress the browser's native autofill list; we render
                      // our own themed history dropdown below instead.
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      aria-autocomplete="list"
                      aria-controls="catalog-search-history"
                      aria-expanded={historyOpen && historySuggestions.length > 0}
                      className={cn(
                        "h-9 w-full rounded-md border border-input bg-background pl-8 pr-9 text-sm outline-none placeholder:text-muted-foreground/70",
                        "transition-all duration-300 ease-out",
                        "hover:border-primary/30",
                        "focus:border-primary/60 focus:bg-background focus:ring-4 focus:ring-primary/15",
                        // Hide the native webkit "x" so we can render our own
                        "[&::-webkit-search-cancel-button]:appearance-none",
                      )}
                    />
                    {searchInput && (
                      <button
                        type="button"
                        onClick={() => setSearchInput("")}
                        aria-label="Очистить поиск"
                        className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </form>

                  {/* Themed "recent searches" dropdown. Rendered only when
                      there is actually something to show — otherwise the
                      field shouldn't sprout an empty popover. */}
                  {historyOpen && historySuggestions.length > 0 && (
                    <div
                      id="catalog-search-history"
                      role="listbox"
                      className={cn(
                        "absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden",
                        "rounded-lg border border-border/70 bg-popover shadow-lg shadow-black/5",
                        "animate-in fade-in slide-in-from-top-1 duration-150",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-3 py-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Недавние запросы
                        </span>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={clearHistory}
                          className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-destructive"
                        >
                          Очистить
                        </button>
                      </div>
                      <ul className="max-h-72 overflow-y-auto py-1">
                        {historySuggestions.map((item, i) => {
                          const active = i === activeIdx;
                          return (
                            <li key={item}>
                              <div
                                role="option"
                                aria-selected={active}
                                className={cn(
                                  "group/hi flex items-center",
                                  active && "bg-accent/70",
                                )}
                                onMouseEnter={() => setActiveIdx(i)}
                              >
                                <button
                                  type="button"
                                  // Prevent input blur so the dropdown doesn't
                                  // collapse before our click handler runs.
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => selectHistoryItem(item)}
                                  className={cn(
                                    "flex flex-1 items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                                    active
                                      ? "text-foreground"
                                      : "text-foreground/85 hover:bg-accent/60 hover:text-foreground",
                                  )}
                                >
                                  <Clock
                                    className={cn(
                                      "h-3.5 w-3.5 shrink-0 transition-colors",
                                      active
                                        ? "text-primary"
                                        : "text-muted-foreground group-hover/hi:text-primary",
                                    )}
                                  />
                                  <span className="flex-1 truncate">
                                    {renderHighlighted(item, search)}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeHistoryItem(item);
                                  }}
                                  aria-label={`Убрать "${item}" из истории`}
                                  className={cn(
                                    "mr-2 grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-all",
                                    "opacity-0 group-hover/hi:opacity-100 focus-visible:opacity-100",
                                    "hover:bg-destructive/10 hover:text-destructive",
                                    active && "opacity-100",
                                  )}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
                <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {totalItems === 0
                    ? "0 товаров"
                    : totalItems <= PAGE_SIZE
                      ? `${totalItems} товаров`
                      : `${rangeStart}–${rangeEnd} из ${totalItems}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Premium sort dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="group inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium transition-all hover:border-primary/40 hover:bg-accent data-[state=open]:border-primary/40 data-[state=open]:bg-accent"
                    >
                      <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground group-data-[state=open]:text-foreground" />
                      <span className="hidden sm:inline">{SORT_LABEL[sort]}</span>
                      <span className="sm:hidden">Сортировка</span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60 overflow-hidden rounded-xl p-0 shadow-lg">
                    <DropdownMenuLabel className="bg-accent/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Сортировка
                    </DropdownMenuLabel>
                    <div className="p-1">
                      {SORT_ITEMS.map(({ key, label, icon: Icon }) => {
                        const active = sort === key;
                        return (
                          <DropdownMenuItem
                            key={key}
                            onClick={() => setSort(key)}
                            className={cn(
                              "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                              active && "bg-accent text-foreground",
                            )}
                          >
                            <span
                              className={cn(
                                "grid h-7 w-7 place-items-center rounded-md transition-colors",
                                active
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className={cn("flex-1", active && "font-medium")}>{label}</span>
                            {active && <Check className="h-4 w-4 text-primary" />}
                          </DropdownMenuItem>
                        );
                      })}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* View toggle */}
                <div className="inline-flex rounded-md border border-input bg-background p-0.5">
                  <button
                    type="button"
                    onClick={() => setView("grid")}
                    aria-pressed={view === "grid"}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-all",
                      view === "grid"
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Grid2X2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Сетка</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("table")}
                    aria-pressed={view === "table"}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-all",
                      view === "table"
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <List className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Таблица</span>
                  </button>
                </div>
              </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-60 sm:h-80" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-12 text-center animate-in fade-in duration-500">
              <p className="text-sm text-muted-foreground">Ничего не найдено. Попробуйте изменить фильтры.</p>
              {activeFiltersCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={clearAllFilters}
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Сбросить фильтры
                </Button>
              )}
            </div>
          ) : (
            /*
              Key-based remount makes both views cross-fade in smoothly when the
              user toggles Сетка ↔ Таблица (via the `animate-fade-in` class).
            */
            <div
              key={view}
              className="animate-in fade-in duration-300"
              onClick={(e) => {
                // Event delegation: when the user clicks through to a product
                // page, persist the variant id so the next return to /catalog
                // can scroll the matching card back into view.
                const anchor = (e.target as HTMLElement).closest?.("a[href*='/product/']");
                if (!anchor) return;
                const card = anchor.closest("[data-variant-id]") as HTMLElement | null;
                const variantId = card?.dataset.variantId;
                if (variantId) trackProductClick(variantId);
              }}
            >
              {view === "grid" ? (
                <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                  {pagedItems.map(({ p, v }, i) => {
                    const cartItem = cartItems.find((ci) => ci.variantId === v.id);
                    // Cap stagger so large catalogs don't feel sluggish —
                    // cards after the 12th reveal almost simultaneously.
                    const delay = Math.min(i, 11) * 20;
                    return (
                      <Reveal key={v.id} delay={delay} className="h-full">
                        <ProductCard
                          p={p}
                          v={v}
                          cartBoxes={cartItem?.boxes ?? 0}
                          currency={currency}
                          lang={lang}
                          onAdd={() => handleAdd(p, v)}
                          onSetBoxes={(n) => setCartBoxes(v.id, n)}
                          onRemove={() => removeFromCart(v.id)}
                          registerRef={cardRefs.registerRef}
                        />
                      </Reveal>
                    );
                  })}
                </div>
              ) : (
                <>
                {/* Mobile list view — compact cards that fit phone screens */}
                <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface shadow-sm md:hidden">
                  {pagedItems.map(({ p, v }, i) => (
                    <MobileListRow
                      key={v.id}
                      p={p}
                      v={v}
                      onAdd={handleAdd}
                      index={i}
                      registerRef={cardRefs.registerRef}
                    />
                  ))}
                </div>
                {/* Desktop list view — horizontal cards like Kufar */}
                <div className="hidden flex-col divide-y divide-border rounded-lg border border-border bg-surface shadow-sm md:flex">
                  {pagedItems.map(({ p, v }, i) => (
                    <TableRow
                      key={v.id}
                      p={p}
                      v={v}
                      onAdd={handleAdd}
                      index={i}
                      registerRef={cardRefs.registerRef}
                    />
                  ))}
                </div>
                </>
              )}

              {/* Pagination — only shown when there's more than one page. */}
              {totalPages > 1 && (
                <nav
                  aria-label="Навигация по страницам каталога"
                  className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-border pt-5 sm:flex-row"
                >
                  <div className="text-xs tabular-nums text-muted-foreground">
                    Страница{" "}
                    <span className="font-semibold text-foreground">{page}</span>
                    {" "}из{" "}
                    <span className="font-semibold text-foreground">{totalPages}</span>
                  </div>

                  <ul className="flex items-center gap-1">
                    <li>
                      <button
                        type="button"
                        onClick={() => goToPage(page - 1)}
                        disabled={page <= 1}
                        aria-label="Предыдущая страница"
                        className={cn(
                          "inline-flex h-9 items-center gap-1 rounded-md border border-input bg-background px-3 text-xs font-medium transition-all",
                          "hover:border-primary/40 hover:bg-accent",
                          "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-input disabled:hover:bg-background",
                        )}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Назад</span>
                      </button>
                    </li>

                    {getPageRange(page, totalPages).map((p, i) =>
                      p === "ellipsis" ? (
                        <li key={`ell-${i}`} className="px-1">
                          <span
                            aria-hidden
                            className="grid h-9 w-6 place-items-center text-muted-foreground"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </span>
                        </li>
                      ) : (
                        <li key={p}>
                          <button
                            type="button"
                            onClick={() => goToPage(p)}
                            aria-current={page === p ? "page" : undefined}
                            aria-label={`Страница ${p}`}
                            className={cn(
                              "inline-grid h-9 w-9 place-items-center rounded-md text-xs font-semibold tabular-nums transition-all",
                              page === p
                                ? "border border-primary bg-primary/15 text-primary shadow-sm ring-1 ring-primary/30"
                                : "border border-transparent text-foreground/80 hover:border-primary/30 hover:bg-accent hover:text-foreground",
                            )}
                          >
                            {p}
                          </button>
                        </li>
                      ),
                    )}

                    <li>
                      <button
                        type="button"
                        onClick={() => goToPage(page + 1)}
                        disabled={page >= totalPages}
                        aria-label="Следующая страница"
                        className={cn(
                          "inline-flex h-9 items-center gap-1 rounded-md border border-input bg-background px-3 text-xs font-medium transition-all",
                          "hover:border-primary/40 hover:bg-accent",
                          "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-input disabled:hover:bg-background",
                        )}
                      >
                        <span className="hidden sm:inline">Вперёд</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  </ul>
                </nav>
              )}
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
};

/**
 * Collapsible filter section with an animated chevron + optional active-count pill.
 * Mirrors the reference design from the ticket (see screenshot 1).
 */
const FilterCard = ({
  title,
  children,
  defaultOpen = false,
  count = 0,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  count?: number;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="overflow-hidden rounded-lg border border-border bg-surface transition-colors">
        <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-left outline-none transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset data-[state=open]:bg-accent/20">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            {count > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {count}
              </span>
            )}
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-300",
              open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div className="border-t border-border px-4 py-3">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

/** Reusable attribute checklist used inside FilterCard sections. */
const FilterCheckList = ({
  items,
  selected,
  onToggle,
}: {
  items: { id: string; label: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) => (
  <div className="space-y-0.5">
    {items.map((it) => {
      const active = selected.has(it.id);
      return (
        <label
          key={it.id}
          className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 text-sm transition-colors hover:bg-accent/60"
        >
          <Checkbox
            checked={active}
            onCheckedChange={() => onToggle(it.id)}
            className="border-muted-foreground/40 data-[state=checked]:border-primary"
          />
          <span className={cn(active ? "font-medium" : "text-foreground/80")}>{it.label}</span>
        </label>
      );
    })}
  </div>
);

/**
 * Product card for the grid view. When the corresponding variant is already in
 * the cart, the "+ В корзину" button is replaced with a NumberStepper bound to
 * `onSetBoxes`, plus a small trash button to remove the item (ticket #11).
 */
const ProductCard = ({
  p,
  v,
  cartBoxes,
  currency,
  lang,
  onAdd,
  onSetBoxes,
  onRemove,
  registerRef,
}: {
  p: Product;
  v: ProductVariant;
  cartBoxes: number;
  currency: Currency;
  lang: Lang;
  onAdd: () => void;
  onSetBoxes: (n: number) => void;
  onRemove: () => void;
  registerRef?: (variantId: string, node: HTMLElement | null) => void;
}) => {
  const cover = variantCoverUrl(p, v);
  const stock = availableBoxes(v);
  const inCart = cartBoxes > 0;

  return (
    <article
      ref={(el) => registerRef?.(v.id, el)}
      data-variant-id={v.id}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-lg border bg-surface transition-all duration-300 ease-out",
        stock > 0
          ? "border-border hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/15"
          : "border-border/50 opacity-60 grayscale",
      )}
    >
      <Link
        to={`/product/${p.slug}?variant=${v.id}`}
        className="relative block aspect-square overflow-hidden bg-muted"
        aria-label={productName(p, lang)}
      >
        <img
          src={getProductImage(cover)}
          alt={productName(p, lang)}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
        />
        {inCart && (
          <span className="absolute right-3 top-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground shadow-md">
            В корзине · {cartBoxes}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-2.5 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="num text-[11px] text-muted-foreground">{v.sku}</span>
          <StockIndicator stockBoxes={stock} />
        </div>
        <Link
          to={`/product/${p.slug}?variant=${v.id}`}
          className="mt-1 line-clamp-2 h-[2.5em] text-sm font-bold leading-snug text-foreground transition-colors hover:text-primary"
        >
          {productName(p, lang)}
        </Link>
        <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{variantLabel(v)}</div>

        <div className="mt-auto flex items-baseline justify-between pt-2 sm:pt-3">
          <div>
            <div className="price text-base font-bold sm:text-lg">{formatMoney(variantBoxPrice(v, currency), currency)}</div>
            <div className="text-[11px] text-muted-foreground">
              за коробку · {v.pieces_per_box} шт
            </div>
          </div>
        </div>

        {/* Cart-aware CTA: stepper while in cart, add button otherwise */}
        <div className="mt-2 sm:mt-3">
          {inCart ? (
            <div className="flex items-stretch gap-2">
              <NumberStepper
                value={cartBoxes}
                onChange={onSetBoxes}
                min={1}
                max={stock}
                size="sm"
                block
                className="flex-1"
              />
              <button
                type="button"
                onClick={onRemove}
                aria-label="Убрать из корзины"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-destructive/30 text-destructive transition-colors hover:bg-destructive/10 hover:border-destructive/50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Button
              onClick={onAdd}
              disabled={stock <= 0}
              className="w-full transition-all duration-200 hover:shadow-md hover:shadow-primary/25"
            >
              {stock > 0 ? "+ В корзину" : "Нет в наличии"}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
};

/**
 * Mobile list-row — compact horizontal card for the "table" view on phones.
 * Small image left, info right, fits the viewport without horizontal scroll.
 */
const MobileListRow = ({
  p,
  v,
  onAdd,
  index = 0,
  registerRef,
}: {
  p: Product;
  v: ProductVariant;
  onAdd: (p: Product, v: ProductVariant, n: number) => void;
  index?: number;
  registerRef?: (variantId: string, node: HTMLElement | null) => void;
}) => {
  const { currency, lang } = useAppStore();
  const cartItem = useCartStore((s) => s.items.find((i) => i.variantId === v.id));
  const setCartBoxes = useCartStore((s) => s.setBoxes);
  const removeFromCart = useCartStore((s) => s.remove);
  const stock = availableBoxes(v);
  const cover = variantCoverUrl(p, v);
  const inCart = Boolean(cartItem);
  const delayMs = Math.min(index, 13) * 20;

  return (
    <div
      ref={(el) => registerRef?.(v.id, el)}
      data-variant-id={v.id}
      className={cn(
        "flex gap-3 p-3 animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-500 ease-out",
        stock <= 0 && "opacity-60 grayscale",
      )}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <Link
        to={`/product/${p.slug}?variant=${v.id}`}
        className="block h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
        aria-label={productName(p, lang)}
      >
        <img
          src={getProductImage(cover)}
          alt={productName(p, lang)}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="price text-base font-bold">
          {formatMoney(variantBoxPrice(v, currency), currency)}
        </div>
        <Link
          to={`/product/${p.slug}?variant=${v.id}`}
          className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors hover:text-primary"
        >
          {productName(p, lang)}
        </Link>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {variantLabel(v)} · {v.pieces_per_box} шт/кор
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1.5">
          {inCart ? (
            <div className="flex flex-1 items-center gap-1.5">
              <NumberStepper
                value={cartItem!.boxes}
                onChange={(n) => setCartBoxes(v.id, n)}
                min={1}
                max={stock}
                size="sm"
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removeFromCart(v.id)}
                aria-label="Убрать из корзины"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Button size="sm" className="h-8 text-xs" onClick={() => onAdd(p, v, 1)} disabled={stock <= 0}>
              {stock > 0 ? "В корзину" : "Нет"}
            </Button>
          )}
          <StockIndicator stockBoxes={stock} />
        </div>
      </div>
    </div>
  );
};

/**
 * Table row — now includes a thumbnail (ticket #7) and becomes cart-aware:
 * the quantity stepper is bound to the cart entry and the CTA flips to
 * "Убрать" once the variant is already in the cart.
 *
 * `index` is used to stagger the row's reveal animation so the table feels as
 * lively as the grid view.
 */
const TableRow = ({
  p,
  v,
  onAdd,
  index = 0,
  registerRef,
}: {
  p: Product;
  v: ProductVariant;
  onAdd: (p: Product, v: ProductVariant, n: number) => void;
  index?: number;
  registerRef?: (variantId: string, node: HTMLElement | null) => void;
}) => {
  const { currency, lang } = useAppStore();
  const cartItem = useCartStore((s) => s.items.find((i) => i.variantId === v.id));
  const setCartBoxes = useCartStore((s) => s.setBoxes);
  const removeFromCart = useCartStore((s) => s.remove);
  const [qty, setQty] = useState(1);
  const stock = availableBoxes(v);
  const cover = variantCoverUrl(p, v);
  const inCart = Boolean(cartItem);
  const delayMs = Math.min(index, 13) * 20;

  return (
    <div
      ref={(el) => registerRef?.(v.id, el)}
      data-variant-id={v.id}
      className={cn(
        "flex items-center gap-5 px-4 py-4 transition-colors hover:bg-accent/30 animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-500 ease-out",
        stock <= 0 && "opacity-60 grayscale",
      )}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {/* Thumbnail */}
      <Link
        to={`/product/${p.slug}?variant=${v.id}`}
        className="block h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
        aria-label={productName(p, lang)}
      >
        <img
          src={getProductImage(cover)}
          alt={productName(p, lang)}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 hover:scale-110"
        />
      </Link>

      {/* Info — middle */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="text-lg font-bold">
          {formatMoney(variantBoxPrice(v, currency), currency)}
        </div>
        <Link
          to={`/product/${p.slug}?variant=${v.id}`}
          className="line-clamp-1 text-sm font-medium text-foreground transition-colors hover:text-primary"
        >
          {productName(p, lang)}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{variantLabel(v)}</span>
          <span>·</span>
          <span>{v.pieces_per_box} шт/кор</span>
          <span>·</span>
          <span className="num">{v.sku}</span>
          <span>·</span>
          <StockIndicator stockBoxes={stock} />
        </div>
      </div>

      {/* Actions — right side */}
      <div className="flex shrink-0 items-center gap-3">
        {inCart ? (
          <>
            <NumberStepper
              value={cartItem!.boxes}
              onChange={(n) => setCartBoxes(v.id, n)}
              min={1}
              max={stock}
              size="sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => removeFromCart(v.id)}
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Убрать
            </Button>
          </>
        ) : (
          <>
            {stock > 0 && <NumberStepper value={qty} onChange={setQty} min={1} max={stock} size="sm" />}
            <Button size="sm" onClick={() => onAdd(p, v, qty)} disabled={stock <= 0}>
              {stock > 0 ? "В корзину" : "Нет в наличии"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default Catalog;
