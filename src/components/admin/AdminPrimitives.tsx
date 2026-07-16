import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CategoryOut } from "@/lib/api";
import { cn } from "@/lib/utils";

// Kept beside StatusPill so status vocabulary and its presentation cannot drift.
// eslint-disable-next-line react-refresh/only-export-components
export const ORDER_STATUSES = [
  "new",
  "processing",
  "awaiting_payment",
  "payment_review",
  "invoiced",
  "paid",
  "shipped",
  "completed",
  "cancelled",
] as const;

export type AdminOrderStatus = (typeof ORDER_STATUSES)[number];

export type StatusPresentation = {
  label: string;
  cls: string;
};

// eslint-disable-next-line react-refresh/only-export-components
export const STATUS_LABEL: Record<AdminOrderStatus, StatusPresentation> = {
  new: { label: "Новая", cls: "bg-info/10 text-info" },
  processing: { label: "В работе", cls: "bg-warning/15 text-warning" },
  awaiting_payment: { label: "Ждёт оплаты", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  payment_review: { label: "Проверка чека", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  invoiced: { label: "Счёт", cls: "bg-primary/15 text-primary" },
  paid: { label: "Оплачен", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  shipped: { label: "Готов", cls: "bg-success/15 text-success" },
  completed: { label: "Завершён", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Отменён", cls: "bg-muted text-muted-foreground" },
};

const FALLBACK_STATUS: StatusPresentation = {
  label: "",
  cls: "bg-muted text-muted-foreground",
};

export const StatusPill = ({ status }: { status: string }) => {
  const presentation = STATUS_LABEL[status as AdminOrderStatus] ?? {
    ...FALLBACK_STATUS,
    label: status,
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        presentation.cls,
      )}
    >
      {presentation.label}
    </span>
  );
};

export type FieldProps = { label: string } & InputHTMLAttributes<HTMLInputElement>;

export const Field = ({ label, className, ...props }: FieldProps) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
    <input
      {...props}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    />
  </label>
);

export type TextAreaProps = { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>;

export const TextArea = ({ label, className, ...props }: TextAreaProps) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
    <textarea
      {...props}
      className={cn(
        "w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    />
  </label>
);

export type KpiTone = "muted" | "warn" | "ok" | "primary";

const KPI_TONE: Record<KpiTone, string> = {
  muted: "text-muted-foreground",
  warn: "text-warning",
  ok: "text-success",
  primary: "text-primary",
};

export type KpiCardProps = {
  label: string;
  value: string | number;
  delta?: string;
  deltaTone?: KpiTone;
};

export const KpiCard = ({ label, value, delta, deltaTone = "muted" }: KpiCardProps) => (
  <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
    {delta && <div className={cn("mt-2 text-xs", KPI_TONE[deltaTone])}>{delta}</div>}
  </div>
);

export type SortableCatRowProps = {
  cat: CategoryOut;
  allCats: CategoryOut[];
  productCount: number;
  depth?: number;
  onEdit: (category: CategoryOut) => void;
  onDelete: (id: string) => void;
};

export const SortableCatRow = ({
  cat,
  allCats,
  productCount,
  depth = 0,
  onEdit,
  onDelete,
}: SortableCatRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cat.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={cn(
        "grid grid-cols-[28px_1fr_140px_100px_60px_80px] items-center gap-2 border-t border-border px-3 py-2.5 text-sm",
        depth > 0 && "bg-muted/15",
      )}
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
        aria-label="Перетащить"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div
        className={cn("min-w-0", depth === 0 ? "font-semibold" : "font-medium")}
        style={{ paddingInlineStart: `${depth * 24}px` }}
      >
        {cat.parent_id && <span className="text-muted-foreground">↳ </span>}
        {cat.name_ru}
      </div>
      <div className="num text-xs text-muted-foreground">{cat.slug}</div>
      <div className="text-xs text-muted-foreground">
        {allCats.find((parent) => parent.id === cat.parent_id)?.name_ru ?? "—"}
      </div>
      <div className="num text-right text-muted-foreground">{productCount}</div>
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => onEdit(cat)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(cat.id)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};
