import { Plus, Minus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type StockOpVariant = {
  id: string;
  sku: string;
  stock_boxes: number;
  reserved_boxes?: number;
};

type Props = {
  variant: StockOpVariant | null;
  onClose: () => void;
  onDone: () => void;
};

const StockOpDialog = ({ variant, onClose, onDone }: Props) => {
  const [type, setType] = useState<"in" | "out" | "adjust">("in");
  const [qty, setQty] = useState(1);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  if (!variant) return null;

  const reserved = variant.reserved_boxes ?? 0;
  const available = Math.max(0, variant.stock_boxes - reserved);

  const submit = async () => {
    if (qty <= 0) return toast.error("Количество должно быть > 0");
    setBusy(true);
    try {
      let newStock = variant.stock_boxes;
      if (type === "in") newStock += qty;
      else if (type === "out") {
        if (qty > available) return toast.error(`Доступно только ${available} кор.`);
        newStock -= qty;
      } else newStock = qty;

      const { error: e1 } = await supabase.from("product_variants").update({ stock_boxes: newStock }).eq("id", variant.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("stock_movements").insert({
        variant_id: variant.id,
        type,
        qty_boxes: type === "adjust" ? qty - variant.stock_boxes : (type === "in" ? qty : -qty),
        source: "admin",
        comment: comment || null,
      });
      if (e2) throw e2;
      toast.success("Движение учтено");
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Движение склада · {variant.sku}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 rounded-md border border-border bg-surface p-2 text-center text-xs">
            <div><div className="text-muted-foreground">Остаток</div><div className="num text-base">{variant.stock_boxes}</div></div>
            <div><div className="text-muted-foreground">В резерве</div><div className="num text-base">{reserved}</div></div>
            <div><div className="text-muted-foreground">Доступно</div><div className="num text-base text-primary">{available}</div></div>
          </div>
          <div className="inline-flex w-full rounded-md border border-input bg-background p-0.5">
            {(["in", "out", "adjust"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 rounded-sm px-2 py-1.5 text-xs font-medium ${type === t ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"}`}
              >
                {t === "in" ? "+ Приход" : t === "out" ? "− Расход" : "= Установить"}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {type === "adjust" ? "Новый остаток" : "Количество (коробок)"}
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" onClick={() => setQty(Math.max(0, qty - 1))}><Minus className="h-3.5 w-3.5" /></Button>
              <input type="number" value={qty} onChange={(e) => setQty(Math.max(0, Number(e.target.value)))} className="h-9 w-full rounded-md border border-input bg-background px-3 text-center text-sm" />
              <Button type="button" variant="outline" size="icon" onClick={() => setQty(qty + 1)}><Plus className="h-3.5 w-3.5" /></Button>
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Комментарий</span>
            <input value={comment} onChange={(e) => setComment(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" placeholder="Накладная № ..." />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Отмена</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "..." : "Применить"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StockOpDialog;
