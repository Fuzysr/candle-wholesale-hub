import type { Currency, OrderListOut } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type PopularProduct = {
  id: string;
  name_ru: string;
  image_url: string | null;
  totalStock: number;
};

export type DashboardTabProps = {
  newCount: number;
  newTodayCount: number;
  processingCount: number;
  monthRevenue: number;
  activeClients: number;
  recentOrders: OrderListOut[];
  popularProducts: PopularProduct[];
  onViewOrders: () => void;
};

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  new: { label: "Новая", className: "bg-info/10 text-info" },
  processing: { label: "В работе", className: "bg-warning/15 text-warning" },
  awaiting_payment: { label: "Ждёт оплаты", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  payment_review: { label: "Проверка чека", className: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  invoiced: { label: "Счёт", className: "bg-primary/15 text-primary" },
  paid: { label: "Оплачен", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  shipped: { label: "Готов", className: "bg-success/15 text-success" },
  completed: { label: "Завершён", className: "bg-muted text-muted-foreground" },
  cancelled: { label: "Отменён", className: "bg-muted text-muted-foreground" },
};

const StatusPill = ({ status }: { status: string }) => {
  const item = STATUS_LABEL[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", item.className)}>
      {item.label}
    </span>
  );
};

type KpiTone = "muted" | "warn" | "ok";
const KPI_TONE: Record<KpiTone, string> = {
  muted: "text-muted-foreground",
  warn: "text-warning",
  ok: "text-success",
};

const KpiCard = ({ label, value, delta, tone }: { label: string; value: string | number; delta: string; tone: KpiTone }) => (
  <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
    <div className={cn("mt-2 text-xs", KPI_TONE[tone])}>{delta}</div>
  </div>
);

const formatCompactMoney = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M ₽`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K ₽`;
  return `${Math.round(value)} ₽`;
};

export const DashboardTab = ({
  newCount,
  newTodayCount,
  processingCount,
  monthRevenue,
  activeClients,
  recentOrders,
  popularProducts,
  onViewOrders,
}: DashboardTabProps) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Новые заявки" value={newCount} delta={newTodayCount > 0 ? `+${newTodayCount} за сегодня` : "сегодня пусто"} tone={newTodayCount > 0 ? "ok" : "muted"} />
      <KpiCard label="В обработке" value={processingCount} delta={processingCount > 0 ? `${processingCount} в работе` : "нет в работе"} tone={processingCount > 0 ? "warn" : "muted"} />
      <KpiCard label="Выручка (мес.)" value={formatCompactMoney(monthRevenue)} delta={monthRevenue > 0 ? "за текущий месяц" : "пока нет продаж"} tone={monthRevenue > 0 ? "ok" : "muted"} />
      <KpiCard label="Активных клиентов" value={activeClients} delta={activeClients > 0 ? `${activeClients} с заказами` : "пока нет клиентов"} tone={activeClients > 0 ? "ok" : "muted"} />
    </div>

    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th colSpan={2} className="px-5 pb-3 pt-5 text-left text-sm font-semibold">Последние заявки</th>
              <th className="px-10 pb-3 pt-5 text-sm font-medium text-primary/80"><div className="flex justify-end">Статус</div></th>
              <th className="px-5 pb-3 pt-5 text-right text-sm">
                <button type="button" onClick={onViewOrders} className="font-medium text-primary transition-colors hover:underline">Все заявки →</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {recentOrders.length === 0 ? (
              <tr><td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">Заявок пока нет</td></tr>
            ) : recentOrders.map((order) => (
              <tr key={order.id} className="border-t border-border">
                <td className="num whitespace-nowrap px-5 py-3 font-semibold">#{order.order_number}</td>
                <td className="py-3 pl-10 pr-5 text-muted-foreground">{order.company_name}</td>
                <td className="px-8 py-3"><div className="flex justify-end"><StatusPill status={order.status} /></div></td>
                <td className="price px-5 py-3 text-right">{formatMoney(Number(order.total), order.currency as Currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h3 className="font-semibold">Популярные товары</h3>
        <ul className="mt-4 space-y-3">
          {popularProducts.length === 0 ? (
            <li className="text-sm text-muted-foreground">Нет товаров</li>
          ) : popularProducts.map((product) => (
            <li key={product.id} className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                {product.image_url && <img src={product.image_url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{product.name_ru}</div>
                <div className="num text-xs text-muted-foreground">{product.totalStock} коробок</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </div>
);

