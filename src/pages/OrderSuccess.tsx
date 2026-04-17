import { useParams, Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { ordersApi } from "@/lib/api";
import { formatMoney } from "@/lib/format";

const OrderSuccess = () => {
  const { id } = useParams();

  const { data: order } = useQuery({
    queryKey: ["order", id],
    queryFn: () => ordersApi.getById(id!),
    enabled: !!id,
    retry: false,
  });

  return (
    <PublicLayout>
      <div className="container max-w-xl py-20 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">Заявка отправлена</h1>
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
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild><Link to="/account/orders">Мои заявки</Link></Button>
          <Button asChild variant="outline"><Link to="/catalog">В каталог</Link></Button>
        </div>
      </div>
    </PublicLayout>
  );
};

export default OrderSuccess;
