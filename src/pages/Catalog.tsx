import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useParams, Link } from "react-router-dom";
import { Grid2X2, List, SlidersHorizontal, Search, ChevronDown, ChevronRight, X } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { formatMoney } from "@/lib/format";
import StockIndicator from "@/components/shop/StockIndicator";
import NumberStepper from "@/components/shop/NumberStepper";
import { toast } from "sonner";

type View = "grid" | "table";
type SortKey = "newest" | "price-asc" | "price-desc" | "name" | "stock";

const SORT_LABELS: Record<SortKey, string> = {
  newest: "Сначала новинки",
  "price-asc": "Цена ↑",
  "price-desc": "Цена ↓",
  name: "По названию (А→Я)",
  stock: "По наличию",
};

const Catalog = () => {
  const { categorySlug } = useParams();
  const [params, setParams] = useSearchParams();
  const { currency, lang } = useAppStore();
  const addItem = useCartStore((s) => s.addItem);

  const [view, setView] = useState<View>("grid");
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [colorFilter, setColorFilter] = useState<string>("");
  const [materialIds, setMaterialIds] = useState<Set<string>>(new Set());
  const [scentIds, setScentIds] = useState<Set<string>>(new Set());
  const [shapeIds, setShapeIds] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>("newest");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());

  const search = params.get("q")?.toLowerCase() ?? "";

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
  }, [products, activeCategoryAndDescendants, search, onlyInStock, colorFilter, lang, materialIds, scentIds, shapeIds, sort, currency]);

  const allColors = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => p.variants?.forEach((v) => v.color && s.add(v.color)));
    return Array.from(s).sort();
  }, [products]);

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

  const activeFiltersCount = materialIds.size + scentIds.size + shapeIds.size + (colorFilter ? 1 : 0) + (onlyInStock ? 0 : 0);

  const clearAttrFilters = () => {
    setMaterialIds(new Set());
    setScentIds(new Set());
    setShapeIds(new Set());
    setColorFilter("");
  };

  return (
    <PublicLayout>
      <div className="border-b border-border bg-surface">
        <div className="container py-6">
          <div className="flex flex-wrap items-baseline gap-2 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground">Главная</Link>
            <span>/</span>
            <Link to="/catalog" className="hover:text-foreground">Каталог</Link>
            {categorySlug && (
              <>
                <span>/</span>
                <span className="text-foreground">
                  {categories.find((c) => c.slug === categorySlug)?.name_ru ?? categorySlug}
                </span>
              </>
            )}
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {categorySlug
              ? categories.find((c) => c.slug === categorySlug)?.name_ru ?? "Каталог"
              : "Каталог свечей"}
          </h1>
        </div>
      </div>

      <div className="container grid gap-8 py-8 lg:grid-cols-[260px_1fr]">
        {/* Filters */}
        <aside className="space-y-6">
          <div>
            <h3 className="eyebrow mb-3 flex items-center gap-2"><SlidersHorizontal className="h-3.5 w-3.5" /> Фильтры</h3>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={onlyInStock}
                onChange={(e) => setOnlyInStock(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Только в наличии
            </label>
            {activeFiltersCount > 0 && (
              <button onClick={clearAttrFilters} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" /> Сбросить фильтры ({activeFiltersCount})
              </button>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Категории</h3>
            <ul className="space-y-0.5 text-sm">
              <li>
                <Link
                  to="/catalog"
                  className={`block rounded-md px-2 py-1.5 hover:bg-accent ${!categorySlug ? "bg-accent font-medium" : ""}`}
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
                    <div className={`flex items-center gap-1 rounded-md ${activeSelf ? "bg-accent" : ""}`}>
                      <Link to={`/catalog/${c.slug}`} className={`flex-1 rounded-md px-2 py-1.5 hover:bg-accent ${activeSelf ? "font-medium" : ""}`}>
                        {c.name_ru}
                      </Link>
                      {subs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setOpenCats((s) => toggleSet(s, c.id))}
                          className="rounded-md p-1 hover:bg-accent"
                          aria-label="Развернуть"
                        >
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                    {subs.length > 0 && isOpen && (
                      <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
                        {subs.map((s) => (
                          <li key={s.id}>
                            <Link
                              to={`/catalog/${s.slug}`}
                              className={`block rounded-md px-2 py-1 text-[13px] hover:bg-accent ${categorySlug === s.slug ? "bg-accent font-medium" : "text-muted-foreground"}`}
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
          </div>

          {materials.length > 0 && (
            <FilterGroup title="Материал" items={materials.map((m) => ({ id: m.id, label: lang === "ru" ? m.name_ru : m.name_en }))} selected={materialIds} onToggle={(id) => setMaterialIds((s) => toggleSet(s, id))} />
          )}
          {scents.length > 0 && (
            <FilterGroup title="Аромат" items={scents.map((s) => ({ id: s.id, label: lang === "ru" ? s.name_ru : s.name_en }))} selected={scentIds} onToggle={(id) => setScentIds((s) => toggleSet(s, id))} />
          )}
          {shapes.length > 0 && (
            <FilterGroup title="Форма" items={shapes.map((sh) => ({ id: sh.id, label: lang === "ru" ? sh.name_ru : sh.name_en }))} selected={shapeIds} onToggle={(id) => setShapeIds((s) => toggleSet(s, id))} />
          )}

          {allColors.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Цвет</h3>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setColorFilter("")}
                  className={`rounded-md border px-2 py-1 text-xs ${!colorFilter ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}
                >
                  Любой
                </button>
                {allColors.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColorFilter(c)}
                    className={`rounded-md border px-2 py-1 text-xs ${colorFilter === c ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Content */}
        <div>
          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center gap-3">
              <form
                className="relative"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = (e.currentTarget.elements.namedItem("q") as HTMLInputElement).value;
                  setParams(v ? { q: v } : {});
                }}
              >
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  name="q"
                  defaultValue={search}
                  placeholder="Поиск по артикулу или названию"
                  className="h-9 w-72 max-w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm"
                />
              </form>
              <span className="text-xs text-muted-foreground">{filtered.length} товаров</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <span className="hidden sm:inline">Сортировка:</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                    <option key={k} value={k}>{SORT_LABELS[k]}</option>
                  ))}
                </select>
              </label>
              <div className="inline-flex rounded-md border border-input bg-background p-0.5">
                <button
                  onClick={() => setView("grid")}
                  className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium ${view === "grid" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"}`}
                >
                  <Grid2X2 className="h-3.5 w-3.5" /> Сетка
                </button>
                <button
                  onClick={() => setView("table")}
                  className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium ${view === "table" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"}`}
                >
                  <List className="h-3.5 w-3.5" /> Таблица
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-72" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
              <p className="text-sm text-muted-foreground">Ничего не найдено. Попробуйте изменить фильтры.</p>
            </div>
          ) : view === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.flatMap((p) =>
                (p.variants ?? []).map((v) => {
                  const cover = productGalleryUrls(p)[0] ?? p.image_url;
                  return (
                    <article key={v.id} className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md">
                      <Link to={`/product/${p.slug}`} className="aspect-square overflow-hidden bg-muted">
                        <img
                          src={getProductImage(cover)}
                          alt={productName(p, lang)}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                      </Link>
                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex items-start justify-between gap-2">
                          <span className="num text-[11px] text-muted-foreground">{v.sku}</span>
                          <StockIndicator stockBoxes={availableBoxes(v)} />
                        </div>
                        <Link to={`/product/${p.slug}`} className="mt-1 line-clamp-2 text-sm font-semibold hover:text-primary">
                          {productName(p, lang)}
                        </Link>
                        <div className="mt-1 text-xs text-muted-foreground">{variantLabel(v)}</div>
                        <div className="mt-3 flex items-baseline justify-between">
                          <div>
                            <div className="price text-base">{formatMoney(variantBoxPrice(v, currency), currency)}</div>
                            <div className="text-[11px] text-muted-foreground">за коробку · {v.pieces_per_box} шт</div>
                          </div>
                        </div>
                        <Button onClick={() => handleAdd(p, v)} className="mt-3 w-full">+ В корзину</Button>
                      </div>
                    </article>
                  );
                }),
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-3">Артикул</th>
                    <th className="px-3 py-3">Товар</th>
                    <th className="px-3 py-3">Вариация</th>
                    <th className="px-3 py-3 text-right">Шт/кор</th>
                    <th className="px-3 py-3 text-right">Остаток</th>
                    <th className="px-3 py-3 text-right">Цена</th>
                    <th className="px-3 py-3 text-right w-32">Кор.</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.flatMap((p) =>
                    (p.variants ?? []).map((v) => (
                      <TableRow key={v.id} p={p} v={v} onAdd={handleAdd} />
                    )),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
};

const FilterGroup = ({
  title, items, selected, onToggle,
}: {
  title: string;
  items: { id: string; label: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) => (
  <div>
    <h3 className="mb-2 text-sm font-semibold">{title}</h3>
    <div className="space-y-1">
      {items.map((it) => {
        const active = selected.has(it.id);
        return (
          <label key={it.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent">
            <input type="checkbox" checked={active} onChange={() => onToggle(it.id)} className="h-3.5 w-3.5 accent-primary" />
            <span className={active ? "font-medium" : "text-foreground/80"}>{it.label}</span>
          </label>
        );
      })}
    </div>
  </div>
);

const TableRow = ({ p, v, onAdd }: { p: Product; v: ProductVariant; onAdd: (p: Product, v: ProductVariant, n: number) => void }) => {
  const { currency, lang } = useAppStore();
  const [qty, setQty] = useState(1);
  const stock = availableBoxes(v);
  return (
    <tr className="border-t border-border hover:bg-accent/40">
      <td className="px-3 py-2.5 num text-xs text-muted-foreground">{v.sku}</td>
      <td className="px-3 py-2.5">
        <Link to={`/product/${p.slug}`} className="font-medium hover:text-primary">
          {productName(p, lang)}
        </Link>
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground">{variantLabel(v)}</td>
      <td className="px-3 py-2.5 text-right num">{v.pieces_per_box}</td>
      <td className="px-3 py-2.5 text-right"><StockIndicator stockBoxes={stock} /></td>
      <td className="px-3 py-2.5 text-right">
        <div className="price">{formatMoney(variantBoxPrice(v, currency), currency)}</div>
        <div className="text-[11px] text-muted-foreground">{formatMoney(variantPrice(v, currency), currency)} × {v.pieces_per_box}</div>
      </td>
      <td className="px-3 py-2.5 text-right">
        <NumberStepper value={qty} onChange={setQty} min={1} max={stock} size="sm" />
      </td>
      <td className="px-3 py-2.5 text-right">
        <Button size="sm" onClick={() => onAdd(p, v, qty)}>В корзину</Button>
      </td>
    </tr>
  );
};

export default Catalog;
