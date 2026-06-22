import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, NavLink, useLocation } from "react-router-dom";
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
  MailCheck,
  Phone,
  Loader2,
  Upload,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import Reveal from "@/components/ui/reveal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ThemeToggle from "@/components/theme-toggle";
import { AUTH_ME_KEY, signOut, useAuth, type AppUser } from "@/hooks/useAuth";
import {
  apiErrorMessage,
  authApi,
  ordersApi,
  profileApi,
} from "@/lib/api";
import type { Currency, OrderListOut, OrderOut } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AccountOrdersList,
  AccountOverview,
  AccountProfileForm,
  AccountSettings,
  AccountSidebar,
} from "@/components/account/AccountSections";
import { SUPPORT_CONTACT } from "@/components/account/constants";

/* ────────────────────────────── Constants ────────────────────────────── */

/**
 * Support contact shown in the sidebar "Нужна помощь?" card. Kept in sync
 * with the values on the public Contacts page; when the business confirms
 * a dedicated account-manager line, swap these two strings.
 */
const Account = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();

  /* Orders list is shared by Overview and OrdersList, so it lives in the
     shell. React-Query will dedupe if a child also requests it. */
  const { data: orders = [] } = useQuery({
    queryKey: ["orders", "mine"],
    queryFn: () => ordersApi.listMine(),
    enabled: !!user,
  });

  /* ───── Repeat-order modal state ───── */
  const [repeatOrder, setRepeatOrder] = useState<OrderOut | null>(null);
  const [repeatLoading, setRepeatLoading] = useState(false);
  const [repeatSubmitting, setRepeatSubmitting] = useState(false);

  /**
   * "Повторить" — fetches the original order and shows a confirmation modal
   * with the order composition. The user reviews and clicks «Подтвердить»
   * to submit a brand-new order with the same items instantly.
   */
  const onRepeat = async (orderId: string) => {
    setRepeatLoading(true);
    try {
      const order = await ordersApi.getById(orderId);
      if (!order.items.length) {
        toast.error("Заявка пуста — нечего повторять");
        return;
      }
      setRepeatOrder(order);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось загрузить заявку"));
    } finally {
      setRepeatLoading(false);
    }
  };

  const confirmRepeatOrder = async () => {
    if (!repeatOrder) return;
    setRepeatSubmitting(true);
    try {
      await ordersApi.create({
        currency: repeatOrder.currency,
        // Доставки нет — только самовывоз. Адрес не передаётся.
        delivery_address: null,
        customer_comment: `Повтор заявки #${repeatOrder.order_number}`,
        company_name: repeatOrder.company_name,
        contact_name: repeatOrder.contact_name,
        phone: repeatOrder.phone,
        inn: repeatOrder.inn,
        email: repeatOrder.email,
        items: repeatOrder.items.map((it) => ({
          variant_id: it.variant_id,
          sku: it.sku,
          product_name: it.product_name,
          variant_label: it.variant_label,
          pieces_per_box: it.pieces_per_box,
          boxes: it.boxes,
          unit_price: Number(it.unit_price),
        })),
      });
      toast.success("Повторная заявка успешно отправлена!");
      setRepeatOrder(null);
      queryClient.invalidateQueries({ queryKey: ["orders", "mine"] });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось отправить заявку"));
    } finally {
      setRepeatSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PublicLayout>
        <div className="container py-8">
          <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
            <div className="space-y-3">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
            <div className="space-y-6">
              <Skeleton className="h-8 w-48" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
              </div>
              <Skeleton className="h-48" />
            </div>
          </div>
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

        {/* Support card — mobile only, at the bottom of the page */}
        <div className="mt-8 rounded-lg border border-border bg-surface p-5 shadow-sm lg:hidden">
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
      </div>

      {/* ───── Repeat-order confirmation modal ───── */}
      <Dialog open={!!repeatOrder} onOpenChange={(o) => !o && setRepeatOrder(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Повторить заявку {repeatOrder ? `#${repeatOrder.order_number}` : ""}
            </DialogTitle>
          </DialogHeader>

          {repeatOrder && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Будет создана новая заявка с тем же составом. Проверьте позиции:
              </p>

              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Товар</th>
                      <th className="px-3 py-2 text-right">Шт/кор</th>
                      <th className="px-3 py-2 text-right">Кор.</th>
                      <th className="px-3 py-2 text-right">Цена</th>
                      <th className="px-3 py-2 text-right">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repeatOrder.items.map((it) => (
                      <tr key={it.id ?? it.sku} className="border-t border-border">
                        <td className="num px-3 py-2">{it.sku}</td>
                        <td className="px-3 py-2">
                          {it.product_name}
                          {it.variant_label ? ` · ${it.variant_label}` : ""}
                        </td>
                        <td className="num px-3 py-2 text-right">{it.pieces_per_box}</td>
                        <td className="num px-3 py-2 text-right">{it.boxes}</td>
                        <td className="num px-3 py-2 text-right">
                          {Number(it.unit_price).toFixed(2)}
                        </td>
                        <td className="price px-3 py-2 text-right">
                          {formatMoney(
                            Number(it.line_total),
                            repeatOrder.currency as Currency,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">
                  Коробок:{" "}
                  <span className="num font-medium text-foreground">
                    {repeatOrder.total_boxes}
                  </span>
                </span>
                <div className="price text-base font-semibold">
                  {formatMoney(
                    Number(repeatOrder.total),
                    repeatOrder.currency as Currency,
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRepeatOrder(null)}
              disabled={repeatSubmitting}
            >
              Отмена
            </Button>
            <Button
              onClick={confirmRepeatOrder}
              disabled={repeatSubmitting}
            >
              {repeatSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {repeatSubmitting ? "Отправка…" : "Подтвердить и отправить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
};

export default Account;
