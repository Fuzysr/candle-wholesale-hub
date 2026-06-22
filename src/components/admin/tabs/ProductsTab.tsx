import { Fragment } from "react";
import { ChevronDown, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CategoryOut, ProductOut, ProductVariantOut } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type ProductStatus = { label: string; cls: string };

interface ProductsTabProps {
  productsSearch: string;
  productsCategory: string;
  categories: CategoryOut[];
  selectedProductIds: Set<string>;
  allVisibleProductsSelected: boolean;
  someVisibleProductsSelected: boolean;
  visibleProductIds: string[];
  filteredProducts: ProductOut[];
  expandedProducts: Set<string>;
  onSearchChange: (search: string) => void;
  onCategoryChange: (category: string) => void;
  onOpenProduct: (product?: Partial<ProductOut>) => void;
  onBulkPublish: (ids: string[], published: boolean) => void;
  onBulkDelete: (ids: string[]) => void;
  onClearSelection: () => void;
  onToggleAllVisible: () => void;
  onToggleSelected: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onDeleteProduct: (id: string) => void;
  onOpenBulkGenerator: (productId: string, skuPrefix: string) => void;
  onCreateVariant: (productId: string) => void;
  onEditVariant: (variant: ProductVariantOut) => void;
  onDeleteVariant: (id: string) => void;
  getProductImage: (product: ProductOut) => string | null;
  getProductPricePerBox: (product: ProductOut) => number | null;
  getProductStockTotal: (product: ProductOut) => number;
  getProductStatus: (product: ProductOut) => ProductStatus;
  getProductSku: (product: ProductOut) => string;
}

