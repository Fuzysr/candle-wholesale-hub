import type { Dispatch, SetStateAction } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, TextArea } from "@/components/admin/AdminPrimitives";
import ImageUpload from "@/components/admin/ImageUpload";
import MultiImageUpload, { type GalleryImage } from "@/components/admin/MultiImageUpload";
import {
  apiErrorMessage,
  catalogApi,
  uploadsApi,
  type AttributeOut,
  type CategoryOut,
  type ManufacturingMethod,
  type ProductOut,
  type ProductVariantOut,
  type VariantImageOut,
} from "@/lib/api";
import { toast } from "sonner";
import {
  imageUploadErrorMessage,
  validateImageFile,
} from "@/lib/imageUploadErrors";

type EditableVariant = Partial<ProductVariantOut> & { product_id: string };
type VariantDiscount = { min_boxes: number; discount_percent: number };
type BulkVariant = { product_id: string };
const MANUFACTURING_METHODS: ManufacturingMethod[] = ["Пресованные", "Экструзионные", "Литые"];

interface ProductDialogsProps {
  editingProduct: Partial<ProductOut> | null;
  productGallery: GalleryImage[];
  editingVariant: EditableVariant | null;
  variantDiscounts: VariantDiscount[];
  variantImages: VariantImageOut[];
  variantImgUploading: boolean;
  bulkVariant: BulkVariant | null;
  bulkSizes: string;
  bulkColors: string;
  bulkPiecesPerBox: number;
  bulkPrice: number;
  bulkStock: number;
  bulkSkuPrefix: string;
  bulkSaving: boolean;
  categories: CategoryOut[];
  materials: AttributeOut[];
  scents: AttributeOut[];
  shapes: AttributeOut[];
  setEditingProduct: Dispatch<SetStateAction<Partial<ProductOut> | null>>;
  setProductGallery: Dispatch<SetStateAction<GalleryImage[]>>;
  setEditingVariant: Dispatch<SetStateAction<EditableVariant | null>>;
  setVariantDiscounts: Dispatch<SetStateAction<VariantDiscount[]>>;
  setVariantImages: Dispatch<SetStateAction<VariantImageOut[]>>;
  setVariantImgUploading: Dispatch<SetStateAction<boolean>>;
  setBulkVariant: Dispatch<SetStateAction<BulkVariant | null>>;
  setBulkSizes: Dispatch<SetStateAction<string>>;
  setBulkColors: Dispatch<SetStateAction<string>>;
  setBulkPiecesPerBox: Dispatch<SetStateAction<number>>;
  setBulkPrice: Dispatch<SetStateAction<number>>;
  setBulkStock: Dispatch<SetStateAction<number>>;
  setBulkSkuPrefix: Dispatch<SetStateAction<string>>;
  onSaveProduct: () => void;
  onSaveVariant: () => void;
  onSaveBulkVariants: () => void;
  onProductsChanged: () => void;
}

