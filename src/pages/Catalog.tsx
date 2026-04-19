import { useEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from "react";
import { useSearchParams, useParams, Link } from "react-router-dom";
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

const Catalog = () => {
  const { categorySlug } = useParams();
  const [params, setParams] = useSearchParams();
  const { currency, lang } = useAppStore();
  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const setCartBoxes = useCartStore((s) => s.setBoxes);
  const removeFromCart = useCartStore((s) => s.remove);

  const [view, setView] = useState<View>("grid");
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [colorFilter, setColorFilter] = useState<string>("");
  const [materialIds, setMaterialIds] = useState<Set<string>>(new Set());
  const [scentIds, setScentIds] = useState<Set<string>>(new Set());
  const [shapeIds, setShapeIds] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>("newest");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");

  /*
    Live search: `searchInput` drives the filter instantly on every keystroke,
    so the catalog reacts without the user having to press Enter. The URL's
    `q` param is synced 250 ms after the user stops typing — this keeps the
    address bar shareable/bookmarkable without churning browser history on
    every character.
  */
  const [searchInput, setSearchInput] = useState(params.get("q") ?? "");
  const search = searchInput.trim().toLowerCase();

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
    if (!categorySlug) return null;
    const root = categories.find((c) => c.slug === categorySlug);
    if (!root) return null;
    const ids = new Set<string>([root.id]);
    const queue = [root.id];
    while (queue.length) {
      const id = queue.shift()!;
      categories.filter((c) => c.parent_id === id).forEach((c) => { ids.add(c.id); queue.push(c.id); });
    }
    return ids;
  }, [categorySlug, categories]);

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
          if (colorFilter && v.color !== colorFilter) return false;
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
  }, [products, activeCategoryAndDescendants, search, onlyInStock, colorFilter, lang, materialIds, scentIds, shapeIds, sort, currency, priceMin, priceMax]);

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
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever the active filter/search/sort set changes so the
  // user doesn't land on an empty page 5 after narrowing the catalog.
  useEffect(() => {
    setPage(1);
  }, [
    search,
    categorySlug,
    onlyInStock,
    colorFilter,
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
      image: productGalleryUrls(p)[0] ?? p.image_url,
      piecesPerBox: v.pieces_per_box,
      priceRub: Number(v.price_per_piece_rub),
      priceUsd: Number(v.price_per_piece_usd),
      stockBoxes: availableBoxes(v),
    }, qty);
    toast.success(`${v.sku} · ${qty} кор. в корзине`);
  };

  const activeFiltersCount =
    materialIds.size + scentIds.size + shapeIds.size +
    (colorFilter ? 1 : 0) + (priceMin ? 1 : 0) + (priceMax ? 1 : 0);

  const clearAllFilters = () => {
    setMaterialIds(new Set());
    setScentIds(new Set());
    setShapeIds(new Set());
    setColorFilter("");
    setPriceMin("");
    setPriceMax("");
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

      <div className="container grid gap-8 py-8 lg:grid-cols-[260px_1fr]">
        {/* Filters — use a single parent-level subtle fade instead of per-item stagger */}
        <aside className="space-y-3 animate-in fade-in duration-500">
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

          {/* Category tree */}
          <FilterCard title="Категория" defaultOpen>
              <ul className="space-y-0.5 text-sm">
                <li>
                  <Link
                    to="/catalog"
                    className={cn(
                      "block rounded-md px-2 py-1.5 transition-colors hover:bg-accent",
                      !categorySlug && "bg-accent font-medium",
                    )}
                  >
                    Все категории
                  </Link>
                </li>
                {rootCategories.map((c) => {
                  const subs = childrenOf(c.id);
                  const isOpen = openCats.has(c.id);
                  const activeSelf = categorySlug === c.slug;
                  return (
                    <li key={c.id}>
                      <div className={cn("flex items-center gap-1 rounded-md", activeSelf && "bg-accent")}>
                        <Link
                          to={`/catalog/${c.slug}`}
                          className={cn(
                            "flex-1 rounded-md px-2 py-1.5 transition-colors hover:bg-accent",
                            activeSelf && "font-medium",
                          )}
                        >
                          {c.name_ru}
                        </Link>
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
                          {subs.map((s) => (
                            <li key={s.id}>
                              <Link
                                to={`/catalog/${s.slug}`}
                                className={cn(
                                  "block rounded-md px-2 py-1 text-[13px] transition-colors hover:bg-accent",
                                  categorySlug === s.slug
                                    ? "bg-accent font-medium"
                                    : "text-muted-foreground",
                                )}
                              >
                                {s.name_ru}
                              </Link>
                            </li>
                          ))}
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

          {/* Color chips */}
          {allColors.length > 0 && (
            <FilterCard title="Цвет" count={colorFilter ? 1 : 0}>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setColorFilter("")}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs transition-colors",
                      !colorFilter
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-accent",
                    )}
                  >
                    Любой
                  </button>
                  {allColors.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColorFilter(c)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs transition-colors",
                        colorFilter === c
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

        {/* Content */}
        <div>
          {/* Toolbar — minimal opacity-only fade to avoid distracting from product cards */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 shadow-sm animate-in fade-in duration-500">
              <div className="flex flex-1 items-center gap-3">
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-80" />)}
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
            <div key={view} className="animate-in fade-in duration-300">
              {view === "grid" ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {pagedItems.map(({ p, v }, i) => {
                    const cartItem = cartItems.find((ci) => ci.variantId === v.id);
                    // Cap stagger so large catalogs don't feel sluggish —
                    // cards after the 12th reveal almost simultaneously.
                    const delay = Math.min(i, 11) * 45;
                    return (
                      <Reveal key={v.id} delay={delay}>
                        <ProductCard
                          p={p}
                          v={v}
                          cartBoxes={cartItem?.boxes ?? 0}
                          currency={currency}
                          lang={lang}
                          onAdd={() => handleAdd(p, v)}
                          onSetBoxes={(n) => setCartBoxes(v.id, n)}
                          onRemove={() => removeFromCart(v.id)}
                        />
                      </Reveal>
                    );
                  })}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60">
                      <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="w-14 px-3 py-3"></th>
                        <th className="px-3 py-3">Артикул</th>
                        <th className="px-3 py-3">Товар</th>
                        <th className="px-3 py-3">Вариация</th>
                        <th className="px-3 py-3 text-right">Шт/кор</th>
                        <th className="px-3 py-3 text-right">Остаток</th>
                        <th className="px-3 py-3 text-right">Цена</th>
                        <th className="w-36 px-3 py-3 text-right">Кор.</th>
                        <th className="px-3 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedItems.map(({ p, v }, i) => (
                        <TableRow
                          key={v.id}
                          p={p}
                          v={v}
                          onAdd={handleAdd}
                          index={i}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
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
}: {
  p: Product;
  v: ProductVariant;
  cartBoxes: number;
  currency: Currency;
  lang: Lang;
  onAdd: () => void;
  onSetBoxes: (n: number) => void;
  onRemove: () => void;
}) => {
  const cover = productGalleryUrls(p)[0] ?? p.image_url;
  const stock = availableBoxes(v);
  const inCart = cartBoxes > 0;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-all duration-300 ease-out hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/15">
      <Link
        to={`/product/${p.slug}`}
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

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="num text-[11px] text-muted-foreground">{v.sku}</span>
          <StockIndicator stockBoxes={stock} />
        </div>
        <Link
          to={`/product/${p.slug}`}
          className="mt-1 line-clamp-2 text-sm font-semibold transition-colors hover:text-primary"
        >
          {productName(p, lang)}
        </Link>
        <div className="mt-1 text-xs text-muted-foreground">{variantLabel(v)}</div>

        <div className="mt-3 flex items-baseline justify-between">
          <div>
            <div className="price text-base">{formatMoney(variantBoxPrice(v, currency), currency)}</div>
            <div className="text-[11px] text-muted-foreground">
              за коробку · {v.pieces_per_box} шт
            </div>
          </div>
        </div>

        {/* Cart-aware CTA: stepper while in cart, add button otherwise */}
        <div className="mt-3">
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
              className="w-full transition-all duration-200 hover:shadow-md hover:shadow-primary/25"
            >
              + В корзину
            </Button>
          )}
        </div>
      </div>
    </article>
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
}: {
  p: Product;
  v: ProductVariant;
  onAdd: (p: Product, v: ProductVariant, n: number) => void;
  index?: number;
}) => {
  const { currency, lang } = useAppStore();
  const cartItem = useCartStore((s) => s.items.find((i) => i.variantId === v.id));
  const setCartBoxes = useCartStore((s) => s.setBoxes);
  const removeFromCart = useCartStore((s) => s.remove);
  const [qty, setQty] = useState(1);
  const stock = availableBoxes(v);
  const cover = productGalleryUrls(p)[0] ?? p.image_url;
  const inCart = Boolean(cartItem);
  // Cap stagger so large lists don't drag — rows after the 14th come in fast.
  const delayMs = Math.min(index, 13) * 40;

  return (
    <tr
      className="border-t border-border transition-colors hover:bg-accent/30 animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-500 ease-out"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <td className="px-3 py-2.5">
        <Link
          to={`/product/${p.slug}`}
          className="block h-12 w-12 overflow-hidden rounded-md border border-border bg-muted"
          aria-label={productName(p, lang)}
        >
          <img
            src={getProductImage(cover)}
            alt={productName(p, lang)}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-110"
          />
        </Link>
      </td>
      <td className="num px-3 py-2.5 text-xs text-muted-foreground">{v.sku}</td>
      <td className="px-3 py-2.5">
        <Link to={`/product/${p.slug}`} className="font-medium transition-colors hover:text-primary">
          {productName(p, lang)}
        </Link>
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground">{variantLabel(v)}</td>
      <td className="num px-3 py-2.5 text-right">{v.pieces_per_box}</td>
      <td className="px-3 py-2.5 text-right">
        <StockIndicator stockBoxes={stock} />
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="price">{formatMoney(variantBoxPrice(v, currency), currency)}</div>
        <div className="text-[11px] text-muted-foreground">
          {formatMoney(variantPrice(v, currency), currency)} × {v.pieces_per_box}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right">
        {inCart ? (
          <NumberStepper
            value={cartItem!.boxes}
            onChange={(n) => setCartBoxes(v.id, n)}
            min={1}
            max={stock}
            size="sm"
          />
        ) : (
          <NumberStepper value={qty} onChange={setQty} min={1} max={stock} size="sm" />
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        {inCart ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => removeFromCart(v.id)}
            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Убрать
          </Button>
        ) : (
          <Button size="sm" onClick={() => onAdd(p, v, qty)}>
            В корзину
          </Button>
        )}
      </td>
    </tr>
  );
};

export default Catalog;
