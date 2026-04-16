import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/store/appStore";
import { useCartStore } from "@/store/cartStore";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney } from "@/lib/format";
import { computeDiscount, type DiscountTier } from "@/lib/catalog";
import { toast } from "sonner";

const Field = ({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    <input {...props} className="h-10 w-full rounded-md border border-input bg-surface px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
  </label>
);

const Checkout = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { items, clear } = useCartStore();
  const { currency } = useAppStore();
  const [tiers, setTiers] = useState<DiscountTier[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    phone: "",
    inn: "",
    email: "",
    delivery_address: "",
    delivery_date: "",
    customer_comment: "",
  });

  useEffect(() => {
    supabase.from("discount_tiers").select("*").order("min_boxes").then(({ data }) => setTiers((data as DiscountTier[]) ?? []));
  }, []);

  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        company_name: user.profile?.company_name ?? f.company_name,
        contact_name: user.profile?.contact_name ?? f.contact_name,
        phone: user.profile?.phone ?? f.phone,
        inn: user.profile?.inn ?? f.inn,
        email: user.user.email ?? f.email,
        delivery_address: user.profile?.address ?? f.delivery_address,
      }));
    }
  }, [user]);

  const totals = useMemo(() => {
    const totalBoxes = items.reduce((s, i) => s + i.boxes, 0);
    const subtotal = items.reduce((s, i) => {
      const price = currency === "RUB" ? i.priceRub : i.priceUsd;
      return s + price * i.piecesPerBox * i.boxes;
    }, 0);
    const discountPercent = computeDiscount(totalBoxes, tiers);
    const discountAmount = (subtotal * discountPercent) / 100;
    return { totalBoxes, subtotal, discountPercent, discountAmount, total: subtotal - discountAmount };
  }, [items, currency, tiers]);

  if (!authLoading && !user) {
    return (
      <PublicLayout>
        <div className="container py-16 text-center">
          <h1 className="text-2xl font-semibold">Войдите, чтобы оформить заявку</h1>
          <p className="mt-2 text-sm text-muted-foreground">Это нужно, чтобы видеть статус и реквизиты в личном кабинете.</p>
          <Button asChild className="mt-6"><Link to={`/auth?next=/checkout`}>Войти / Зарегистрироваться</Link></Button>
        </div>
      </PublicLayout>
    );
  }

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
    if (!user) return;
    setSubmitting(true);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([{
        user_id: user.user.id,
        currency,
        subtotal: totals.subtotal,
        discount_percent: totals.discountPercent,
        discount_amount: totals.discountAmount,
        total: totals.total,
        total_boxes: totals.totalBoxes,
        delivery_address: form.delivery_address || null,
        delivery_date: form.delivery_date || null,
        customer_comment: form.customer_comment || null,
        company_name: form.company_name,
        contact_name: form.contact_name,
        phone: form.phone,
        inn: form.inn,
        email: form.email,
      }])
      .select()
      .single();

    if (orderError || !order) {
      setSubmitting(false);
      toast.error("Не удалось создать заявку: " + (orderError?.message ?? ""));
      return;
    }

    const orderItems = items.map((i) => {
      const unit = currency === "RUB" ? i.priceRub : i.priceUsd;
      return {
        order_id: order.id,
        variant_id: i.variantId,
        sku: i.sku,
        product_name: i.productName,
        variant_label: i.variantLabel,
        pieces_per_box: i.piecesPerBox,
        boxes: i.boxes,
        unit_price: unit,
        line_total: unit * i.piecesPerBox * i.boxes,
      };
    });

    const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
    if (itemsError) {
      setSubmitting(false);
      toast.error("Не удалось сохранить позиции: " + itemsError.message);
      return;
    }

    // Update profile snapshot
    await supabase.from("profiles").update({
      company_name: form.company_name, contact_name: form.contact_name,
      phone: form.phone, inn: form.inn, address: form.delivery_address,
    }).eq("id", user.user.id);

    clear();
    setSubmitting(false);
    navigate(`/order/success/${order.id}`);
  };

  return (
    <PublicLayout>
      <div className="container py-8">
        <h1 className="text-3xl font-semibold tracking-tight">Оформление заявки</h1>
        <form onSubmit={handleSubmit} className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6 rounded-lg border border-border bg-surface p-6">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Реквизиты компании</h2>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <Field label="Название компании *" required value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
                <Field label="ИНН" value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} />
                <Field label="Контактное лицо *" required value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                <Field label="Телефон *" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <Field label="Email *" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Доставка</h2>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Field label="Адрес доставки или «самовывоз»" value={form.delivery_address} onChange={(e) => setForm({ ...form, delivery_address: e.target.value })} />
                </div>
                <Field label="Желаемая дата" type="date" value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} />
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
              <h3 className="text-sm font-semibold">Итого по заявке</h3>
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 text-sm">
                {items.map((i) => (
                  <div key={i.variantId} className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <div className="num text-[11px] text-muted-foreground">{i.sku}</div>
                      <div className="truncate">{i.productName}</div>
                    </div>
                    <div className="price text-xs whitespace-nowrap">{i.boxes} × {formatMoney((currency === "RUB" ? i.priceRub : i.priceUsd) * i.piecesPerBox, currency)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Коробок</span><span className="num">{totals.totalBoxes}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Сумма</span><span className="price">{formatMoney(totals.subtotal, currency)}</span></div>
                {totals.discountPercent > 0 && (
                  <div className="flex justify-between text-primary"><span>Скидка {totals.discountPercent}%</span><span className="price">−{formatMoney(totals.discountAmount, currency)}</span></div>
                )}
                <div className="flex items-baseline justify-between border-t border-border pt-3">
                  <span className="font-semibold">К оплате</span>
                  <span className="price text-2xl">{formatMoney(totals.total, currency)}</span>
                </div>
              </div>
              <Button type="submit" size="lg" className="mt-5 w-full" disabled={submitting}>
                {submitting ? "Отправка..." : "Отправить заявку"}
              </Button>
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
