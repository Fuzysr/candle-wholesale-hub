import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage, ordersApi, profileApi } from "@/lib/api";
import { AUTH_ME_KEY } from "@/hooks/useAuth";
import { useAppStore } from "@/store/appStore";
import { useCartStore } from "@/store/cartStore";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const Field = ({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    <input {...props} className="h-10 w-full rounded-md border border-input bg-surface px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
  </label>
);

const Checkout = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const { items, clear } = useCartStore();
  const { currency } = useAppStore();
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    contact_name: "",
    phone: "",
    email: "",
    delivery_date: "",
    customer_comment: "",
  });

  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        contact_name: user.profile?.contact_name ?? f.contact_name,
        phone: user.profile?.phone ?? f.phone,
        email: user.user.email ?? f.email,
      }));
    }
  }, [user]);

  // Это заявка, а не мгновенная отгрузка: количество не ограничивается
  // текущим складским остатком. Наличие и итоговые условия подтверждает
  // менеджер после отправки.
  const hasStockIssues = false;

  const orderItems = useMemo(
    () =>
      items.map((i) => ({
        variant_id: i.variantId,
        boxes: i.boxes,
      })),
    [items],
  );

  const totalBoxes = orderItems.reduce((sum, item) => sum + item.boxes, 0);

  if (authLoading) {
    return (
      <PublicLayout>
        <div className="container py-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-40" />
            </div>
          </div>
        </div>
      </PublicLayout>
    );
  }

  // Авторизация НЕ требуется — гость может оформить заявку (как на rucandle.ru):
  // бэкенд автоматически создаёт/находит user по email. Позже клиент может
  // восстановить доступ через «Забыли пароль?» и увидеть все свои заявки в ЛК.

  if (items.length === 0) {
    return (
      <PublicLayout>
        <div className="container py-16 text-center">
          <h1 className="text-2xl font-semibold">Корзина пуста</h1>
          <Button asChild className="mt-6"><Link to="/catalog">В каталог</Link></Button>
        </div>
      </PublicLayout>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Гость допустим — бэкенд авто-создаёт user по email. Никакого гейта.
    if (hasStockIssues) {
      toast.error("Часть позиций недоступна на складе — поправьте корзину");
      return;
    }
    setSubmitting(true);

    try {
      const order = await ordersApi.create({
        currency,
        // Доставки нет — только самовывоз. Адрес не передаётся.
        delivery_address: null,
        delivery_date: form.delivery_date || null,
        customer_comment: form.customer_comment || null,
        contact_name: form.contact_name,
        phone: form.phone,
        email: form.email,
        items: orderItems,
      });

      // Keep the profile snapshot in sync for next checkout.
      try {
        await profileApi.update({
          contact_name: form.contact_name || null,
          phone: form.phone || null,
        });
        queryClient.invalidateQueries({ queryKey: AUTH_ME_KEY });
      } catch {
        // non-fatal — order is already created
      }

      clear();
      // Для гостя GET /orders/{id} вернёт 401 — прокидываем заказ через
      // router state, OrderSuccess предпочтёт state перед сетевым запросом.
      navigate(`/order/success/${order.id}`, { state: { order, guest: !user } });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось создать заявку"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      <div className="container py-8">
        <h1 className="font-semibold tracking-tight text-[clamp(1.5rem,4vw,1.875rem)]">Оформление заявки</h1>
        <form onSubmit={handleSubmit} className="mt-6 grid gap-6 sm:mt-8 sm:gap-8 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6 rounded-lg border border-border bg-surface p-6">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Контактные данные</h2>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <Field label="Контактное лицо *" required value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                <Field label="Телефон *" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <Field label="Email *" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Самовывоз</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Заказы отгружаются только самовывозом со склада. Адрес склада менеджер пришлёт вместе со счётом.
              </p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <Field
                  label="Желаемая дата самовывоза"
                  type="date"
                  value={form.delivery_date}
                  onChange={(e) => setForm({ ...form, delivery_date: e.target.value })}
                />
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Комментарий</h2>
              <textarea value={form.customer_comment} onChange={(e) => setForm({ ...form, customer_comment: e.target.value })}
                rows={3} className="mt-3 w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-lg border border-border bg-surface p-5">
              <h3 className="text-sm font-semibold">Состав заявки</h3>
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 text-sm">
                {items.map((i) => (
                  <div key={i.variantId} className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <div className="num text-[11px] text-muted-foreground">{i.sku}</div>
                      <div className="truncate">{i.productName}</div>
                    </div>
                    <div className="num text-xs whitespace-nowrap">{i.boxes} кор.</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Коробок</span><span className="num">{totalBoxes}</span></div>
                <p className="text-xs text-muted-foreground">Стоимость и условия менеджер подтвердит после отправки заявки.</p>
              </div>
              <Button
                type="submit"
                size="lg"
                className="mt-5 w-full"
                disabled={submitting || hasStockIssues}
              >
                {submitting ? "Отправка..." : "Отправить заявку"}
              </Button>
              {hasStockIssues && (
                <p className="mt-3 text-[11px] text-destructive">
                  Часть позиций недоступна на складе.{" "}
                  <Link to="/cart" className="underline">
                    Вернуться в корзину
                  </Link>{" "}
                  и поправить количество.
                </p>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">
                Без онлайн-оплаты. Менеджер свяжется и пришлёт счёт в течение 2 часов в рабочее время.
              </p>
            </div>
          </aside>
        </form>
      </div>
    </PublicLayout>
  );
};

export default Checkout;