export function ProductsTab({
  productsSearch,
  productsCategory,
  categories,
  selectedProductIds,
  allVisibleProductsSelected,
  someVisibleProductsSelected,
  visibleProductIds,
  filteredProducts,
  expandedProducts,
  onSearchChange: setProductsSearch,
  onCategoryChange: setProductsCategory,
  onOpenProduct: openProductDialog,
  onBulkPublish: bulkSetProductsPublished,
  onBulkDelete: bulkDeleteProducts,
  onClearSelection: clearProductSelection,
  onToggleAllVisible: toggleAllVisibleProducts,
  onToggleSelected: toggleProductSelected,
  onToggleExpanded: toggleProductExpanded,
  onDeleteProduct: deleteProduct,
  onOpenBulkGenerator,
  onCreateVariant,
  onEditVariant,
  onDeleteVariant: deleteVariant,
  getProductImage: productImage,
  getProductPricePerBox: productPricePerBox,
  getProductStockTotal: productStockTotal,
  getProductStatus: productStatus,
  getProductSku: productSku,
}: ProductsTabProps) {
  return (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Поиск товара..."
                value={productsSearch}
                onChange={(e) => setProductsSearch(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-surface pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="relative">
              <select
                value={productsCategory}
                onChange={(e) => setProductsCategory(e.target.value)}
                className="h-10 appearance-none rounded-md border border-input bg-surface pl-3 pr-8 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Категория: Все</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parent_id ? "↳ " : ""}
                    {c.name_ru}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <Button size="sm" className="ml-auto h-10" onClick={() => openProductDialog()}>
              <Plus className="h-4 w-4" /> Добавить товар
            </Button>
          </div>

          {/*
            Bulk-actions bar для товаров — параллельно bar'у заявок.
            Появляется, когда выделен хотя бы один товар. «Опубликовать» /
            «Снять с публикации» батчат `is_published`, «Удалить» —
            необратимое каскадное удаление через confirm().
          */}
          {selectedProductIds.size > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-5xl flex-wrap items-center gap-3 rounded-t-lg border border-primary/30 bg-background/95 px-4 py-3 text-sm shadow-lg backdrop-blur-sm">
              <span className="font-medium text-foreground">
                Выбрано: <span className="num text-primary">{selectedProductIds.size}</span>
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-success/30 bg-success/10 text-success hover:border-success/60 hover:bg-success/15 hover:text-success"
                  onClick={() => bulkSetProductsPublished(Array.from(selectedProductIds), true)}
                >
                  Опубликовать
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => bulkSetProductsPublished(Array.from(selectedProductIds), false)}
                >
                  Снять с публикации
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-destructive/30 bg-destructive/10 text-destructive hover:border-destructive/60 hover:bg-destructive/15 hover:text-destructive"
                  onClick={() => bulkDeleteProducts(Array.from(selectedProductIds))}
                >
                  <Trash2 className="h-4 w-4" /> Удалить
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-muted-foreground hover:text-foreground"
                  onClick={clearProductSelection}
                >
                  Снять выделение
                </Button>
              </div>
            </div>
          )}

          {/* Flat product table (variants live in the expandable drawer below each row) */}
          <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-3">
                    {/* Checkbox «выбрать все видимые товары».
                        Таблица товаров не пагинируется — берём весь
                        отфильтрованный набор. */}
                    <input
                      type="checkbox"
                      checked={allVisibleProductsSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someVisibleProductsSelected;
                      }}
                      onChange={toggleAllVisibleProducts}
                      disabled={visibleProductIds.length === 0}
                      aria-label="Выбрать все товары"
                      className="h-4 w-4 cursor-pointer rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </th>
                  <th className="w-16 px-4 py-3">Фото</th>
                  <th className="px-4 py-3">Название</th>
                  <th className="px-4 py-3">Категория</th>
                  <th className="px-4 py-3 text-right">Цена/кор.</th>
                  <th className="px-4 py-3 text-right">Остаток</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="w-24 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => {
                  const img = productImage(p);
                  const price = productPricePerBox(p);
                  const stock = productStockTotal(p);
                  const status = productStatus(p);
                  const sku = productSku(p);
                  const expanded = expandedProducts.has(p.id);
                  return (
                    <Fragment key={p.id}>
                      <tr className="border-t border-border hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedProductIds.has(p.id)}
                            onChange={() => toggleProductSelected(p.id)}
                            aria-label={`Выбрать ${p.name_ru}`}
                            className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-10 w-10 overflow-hidden rounded-md bg-muted">
                            {img && (
                              <img src={img} alt="" className="h-full w-full object-cover" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {/*
                            Clicking the name toggles the variants drawer — the ✏️
                            button on the right still opens the product dialog so
                            the row has two clearly-separated affordances.
                          */}
                          <button
                            type="button"
                            onClick={() => toggleProductExpanded(p.id)}
                            className="group flex items-center gap-2 text-left"
                          >
                            <div>
                              <div className="font-medium">
                                {p.name_ru}
                                {!p.is_published && (
                                  <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                                    черновик
                                  </span>
                                )}
                              </div>
                              <div className="num text-xs text-muted-foreground">
                                SKU: {sku}
                              </div>
                            </div>
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 text-muted-foreground transition-transform",
                                expanded && "rotate-180",
                              )}
                            />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {categories.find((c) => c.id === p.category_id)?.name_ru ?? "—"}
                        </td>
                        <td className="price px-4 py-3 text-right">
                          {price !== null ? formatMoney(price, "RUB") : "—"}
                        </td>
                        <td
                          className={cn(
                            "num px-4 py-3 text-right",
                            stock === 0
                              ? "text-muted-foreground"
                              : stock <= 5
                                ? "text-warning"
                                : "text-success",
                          )}
                        >
                          {stock}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                              status.cls,
                            )}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openProductDialog(p)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteProduct(p.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-t border-border bg-muted/30">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="mb-2 flex items-center justify-between">
                              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Вариации ({p.variants?.length ?? 0})
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onOpenBulkGenerator(p.id, p.slug?.toUpperCase() ?? "")}
                                >
                                  <Plus className="h-3.5 w-3.5" /> Генератор
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onCreateVariant(p.id)}
                                >
                                  <Plus className="h-3.5 w-3.5" /> Вариация
                                </Button>
                              </div>
                            </div>
                            <div className="overflow-x-auto rounded-md border border-border bg-surface">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/50 text-left uppercase tracking-wider text-muted-foreground">
                                  <tr>
                                    <th className="w-10 px-3 py-2">Фото</th>
                                    <th className="px-3 py-2">SKU</th>
                                    <th className="px-3 py-2">Размер</th>
                                    <th className="px-3 py-2">Цвет</th>
                                    <th className="px-3 py-2 text-right">Шт/кор</th>
                                    <th className="px-3 py-2 text-right">RUB/шт</th>
                                    <th className="px-3 py-2 text-right">Кор.</th>
                                    <th className="px-3 py-2"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.variants?.map((v) => (
                                    <tr key={v.id} className="border-t border-border">
                                      <td className="px-3 py-2">
                                        <div className="h-8 w-8 overflow-hidden rounded bg-muted">
                                          {(v.images?.[0]?.url ?? v.image_url) ? (
                                            <img src={(v.images?.[0]?.url ?? v.image_url)!} alt="" className="h-full w-full object-cover" />
                                          ) : (
                                            <div className="flex h-full w-full items-center justify-center text-[9px] text-muted-foreground">—</div>
                                          )}
                                        </div>
                                      </td>
                                      <td className="num px-3 py-2">{v.sku}</td>
                                      <td className="px-3 py-2">{v.size ?? "—"}</td>
                                      <td className="px-3 py-2">{v.color ?? "—"}</td>
                                      <td className="num px-3 py-2 text-right">{v.pieces_per_box}</td>
                                      <td className="num px-3 py-2 text-right">{v.price_per_piece_rub}</td>
                                      <td className="num px-3 py-2 text-right">{v.stock_boxes}</td>
                                      <td className="px-3 py-2 text-right">
                                        <div className="inline-flex gap-1">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => onEditVariant(v)}
                                          >
                                            <Pencil className="h-3 w-3" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => deleteVariant(v.id)}
                                            className="text-destructive hover:text-destructive"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                  {(!p.variants || p.variants.length === 0) && (
                                    <tr>
                                      <td
                                        colSpan={8}
                                        className="p-3 text-center text-muted-foreground"
                                      >
                                        Нет вариаций
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="p-10 text-center text-muted-foreground"
                    >
                      Товаров не найдено
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
  );
}
