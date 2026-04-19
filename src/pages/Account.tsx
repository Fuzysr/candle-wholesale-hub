import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import {
  LayoutDashboard,
  FileText,
  User as UserIcon,
  Settings as SettingsIcon,
  ArrowRight,
  Inbox,
  LogOut,
  Mail,
  Phone,
} from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import Reveal from "@/components/ui/reveal";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/theme-toggle";
import { AUTH_ME_KEY, signOut, useAuth, type AppUser } from "@/hooks/useAuth";
import {
  apiErrorMessage,
  authApi,
  catalogApi,
  ordersApi,
  profileApi,
} from "@/lib/api";
import type { Currency, OrderListOut, OrderOut } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useCartStore } from "@/store/cartStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ────────────────────────────── Constants ────────────────────────────── */

/**
 * Support contact shown in the sidebar "Нужна помощь?" card. Kept in sync
 * with the values on the public Contacts page; when the business confirms
 * a dedicated account-manager line, swap these two strings.
 */
const SUPPORT_CONTACT = {
  phone: "+7 (800) 555-12-34 доб. 23",
  email: "anna@mirsvechi.ru",
};

/** Short labels + colour classes for each server-side order status. */
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  new:        { label: "Новая",          cls: "bg-info/10 text-info" },
  processing: { label: "В обработке",    cls: "bg-warning/15 text-warning" },
  invoiced:   { label: "Счёт выставлен", cls: "bg-warning/15 text-warning" },
  paid:       { label: "Оплачена",       cls: "bg-success/10 text-success" },
  shipped:    { label: "Отгружена",      cls: "bg-success/10 text-success" },
  completed:  { label: "Выполнен",       cls: "bg-success/10 text-success" },
  cancelled:  { label: "Отменена",       cls: "bg-destructive/10 text-destructive" },
};

/** Statuses considered "in progress" for the overview counter. */
const IN_PROGRESS_STATUSES = new Set(["new", "processing", "invoiced"]);
/** Statuses considered "done" for the overview counter. */
const COMPLETED_STATUSES = new Set(["paid", "shipped", "completed"]);

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

