import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DiscountTierOut } from "@/lib/api";

export type DiscountsTabProps = {
  tiers: DiscountTierOut[];
  onCreate: () => void;
  onEdit: (tier: DiscountTierOut) => void;
  onDelete: (id: string) => void;
};

export const DiscountsTab = ({ tiers, onCreate, onEdit, onDelete }: DiscountsTabProps) => (
  <div className="space-y-4">
    <div className="flex items-start justify-between gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Оптовые пороги: скидка применяется автоматически, когда количество коробок в заявке достигает указанного значения.
      </p>
      <Button onClick={onCreate}><Plus className="h-4 w-4" /> Новая скидка</Button>
    </div>
    <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr><th className="px-4 py-3">От (коробок)</th><th className="px-4 py-3 text-right">Скидка, %</th><th className="px-4 py-3 text-right" /></tr>
        </thead>
        <tbody>
          {tiers.map((tier) => (
            <tr key={tier.id} className="border-t border-border">
              <td className="num px-4 py-3">{tier.min_boxes}</td>
              <td className="num px-4 py-3 text-right text-primary">{tier.discount_percent}%</td>
              <td className="px-4 py-3 text-right">
                <div className="inline-flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => onEdit(tier)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(tier.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </td>
            </tr>
          ))}
          {tiers.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">Скидок пока нет</td></tr>}
        </tbody>
      </table>
    </div>
  </div>
);

