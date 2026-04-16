import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import { useCartStore } from "@/store/cartStore";
import { toast } from "sonner";

type Order = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  currency: string;
  total_boxes: number;
  created_at: string;
};

type OrderItem = {
  variant_id: string | null;
  sku: string;
  product_name: string;
  variant_label: string | null;
  pieces_per_box: number;
  boxes: number;
  unit_price: number;
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  new:        { label: "Новая",          cls: "bg-info/10 text-info" },
  processing: { label: "В обработке",    cls: "bg-warning/15 text-warning" },
  invoiced:   { label: "Счёт выставлен", cls: "bg-warning/15 text-warning" },
  paid:       { label: "Оплачена",       cls: "bg-success/10 text-success" },
  shipped:    { label: "Отгружена",      cls: "bg-success/10 text-success" },
  completed:  { label: "Завершена",      cls: "bg-muted text-muted-foreground" },
  cancelled:  { label: "Отменена",       cls: "bg-destructive/10 text-destructive" },
};

const Field = ({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    <input {...props} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
  </label>
);

const Account = () => {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const addItem = useCartStore((s) => s.addItem);
  const [tab, setTab] = useState<"orders" | "profile">("orders");
  const [profileForm, setProfileForm] = useState({
    company_name: "",
    contact_name: "",
    phone: "",
    inn: "",
    address: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      company_name: user.profile?.company_name ?? "",
      contact_name: user.profile?.contact_name ?? "",
      phone: user.profile?.phone ?? "",
      inn: user.profile?.inn ?? "",
      address: user.profile?.address ?? "",
    });
    supabase.from("orders").select("id,order_number,status,total,currency,total_boxes,created_at")
      .eq("user_id", user.user.id).order("created_at", { ascending: false })
      .then(({ data }) => setOrders((data as Order[]) ?? []));
  }, [user]);

  const repeat = async (orderId: string) => {
    const { data: items } = await supabase.from("order_items").select("*").eq("order_id", orderId);
    if (!items) return;
    let added = 0;
    for (const i of items as OrderItem[]) {
      if (!i.variant_id) continue;
      const { data: v } = await supabase.from("product_variants").select("*, product:products(*)").eq("id", i.variant_id).maybeSingle();
      if (!v) continue;
      const product = (v as { product: { id: string; name_ru: string; image_url: string | null } }).product;
      addItem({
        variantId: v.id, productId: product.id, sku: v.sku,
        productName: product.name_ru,
        variantLabel: i.variant_label ?? "",
        image: product.image_url,
        piecesPerBox: v.pieces_per_box,
        priceRub: Number(v.price_per_piece_rub),
        priceUsd: Number(v.price_per_piece_usd),
        stockBoxes: v.stock_boxes,
      }, i.boxes);
      added++;
    }
    toast.success(`Добавлено в корзину: ${added} позиций`);
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").update(profileForm).eq("id", user.user.id);
    setSavingProfile(false);
    if (error) return toast.error(error.message);
    toast.success("Профиль сохранён");
  };

  if (loading) return <PublicLayout><div className="container py-10">Загрузка...</div></PublicLayout>;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <PublicLayout>
      <div className="container py-8">
        <div className="mb-8">
          <div className="eyebrow mb-2">Личный кабинет</div>
          <h1 className="text-3xl font-semibold tracking-tight">{user.profile?.company_name || user.user.email}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{user.user.email}{user.isAdmin && <> · <Link to="/admin" className="text-primary hover:underline">Админка</Link></>}</p>
        </div>

        <div className="mb-4 inline-flex rounded-md border border-input bg-surface p-0.5">
          <button onClick={() => setTab("orders")} className={`rounded-sm px-3 py-1.5 text-sm ${tab === "orders" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"}`}>
            Мои заявки
          </button>
          <button onClick={() => setTab("profile")} className={`rounded-sm px-3 py-1.5 text-sm ${tab === "profile" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"}`}>
            Профиль
          </button>
        </div>

        {tab === "orders" ? (
          orders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
              <p className="text-sm text-muted-foreground">У вас пока нет заявок.</p>
              <Button asChild className="mt-4"><Link to="/catalog">Перейти в каталог</Link></Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Номер</th>
                    <th className="px-3 py-3">Дата</th>
                    <th className="px-3 py-3">Статус</th>
                    <th className="px-3 py-3 text-right">Коробок</th>
                    <th className="px-3 py-3 text-right">Сумма</th>
                    <th className="px-3 py-3 text-right">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const s = STATUS_LABEL[o.status] ?? { label: o.status, cls: "bg-muted" };
                    return (
                      <tr key={o.id} className="border-t border-border">
                        <td className="px-3 py-2.5 num font-semibold">{o.order_number}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{new Date(o.created_at).toLocaleDateString("ru-RU")}</td>
                        <td className="px-3 py-2.5"><span className={`inline-flex rounded-sm px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span></td>
                        <td className="px-3 py-2.5 text-right num">{o.total_boxes}</td>
                        <td className="px-3 py-2.5 text-right price">{formatMoney(Number(o.total), o.currency as "RUB" | "USD")}</td>
                        <td className="px-3 py-2.5 text-right">
                          <Button size="sm" variant="outline" onClick={() => repeat(o.id)}>Повторить</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <form onSubmit={saveProfile} className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Реквизиты компании</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Название компании" value={profileForm.company_name} onChange={(e) => setProfileForm({ ...profileForm, company_name: e.target.value })} />
              <Field label="ИНН" value={profileForm.inn} onChange={(e) => setProfileForm({ ...profileForm, inn: e.target.value })} />
              <Field label="Контактное лицо" value={profileForm.contact_name} onChange={(e) => setProfileForm({ ...profileForm, contact_name: e.target.value })} />
              <Field label="Телефон" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} />
              <div className="md:col-span-2">
                <Field label="Адрес доставки по умолчанию" value={profileForm.address} onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={savingProfile}>{savingProfile ? "Сохранение..." : "Сохранить"}</Button>
            </div>
          </form>
        )}
      </div>
    </PublicLayout>
  );
};

export default Account;
