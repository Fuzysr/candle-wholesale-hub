import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/admin/AdminPrimitives";
import ImageUpload from "@/components/admin/ImageUpload";
import type { AttributeKind, AttributeOut, CategoryOut, DiscountTierOut } from "@/lib/api";

type LookupEditor = { kind: AttributeKind; data: Partial<AttributeOut> };

const LOOKUP_LABEL: Record<AttributeKind, string> = {
  materials: "Материалы",
  scents: "Ароматы",
  shapes: "Формы",
};

interface AdminEntityDialogsProps {
  editingCategory: Partial<CategoryOut> | null;
  editingLookup: LookupEditor | null;
  editingDiscount: Partial<DiscountTierOut> | null;
  categories: CategoryOut[];
  setEditingCategory: Dispatch<SetStateAction<Partial<CategoryOut> | null>>;
  setEditingLookup: Dispatch<SetStateAction<LookupEditor | null>>;
  setEditingDiscount: Dispatch<SetStateAction<Partial<DiscountTierOut> | null>>;
  isSavingCategory: boolean;
  onSaveCategory: () => void;
  onSaveLookup: () => void;
  onSaveDiscount: () => void;
}

export function AdminEntityDialogs({
  editingCategory,
  editingLookup,
  editingDiscount,
  categories,
  setEditingCategory,
  setEditingLookup,
  setEditingDiscount,
  isSavingCategory,
  onSaveCategory: saveCategory,
  onSaveLookup: saveLookup,
  onSaveDiscount: saveDiscount,
}: AdminEntityDialogsProps) {
  const excludedParentIds = new Set<string>();
  if (editingCategory?.id) {
    excludedParentIds.add(editingCategory.id);
    const pending = [editingCategory.id];
    while (pending.length) {
      const parentId = pending.pop()!;
      for (const category of categories) {
        if (category.parent_id === parentId && !excludedParentIds.has(category.id)) {
          excludedParentIds.add(category.id);
          pending.push(category.id);
        }
      }
    }
  }
  const parentOptions = categories.filter((category) => !excludedParentIds.has(category.id));

  return (
    <>
      {/* CATEGORY DIALOG */}
      <Dialog open={!!editingCategory} onOpenChange={(o) => !o && setEditingCategory(null)}>
        <DialogContent className="min-w-0 max-w-md">
          <DialogHeader><DialogTitle>{editingCategory?.id ? "Редактировать категорию" : "Новая категория"}</DialogTitle></DialogHeader>
          {editingCategory && (
            <div className="grid min-w-0 grid-cols-1 gap-4">
              <Field label="Название *" value={editingCategory.name_ru ?? ""} onChange={(e) => setEditingCategory({ ...editingCategory, name_ru: e.target.value })} />
              <Field label="Slug *" value={editingCategory.slug ?? ""} onChange={(e) => setEditingCategory({ ...editingCategory, slug: e.target.value })} />
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Родительская категория</span>
                <select value={editingCategory.parent_id ?? ""} onChange={(e) => setEditingCategory({ ...editingCategory, parent_id: e.target.value || null })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">— корневая —</option>
                  {parentOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name_ru}</option>
                  ))}
                </select>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-input bg-muted/20 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={editingCategory.show_on_home === true}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, show_on_home: e.target.checked })
                  }
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="block font-medium text-foreground">Показывать на главной</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    На главной отображаются максимум пять отмеченных категорий.
                  </span>
                </span>
              </label>
              {editingCategory.show_on_home && (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Обложка для главной
                  </div>
                  <ImageUpload
                    value={editingCategory.home_image_url ?? null}
                    onChange={(home_image_url) =>
                      setEditingCategory({ ...editingCategory, home_image_url })
                    }
                  />
                </div>
              )}

            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCategory(null)} disabled={isSavingCategory}>Отмена</Button>
            <Button onClick={saveCategory} disabled={isSavingCategory}>
              {isSavingCategory ? "Сохранение…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* LOOKUP DIALOG */}
      <Dialog open={!!editingLookup} onOpenChange={(o) => !o && setEditingLookup(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingLookup?.data.id ? "Редактировать" : "Новая запись"} · {editingLookup && LOOKUP_LABEL[editingLookup.kind]}</DialogTitle></DialogHeader>
          {editingLookup && (
            <div className="grid gap-3">
              <Field label="Slug *" value={editingLookup.data.slug ?? ""} onChange={(e) => setEditingLookup({ ...editingLookup, data: { ...editingLookup.data, slug: e.target.value } })} />
              <Field label="Название RU *" value={editingLookup.data.name_ru ?? ""} onChange={(e) => setEditingLookup({ ...editingLookup, data: { ...editingLookup.data, name_ru: e.target.value } })} />
              <Field label="Название EN" value={editingLookup.data.name_en ?? ""} onChange={(e) => setEditingLookup({ ...editingLookup, data: { ...editingLookup.data, name_en: e.target.value } })} />
              <Field label="Сортировка" type="number" value={editingLookup.data.sort_order ?? 0} onChange={(e) => setEditingLookup({ ...editingLookup, data: { ...editingLookup.data, sort_order: Number(e.target.value) } })} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLookup(null)}>Отмена</Button>
            <Button onClick={saveLookup}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DISCOUNT DIALOG */}
      <Dialog open={!!editingDiscount} onOpenChange={(o) => !o && setEditingDiscount(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingDiscount?.id ? "Редактировать скидку" : "Новая скидка"}
            </DialogTitle>
          </DialogHeader>
          {editingDiscount && (
            <div className="grid gap-3">
              <Field
                label="От (коробок) *"
                type="number"
                min={1}
                value={editingDiscount.min_boxes ?? 1}
                onChange={(e) =>
                  setEditingDiscount({
                    ...editingDiscount,
                    min_boxes: Number(e.target.value),
                  })
                }
              />
              <Field
                label="Скидка, % *"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={editingDiscount.discount_percent ?? 0}
                onChange={(e) =>
                  setEditingDiscount({
                    ...editingDiscount,
                    discount_percent: Number(e.target.value),
                  })
                }
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDiscount(null)}>Отмена</Button>
            <Button onClick={saveDiscount}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
