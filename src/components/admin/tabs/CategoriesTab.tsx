import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { GripVertical, Plus } from "lucide-react";
import { toast } from "sonner";

import { SortableCatRow } from "@/components/admin/AdminPrimitives";
import { Button } from "@/components/ui/button";
import { apiErrorMessage, catalogApi, type CategoryOut, type ProductOut } from "@/lib/api";

type CategoriesTabProps = {
  categories: CategoryOut[];
  products: ProductOut[];
  onCreate: () => void;
  onEdit: (category: CategoryOut) => void;
  onDelete: (id: string) => void;
  onChanged: () => void;
};

type CategoryTreeRow = { category: CategoryOut; depth: number };

const buildCategoryTree = (categories: CategoryOut[]): CategoryTreeRow[] => {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const children = new Map<string, CategoryOut[]>();
  const roots: CategoryOut[] = [];
  const compare = (a: CategoryOut, b: CategoryOut) =>
    (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name_ru.localeCompare(b.name_ru, "ru");

  for (const category of categories) {
    if (category.parent_id && byId.has(category.parent_id)) {
      const siblings = children.get(category.parent_id) ?? [];
      siblings.push(category);
      children.set(category.parent_id, siblings);
    } else {
      roots.push(category);
    }
  }

  const rows: CategoryTreeRow[] = [];
  const visited = new Set<string>();
  const visit = (category: CategoryOut, depth: number) => {
    if (visited.has(category.id)) return;
    visited.add(category.id);
    rows.push({ category, depth });
    for (const child of (children.get(category.id) ?? []).sort(compare)) visit(child, depth + 1);
  };

  for (const root of roots.sort(compare)) visit(root, 0);
  // A corrupted cyclic relationship must not hide categories from the admin.
  for (const category of [...categories].sort(compare)) visit(category, 0);
  return rows;
};

export const CategoriesTab = ({
  categories,
  products,
  onCreate,
  onEdit,
  onDelete,
  onChanged,
}: CategoriesTabProps) => {
  const [orderedCategories, setOrderedCategories] = useState<CategoryOut[]>([]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  useEffect(() => {
    setOrderedCategories(
      [...categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    );
  }, [categories]);

  const treeRows = useMemo(() => buildCategoryTree(orderedCategories), [orderedCategories]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeCategory = orderedCategories.find((category) => category.id === active.id);
    const overCategory = orderedCategories.find((category) => category.id === over.id);
    if (!activeCategory || !overCategory) return;
    if (activeCategory.parent_id !== overCategory.parent_id) {
      toast.error("Порядок можно менять только внутри одной родительской категории");
      return;
    }

    const siblings = treeRows
      .filter((row) => row.category.parent_id === activeCategory.parent_id)
      .map((row) => row.category);
    const oldIndex = siblings.findIndex((category) => category.id === active.id);
    const newIndex = siblings.findIndex((category) => category.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reorderedSiblings = arrayMove(siblings, oldIndex, newIndex);
    const newSortOrders = new Map(reorderedSiblings.map((category, index) => [category.id, index]));
    const nextCategories = orderedCategories.map((category) =>
      newSortOrders.has(category.id)
        ? { ...category, sort_order: newSortOrders.get(category.id)! }
        : category,
    );
    setOrderedCategories(nextCategories);
    try {
      await Promise.all(
        reorderedSiblings.map((category, index) =>
          category.sort_order === index
            ? Promise.resolve()
            : catalogApi.updateCategory(category.id, { sort_order: index }),
        ),
      );
      onChanged();
    } catch (error) {
      setOrderedCategories(orderedCategories);
      toast.error(apiErrorMessage(error, "Не удалось изменить порядок категорий"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="max-w-[13rem] text-xs leading-snug text-muted-foreground sm:max-w-none">
          Перетащите строку за иконку <GripVertical className="inline h-3.5 w-3.5" />,
          чтобы изменить порядок
        </p>
        <Button onClick={onCreate} className="shrink-0">
          <Plus className="h-4 w-4" /> Новая категория
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="hidden grid-cols-[28px_1fr_140px_100px_60px_80px] items-center gap-2 border-b border-border bg-muted/60 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid">
          <div />
          <div>Название</div>
          <div>Slug</div>
          <div>Родитель</div>
          <div className="text-right">Товары</div>
          <div />
        </div>
        <div className="grid grid-cols-[24px_minmax(0,1fr)_72px] items-center gap-2 border-b border-border bg-muted/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:hidden">
          <div />
          <div>Название</div>
          <div />
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={treeRows.map((row) => row.category.id)}
            strategy={verticalListSortingStrategy}
          >
            {treeRows.map(({ category, depth }) => (
              <SortableCatRow
                key={category.id}
                cat={category}
                allCats={orderedCategories}
                depth={depth}
                productCount={products.filter(
                  (product) => product.category_id === category.id,
                ).length}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </SortableContext>
        </DndContext>
        {orderedCategories.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Нет категорий
          </div>
        )}
      </div>
    </div>
  );
};
