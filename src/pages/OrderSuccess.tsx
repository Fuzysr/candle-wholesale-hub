import { useParams, useLocation, Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { ordersApi } from "@/lib/api";
import type { OrderOut } from "@/lib/api/types";
import { formatMoney } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";

type LocState = { order?: OrderOut; guest?: boolean } | null;

const OrderSuccess = () => {
  const { id } = useParams();
  const location = useLocation();
  const state = (location.state as LocState) ?? null;
  const { user } = useAuth();

  // Гость: бэкенд авто-создал ему юзера, но в браузере токена нет —
  // GET /orders/{id} вернёт 401. Используем заказ, переданный из Checkout
  // через router state, и не делаем сетевой запрос.
  const isGuest = !!state?.guest || !user;

  const { data: fetchedOrder } = useQuery({
    queryKey: ["order", id],
    queryFn: () => ordersApi.getById(id!),
    enabled: !!id && !isGuest && !state?.order,
    retry: false,
  });

  const order: OrderOut | undefined = state?.order ?? fetchedOrder;

  return (
    <PublicLayout>
      <div className="container max-w-xl py-12 text-center sm:py-20">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="mt-5 font-semibold tracking-tight text-[clamp(1.5rem,4vw,1.875rem)]">Заявка отправлена</h1>
        {order && (
          <>
            <p className="mt-2 text-muted-foreground">Номер заявки: <span className="num font-semibold text-foreground">{order.order_number}</span></p>
            <div className="mt-6 rounded-lg border border-border bg-surface p-5 text-left">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Сумма</span><span className="price">{formatMoney(Number(order.total), order.currency as "RUB" | "USD")}</span></div>
              <div className="mt-2 flex justify-between text-sm"><span className="text-muted-foreground">Email для счёта</span><span>{order.email}</span></div>
            </div>
          </>
        )}
        <p className="mt-6 text-sm text-muted-foreground">
          Менеджер подтвердит наличие и пришлёт счёт с реквизитами в течение 2 часов в рабочее время.
        </p>
        {isGuest && (
          <div className="mt-4 rounded-md border border-amber/30 bg-amber/5 p-4 text-left text-xs text-foreground/80">
            <p className="font-semibold">Хотите видеть статус заказа и историю заявок?</p>
            <p className="mt-1">
              Для этого e-mail{order?.email ? <> <span className="font-medium">{order.email}</span></> : null} мы создали аккаунт.
              Чтобы войти в личный кабинет, нажмите{" "}
              <Link to="/auth?forgot=1" className="underline">«Забыли пароль?»</Link>{" "}
              на странице входа и задайте свой пароль.
            </p>
          </div>
        )}
        <div className="mt-8 flex justify-center gap-3">
          {!isGuest && <Button asChild><Link to="/account/orders">Мои заявки</Link></Button>}
          <Button asChild variant={isGuest ? "default" : "outline"}><Link to="/catalog">В каталог</Link></Button>
        </div>
      </div>
    </PublicLayout>
  );
};

export default OrderSuccess;
