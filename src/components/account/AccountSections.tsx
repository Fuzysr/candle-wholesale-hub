import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useQueries, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import {
  LayoutDashboard, FileText, User as UserIcon, Settings as SettingsIcon,
  ArrowRight, Inbox, LogOut, Mail, MailCheck, Phone, Loader2, Upload,
  CheckCircle2, ExternalLink,
} from "lucide-react";

import Reveal from "@/components/ui/reveal";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ThemeToggle from "@/components/theme-toggle";
import { AUTH_ME_KEY, signOut, useAuth, type AppUser } from "@/hooks/useAuth";
import { apiErrorMessage, authApi, ordersApi, profileApi } from "@/lib/api";
import type { Currency, OrderListOut, OrderOut } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SUPPORT_CONTACT } from "@/components/account/constants";

/**
 * Cooldown между запросами письма со ссылкой для сброса пароля.
 *
 * 60 секунд — баланс между UX (дать пользователю перезапросить, если
 * не пришло быстро) и защитой SMTP-сервера от спама перезапросами.
 * На бэкенде rate-limit по IP/email отдельно не реализован, так что
 * клиентский cooldown здесь — единственный ограничитель на стороне
 * залогиненного пользователя.
 */
const RESET_COOLDOWN_MS = 60_000;

/** Short labels + colour classes for each server-side order status. */
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  new:              { label: "Новая",          cls: "bg-info/10 text-info" },
  processing:       { label: "В обработке",    cls: "bg-warning/15 text-warning" },
  awaiting_payment: { label: "Ждёт оплаты",   cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  payment_review:   { label: "Чек на проверке", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  invoiced:         { label: "Счёт выставлен", cls: "bg-warning/15 text-warning" },
  paid:             { label: "Оплачена",       cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  shipped:          { label: "Готов к выдаче",  cls: "bg-success/10 text-success" },
  completed:        { label: "Завершён",       cls: "bg-muted text-muted-foreground" },
  cancelled:        { label: "Отменена",       cls: "bg-destructive/10 text-destructive" },
};

/** Statuses considered "in progress" for the overview counter. */
const IN_PROGRESS_STATUSES = new Set(["new", "processing", "invoiced", "awaiting_payment", "payment_review", "paid"]);
/** Statuses considered "done" for the overview counter. */
const COMPLETED_STATUSES = new Set(["shipped", "completed"]);

/** Nav items rendered in the left sidebar. `end` is passed to `NavLink`
 *  so the /account index route doesn't highlight when viewing sub-pages. */
const SIDEBAR_ITEMS = [
  { to: "/account",          end: true,  icon: LayoutDashboard, label: "Обзор" },
  { to: "/account/orders",   end: false, icon: FileText,        label: "Мои заявки" },
  { to: "/account/profile",  end: false, icon: UserIcon,        label: "Профиль" },
  { to: "/account/settings", end: false, icon: SettingsIcon,    label: "Настройки" },
] as const;

/* ────────────────────────────── Helpers ────────────────────────────── */

/** "Иван Петров" → "Иван"; falls back to email prefix, then "Гость". */
const firstNameOf = (profile: AppUser["profile"], email: string) => {
  const src = (profile.contact_name ?? email.split("@")[0] ?? "").trim();
  return src.split(/\s+/)[0] || "Гость";
};

/** "Иван Петров" → "ИП"; email "a.b@foo" → "AB"; fallback "?". */
const initialsOf = (profile: AppUser["profile"], email: string) => {
  const src = (profile.contact_name ?? email.split("@")[0] ?? "").trim();
  const parts = src.split(/[\s._-]+/).filter(Boolean).slice(0, 2);
  const out = parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return out || "?";
};

/** Compact "Ваниль ×5, Роза ×3" preview for the overview orders table.
 *  Falls back to "{N} кор." when details haven't loaded yet. */
const composeLabel = (
  list: OrderListOut,
  detail: OrderOut | undefined,
): string => {
  if (!detail) return `${list.total_boxes} кор.`;
  const items = detail.items.slice(0, 2);
  const base = items.map((i) => `${i.product_name} ×${i.boxes}`).join(", ");
  const hiddenCount = detail.items.length - items.length;
  return hiddenCount > 0 ? `${base} и ещё ${hiddenCount}` : base;
};

/* ────────────────────────────── Primitives ────────────────────────────── */

const Field = ({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
    <input
      {...props}
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  </label>
);

type StatAccent = "neutral" | "amber" | "green";
const STAT_ACCENT: Record<StatAccent, string> = {
  neutral: "text-foreground",
  amber: "text-amber-600 dark:text-amber-400",
  green: "text-emerald-600 dark:text-emerald-400",
};

/** Big-number tile used on the overview dashboard. */
const StatCard = ({
  value,
  label,
  accent = "neutral",
}: {
  value: React.ReactNode;
  label: string;
  accent?: StatAccent;
}) => (
  <div className="rounded-lg border border-border bg-surface px-5 py-4 shadow-sm transition-shadow hover:shadow-md">
    <div className={cn("text-3xl font-semibold tracking-tight", STAT_ACCENT[accent])}>
      {value}
    </div>
    <div className="mt-1 text-xs text-muted-foreground">{label}</div>
  </div>
);

/* ────────────────────────────── Sidebar ────────────────────────────── */

export const AccountSidebar = ({ user }: { user: AppUser }) => {
  const initials = initialsOf(user.profile, user.user.email);
  const fullName =
    user.profile.contact_name ?? user.user.email.split("@")[0] ?? "";
  const companyName = user.profile.company_name ?? "—";

  return (
    <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
      {/* Identity card — no card chrome on mobile, full card on lg+ */}
      <div className="p-5 text-center lg:rounded-lg lg:border lg:border-border lg:bg-surface lg:shadow-sm">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-base font-semibold uppercase tracking-wide text-primary">
          {initials}
        </div>
        <div className="mt-3 font-semibold leading-tight">{fullName}</div>
        <div className="mt-1 text-xs text-muted-foreground">{companyName}</div>
      </div>

      {/* Primary nav */}
      <nav className="overflow-hidden rounded-lg border border-border bg-surface p-2 shadow-sm">
        {SIDEBAR_ITEMS.map(({ to, end, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground/80 hover:bg-accent hover:text-foreground",
              )
            }
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Support card — hidden on mobile, shown at bottom of page instead */}
      <div className="hidden rounded-lg border border-border bg-surface p-5 shadow-sm lg:block">
        <div className="text-sm font-semibold">Нужна помощь?</div>
        <a
          href={`tel:${SUPPORT_CONTACT.phone.replace(/[^+\d]/g, "")}`}
          className="mt-2 flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <Phone className="h-3.5 w-3.5" />
          {SUPPORT_CONTACT.phone}
        </a>
        <a
          href={`mailto:${SUPPORT_CONTACT.email}`}
          className="mt-1.5 flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <Mail className="h-3.5 w-3.5" />
          {SUPPORT_CONTACT.email}
        </a>
      </div>
    </aside>
  );
};

/* ────────────────────────────── Views ────────────────────────────── */

/**
 * Styling for the «Повторить» link that appears in every orders table.
 * Deliberately uses a calm sky-blue instead of the warm amber primary so it
 * reads as a secondary action: visible against the neutral row background,
 * but not competing with real CTAs like the green status pill or the итог
 * numbers.
 */
const REPEAT_LINK_CLS =
  "text-sm font-medium text-sky-600 transition-colors hover:text-sky-700 hover:underline dark:text-sky-400 dark:hover:text-sky-300";

/** Status pill used by both overview and the full orders list. */
const StatusPill = ({ status }: { status: string }) => {
  const s = STATUS_LABEL[status] ?? { label: status, cls: "bg-muted" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium",
        s.cls,
      )}
    >
      {s.label}
    </span>
  );
};

/** Compact order card for mobile — replaces the wide table rows. */
const MobileOrderCard = ({
  order: o,
  detail,
  onRepeat,
  canUploadReceipt,
  hasReceipt,
  isUploading,
  onUpload,
}: {
  order: OrderListOut;
  detail?: OrderOut;
  onRepeat: (id: string) => void;
  canUploadReceipt?: boolean;
  hasReceipt?: boolean;
  isUploading?: boolean;
  onUpload?: () => void;
}) => (
  <div className="rounded-lg border border-border bg-surface p-3.5 shadow-sm">
    <div className="flex items-start justify-between gap-2">
      <div>
        <span className="num text-sm font-semibold">{o.order_number}</span>
        <span className="ml-2 text-xs text-muted-foreground">
          {new Date(o.created_at).toLocaleDateString("ru-RU")}
        </span>
      </div>
      <StatusPill status={o.status} />
    </div>

    <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
      {composeLabel(o, detail)}
    </p>

    <div className="mt-2 flex items-center justify-between">
      <div className="flex items-baseline gap-3">
        <span className="price text-sm font-semibold">
          {formatMoney(Number(o.total), o.currency as Currency)}
        </span>
        <span className="num text-xs text-muted-foreground">{o.total_boxes} кор.</span>
      </div>
      <div className="flex items-center gap-2">
        {canUploadReceipt && onUpload && (
          <Button
            size="sm"
            variant="outline"
            disabled={isUploading}
            onClick={onUpload}
            className="h-7 gap-1 px-2 text-xs border-amber-500/30 bg-amber-500/10 text-amber-600 hover:border-amber-500/60 hover:bg-amber-500/15 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
          >
            {isUploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : hasReceipt ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            {hasReceipt ? "Чек" : "Оплатил"}
          </Button>
        )}
        {hasReceipt && detail && (
          <a
            href={(detail as OrderOut).payment_receipt_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-xs text-primary"
            title="Открыть чек"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <button
          type="button"
          onClick={() => onRepeat(o.id)}
          className={REPEAT_LINK_CLS}
        >
          Повторить
        </button>
      </div>
    </div>
  </div>
);

/* ───────── Overview ───────── */

type OverviewProps = {
  user: AppUser;
  orders: OrderListOut[];
  onRepeat: (orderId: string) => void;
};

export const AccountOverview = ({ user, orders, onRepeat }: OverviewProps) => {
  const firstName = firstNameOf(user.profile, user.user.email);

  const stats = useMemo(() => {
    const inProgress = orders.filter((o) => IN_PROGRESS_STATUSES.has(o.status)).length;
    const completed = orders.filter((o) => COMPLETED_STATUSES.has(o.status)).length;
    // Currency mix is rare in practice (almost all orders are RUB), but
    // when present we pick the dominant one for the display format.
    const sumByCurrency = orders.reduce<Record<string, number>>((acc, o) => {
      acc[o.currency] = (acc[o.currency] ?? 0) + Number(o.total);
      return acc;
    }, {});
    const [dominantCurrency = "RUB", total = 0] =
      Object.entries(sumByCurrency).sort((a, b) => b[1] - a[1])[0] ?? [];
    return {
      inProgress,
      completed,
      total,
      currency: dominantCurrency as Currency,
    };
  }, [orders]);

  const top3 = useMemo(() => orders.slice(0, 3), [orders]);

  /* Fetch full order details for the recent-3 so the "Состав" column can
     show actual product names — `listMine()` only returns headers. The
     queries are keyed the same way as `repeat()` so they share cache. */
  const detailQueries = useQueries({
    queries: top3.map<UseQueryOptions<OrderOut>>((o) => ({
      queryKey: ["order", o.id],
      queryFn: () => ordersApi.getById(o.id),
      staleTime: 60_000,
    })),
  });

  return (
    <div className="space-y-8">
      <Reveal delay={0} y={18}>
        <div>
          <h1 className="font-semibold tracking-tight text-[clamp(1.5rem,4vw,1.875rem)]">
            Добро пожаловать, {firstName}!
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Обзор вашего аккаунта и последних заявок
          </p>
        </div>
      </Reveal>

      {/* Stat cards */}
      <Reveal delay={80} y={20}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard value={orders.length} label="Заявок всего" />
          <StatCard value={stats.inProgress} label="В обработке" accent="amber" />
          <StatCard value={stats.completed} label="Выполнено" accent="green" />
          <StatCard
            value={formatMoney(stats.total, stats.currency)}
            label="Сумма заказов"
          />
        </div>
      </Reveal>

      {/* Recent orders */}
      <Reveal delay={160} y={22}>
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">Последние заявки</h2>
            {orders.length > 0 && (
              <Link
                to="/account/orders"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Все заявки <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>

          {orders.length === 0 ? (
            <EmptyOrdersBlock />
          ) : (
            <>
            {/* Mobile card list */}
            <div className="flex flex-col gap-3 md:hidden">
              {top3.map((o, i) => (
                <MobileOrderCard
                  key={o.id}
                  order={o}
                  detail={detailQueries[i]?.data}
                  onRepeat={onRepeat}
                />
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-lg border border-border bg-surface shadow-sm md:block">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">№ заявки</th>
                    <th className="px-4 py-3">Дата</th>
                    <th className="px-4 py-3">Состав</th>
                    <th className="px-4 py-3 text-right">Сумма</th>
                    <th className="px-4 py-3">Статус</th>
                    <th className="px-4 py-3 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {top3.map((o, i) => (
                    <tr key={o.id} className="border-t border-border">
                      <td className="px-4 py-3 num font-semibold">{o.order_number}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="max-w-[320px] truncate px-4 py-3">
                        {composeLabel(o, detailQueries[i]?.data)}
                      </td>
                      <td className="price whitespace-nowrap px-4 py-3 text-right">
                        {formatMoney(Number(o.total), o.currency as Currency)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={o.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onRepeat(o.id)}
                          className={REPEAT_LINK_CLS}
                        >
                          Повторить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            </>
          )}
        </div>
      </Reveal>
    </div>
  );
};

const EmptyOrdersBlock = () => (
  <div className="rounded-lg border border-dashed border-border bg-surface/50 p-12 text-center">
    <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
      <Inbox className="h-5 w-5" />
    </div>
    <p className="mt-3 text-sm text-muted-foreground">У вас пока нет заявок.</p>
    <Button asChild className="mt-4">
      <Link to="/catalog">Перейти в каталог</Link>
    </Button>
  </div>
);

/* ───────── Orders (full list) ───────── */

export const AccountOrdersList = ({
  orders,
  onRepeat,
}: {
  orders: OrderListOut[];
  onRepeat: (orderId: string) => void;
}) => {
  const qc = useQueryClient();

  /* Fetch full order details for every visible order so the «Состав заказа»
     column can show real product names instead of just box counts. Queries
     share cache keys with the overview + `onRepeat`, so React-Query dedupes
     identical requests across the cabinet. */
  const detailQueries = useQueries({
    queries: orders.map<UseQueryOptions<OrderOut>>((o) => ({
      queryKey: ["order", o.id],
      queryFn: () => ordersApi.getById(o.id),
      staleTime: 60_000,
    })),
  });

  /* ---------- Receipt upload state ---------- */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingOrderId, setUploadingOrderId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const triggerFileInput = useCallback((orderId: string) => {
    setUploadingOrderId(orderId);
    // reset so same file can be picked again
    if (fileInputRef.current) fileInputRef.current.value = "";
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !uploadingOrderId) return;

      // Client-side guards matching backend limits
      const MAX_SIZE = 5 * 1024 * 1024;
      const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf"];
      if (!ALLOWED.includes(file.type)) {
        toast.error("Допустимые форматы: JPEG, PNG, WebP, AVIF, PDF");
        return;
      }
      if (file.size > MAX_SIZE) {
        toast.error("Файл слишком большой (макс. 5 МБ)");
        return;
      }

      setIsUploading(true);
      try {
        await ordersApi.uploadReceipt(uploadingOrderId, file);
        toast.success("Чек загружен — ожидайте подтверждения оплаты");
        // Refresh order lists so the status pill updates immediately
        qc.invalidateQueries({ queryKey: ["my-orders"] });
        qc.invalidateQueries({ queryKey: ["order", uploadingOrderId] });
      } catch (err) {
        toast.error(apiErrorMessage(err, "Не удалось загрузить чек"));
      } finally {
        setIsUploading(false);
        setUploadingOrderId(null);
      }
    },
    [uploadingOrderId, qc],
  );

  return (
    <div className="space-y-6">
      {/* Hidden file input shared across all rows */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      <Reveal delay={0} y={18}>
        <div>
          <h1 className="font-semibold tracking-tight text-[clamp(1.5rem,4vw,1.875rem)]">Мои заявки</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Все отправленные заявки с актуальным статусом
          </p>
        </div>
      </Reveal>

      <Reveal delay={80} y={20}>
        {orders.length === 0 ? (
          <EmptyOrdersBlock />
        ) : (
          <>
          {/* Mobile card list */}
          <div className="flex flex-col gap-3 md:hidden">
            {orders.map((o, i) => {
              const detail = detailQueries[i]?.data;
              const canUploadReceipt =
                o.status === "awaiting_payment" || o.status === "payment_review";
              const hasReceipt = !!(detail as OrderOut | undefined)?.payment_receipt_url;
              return (
                <MobileOrderCard
                  key={o.id}
                  order={o}
                  detail={detail}
                  onRepeat={onRepeat}
                  canUploadReceipt={canUploadReceipt}
                  hasReceipt={hasReceipt}
                  isUploading={isUploading && uploadingOrderId === o.id}
                  onUpload={() => triggerFileInput(o.id)}
                />
              );
            })}
          </div>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface shadow-sm md:block">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">№ заявки</th>
                  <th className="px-4 py-3">Дата</th>
                  <th className="px-4 py-3">Состав заказа</th>
                  <th className="px-4 py-3 text-right">Коробок</th>
                  <th className="px-4 py-3 text-right">Сумма</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3 text-right" />
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => {
                  const canUploadReceipt =
                    o.status === "awaiting_payment" || o.status === "payment_review";
                  const detail = detailQueries[i]?.data;
                  const hasReceipt = !!(detail as OrderOut | undefined)?.payment_receipt_url;

                  return (
                    <tr key={o.id} className="border-t border-border">
                      <td className="num whitespace-nowrap px-4 py-3 font-semibold">
                        {o.order_number}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="max-w-[360px] truncate px-4 py-3">
                        {composeLabel(o, detail)}
                      </td>
                      <td className="num whitespace-nowrap px-4 py-3 text-right">
                        {o.total_boxes}
                      </td>
                      <td className="price whitespace-nowrap px-4 py-3 text-right">
                        {formatMoney(Number(o.total), o.currency as Currency)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={o.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canUploadReceipt && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isUploading && uploadingOrderId === o.id}
                              onClick={() => triggerFileInput(o.id)}
                              className="h-8 gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-600 hover:border-amber-500/60 hover:bg-amber-500/15 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                            >
                              {isUploading && uploadingOrderId === o.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : hasReceipt ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              ) : (
                                <Upload className="h-3.5 w-3.5" />
                              )}
                              {hasReceipt ? "Перезагрузить чек" : "Я оплатил"}
                            </Button>
                          )}
                          {hasReceipt && (
                            <a
                              href={(detail as OrderOut).payment_receipt_url!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                              title="Открыть загруженный чек"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => onRepeat(o.id)}
                            className={REPEAT_LINK_CLS}
                          >
                            Повторить
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
          </>
        )}
      </Reveal>
    </div>
  );
};

/* ───────── Profile (view + edit) ───────── */

/** Card used on the profile page — consistent chrome around each section. */
const ProfileSectionCard = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
    <h2 className="text-base font-semibold">{title}</h2>
    <div className="mt-5">{children}</div>
  </section>
);

/** Read-only field used in the profile view mode. */
const ReadOnlyField = ({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) => (
  <div>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="mt-1 text-sm font-medium">
      {value && value.length > 0 ? value : "—"}
    </div>
  </div>
);

export const AccountProfileForm = ({ user }: { user: AppUser }) => {
  const queryClient = useQueryClient();

  // View vs. edit mode. Defaults to view so the page opens as a read-only
  // summary; «Редактировать профиль» flips to inputs.
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  // Смена пароля идёт через письмо со ссылкой. Чтобы случайный клик не
  // сыпал на SMTP, используем два слоя защиты:
  //   1) `confirmOpen` — AlertDialog с подтверждением перед отправкой;
  //   2) `cooldownUntil` — отметка времени, до которой кнопка «Отправить
  //      повторно» заблокирована. Отдельно держим `resetSent`, чтобы
  //      после истечения cooldown UI не «мигал» обратно к стартовому
  //      состоянию, а оставался в режиме «мы уже отправили ссылку».
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    phone: "",
    inn: "",
    address: "",
  });

  // Reset the form back to the server state whenever the user data changes
  // OR the user cancels the edit flow (editing flips back to false).
  useEffect(() => {
    setForm({
      company_name: user.profile.company_name ?? "",
      contact_name: user.profile.contact_name ?? "",
      phone: user.profile.phone ?? "",
      inn: user.profile.inn ?? "",
      address: user.profile.address ?? "",
    });
  }, [user, editing]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await profileApi.update({
        company_name: form.company_name || null,
        contact_name: form.contact_name || null,
        phone: form.phone || null,
        inn: form.inn || null,
        address: form.address || null,
      });
      await queryClient.invalidateQueries({ queryKey: AUTH_ME_KEY });
      toast.success("Профиль сохранён");
      setEditing(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось сохранить профиль"));
    } finally {
      setSaving(false);
    }
  };

  /*
    Password reset flow: просим бэкенд выслать ссылку для смены пароля
    на email пользователя. Ответ всегда `ok: true` (защита от
    user-enumeration), сам токен к нам не возвращается — он приходит
    в письме со ссылкой вида `/reset-password?token=...`.

    Кнопка в UI не дёргает API напрямую — она открывает AlertDialog,
    а уже подтверждение внутри модалки вызывает `confirmSendResetLink`.
    После успеха включается cooldown 60с, чтобы один и тот же
    пользователь не мог закидать SMTP-сервер перезапросами.
  */
  const handleChangePasswordClick = () => {
    if (sendingReset) return;
    if (cooldownLeft > 0) return;
    setConfirmOpen(true);
  };

  const confirmSendResetLink = async () => {
    setConfirmOpen(false);
    if (sendingReset) return;
    setSendingReset(true);
    try {
      await authApi.requestPasswordReset(user.user.email);
      toast.success("Ссылка на смену пароля отправлена на email");
      setResetSent(true);
      setCooldownUntil(Date.now() + RESET_COOLDOWN_MS);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось отправить ссылку"));
    } finally {
      setSendingReset(false);
    }
  };

  // Тик раз в секунду, пока активен cooldown. Когда время вышло —
  // обнуляем `cooldownUntil` (флаг `resetSent` остаётся, чтобы UI
  // продолжал показывать «ссылка отправлена» и кнопку «Отправить
  // повторно»). Интервал чистим в return-е, чтобы не течь при unmount.
  useEffect(() => {
    if (!cooldownUntil) {
      setCooldownLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.max(
        0,
        Math.ceil((cooldownUntil - Date.now()) / 1000),
      );
      setCooldownLeft(left);
      if (left === 0) setCooldownUntil(null);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  /* ---- Shared security section (same JSX in both modes) ----

     Два визуальных состояния:
     * `resetSent === false` — дефолт, кнопка «Сменить пароль».
     * `resetSent === true`  — зелёный success-блок с напоминанием
       проверить почту + кнопка «Отправить повторно» с cooldown.

     Отдельная модалка подтверждения страхует от случайного клика:
     запрос к API уходит ТОЛЬКО после подтверждения в AlertDialog. */
  const resendDisabled = sendingReset || cooldownLeft > 0;
  const resendLabel = sendingReset
    ? "Отправка…"
    : cooldownLeft > 0
    ? `Отправить повторно через ${cooldownLeft}с`
    : "Отправить повторно";

  const securityCard = (
    <ProfileSectionCard title="Безопасность">
      {resetSent ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md border border-emerald-200/60 bg-emerald-50 p-4 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/30">
            <MailCheck
              className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="font-medium text-emerald-900 dark:text-emerald-100">
                Ссылка отправлена
              </p>
              <p className="text-emerald-900/80 dark:text-emerald-100/80">
                Мы отправили письмо на{" "}
                <span className="font-medium">{user.user.email}</span>.
                Перейдите по ссылке из письма, чтобы задать новый пароль.
                Ссылка действительна 60 минут.
              </p>
              <p className="text-xs text-emerald-900/70 dark:text-emerald-100/70">
                Не видите письмо? Проверьте папку «Спам». Если его нет и
                там — можно запросить ссылку ещё раз.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleChangePasswordClick}
            disabled={resendDisabled}
          >
            {resendLabel}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Для смены пароля мы отправим ссылку на вашу электронную почту{" "}
            <span className="text-foreground">{user.user.email}</span>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleChangePasswordClick}
            disabled={sendingReset}
            className="mt-4"
          >
            {sendingReset ? "Отправка…" : "Сменить пароль"}
          </Button>
        </>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отправить ссылку для смены пароля?</AlertDialogTitle>
            <AlertDialogDescription>
              На вашу почту{" "}
              <span className="font-medium text-foreground">{user.user.email}</span>{" "}
              будет отправлено письмо со ссылкой, по которой можно задать
              новый пароль. Ссылка действительна 60 минут и становится
              недействительной сразу после смены пароля.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendingReset}>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSendResetLink} disabled={sendingReset}>
              {sendingReset ? "Отправка…" : "Отправить ссылку"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProfileSectionCard>
  );

  /* ---- Edit mode ---- */
  if (editing) {
    return (
      <div className="space-y-6">
        <Reveal delay={0} y={18}>
          <h1 className="text-3xl font-semibold tracking-tight">
            Редактирование профиля
          </h1>
        </Reveal>

        <Reveal delay={80} y={20}>
          <form onSubmit={save} className="space-y-6">
            <ProfileSectionCard title="Контактная информация">
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Контактное лицо"
                  value={form.contact_name}
                  onChange={(e) =>
                    setForm({ ...form, contact_name: e.target.value })
                  }
                />
                {/* Email is the account identity — editing it would require
                    a confirmation flow the backend doesn't support yet, so
                    we surface the current value read-only. */}
                <Field
                  label="Email"
                  value={user.user.email}
                  readOnly
                  disabled
                />
                <Field
                  label="Телефон"
                  value={form.phone}
                  onChange={(e) =>
                    setForm({ ...form, phone: e.target.value })
                  }
                />
                <Field
                  label="Город"
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                />
              </div>
            </ProfileSectionCard>

            <ProfileSectionCard title="Данные компании">
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Название компании"
                  value={form.company_name}
                  onChange={(e) =>
                    setForm({ ...form, company_name: e.target.value })
                  }
                />
                <Field
                  label="ИНН (опционально)"
                  value={form.inn}
                  onChange={(e) => setForm({ ...form, inn: e.target.value })}
                />
              </div>
            </ProfileSectionCard>

            {securityCard}

            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                size="lg"
                disabled={saving}
                className="rounded-full px-8"
              >
                {saving ? "Сохранение…" : "Сохранить изменения"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="rounded-full px-8"
              >
                Отменить
              </Button>
            </div>
          </form>
        </Reveal>
      </div>
    );
  }

  /* ---- View mode ---- */
  return (
    <div className="space-y-6">
      <Reveal delay={0} y={18}>
        <h1 className="text-3xl font-semibold tracking-tight">Мой профиль</h1>
      </Reveal>

      <Reveal delay={80} y={20}>
        <div className="space-y-6">
          <ProfileSectionCard title="Контактная информация">
            <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
              <ReadOnlyField
                label="Контактное лицо"
                value={user.profile.contact_name}
              />
              <ReadOnlyField label="Email" value={user.user.email} />
              <ReadOnlyField label="Телефон" value={user.profile.phone} />
              <ReadOnlyField label="Город" value={user.profile.address} />
            </div>
          </ProfileSectionCard>

          <ProfileSectionCard title="Данные компании">
            <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
              <ReadOnlyField
                label="Название компании"
                value={user.profile.company_name}
              />
              <ReadOnlyField
                label="ИНН (опционально)"
                value={user.profile.inn}
              />
            </div>
          </ProfileSectionCard>

          {securityCard}

          <div>
            <Button
              size="lg"
              onClick={() => setEditing(true)}
              className="rounded-full px-8"
            >
              Редактировать профиль
            </Button>
          </div>
        </div>
      </Reveal>
    </div>
  );
};

/* ───────── Settings ───────── */

export const AccountSettings = () => {
  /*
    Fire the toast BEFORE tearing down the auth session. `signOut()` clears
    tokens synchronously, which triggers `useAuth` in this tree to flip
    `user` to null and hands control to `<Navigate>` on the next render.
    Queuing the toast first guarantees Sonner has the message in its portal
    before React Router unmounts this subtree.
  */
  const handleSignOut = async () => {
    toast.success("Вы успешно вышли из аккаунта");
    await signOut();
  };

  /*
    Settings intentionally stays minimal — currency & language toggles lived
    here previously but were removed on request; the cabinet currently only
    exposes theme + sign-out so this screen doesn't pretend to be richer
    than it actually is.
  */
  return (
    <div className="space-y-6">
      <Reveal delay={0} y={18}>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Настройки</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Внешний вид интерфейса и выход из аккаунта.
          </p>
        </div>
      </Reveal>

      <Reveal delay={80} y={20}>
        <div className="max-w-2xl space-y-5 rounded-lg border border-border bg-surface p-6 shadow-sm">
          <ThemeToggle />

          <div className="flex justify-end border-t border-border pt-5">
            {/* Destructive variant = filled red — sign-out is a terminating
                action, so the colour warns the user before clicking. */}
            <Button
              variant="destructive"
              onClick={handleSignOut}
              className="gap-2"
            >
              <LogOut className="h-4 w-4" /> Выйти из аккаунта
            </Button>
          </div>
        </div>
      </Reveal>
    </div>
  );
};

/* ────────────────────────── Main routing shell ────────────────────────── */
