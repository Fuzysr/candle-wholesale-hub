import { useEffect, useState } from "react";
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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedCategories.findIndex((category) => category.id === active.id);
    const newIndex = orderedCategories.findIndex((category) => category.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(orderedCategories, oldIndex, newIndex);
    setOrderedCategories(reordered);
    try {
      await Promise.all(
        reordered.map((category, index) =>
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
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Перетащите строку за иконку <GripVertical className="inline h-3.5 w-3.5" />,
          чтобы изменить порядок
        </p>
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4" /> Новая категория
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="grid grid-cols-[28px_1fr_140px_100px_60px_80px] items-center gap-2 border-b border-border bg-muted/60 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <div />
          <div>Название</div>
          <div>Slug</div>
          <div>Родитель</div>
          <div className="text-right">Товары</div>
          <div />
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={orderedCategories.map((category) => category.id)}
            strategy={verticalListSortingStrategy}
          >
            {orderedCategories.map((category) => (
              <SortableCatRow
                key={category.id}
                cat={category}
                allCats={orderedCategories}
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
