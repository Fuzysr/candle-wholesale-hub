import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProductVariantOut } from "@/lib/api";
import type { StockOpVariant } from "@/components/admin/StockOpDialog";

export type StockVariant = ProductVariantOut & {
  product_name: string;
};

export type StockTabProps = {
  variants: StockVariant[];
  onStockOperation: (variant: StockOpVariant) => void;
};

export const StockTab = ({ variants, onStockOperation }: StockTabProps) => (
  <div className="space-y-4">
    <div className="rounded-lg border border-border bg-surface p-4 text-xs">
      <div className="font-semibold">Webhook для внешней системы (1С / МойСклад):</div>
      <div className="mt-1 break-all rounded-md bg-muted px-2 py-1 num">
        {`${import.meta.env.VITE_API_URL ?? "http://localhost:8000"}/inventory/webhook`}
      </div>
      <div className="mt-2 text-muted-foreground">
        POST с заголовком <code className="num">x-webhook-secret</code> и телом <code className="num">{`{"updates":[{"sku":"...","stock_boxes":N}]}`}</code>.
        Установите секрет <code className="num">INVENTORY_WEBHOOK_SECRET</code> в настройках бэкенда.
      </div>
    </div>
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr><th className="px-3 py-3">SKU</th><th className="px-3 py-3">Товар</th><th className="px-3 py-3 text-right">Остаток</th><th className="px-3 py-3 text-right">Резерв</th><th className="px-3 py-3 text-right">Доступно</th><th className="px-3 py-3">Внешний ID</th><th className="px-3 py-3" /></tr>
        </thead>
        <tbody>
          {variants.map((variant) => {
            const reserved = variant.reserved_boxes ?? 0;
            const available = Math.max(0, variant.stock_boxes - reserved);
            const low = variant.stock_boxes <= 5;
            return (
              <tr key={variant.id} className="border-t border-border">
                <td className="px-3 py-2 num">{variant.sku}</td>
                <td className="px-3 py-2">{variant.product_name}</td>
                <td className={`px-3 py-2 text-right num ${low ? "text-warning" : ""}`}>{variant.stock_boxes}</td>
                <td className="px-3 py-2 text-right num">{reserved}</td>
                <td className="px-3 py-2 text-right num font-semibold">{available}</td>
                <td className="px-3 py-2 num text-xs text-muted-foreground">{variant.external_id ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => onStockOperation({ id: variant.id, sku: variant.sku, stock_boxes: variant.stock_boxes, reserved_boxes: variant.reserved_boxes })}>
                    <Package className="h-3.5 w-3.5" /> Движение
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);
