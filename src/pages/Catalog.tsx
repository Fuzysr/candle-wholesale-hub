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
  Download,
  CheckSquare,
  ShoppingCart,
} from "lucide-react";
import { useQueries, useQuery } from "@tanstack/react-query";
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
import { catalogApi, type ManufacturingMethod } from "@/lib/api";
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
} from "@/lib/catalog";
import { formatMoney, type Currency, type Lang } from "@/lib/format";
import StockIndicator from "@/components/shop/StockIndicator";
import NumberStepper from "@/components/shop/NumberStepper";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import AddToCartConfirm from "@/components/shop/AddToCartConfirm";
import {
  FilterCard,
  FilterCheckList,
  MobileListRow,
  ProductCard,
  RangeFilter,
  TableRow,
} from "@/components/catalog/CatalogComponents";
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
const MANUFACTURING_METHODS: ManufacturingMethod[] = ["Пресованные", "Экструзионные", "Литые"];
type ScentPresence = "any" | "yes" | "no";

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
const EMPTY_CATEGORIES: Category[] = [];
const EMPTY_PRODUCTS: Product[] = [];
const EMPTY_COLORS: string[] = [];

const readSavedFilters = (): Record<string, unknown> | null => {
  try {
    const raw = sessionStorage.getItem(FILTERS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const writeSavedFilters = (f: Record<string, unknown>) => {
  try {
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify(f));
  } catch {
    // Storage may be disabled by browser privacy settings.
  }
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
  const restoreItem = useCartStore((s) => s.restoreItem);

  // Batch-режим выбора товаров: пользователь включает чекбоксами выбор
  // нескольких карточек и одной кнопкой добавляет всё в корзину.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());
  const toggleSelected = (variantId: string) => {
    setSelectedVariantIds((s) => {
      const next = new Set(s);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  };
  const clearSelection = () => setSelectedVariantIds(new Set());
  // Выходя из режима выбора, всегда сбрасываем накопленный список —
  // иначе при повторном включении пользователь видит стейл-выбор.
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedVariantIds(new Set());
  };

  // Restore filters: prefer restore snapshot, then our lightweight
  // sessionStorage copy, then defaults.
  const saved = readSavedFilters();
  const initial = restore.initialFilters;
  const [view, setView] = useState<View>(() => (initial?.view ?? saved?.view as View) ?? "grid");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [onlyInStock, setOnlyInStock] = useState(() => initial?.onlyInStock ?? (saved?.onlyInStock as boolean | undefined) ?? true);
  const [colorIds, setColorIds] = useState<Set<string>>(() => new Set((initial?.colorIds) ?? []));
  const [manufacturingMethods, setManufacturingMethods] = useState<Set<string>>(
    () => new Set((initial?.manufacturingMethods) ?? []),
  );
  const [scentPresence, setScentPresence] = useState<ScentPresence>(() => initial?.scentPresence ?? "any");
  const [sort, setSort] = useState<SortKey>(() => (initial?.sort ?? saved?.sort as SortKey) ?? "newest");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [categoryIds, setCategoryIds] = useState<Set<string>>(() => new Set((initial?.categoryIds) ?? []));
  const [priceMin, setPriceMin] = useState(() => initial?.priceMin ?? "");
  const [priceMax, setPriceMax] = useState(() => initial?.priceMax ?? "");
  // Габариты товара (мм)
  const [diameterMin, setDiameterMin] = useState(() => initial?.diameterMin ?? initial?.widthMin ?? "");
  const [diameterMax, setDiameterMax] = useState(() => initial?.diameterMax ?? initial?.widthMax ?? "");
  const [heightMin, setHeightMin] = useState(() => initial?.heightMin ?? "");
  const [heightMax, setHeightMax] = useState(() => initial?.heightMax ?? "");
  const [burnTimeMin, setBurnTimeMin] = useState(() => initial?.burnTimeMin ?? "");
  const [burnTimeMax, setBurnTimeMax] = useState(() => initial?.burnTimeMax ?? "");

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

  // Tracks the last `q` value our own debounced writer pushed to the URL, so
  // the URL→input sync below can tell our echo apart from a genuine external
  // navigation (e.g. the header search bar, or browser back/forward).
  const lastPushedQ = useRef(params.get("q") ?? "");

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
      lastPushedQ.current = trimmed;
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
    Sync the URL's `q` back INTO the input on external navigations. The header
    search bar navigates to `/catalog?q=...`; when the catalog is already
    mounted that only changes the URL, so without this the controlled input
    (and therefore the results) would never update. We ignore the echo of our
    own writer above by comparing against `lastPushedQ`, and skip when already
    in sync so we don't clobber the user mid-typing (e.g. trailing spaces).
  */
  useEffect(() => {
    const urlQ = params.get("q") ?? "";
    if (urlQ === lastPushedQ.current) return;
    if (urlQ === searchInput.trim()) return;
    lastPushedQ.current = urlQ;
    setSearchInput(urlQ);
  }, [params, searchInput]);

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

  const [catQ, colorsQ] = useQueries({
    queries: [
      { queryKey: ["categories"], queryFn: () => catalogApi.listCategories(), retry: 1, retryDelay: 500 },
      { queryKey: ["products", "colors"], queryFn: () => catalogApi.listProductColors(), retry: 1, retryDelay: 500 },
    ],
  });
  const categories = catQ.data ?? EMPTY_CATEGORIES;
  const allColors = colorsQ.data ?? EMPTY_COLORS;

  // Category tree. Keep every level visible by default; users can collapse
  // any branch with its chevron. This avoids hiding grandchildren in the
  // filter when the admin creates nested categories.
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id);

  // Auto-open the parent of the active category
  useEffect(() => {
    setOpenCats((current) => {
      const next = new Set(current);
      categories.forEach((category) => {
        if (categories.some((child) => child.parent_id === category.id)) next.add(category.id);
      });
      return next;
    });
    if (!categorySlug) return;
    const active = categories.find((c) => c.slug === categorySlug);
    if (active?.parent_id) {
      setOpenCats((s) => new Set(s).add(active.parent_id!));
    }
  }, [categorySlug, categories]);

  const renderCategoryNodes = (parentId: string | null, depth = 0, path = new Set<string>()): ReactNode[] =>
    categories
      .filter((category) => (category.parent_id ?? null) === parentId && !path.has(category.id))
      .map((category) => {
        const children = childrenOf(category.id);
        const isOpen = openCats.has(category.id);
        const checked = categoryIds.has(category.id) || categorySlug === category.slug;
        const nextPath = new Set(path).add(category.id);
        return (
          <li key={category.id}>
            <div className="flex min-h-9 items-center gap-1 rounded-md">
              <label className={cn(
                "flex flex-1 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/60",
                depth > 0 && "text-[13px] text-muted-foreground",
                checked && "bg-accent font-medium text-foreground",
              )}>
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => {
                    if (categorySlug === category.slug) navigate("/catalog", { replace: true });
                    else setCategoryIds((selected) => toggleSet(selected, category.id));
                  }}
                  className="border-muted-foreground/40 data-[state=checked]:border-primary"
                />
                {category.name_ru}
              </label>
              {children.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOpenCats((selected) => toggleSet(selected, category.id))}
                  className="rounded-md p-1 transition-colors hover:bg-accent"
                  aria-label={`${isOpen ? "Свернуть" : "Развернуть"} категорию ${category.name_ru}`}
                >
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-300", isOpen && "rotate-180")} />
                </button>
              )}
            </div>
            {children.length > 0 && isOpen && (
              <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-3">
                {renderCategoryNodes(category.id, depth + 1, nextPath)}
              </ul>
            )}
          </li>
        );
      });

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

  // Server pagination is product-based. Matching variants are narrowed again
  // below for presentation, while `total/pages` remain authoritative and do
  // not depend on which page happens to be loaded in the browser.
  const [page, setPage] = useState(() => restore.initialPage);
  const productSearchParams = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      category_ids: activeCategoryAndDescendants
        ? Array.from(activeCategoryAndDescendants)
        : undefined,
      colors: colorIds.size ? Array.from(colorIds) : undefined,
      manufacturing_methods: manufacturingMethods.size ? (Array.from(manufacturingMethods) as ManufacturingMethod[]) : undefined,
      has_scent: scentPresence === "any" ? undefined : scentPresence === "yes",
      q: search || undefined,
      in_stock: onlyInStock || undefined,
      price_min: priceMin ? Number(priceMin) : undefined,
      price_max: priceMax ? Number(priceMax) : undefined,
      width_min: diameterMin ? Number(diameterMin) : undefined,
      width_max: diameterMax ? Number(diameterMax) : undefined,
      height_min: heightMin ? Number(heightMin) : undefined,
      height_max: heightMax ? Number(heightMax) : undefined,
      burn_time_min: burnTimeMin ? Number(burnTimeMin) : undefined,
      burn_time_max: burnTimeMax ? Number(burnTimeMax) : undefined,
      sort,
      language: lang,
      currency,
    }),
    [
      page,
      activeCategoryAndDescendants,
      colorIds,
      manufacturingMethods,
      scentPresence,
      search,
      onlyInStock,
      priceMin,
      priceMax,
      diameterMin,
      diameterMax,
      heightMin,
      heightMax,
      burnTimeMin,
      burnTimeMax,
      sort,
      lang,
      currency,
    ],
  );
  const prodQ = useQuery({
    queryKey: ["products", "search", productSearchParams],
    queryFn: () => catalogApi.searchProducts(productSearchParams),
    placeholderData: (previous) => previous,
    retry: 1,
    retryDelay: 500,
  });
  const products = prodQ.data?.items ?? EMPTY_PRODUCTS;
  const loading = catQ.isPending || prodQ.isPending;
  const coreLoadFailed = catQ.isError || prodQ.isError;
  const retryCatalog = () => {
    void Promise.all([
      catQ.refetch(),
      prodQ.refetch(),
      colorsQ.refetch(),
    ]);
  };

  const toggleSet = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  };

  const filtered = useMemo(() => {
    const pMin = priceMin ? Number(priceMin) : null;
    const pMax = priceMax ? Number(priceMax) : null;
    const dMin = diameterMin ? Number(diameterMin) : null;
    const dMax = diameterMax ? Number(diameterMax) : null;
    const hMin = heightMin ? Number(heightMin) : null;
    const hMax = heightMax ? Number(heightMax) : null;
    const bMin = burnTimeMin ? Number(burnTimeMin) : null;
    const bMax = burnTimeMax ? Number(burnTimeMax) : null;
    const list = products
      .filter((p) => activeCategoryAndDescendants ? (p.category_id ? activeCategoryAndDescendants.has(p.category_id) : false) : true)
      .filter((p) =>
        search
          ? productName(p, lang).toLowerCase().includes(search) ||
            p.variants?.some((v) => v.sku.toLowerCase().includes(search))
          : true,
      )
      .map((p) => ({
        ...p,
        variants: (p.variants ?? []).filter((v) => {
          // `in_stock` is applied by the API at card level: a color card is
          // shown when at least one of its sizes is available. Keep all sizes
          // in the card afterwards, including temporarily empty ones, so the
          // catalog count matches the size picker on the product page.
          if (colorIds.size && !(v.color && colorIds.has(v.color))) return false;
          if (manufacturingMethods.size && !(v.manufacturing_method && manufacturingMethods.has(v.manufacturing_method))) return false;
          if (scentPresence === "yes" && !v.has_scent) return false;
          if (scentPresence === "no" && v.has_scent) return false;
          const box = variantBoxPrice(v, currency);
          if (pMin !== null && box < pMin) return false;
          if (pMax !== null && box > pMax) return false;
          // Габариты товара: если фильтр задан, у варианта должно быть значение и попадать в диапазон
          if (dMin !== null && (v.width_mm == null || v.width_mm < dMin)) return false;
          if (dMax !== null && (v.width_mm == null || v.width_mm > dMax)) return false;
          if (hMin !== null && (v.height_mm == null || v.height_mm < hMin)) return false;
          if (hMax !== null && (v.height_mm == null || v.height_mm > hMax)) return false;
          if (bMin !== null && (v.burn_time_hours == null || v.burn_time_hours < bMin)) return false;
          if (bMax !== null && (v.burn_time_hours == null || v.burn_time_hours > bMax)) return false;
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
  }, [
    products,
    activeCategoryAndDescendants,
    search,
    colorIds,
    manufacturingMethods,
    scentPresence,
    lang,
    sort,
    currency,
    priceMin,
    priceMax,
    diameterMin,
    diameterMax,
    heightMin,
    heightMax,
    burnTimeMin,
    burnTimeMax,
  ]);

  /*
    Pagination — the API now returns one color card with multiple size
    variants. We render one representative card per color and keep the
    variants for the detail page. `page` is plain local state (not URL) so
    that filter changes can cleanly reset to page 1 without racing the other
    URL-writing effects. The user's filter/sort/search state is already in the
    URL, which is what matters for sharing.
  */
  const flatFiltered = useMemo(
    () => filtered.flatMap((p) => {
      const variants = p.variants ?? [];
      if (!variants.length) return [];
      // The API returns one card per color. Keep one representative variant
      // for the card; all sizes remain available after opening the color page.
      const representative = [...variants].sort((a, b) => {
        const aStock = availableBoxes(a);
        const bStock = availableBoxes(b);
        if (aStock !== bStock) return bStock - aStock;
        return variantBoxPrice(a, currency) - variantBoxPrice(b, currency);
      })[0];
      return [{ p, v: representative }];
    }),
    [filtered, currency],
  );
  const totalItems = prodQ.data?.total ?? 0;
  const totalPages = Math.max(1, prodQ.data?.pages ?? 0);

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
    diameterMin,
    diameterMax,
    heightMin,
    heightMax,
    burnTimeMin,
    burnTimeMax,
    manufacturingMethods,
    scentPresence,
    sort,
  ]);

  // Clamp page if it ever exceeds the (new) total — e.g., results shrank.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedItems = flatFiltered;

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
      manufacturingMethods: Array.from(manufacturingMethods),
      scentPresence,
      priceMin,
      priceMax,
      diameterMin,
      diameterMax,
      heightMin,
      heightMax,
      burnTimeMin,
      burnTimeMax,
      sort,
      view,
    }),
    [
      search,
      categorySlug,
      categoryIds,
      onlyInStock,
      colorIds,
      manufacturingMethods,
      scentPresence,
      priceMin,
      priceMax,
      diameterMin,
      diameterMax,
      heightMin,
      heightMax,
      burnTimeMin,
      burnTimeMax,
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

  /* ── Диалог подтверждения добавления в корзину ── */
  const [confirmAdd, setConfirmAdd] = useState<{
    type: "single";
    product: Product;
    variant: ProductVariant;
    qty: number;
    description: string;
  } | {
    type: "bulk";
    description: string;
  } | null>(null);

  const handleAdd = (p: Product, v: ProductVariant, qty = 1) => {
    setConfirmAdd({
      type: "single",
      product: p,
      variant: v,
      qty,
      description: `${v.sku} · ${variantLabel(v)} — ${qty} кор.`,
    });
  };

  const executeAdd = (p: Product, v: ProductVariant, qty: number) => {
    const prevBoxes = cartItems.find((i) => i.variantId === v.id)?.boxes ?? 0;
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
    toast.success(`${v.sku} · ${qty} кор. в корзине`, {
      action: {
        label: "Отменить",
        onClick: () => restoreItem(v.id, prevBoxes),
      },
      duration: 6000,
    });
  };

  /**
   * Массовое добавление всех выбранных в режиме `selectMode` товаров.
   * Каждый вариант кладётся по 1 коробке (минимально-разумный объём для
   * оптового заказа — клиент потом корректирует количество в корзине).
   * Все out-of-stock варианты молча пропускаются, чтобы пользователь не
   * получал серию тостов с ошибками.
   */
  const handleBulkAdd = () => {
    if (selectedVariantIds.size === 0) return;
    setConfirmAdd({
      type: "bulk",
      description: `Добавить ${selectedVariantIds.size} выбранных позиций в корзину?`,
    });
  };

  const executeBulkAdd = () => {
    // Строим индекс variantId → {product, variant} один раз, чтобы не
    // прогонять O(products × variants × selected) при каждом item.
    const lookup = new Map<string, { p: Product; v: ProductVariant }>();
    for (const p of products) {
      for (const v of p.variants ?? []) {
        if (selectedVariantIds.has(v.id)) lookup.set(v.id, { p, v });
      }
    }

    // Запоминаем предыдущие значения boxes — для batch-undo одним движением.
    const prevState: { variantId: string; prevBoxes: number }[] = [];
    let addedCount = 0;
    let skippedOutOfStock = 0;

    for (const variantId of selectedVariantIds) {
      const found = lookup.get(variantId);
      if (!found) continue;
      const { p, v } = found;
      const stock = availableBoxes(v);
      if (stock <= 0) {
        skippedOutOfStock += 1;
        continue;
      }
      const prevBoxes = cartItems.find((i) => i.variantId === v.id)?.boxes ?? 0;
      prevState.push({ variantId: v.id, prevBoxes });
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
        stockBoxes: stock,
        volumeDiscounts: (v.volume_discounts ?? []).map((vd) => ({
          min_boxes: vd.min_boxes,
          discount_percent: vd.discount_percent,
        })),
      }, 1);
      addedCount += 1;
    }

    if (addedCount === 0) {
      toast.error("Все выбранные позиции вне наличия");
      return;
    }

    const suffix = skippedOutOfStock > 0
      ? ` · ${skippedOutOfStock} вне наличия пропущено`
      : "";
    toast.success(`Добавлено ${addedCount} позиц. в корзину${suffix}`, {
      action: {
        label: "Отменить",
        onClick: () => {
          for (const { variantId, prevBoxes } of prevState) {
            restoreItem(variantId, prevBoxes);
          }
        },
      },
      duration: 6000,
    });
    exitSelectMode();
  };

  /**
   * Сгенерировать XLSX-прайс по ВСЕМУ каталогу (а не только текущей странице
   * или активному фильтру) — клиенты обычно хотят полную выгрузку. Если
   * данные ещё грузятся — показываем ошибку, чтобы не отдать пустой файл.
   */
  const handleExportPriceList = async () => {
    if (loading) {
      toast.error("Каталог ещё загружается");
      return;
    }
    try {
      const allProducts = await catalogApi.listProducts();
      if (allProducts.length === 0) {
        toast.error("В каталоге пока нет товаров");
        return;
      }
      const { downloadPriceListXlsx } = await import("@/lib/exportPriceList");
      downloadPriceListXlsx(allProducts);
      toast.success(`Прайс-лист сформирован (${allProducts.length} товаров)`);
    } catch (err) {
      console.error("Price list export failed", err);
      toast.error("Не удалось сформировать прайс-лист");
    }
  };

  const activeFiltersCount =
    colorIds.size + categoryIds.size + manufacturingMethods.size +
    (scentPresence === "any" ? 0 : 1) +
    (priceMin ? 1 : 0) + (priceMax ? 1 : 0) +
    (diameterMin ? 1 : 0) + (diameterMax ? 1 : 0) +
    (heightMin ? 1 : 0) + (heightMax ? 1 : 0) +
    (burnTimeMin ? 1 : 0) + (burnTimeMax ? 1 : 0);

  const clearAllFilters = () => {
    setColorIds(new Set());
    setManufacturingMethods(new Set());
    setScentPresence("any");
    setCategoryIds(new Set());
    setPriceMin("");
    setPriceMax("");
    setDiameterMin("");
    setDiameterMax("");
    setHeightMin("");
    setHeightMax("");
    setBurnTimeMin("");
    setBurnTimeMax("");
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

      <div className="container grid gap-6 py-6 sm:gap-8 sm:py-8 lg:grid-cols-[260px_1fr] lg:items-start">
        {/* Filters sidebar — hidden on mobile, visible on lg+.
            Делаем sidebar `sticky` на широких экранах: при скролле каталог
            продолжает прокручиваться, а панель фильтров остаётся в зоне
            видимости. `top` рассчитан под высоту глобального sticky-хедера
            (h-16 = 4rem) плюс небольшой визуальный воздух. `max-h` и
            `overflow-y-auto` нужны для редких случаев, когда фильтров
            много и они не помещаются в одном экране — внутренний скролл
            предотвращает «обрезание» нижних пунктов. Radix-меню/поповеры
            рендерятся в Portal, поэтому overflow их не клипает. */}
        {loading ? (
          <aside className="hidden space-y-3 lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </aside>
        ) : coreLoadFailed ? (
          <aside className="hidden rounded-lg border border-destructive/25 bg-destructive/5 p-4 lg:sticky lg:top-20 lg:block">
            <p className="text-sm font-semibold text-foreground">Фильтры недоступны</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {import.meta.env.DEV
                ? "Локальный API не отвечает на порту 8000."
                : "Не удалось получить данные каталога."}
            </p>
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={retryCatalog}>
              Повторить
            </Button>
          </aside>
        ) : (
        <aside className="hidden space-y-3 animate-in fade-in duration-500 lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
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
            <ul className="space-y-0.5 text-sm">{renderCategoryNodes(null)}</ul>
          </FilterCard>

          {/* Price range filter */}
          <FilterCard
            title="Цена за коробку"
            defaultOpen
            count={(priceMin ? 1 : 0) + (priceMax ? 1 : 0)}
          >
            <RangeFilter min={priceMin} max={priceMax} onMin={setPriceMin} onMax={setPriceMax} />
          </FilterCard>

          <FilterCard title="Диаметр, мм" count={(diameterMin ? 1 : 0) + (diameterMax ? 1 : 0)}>
            <RangeFilter min={diameterMin} max={diameterMax} onMin={setDiameterMin} onMax={setDiameterMax} unit="мм" />
          </FilterCard>
          <FilterCard title="Высота, мм" count={(heightMin ? 1 : 0) + (heightMax ? 1 : 0)}>
            <RangeFilter min={heightMin} max={heightMax} onMin={setHeightMin} onMax={setHeightMax} unit="мм" />
          </FilterCard>
          <FilterCard title="Время горения, ч" count={(burnTimeMin ? 1 : 0) + (burnTimeMax ? 1 : 0)}>
            <RangeFilter min={burnTimeMin} max={burnTimeMax} onMin={setBurnTimeMin} onMax={setBurnTimeMax} unit="ч" />
          </FilterCard>

          {/* Color chips — multi-select */}
          <FilterCard title="Цвет" count={colorIds.size}>
            {allColors.length > 0 ? (
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
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Цвета появятся после добавления товаров.
              </p>
            )}
          </FilterCard>

          <FilterCard title="Способ изготовления" count={manufacturingMethods.size}>
            <FilterCheckList
              items={MANUFACTURING_METHODS.map((method) => ({ id: method, label: method }))}
              selected={manufacturingMethods}
              onToggle={(id) => setManufacturingMethods((s) => toggleSet(s, id))}
            />
          </FilterCard>
          <FilterCard title="Наличие аромата" count={scentPresence === "any" ? 0 : 1}>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                ["any", "Любой"],
                ["yes", "Да"],
                ["no", "Нет"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScentPresence(value as ScentPresence)}
                  className={cn(
                    "h-9 rounded-md border px-2 text-xs font-medium transition-colors",
                    scentPresence === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-foreground/80 hover:bg-accent",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </FilterCard>
        </aside>
        )}

        {/* Mobile filters Sheet — rendered below lg breakpoint */}
        {!loading && !coreLoadFailed && (
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
                  <ul className="space-y-0.5 text-sm">{renderCategoryNodes(null)}</ul>
                </FilterCard>

                <FilterCard title="Цена за коробку" defaultOpen count={(priceMin ? 1 : 0) + (priceMax ? 1 : 0)}>
                  <RangeFilter min={priceMin} max={priceMax} onMin={setPriceMin} onMax={setPriceMax} />
                </FilterCard>

                <FilterCard title="Диаметр, мм" count={(diameterMin ? 1 : 0) + (diameterMax ? 1 : 0)}>
                  <RangeFilter min={diameterMin} max={diameterMax} onMin={setDiameterMin} onMax={setDiameterMax} unit="мм" />
                </FilterCard>
                <FilterCard title="Высота, мм" count={(heightMin ? 1 : 0) + (heightMax ? 1 : 0)}>
                  <RangeFilter min={heightMin} max={heightMax} onMin={setHeightMin} onMax={setHeightMax} unit="мм" />
                </FilterCard>
                <FilterCard title="Время горения, ч" count={(burnTimeMin ? 1 : 0) + (burnTimeMax ? 1 : 0)}>
                  <RangeFilter min={burnTimeMin} max={burnTimeMax} onMin={setBurnTimeMin} onMax={setBurnTimeMax} unit="ч" />
                </FilterCard>

                <FilterCard title="Цвет" count={colorIds.size}>
                  {allColors.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {allColors.map((c) => (
                        <button key={c} onClick={() => setColorIds((s) => toggleSet(s, c))} className={cn("rounded-md border px-2 py-1 text-xs transition-colors", colorIds.has(c) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent")}>{c}</button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Цвета появятся после добавления товаров.
                    </p>
                  )}
                </FilterCard>
                <FilterCard title="Способ изготовления" count={manufacturingMethods.size}>
                  <FilterCheckList
                    items={MANUFACTURING_METHODS.map((method) => ({ id: method, label: method }))}
                    selected={manufacturingMethods}
                    onToggle={(id) => setManufacturingMethods((s) => toggleSet(s, id))}
                  />
                </FilterCard>
                <FilterCard title="Наличие аромата" count={scentPresence === "any" ? 0 : 1}>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      ["any", "Любой"],
                      ["yes", "Да"],
                      ["no", "Нет"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setScentPresence(value as ScentPresence)}
                        className={cn(
                          "h-9 rounded-md border px-2 text-xs font-medium transition-colors",
                          scentPresence === value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-foreground/80 hover:bg-accent",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </FilterCard>

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
                {/* Прайс-лист — выгрузка всех товаров с ценами в XLSX */}
                <button
                  type="button"
                  onClick={handleExportPriceList}
                  disabled={loading}
                  title="Скачать прайс-лист (Excel)"
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium transition-all",
                    "hover:border-primary/40 hover:bg-accent",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Прайс-лист</span>
                </button>

                {/* Batch-режим выбора — включает чекбоксы на карточках */}
                <button
                  type="button"
                  onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                  aria-pressed={selectMode}
                  title={selectMode ? "Выйти из режима выбора" : "Выбрать несколько товаров"}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-all",
                    selectMode
                      ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border-input bg-background hover:border-primary/40 hover:bg-accent",
                  )}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    {selectMode ? "Готово" : "Выбрать"}
                  </span>
                </button>

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
          ) : coreLoadFailed ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/25 bg-destructive/5 px-6 py-12 text-center"
            >
              <p className="font-semibold text-foreground">Не удалось загрузить каталог</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                {import.meta.env.DEV
                  ? "Запустите локальный backend на http://localhost:8000 и повторите запрос."
                  : "Проверьте подключение и попробуйте ещё раз."}
              </p>
              <Button variant="outline" size="sm" className="mt-5" onClick={retryCatalog}>
                Повторить загрузку
              </Button>
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
                <div className="grid grid-cols-2 items-start gap-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                  {pagedItems.map(({ p, v }, i) => {
                    const cartItem = cartItems.find((ci) => ci.variantId === v.id);
                    // Cap stagger so large catalogs don't feel sluggish —
                    // cards after the 12th reveal almost simultaneously.
                    const delay = Math.min(i, 11) * 20;
                    return (
                      <Reveal key={v.id} delay={delay} className="self-start">
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
                          selectMode={selectMode}
                          selected={selectedVariantIds.has(v.id)}
                          onToggleSelect={() => toggleSelected(v.id)}
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
                      selectMode={selectMode}
                      selected={selectedVariantIds.has(v.id)}
                      onToggleSelect={() => toggleSelected(v.id)}
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
                      selectMode={selectMode}
                      selected={selectedVariantIds.has(v.id)}
                      onToggleSelect={() => toggleSelected(v.id)}
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

      {/*
        Sticky floating action-bar для batch-режима. Появляется когда
        пользователь выбрал хотя бы один товар. На мобиле и десктопе —
        одинаковая горизонтальная плашка снизу, как в Cart-page checkout
        bar. Учитываем `safe-area-inset-bottom` чтобы не залипало под
        iOS home-indicator.
      */}
      {selectMode && selectedVariantIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.1)] backdrop-blur animate-in slide-in-from-bottom-4 duration-200 dark:shadow-[0_-4px_16px_rgba(0,0,0,0.3)]">
          <div className="container flex items-center gap-2 sm:gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">
                Выбрано: {selectedVariantIds.size}{" "}
                {selectedVariantIds.size === 1 ? "товар" : "товаров"}
              </div>
              <button
                type="button"
                onClick={clearSelection}
                className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Снять выделение
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={exitSelectMode}
              className="shrink-0"
            >
              <X className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">Отмена</span>
            </Button>
            <Button
              size="sm"
              onClick={handleBulkAdd}
              className="shrink-0 gap-1.5"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>В корзину</span>
              <span className="ml-1 rounded-md bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] tabular-nums">
                {selectedVariantIds.size}
              </span>
            </Button>
          </div>
        </div>
      )}
      <AddToCartConfirm
        open={!!confirmAdd}
        title="Добавить в корзину?"
        description={confirmAdd?.description}
        onCancel={() => setConfirmAdd(null)}
        onConfirm={() => {
          if (!confirmAdd) return;
          if (confirmAdd.type === "single") {
            executeAdd(confirmAdd.product, confirmAdd.variant, confirmAdd.qty);
          } else {
            executeBulkAdd();
          }
          setConfirmAdd(null);
        }}
      />
    </PublicLayout>
  );
};

/**
 * Collapsible filter section with an animated chevron + optional active-count pill.
 * Mirrors the reference design from the ticket (see screenshot 1).
 */
export default Catalog;
