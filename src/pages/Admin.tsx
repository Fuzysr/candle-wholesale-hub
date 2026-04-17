import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Plus, Pencil, Trash2 } from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ImageUpload from "@/components/admin/ImageUpload";
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

type AdminVariant = {
  id: string;
  product_id: string;
  sku: string;
  size: string | null;
  color: string | null;
  shape: string | null;
  pieces_per_box: number;
  price_per_piece_rub: number;
  price_per_piece_usd: number;
  stock_boxes: number;
};

type AdminProduct = {
  id: string;
  slug: string;
  name_ru: string;
  name_en: string;
  description_ru: string | null;
  description_en: string | null;
  image_url: string | null;
  is_published: boolean;
  category_id: string | null;
  variants: AdminVariant[];
};

type AdminCategory = {
  id: string;
  slug: string;
  name_ru: string;
  name_en: string;
  sort_order: number;
};

const STATUSES = ["new", "processing", "invoiced", "paid", "shipped", "completed", "cancelled"] as const;

const Field = ({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    <input {...props} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
  </label>
);

const TextArea = ({ label, ...props }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    <textarea {...props} className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
  </label>
);

const Admin = () => {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [tab, setTab] = useState<"orders" | "products" | "categories">("orders");

  // Dialogs
  const [editingProduct, setEditingProduct] = useState<Partial<AdminProduct> | null>(null);
  const [editingCategory, setEditingCategory] = useState<Partial<AdminCategory> | null>(null);
  const [editingVariant, setEditingVariant] = useState<(Partial<AdminVariant> & { product_id: string }) | null>(null);

  const load = async () => {
    const [{ data: o }, { data: p }, { data: c }] = await Promise.all([
      supabase.from("orders").select("id,order_number,status,total,currency,total_boxes,created_at,company_name,contact_name,email,phone").order("created_at", { ascending: false }),
      supabase.from("products").select("*, variants:product_variants(*)").order("name_ru"),
      supabase.from("categories").select("*").order("sort_order"),
    ]);
    setOrders((o as AdminOrder[]) ?? []);
    setProducts((p as unknown as AdminProduct[]) ?? []);
    setCategories((c as AdminCategory[]) ?? []);
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

  // ======= PRODUCTS =======
  const saveProduct = async () => {
    if (!editingProduct) return;
    const payload = {
      slug: editingProduct.slug || "",
      name_ru: editingProduct.name_ru || "",
      name_en: editingProduct.name_en || "",
      description_ru: editingProduct.description_ru || null,
      description_en: editingProduct.description_en || null,
      image_url: editingProduct.image_url || null,
      category_id: editingProduct.category_id || null,
      is_published: editingProduct.is_published ?? true,
    };
    if (!payload.slug || !payload.name_ru || !payload.name_en) return toast.error("Заполните slug и названия");

    let error;
    if (editingProduct.id) {
      ({ error } = await supabase.from("products").update(payload).eq("id", editingProduct.id));
    } else {
      ({ error } = await supabase.from("products").insert(payload));
    }
    if (error) return toast.error(error.message);
    toast.success("Сохранено");
    setEditingProduct(null);
    load();
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Удалить товар вместе со всеми вариациями?")) return;
    await supabase.from("product_variants").delete().eq("product_id", id);
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Удалено");
    load();
  };

  // ======= VARIANTS =======
  const saveVariant = async () => {
    if (!editingVariant) return;
    const payload = {
      product_id: editingVariant.product_id,
      sku: editingVariant.sku || "",
      size: editingVariant.size || null,
      color: editingVariant.color || null,
      shape: editingVariant.shape || null,
      pieces_per_box: Number(editingVariant.pieces_per_box) || 1,
      price_per_piece_rub: Number(editingVariant.price_per_piece_rub) || 0,
      price_per_piece_usd: Number(editingVariant.price_per_piece_usd) || 0,
      stock_boxes: Number(editingVariant.stock_boxes) || 0,
    };
    if (!payload.sku) return toast.error("Укажите SKU");

    let error;
    if (editingVariant.id) {
      ({ error } = await supabase.from("product_variants").update(payload).eq("id", editingVariant.id));
    } else {
      ({ error } = await supabase.from("product_variants").insert(payload));
    }
    if (error) return toast.error(error.message);
    toast.success("Сохранено");
    setEditingVariant(null);
    load();
  };

  const deleteVariant = async (id: string) => {
    if (!confirm("Удалить вариацию?")) return;
    const { error } = await supabase.from("product_variants").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Удалено");
    load();
  };

  // ======= CATEGORIES =======
  const saveCategory = async () => {
    if (!editingCategory) return;
    const payload = {
      slug: editingCategory.slug || "",
      name_ru: editingCategory.name_ru || "",
      name_en: editingCategory.name_en || "",
      sort_order: Number(editingCategory.sort_order) || 0,
    };
    if (!payload.slug || !payload.name_ru) return toast.error("Заполните slug и название");

    let error;
    if (editingCategory.id) {
      ({ error } = await supabase.from("categories").update(payload).eq("id", editingCategory.id));
    } else {
      ({ error } = await supabase.from("categories").insert(payload));
    }
    if (error) return toast.error(error.message);
    toast.success("Сохранено");
    setEditingCategory(null);
    load();
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("Удалить категорию? Товары в ней останутся без категории.")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Удалено");
    load();
  };

  const newCount = orders.filter((o) => o.status === "new").length;
  const lowStock = products.filter((p) => p.variants?.some((v) => v.stock_boxes > 0 && v.stock_boxes <= 5)).length;
  const outOfStock = products.filter((p) => p.variants?.length > 0 && p.variants.every((v) => v.stock_boxes <= 0)).length;

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

        <div className="mb-4 inline-flex flex-wrap rounded-md border border-input bg-surface p-0.5">
          {(["orders", "products", "categories"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-sm px-3 py-1.5 text-sm ${tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"}`}>
              {t === "orders" ? "Заявки" : t === "products" ? "Товары" : "Категории"}
            </button>
          ))}
        </div>

        {tab === "orders" && (
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
        )}

        {tab === "products" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setEditingProduct({ is_published: true })}><Plus className="h-4 w-4" /> Новый товар</Button>
            </div>
            <div className="space-y-3">
              {products.map((p) => (
                <div key={p.id} className="rounded-lg border border-border bg-surface">
                  <div className="flex items-start justify-between gap-3 border-b border-border p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.name_ru}</span>
                        {!p.is_published && <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">черновик</span>}
                      </div>
                      <div className="num text-xs text-muted-foreground">/{p.slug} · {categories.find((c) => c.id === p.category_id)?.name_ru ?? "без категории"}</div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditingProduct(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingVariant({ product_id: p.id, pieces_per_box: 1 })}><Plus className="h-3.5 w-3.5" /> Вариация</Button>
                      <Button size="sm" variant="outline" onClick={() => deleteProduct(p.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-left uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">SKU</th>
                          <th className="px-3 py-2">Размер</th>
                          <th className="px-3 py-2">Цвет</th>
                          <th className="px-3 py-2 text-right">Шт/кор</th>
                          <th className="px-3 py-2 text-right">RUB/шт</th>
                          <th className="px-3 py-2 text-right">USD/шт</th>
                          <th className="px-3 py-2 text-right">Кор.</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.variants?.map((v) => (
                          <tr key={v.id} className="border-t border-border">
                            <td className="px-3 py-2 num">{v.sku}</td>
                            <td className="px-3 py-2">{v.size ?? "—"}</td>
                            <td className="px-3 py-2">{v.color ?? "—"}</td>
                            <td className="px-3 py-2 text-right num">{v.pieces_per_box}</td>
                            <td className="px-3 py-2 text-right num">{v.price_per_piece_rub}</td>
                            <td className="px-3 py-2 text-right num">{v.price_per_piece_usd}</td>
                            <td className="px-3 py-2 text-right num">{v.stock_boxes}</td>
                            <td className="px-3 py-2 text-right">
                              <div className="inline-flex gap-1">
                                <Button size="sm" variant="ghost" onClick={() => setEditingVariant(v)}><Pencil className="h-3 w-3" /></Button>
                                <Button size="sm" variant="ghost" onClick={() => deleteVariant(v.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {(!p.variants || p.variants.length === 0) && (
                          <tr><td colSpan={8} className="px-3 py-3 text-center text-muted-foreground">Нет вариаций</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "categories" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setEditingCategory({ sort_order: categories.length })}><Plus className="h-4 w-4" /> Новая категория</Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Название (RU)</th>
                    <th className="px-3 py-3">Название (EN)</th>
                    <th className="px-3 py-3">Slug</th>
                    <th className="px-3 py-3 text-right">Сортировка</th>
                    <th className="px-3 py-3 text-right">Товаров</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="px-3 py-2.5 font-medium">{c.name_ru}</td>
                      <td className="px-3 py-2.5">{c.name_en}</td>
                      <td className="px-3 py-2.5 num text-muted-foreground">{c.slug}</td>
                      <td className="px-3 py-2.5 text-right num">{c.sort_order}</td>
                      <td className="px-3 py-2.5 text-right num">{products.filter((p) => p.category_id === c.id).length}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditingCategory(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteCategory(c.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* PRODUCT DIALOG */}
      <Dialog open={!!editingProduct} onOpenChange={(o) => !o && setEditingProduct(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingProduct?.id ? "Редактировать товар" : "Новый товар"}</DialogTitle></DialogHeader>
          {editingProduct && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Slug *" value={editingProduct.slug ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, slug: e.target.value })} />
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Категория</span>
                <select value={editingProduct.category_id ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, category_id: e.target.value || null })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">— без категории —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name_ru}</option>)}
                </select>
              </label>
              <Field label="Название RU *" value={editingProduct.name_ru ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, name_ru: e.target.value })} />
              <Field label="Название EN *" value={editingProduct.name_en ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, name_en: e.target.value })} />
              <div className="md:col-span-2">
                <TextArea label="Описание RU" rows={3} value={editingProduct.description_ru ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, description_ru: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <TextArea label="Описание EN" rows={3} value={editingProduct.description_en ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, description_en: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <ImageUpload
                  value={editingProduct.image_url ?? null}
                  onChange={(url) => setEditingProduct({ ...editingProduct, image_url: url })}
                />
              </div>
              <label className="md:col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editingProduct.is_published ?? true} onChange={(e) => setEditingProduct({ ...editingProduct, is_published: e.target.checked })} className="h-4 w-4 accent-primary" />
                Опубликован
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProduct(null)}>Отмена</Button>
            <Button onClick={saveProduct}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* VARIANT DIALOG */}
      <Dialog open={!!editingVariant} onOpenChange={(o) => !o && setEditingVariant(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingVariant?.id ? "Редактировать вариацию" : "Новая вариация"}</DialogTitle></DialogHeader>
          {editingVariant && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="SKU *" value={editingVariant.sku ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, sku: e.target.value })} />
              <Field label="Размер" value={editingVariant.size ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, size: e.target.value })} />
              <Field label="Цвет" value={editingVariant.color ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, color: e.target.value })} />
              <Field label="Форма" value={editingVariant.shape ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, shape: e.target.value })} />
              <Field label="Шт. в коробке" type="number" min={1} value={editingVariant.pieces_per_box ?? 1} onChange={(e) => setEditingVariant({ ...editingVariant, pieces_per_box: Number(e.target.value) })} />
              <Field label="Остаток (коробок)" type="number" min={0} value={editingVariant.stock_boxes ?? 0} onChange={(e) => setEditingVariant({ ...editingVariant, stock_boxes: Number(e.target.value) })} />
              <Field label="Цена за шт. (RUB)" type="number" min={0} step={0.01} value={editingVariant.price_per_piece_rub ?? 0} onChange={(e) => setEditingVariant({ ...editingVariant, price_per_piece_rub: Number(e.target.value) })} />
              <Field label="Цена за шт. (USD)" type="number" min={0} step={0.01} value={editingVariant.price_per_piece_usd ?? 0} onChange={(e) => setEditingVariant({ ...editingVariant, price_per_piece_usd: Number(e.target.value) })} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingVariant(null)}>Отмена</Button>
            <Button onClick={saveVariant}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CATEGORY DIALOG */}
      <Dialog open={!!editingCategory} onOpenChange={(o) => !o && setEditingCategory(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingCategory?.id ? "Редактировать категорию" : "Новая категория"}</DialogTitle></DialogHeader>
          {editingCategory && (
            <div className="grid gap-4">
              <Field label="Название RU *" value={editingCategory.name_ru ?? ""} onChange={(e) => setEditingCategory({ ...editingCategory, name_ru: e.target.value })} />
              <Field label="Название EN *" value={editingCategory.name_en ?? ""} onChange={(e) => setEditingCategory({ ...editingCategory, name_en: e.target.value })} />
              <Field label="Slug *" value={editingCategory.slug ?? ""} onChange={(e) => setEditingCategory({ ...editingCategory, slug: e.target.value })} />
              <Field label="Сортировка" type="number" value={editingCategory.sort_order ?? 0} onChange={(e) => setEditingCategory({ ...editingCategory, sort_order: Number(e.target.value) })} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCategory(null)}>Отмена</Button>
            <Button onClick={saveCategory}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
};

export default Admin;
