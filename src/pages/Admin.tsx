import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";

type AdminOrder = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  currency: string;
  total_boxes: number;
  created_at: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
};

type AdminProduct = {
  id: string;
  name_ru: string;
  is_published: boolean;
  variants: { stock_boxes: number; sku: string }[];
};

const STATUSES = ["new", "processing", "invoiced", "paid", "shipped", "completed", "cancelled"] as const;

const Admin = () => {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [tab, setTab] = useState<"orders" | "products">("orders");

  const load = async () => {
    const [{ data: o }, { data: p }] = await Promise.all([
      supabase.from("orders").select("id,order_number,status,total,currency,total_boxes,created_at,company_name,contact_name,email,phone").order("created_at", { ascending: false }),
      supabase.from("products").select("id,name_ru,is_published,variants:product_variants(stock_boxes,sku)").order("name_ru"),
    ]);
    setOrders((o as AdminOrder[]) ?? []);
    setProducts((p as unknown as AdminProduct[]) ?? []);
  };

  useEffect(() => { if (user?.isAdmin) load(); }, [user]);

  if (loading) return <PublicLayout><div className="container py-10">Загрузка...</div></PublicLayout>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!user.isAdmin) return (
    <PublicLayout>
      <div className="container py-16 text-center">
        <h1 className="text-2xl font-semibold">Доступ запрещён</h1>
        <p className="mt-2 text-muted-foreground">Раздел доступен только администраторам.</p>
        <Button asChild className="mt-6"><Link to="/">На главную</Link></Button>
      </div>
    </PublicLayout>
  );

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("orders").update({ status: status as never }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Статус обновлён");
    load();
  };

  const newCount = orders.filter((o) => o.status === "new").length;
  const lowStock = products.filter((p) => p.variants?.some((v) => v.stock_boxes > 0 && v.stock_boxes <= 5)).length;
  const outOfStock = products.filter((p) => p.variants?.every((v) => v.stock_boxes <= 0)).length;

  return (
    <PublicLayout>
      <div className="container py-8">
        <div className="mb-6">
          <div className="eyebrow mb-2">Админка</div>
          <h1 className="text-3xl font-semibold tracking-tight">Управление магазином</h1>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-xs text-muted-foreground">Новых заявок</div>
            <div className="price text-3xl text-primary">{newCount}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-xs text-muted-foreground">Мало на складе</div>
            <div className="price text-3xl text-warning">{lowStock}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-xs text-muted-foreground">Закончилось</div>
            <div className="price text-3xl text-destructive">{outOfStock}</div>
          </div>
        </div>

        <div className="mb-4 inline-flex rounded-md border border-input bg-surface p-0.5">
          <button onClick={() => setTab("orders")} className={`rounded-sm px-3 py-1.5 text-sm ${tab === "orders" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"}`}>Заявки</button>
          <button onClick={() => setTab("products")} className={`rounded-sm px-3 py-1.5 text-sm ${tab === "products" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"}`}>Товары</button>
        </div>

        {tab === "orders" ? (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Номер</th>
                  <th className="px-3 py-3">Дата</th>
                  <th className="px-3 py-3">Клиент</th>
                  <th className="px-3 py-3 text-right">Кор.</th>
                  <th className="px-3 py-3 text-right">Сумма</th>
                  <th className="px-3 py-3 w-44">Статус</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-border align-top">
                    <td className="px-3 py-2.5 num font-semibold">{o.order_number}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("ru-RU")}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{o.company_name}</div>
                      <div className="text-xs text-muted-foreground">{o.contact_name} · {o.phone}</div>
                      <div className="text-xs text-muted-foreground">{o.email}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right num">{o.total_boxes}</td>
                    <td className="px-3 py-2.5 text-right price">{formatMoney(Number(o.total), o.currency as "RUB" | "USD")}</td>
                    <td className="px-3 py-2.5">
                      <select value={o.status} onChange={(e) => updateStatus(o.id, e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs">
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Заявок пока нет</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Товар</th>
                  <th className="px-3 py-3">SKU вариаций</th>
                  <th className="px-3 py-3 text-right">Остаток (кор.)</th>
                  <th className="px-3 py-3">Опубликован</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const total = p.variants?.reduce((s, v) => s + v.stock_boxes, 0) ?? 0;
                  return (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-3 py-2.5 font-medium">{p.name_ru}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{p.variants?.map((v) => v.sku).join(", ")}</td>
                      <td className="px-3 py-2.5 text-right price">{total}</td>
                      <td className="px-3 py-2.5">{p.is_published ? "Да" : "Нет"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-border p-3 text-xs text-muted-foreground">
              Полный CRUD товаров и категорий — следующий шаг. Пока создавайте/обновляйте через миграции БД.
            </div>
          </div>
        )}
      </div>
    </PublicLayout>
  );
};

export default Admin;