export function ProductDialogs({
  editingProduct,
  productGallery,
  editingVariant,
  variantDiscounts,
  variantImages,
  variantImgUploading,
  bulkVariant,
  bulkSizes,
  bulkColors,
  bulkPiecesPerBox,
  bulkPrice,
  bulkStock,
  bulkSkuPrefix,
  bulkSaving,
  categories,
  materials,
  scents,
  shapes,
  setEditingProduct,
  setProductGallery,
  setEditingVariant,
  setVariantDiscounts,
  setVariantImages,
  setVariantImgUploading,
  setBulkVariant,
  setBulkSizes,
  setBulkColors,
  setBulkPiecesPerBox,
  setBulkPrice,
  setBulkStock,
  setBulkSkuPrefix,
  onSaveProduct: saveProduct,
  onSaveVariant: saveVariant,
  onSaveBulkVariants: saveBulkVariants,
  onProductsChanged: reloadProducts,
}: ProductDialogsProps) {
  return (
    <>
      {/* PRODUCT DIALOG */}

      {/* PRODUCT DIALOG */}
      <Dialog open={!!editingProduct} onOpenChange={(o) => { if (!o) { setEditingProduct(null); setProductGallery([]); } }}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)]">
          <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 sm:px-6"><DialogTitle>{editingProduct?.id ? "Редактировать товар" : "Новый товар"}</DialogTitle></DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            {editingProduct && (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Slug *" value={editingProduct.slug ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, slug: e.target.value })} />
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Категория</span>
                <select value={editingProduct.category_id ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, category_id: e.target.value || null })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">— без категории —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? "↳ " : ""}{c.name_ru}</option>)}
                </select>
              </label>
              <Field label="Название *" value={editingProduct.name_ru ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, name_ru: e.target.value })} />

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Материал</span>
                <select value={editingProduct.material_id ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, material_id: e.target.value || null })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">—</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.name_ru}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Аромат</span>
                <select value={editingProduct.scent_id ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, scent_id: e.target.value || null })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">—</option>
                  {scents.map((s) => <option key={s.id} value={s.id}>{s.name_ru}</option>)}
                </select>
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Форма</span>
                <select value={editingProduct.shape_id ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, shape_id: e.target.value || null })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">—</option>
                  {shapes.map((sh) => <option key={sh.id} value={sh.id}>{sh.name_ru}</option>)}
                </select>
              </label>

              <div className="md:col-span-2">
                <TextArea label="Описание" rows={3} value={editingProduct.description_ru ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, description_ru: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <ImageUpload
                  value={editingProduct.image_url ?? null}
                  onChange={(url) => setEditingProduct({ ...editingProduct, image_url: url })}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Главное фото — используется в карточках. Если пусто, возьмётся первое из галереи.</p>
              </div>
              <div className="md:col-span-2">
                <MultiImageUpload
                  value={productGallery}
                  onChange={setProductGallery}
                  mainImageUrl={editingProduct.image_url ?? null}
                />
              </div>
              <label className="md:col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editingProduct.is_published ?? true} onChange={(e) => setEditingProduct({ ...editingProduct, is_published: e.target.checked })} className="h-4 w-4 accent-primary" />
                Опубликован
              </label>
            </div>
            )}
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-border bg-background px-4 py-3 sm:px-6">
            <Button variant="outline" onClick={() => { setEditingProduct(null); setProductGallery([]); }}>Отмена</Button>
            <Button onClick={saveProduct}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* VARIANT DIALOG */}
      <Dialog open={!!editingVariant} onOpenChange={(o) => { if (!o) { setEditingVariant(null); setVariantDiscounts([]); setVariantImages([]); } }}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)]">
          <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 sm:px-6"><DialogTitle>{editingVariant?.id ? "Редактировать вариацию" : "Новая вариация"}</DialogTitle></DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            {editingVariant && (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="SKU *" value={editingVariant.sku ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, sku: e.target.value })} />
              <Field label="Внешний ID (1С/МойСклад)" value={editingVariant.external_id ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, external_id: e.target.value })} />
              <Field label="Размер" value={editingVariant.size ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, size: e.target.value })} />
              <Field label="Цвет" value={editingVariant.color ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, color: e.target.value })} />
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Способ изготовления
                </span>
                <select
                  value={editingVariant.manufacturing_method ?? ""}
                  onChange={(e) => setEditingVariant({ ...editingVariant, manufacturing_method: (e.target.value || null) as ManufacturingMethod | null })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">—</option>
                  {MANUFACTURING_METHODS.map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editingVariant.has_scent)}
                  onChange={(e) => setEditingVariant({ ...editingVariant, has_scent: e.target.checked })}
                  className="h-4 w-4 accent-primary"
                />
                Есть аромат
              </label>
              <Field label="Шт. в коробке" type="number" min={1} value={editingVariant.pieces_per_box ?? 1} onChange={(e) => setEditingVariant({ ...editingVariant, pieces_per_box: Number(e.target.value) })} />
              <Field label="Остаток (коробок)" type="number" min={0} value={editingVariant.stock_boxes ?? 0} onChange={(e) => setEditingVariant({ ...editingVariant, stock_boxes: Number(e.target.value) })} />
              <Field label="Цена за шт. (RUB)" type="number" min={0} step={0.01} value={editingVariant.price_per_piece_rub ?? 0} onChange={(e) => setEditingVariant({ ...editingVariant, price_per_piece_rub: Number(e.target.value) })} />
              <Field label="Диаметр (мм)" type="number" min={0} value={editingVariant.width_mm ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, width_mm: e.target.value ? Number(e.target.value) : null })} />
              <Field label="Высота (мм)" type="number" min={0} value={editingVariant.height_mm ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, height_mm: e.target.value ? Number(e.target.value) : null })} />
              <Field label="Вес (г)" type="number" min={0} value={editingVariant.weight_gr ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, weight_gr: e.target.value ? Number(e.target.value) : null })} />
              <Field label="Время горения (ч)" type="number" min={0} value={editingVariant.burn_time_hours ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, burn_time_hours: e.target.value ? Number(e.target.value) : null })} />
              <div className="md:col-span-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <p className="text-xs font-semibold text-foreground">Транспортная коробка (ТК)</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Параметры внешней коробки для склада и доставки.</p>
              </div>
              <Field label="Упаковок в ТК" type="number" min={1} value={editingVariant.packages_per_box ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, packages_per_box: e.target.value ? Number(e.target.value) : null })} />
              <Field label="Длина ТК (мм)" type="number" min={0} value={editingVariant.box_length_mm ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, box_length_mm: e.target.value ? Number(e.target.value) : null })} />
              <Field label="Ширина ТК (мм)" type="number" min={0} value={editingVariant.box_width_mm ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, box_width_mm: e.target.value ? Number(e.target.value) : null })} />
              <Field label="Высота ТК (мм)" type="number" min={0} value={editingVariant.box_height_mm ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, box_height_mm: e.target.value ? Number(e.target.value) : null })} />
              <Field label="Вес ТК (г)" type="number" min={0} value={editingVariant.box_weight_gr ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, box_weight_gr: e.target.value ? Number(e.target.value) : null })} />
              <div className="md:col-span-2">
                {editingVariant.id ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Фото вариации ({variantImages.length})
                      </span>
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/webp,image/avif"
                          className="hidden"
                          onChange={async (e) => {
                            const files = e.target.files;
                            if (!files?.length || !editingVariant.id) return;
                            setVariantImgUploading(true);
                            let added = 0;
                            for (const file of Array.from(files)) {
                              const validationError = validateImageFile(file);
                              if (validationError) { toast.error(`${file.name}: ${validationError}`); continue; }
                              try {
                                const { url } = await uploadsApi.uploadProductImage(file);
                                const img = await catalogApi.createVariantImage(editingVariant.id, { url, sort_order: variantImages.length + added });
                                setVariantImages((prev) => [...prev, img]);
                                added++;
                              } catch (err) {
                                toast.error(imageUploadErrorMessage(err, file.name));
                              }
                            }
                            setVariantImgUploading(false);
                            if (added) { toast.success(`Загружено: ${added}`); reloadProducts(); }
                            e.target.value = "";
                          }}
                        />
                        <Button type="button" size="sm" variant="outline" asChild disabled={variantImgUploading}>
                          <span>{variantImgUploading ? "Загрузка..." : "Добавить фото"}</span>
                        </Button>
                      </label>
                    </div>
                    {variantImages.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                        Нет фото. Нажмите «Добавить фото».
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {variantImages.map((img, i) => (
                          <div key={img.id} className="group relative overflow-hidden rounded-md border border-border bg-muted">
                            <img src={img.url} alt="" className="aspect-square w-full object-cover" />
                            {i === 0 && (
                              <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-sm bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary-foreground">
                                главное
                              </span>
                            )}
                            <div className="absolute inset-x-0 bottom-0 flex justify-end bg-background/85 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await catalogApi.deleteVariantImage(img.id);
                                    try { await uploadsApi.delete(img.url); } catch { /* ignore */ }
                                    setVariantImages((prev) => prev.filter((x) => x.id !== img.id));
                                    reloadProducts();
                                  } catch (err) {
                                    toast.error(apiErrorMessage(err, "Не удалось удалить"));
                                  }
                                }}
                                className="rounded-sm p-1 text-destructive hover:bg-destructive/10"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">JPG / PNG / WebP, до 5 МБ. Первое фото — главное.</p>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Сохраните вариацию, чтобы добавить фото
                  </div>
                )}
              </div>
              <div className="md:col-span-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Скидки по объёму</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setVariantDiscounts([...variantDiscounts, { min_boxes: 0, discount_percent: 0 }])}
                  >
                    <Plus className="h-3.5 w-3.5" /> Порог
                  </Button>
                </div>
                {variantDiscounts.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {variantDiscounts.map((d, i) => (
                      <div key={i} className="flex items-end gap-2">
                        <label className="flex-1">
                          <span className="mb-0.5 block text-[11px] text-muted-foreground">от (кор.)</span>
                          <input
                            type="number"
                            min={1}
                            value={d.min_boxes || ""}
                            onChange={(e) => {
                              const next = [...variantDiscounts];
                              next[i] = { ...next[i], min_boxes: Number(e.target.value) };
                              setVariantDiscounts(next);
                            }}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        </label>
                        <label className="flex-1">
                          <span className="mb-0.5 block text-[11px] text-muted-foreground">Скидка %</span>
                          <input
                            type="number"
                            min={0.01}
                            max={100}
                            step={0.01}
                            value={d.discount_percent || ""}
                            onChange={(e) => {
                              const next = [...variantDiscounts];
                              next[i] = { ...next[i], discount_percent: Number(e.target.value) };
                              setVariantDiscounts(next);
                            }}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 text-destructive hover:text-destructive"
                          onClick={() => setVariantDiscounts(variantDiscounts.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {variantDiscounts.length === 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Нет скидок — нажмите «Порог», чтобы добавить.</p>
                )}
              </div>
            </div>
            )}
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-border bg-background px-4 py-3 sm:px-6">
            <Button variant="outline" onClick={() => { setEditingVariant(null); setVariantDiscounts([]); setVariantImages([]); }}>Отмена</Button>
            <Button onClick={saveVariant}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BULK VARIANT GENERATOR DIALOG */}
      <Dialog open={!!bulkVariant} onOpenChange={(o) => { if (!o) { setBulkVariant(null); setBulkSizes(""); setBulkColors(""); setBulkSkuPrefix(""); setBulkPrice(0); setBulkPiecesPerBox(1); setBulkStock(0); } }}>
        <DialogContent
          className="max-w-lg"
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <DialogHeader><DialogTitle>Генератор вариаций</DialogTitle></DialogHeader>
          {bulkVariant && (
            <div className="grid gap-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Размеры (через запятую)</label>
                <input
                  value={bulkSizes}
                  onChange={(e) => setBulkSizes(e.target.value)}
                  placeholder="Ø50×100, Ø60×150, Ø80×200"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="mt-0.5 text-[11px] text-muted-foreground">Оставьте пустым, если размер один или не нужен</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Цвета (через запятую)</label>
                <input
                  value={bulkColors}
                  onChange={(e) => setBulkColors(e.target.value)}
                  placeholder="Медовый, Белый, Красный"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="mt-0.5 text-[11px] text-muted-foreground">Оставьте пустым, если цвет один или не нужен</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="SKU-префикс *" value={bulkSkuPrefix} onChange={(e) => setBulkSkuPrefix(e.target.value)} />
                <Field label="Шт. в коробке" type="number" min={1} value={bulkPiecesPerBox} onChange={(e) => setBulkPiecesPerBox(Number(e.target.value))} />
                <Field label="Цена за шт. (₽)" type="number" min={0} step={0.01} value={bulkPrice} onChange={(e) => setBulkPrice(Number(e.target.value))} />
                <Field label="Остаток (коробок)" type="number" min={0} value={bulkStock} onChange={(e) => setBulkStock(Number(e.target.value))} />
              </div>
              {(() => {
                const sizes = bulkSizes.split(",").map((s) => s.trim()).filter(Boolean);
                const colors = bulkColors.split(",").map((s) => s.trim()).filter(Boolean);
                const count = sizes.length > 0 && colors.length > 0 ? sizes.length * colors.length : Math.max(sizes.length, colors.length);
                return count > 0 ? (
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                    Будет создано <span className="font-semibold text-foreground">{count}</span> вариаций
                    {sizes.length > 0 && colors.length > 0 && (
                      <span> ({sizes.length} размер{sizes.length > 1 ? "ов" : ""} × {colors.length} цвет{colors.length > 1 ? (colors.length < 5 ? "а" : "ов") : ""})</span>
                    )}
                  </div>
                ) : null;
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setBulkVariant(null);
              setBulkSizes("");
              setBulkColors("");
              setBulkSkuPrefix("");
              setBulkPrice(0);
              setBulkPiecesPerBox(1);
              setBulkStock(0);
            }}>Отмена</Button>
            <Button onClick={saveBulkVariants} disabled={bulkSaving}>
              {bulkSaving ? "Создание..." : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