const AccountSidebar = ({ user }: { user: AppUser }) => {
  const initials = initialsOf(user.profile, user.user.email);
  const fullName =
    user.profile.contact_name ?? user.user.email.split("@")[0] ?? "";
  const companyName = user.profile.company_name ?? "—";

  return (
    <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
      {/* Identity card */}
      <div className="rounded-lg border border-border bg-surface p-5 text-center shadow-sm">
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

      {/* Support card */}
      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
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

/* ───────── Overview ───────── */

type OverviewProps = {
  user: AppUser;
  orders: OrderListOut[];
  onRepeat: (orderId: string) => void;
};

const AccountOverview = ({ user, orders, onRepeat }: OverviewProps) => {
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
          <h1 className="text-3xl font-semibold tracking-tight">
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
            <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
              <table className="w-full text-sm">
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

const AccountOrdersList = ({
  orders,
  onRepeat,
}: {
  orders: OrderListOut[];
  onRepeat: (orderId: string) => void;
}) => {
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

  return (
    <div className="space-y-6">
      <Reveal delay={0} y={18}>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Мои заявки</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Все отправленные заявки с актуальным статусом
          </p>
        </div>
      </Reveal>

      <Reveal delay={80} y={20}>
        {orders.length === 0 ? (
          <EmptyOrdersBlock />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
            <table className="w-full text-sm">
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
                {orders.map((o, i) => (
                  <tr key={o.id} className="border-t border-border">
                    <td className="num whitespace-nowrap px-4 py-3 font-semibold">
                      {o.order_number}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="max-w-[360px] truncate px-4 py-3">
                      {composeLabel(o, detailQueries[i]?.data)}
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

const AccountProfileForm = ({ user }: { user: AppUser }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // View vs. edit mode. Defaults to view so the page opens as a read-only
  // summary; «Редактировать профиль» flips to inputs.
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

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
    Password reset flow: ask the backend for a reset token tied to the user's
    email. In production the link is delivered via email and the response is
    just `ok: true`. In dev (APP_ENV != production) the backend exposes the
    raw token so we can jump straight into /reset-password for testing.
  */
  const handleChangePassword = async () => {
    if (sendingReset) return;
    setSendingReset(true);
    try {
      const res = await authApi.requestPasswordReset(user.user.email);
      if (res.reset_token) {
        toast.success("Открываем форму смены пароля");
        navigate(`/reset-password?token=${encodeURIComponent(res.reset_token)}`);
      } else {
        toast.success("Ссылка на смену пароля отправлена на email");
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось отправить ссылку"));
    } finally {
      setSendingReset(false);
    }
  };

  /* ---- Shared security section (same JSX in both modes) ---- */
  const securityCard = (
    <ProfileSectionCard title="Безопасность">
      <p className="text-sm text-muted-foreground">
        Для смены пароля мы отправим ссылку на вашу электронную почту{" "}
        <span className="text-foreground">{user.user.email}</span>
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleChangePassword}
        disabled={sendingReset}
        className="mt-4"
      >
        {sendingReset ? "Отправка…" : "Сменить пароль"}
      </Button>
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

const AccountSettings = () => {
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

const Account = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const addItem = useCartStore((s) => s.addItem);

  /* Orders list is shared by Overview and OrdersList, so it lives in the
     shell. React-Query will dedupe if a child also requests it. */
  const { data: orders = [] } = useQuery({
    queryKey: ["orders", "mine"],
    queryFn: () => ordersApi.listMine(),
    enabled: !!user,
  });

  /**
   * "Повторить" — takes the items from a past order and drops them back in
   * the cart, so the user can edit quantities before checkout. The backend
   * has no "clone order" endpoint, so we refetch products and cherry-pick
   * variants by id; anything discontinued is silently skipped.
   */
  const onRepeat = async (orderId: string) => {
    try {
      const order = await ordersApi.getById(orderId);
      const products = await catalogApi.listProducts();
      let added = 0;
      for (const item of order.items) {
        if (!item.variant_id) continue;
        const product = products.find((p) =>
          p.variants.some((v) => v.id === item.variant_id),
        );
        const variant = product?.variants.find((v) => v.id === item.variant_id);
        if (!product || !variant) continue;
        addItem(
          {
            variantId: variant.id,
            productId: product.id,
            sku: variant.sku,
            productName: product.name_ru,
            variantLabel: item.variant_label ?? "",
            image: product.image_url,
            piecesPerBox: variant.pieces_per_box,
            priceRub: Number(variant.price_per_piece_rub),
            priceUsd: Number(variant.price_per_piece_usd),
            stockBoxes: Math.max(
              0,
              variant.stock_boxes - variant.reserved_boxes,
            ),
          },
          item.boxes,
        );
        added++;
      }
      if (added === 0) {
        toast.error("Ни одной позиции из заявки нельзя повторить");
        return;
      }
      toast.success(`Добавлено в корзину: ${added} позиций`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось повторить заявку"));
    }
  };

  if (loading) {
    return (
      <PublicLayout>
        <div className="container py-10 text-sm text-muted-foreground">
          Загрузка…
        </div>
      </PublicLayout>
    );
  }
  if (!user) return <Navigate to="/auth?next=/account" replace />;

  /* Pick the sub-view by pathname. Unknown nested paths fall back to
     Overview so typos / stale links don't 404 inside the cabinet. */
  const renderView = () => {
    switch (location.pathname) {
      case "/account/orders":
        return <AccountOrdersList orders={orders} onRepeat={onRepeat} />;
      case "/account/profile":
        return <AccountProfileForm user={user} />;
      case "/account/settings":
        return <AccountSettings />;
      case "/account":
      default:
        return (
          <AccountOverview user={user} orders={orders} onRepeat={onRepeat} />
        );
    }
  };

  return (
    <PublicLayout>
      <div className="container py-8">
        <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
          <AccountSidebar user={user} />
          <main className="min-w-0">{renderView()}</main>
        </div>
      </div>
    </PublicLayout>
  );
};

export default Account;
