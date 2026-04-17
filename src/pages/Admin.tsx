import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Plus, Pencil, Trash2, FileDown, Package, Settings as SettingsIcon, Tag } from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ImageUpload from "@/components/admin/ImageUpload";
import MultiImageUpload, { type GalleryImage } from "@/components/admin/MultiImageUpload";
import StockOpDialog, { type StockOpVariant } from "@/components/admin/StockOpDialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import { downloadInvoicePdf, type InvoiceCompany } from "@/lib/invoicePdf";
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
  inn: string | null;
  delivery_address: string | null;
  customer_comment: string | null;
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
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
  reserved_boxes?: number;
  external_id?: string | null;
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
  material_id: string | null;
  scent_id: string | null;
  shape_id: string | null;
  variants: AdminVariant[];
  images: { id: string; url: string; sort_order: number }[];
};

type AdminCategory = {
  id: string;
  slug: string;
  name_ru: string;
  name_en: string;
  sort_order: number;
  parent_id: string | null;
};

type Lookup = { id: string; slug: string; name_ru: string; name_en: string; sort_order: number };

const STATUSES = ["new", "processing", "invoiced", "paid", "shipped", "completed", "cancelled"] as const;
type LookupKind = "materials" | "scents" | "shapes";
const LOOKUP_LABEL: Record<LookupKind, string> = { materials: "Материалы", scents: "Ароматы", shapes: "Формы" };

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

type Tab = "orders" | "products" | "categories" | "stock" | "lookups" | "settings";

const Admin = () => {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [materials, setMaterials] = useState<Lookup[]>([]);
  const [scents, setScents] = useState<Lookup[]>([]);
  const [shapes, setShapes] = useState<Lookup[]>([]);
  const [company, setCompany] = useState<InvoiceCompany | null>(null);
  const [tab, setTab] = useState<Tab>("orders");

  const [editingProduct, setEditingProduct] = useState<Partial<AdminProduct> | null>(null);
  const [productGallery, setProductGallery] = useState<GalleryImage[]>([]);
  const [editingCategory, setEditingCategory] = useState<Partial<AdminCategory> | null>(null);
  const [editingVariant, setEditingVariant] = useState<(Partial<AdminVariant> & { product_id: string }) | null>(null);
  const [stockOpVariant, setStockOpVariant] = useState<StockOpVariant | null>(null);
  const [editingLookup, setEditingLookup] = useState<{ kind: LookupKind; data: Partial<Lookup> } | null>(null);

  const load = async () => {
    const [{ data: o }, { data: p }, { data: c }, { data: m }, { data: s }, { data: sh }, { data: comp }] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("products").select("*, variants:product_variants(*), images:product_images(*)").order("name_ru"),
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("materials").select("*").order("sort_order"),
      supabase.from("scents").select("*").order("sort_order"),
      supabase.from("shapes").select("*").order("sort_order"),
      supabase.from("company_settings").select("*").maybeSingle(),
    ]);
    setOrders((o as unknown as AdminOrder[]) ?? []);
    setProducts((p as unknown as AdminProduct[]) ?? []);
    setCategories((c as AdminCategory[]) ?? []);
    setMaterials((m as Lookup[]) ?? []);
    setScents((s as Lookup[]) ?? []);
    setShapes((sh as Lookup[]) ?? []);
    if (comp) setCompany(comp as unknown as InvoiceCompany);
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

  // ======= INVOICE =======
  const downloadInvoice = async (order: AdminOrder) => {
    if (!company) return toast.error("Заполните реквизиты компании в разделе «Настройки»");
    const { data: items, error } = await supabase
      .from("order_items")
      .select("sku,product_name,variant_label,pieces_per_box,boxes,unit_price,line_total")
      .eq("order_id", order.id);
    if (error) return toast.error(error.message);
    downloadInvoicePdf(
      company,
      {
        company_name: order.company_name,
        contact_name: order.contact_name,
        inn: order.inn,
        email: order.email,
        phone: order.phone,
        delivery_address: order.delivery_address,
      },
      {
        order_number: order.order_number,
        created_at: order.created_at,
        currency: order.currency,
        subtotal: Number(order.subtotal),
        discount_percent: Number(order.discount_percent),
        discount_amount: Number(order.discount_amount),
        total: Number(order.total),
        total_boxes: order.total_boxes,
        customer_comment: order.customer_comment,
      },
      (items ?? []).map((it) => ({
        sku: it.sku,
        product_name: it.product_name,
        variant_label: it.variant_label,
        pieces_per_box: it.pieces_per_box,
        boxes: it.boxes,
        unit_price: Number(it.unit_price),
        line_total: Number(it.line_total),
      })),
    );
  };

  // ======= PRODUCTS =======
  const openProductDialog = (p?: Partial<AdminProduct>) => {
    setEditingProduct(p ?? { is_published: true });
    setProductGallery(
      (p?.images ?? []).map((i) => ({ id: i.id, url: i.url, sort_order: i.sort_order }))
        .sort((a, b) => a.sort_order - b.sort_order),
    );
  };

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
      material_id: editingProduct.material_id || null,
      scent_id: editingProduct.scent_id || null,
      shape_id: editingProduct.shape_id || null,
      is_published: editingProduct.is_published ?? true,
    };
    if (!payload.slug || !payload.name_ru || !payload.name_en) return toast.error("Заполните slug и названия");

    let productId = editingProduct.id;
    if (productId) {
      const { error } = await supabase.from("products").update(payload).eq("id", productId);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await supabase.from("products").insert(payload).select("id").single();
      if (error) return toast.error(error.message);
      productId = data.id;
    }

    // Sync gallery: delete removed, upsert remaining with sort_order
    const existing = (editingProduct.images ?? []) as { id: string; url: string }[];
    const keepIds = new Set(productGallery.filter((g) => g.id).map((g) => g.id!));
    const toDelete = existing.filter((e) => !keepIds.has(e.id)).map((e) => e.id);
    if (toDelete.length) await supabase.from("product_images").delete().in("id", toDelete);
    for (let i = 0; i < productGallery.length; i++) {
      const img = productGallery[i];
      if (img.id) {
        await supabase.from("product_images").update({ sort_order: i }).eq("id", img.id);
      } else {
        await supabase.from("product_images").insert({ product_id: productId, url: img.url, sort_order: i });
      }
    }
    // Auto-set image_url to first gallery image if main empty
    if (!payload.image_url && productGallery[0]?.url) {
      await supabase.from("products").update({ image_url: productGallery[0].url }).eq("id", productId);
    }

    toast.success("Сохранено");
    setEditingProduct(null);
    setProductGallery([]);
    load();
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Удалить товар вместе со всеми вариациями?")) return;
    await supabase.from("product_variants").delete().eq("product_id", id);
    await supabase.from("product_images").delete().eq("product_id", id);
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
      external_id: editingVariant.external_id || null,
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
      parent_id: editingCategory.parent_id || null,
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
    if (!confirm("Удалить категорию? Подкатегории и товары в ней останутся без родителя/категории.")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Удалено");
    load();
  };

  // ======= LOOKUPS (materials/scents/shapes) =======
  const lookupListByKind = (kind: LookupKind) => kind === "materials" ? materials : kind === "scents" ? scents : shapes;

  const saveLookup = async () => {
    if (!editingLookup) return;
    const { kind, data } = editingLookup;
    const payload = {
      slug: data.slug || "",
      name_ru: data.name_ru || "",
      name_en: data.name_en || "",
      sort_order: Number(data.sort_order) || 0,
    };
    if (!payload.slug || !payload.name_ru) return toast.error("Заполните slug и название");
    let error;
    if (data.id) ({ error } = await supabase.from(kind).update(payload).eq("id", data.id));
    else ({ error } = await supabase.from(kind).insert(payload));
    if (error) return toast.error(error.message);
    toast.success("Сохранено");
    setEditingLookup(null);
    load();
  };

  const deleteLookup = async (kind: LookupKind, id: string) => {
    if (!confirm("Удалить запись справочника?")) return;
    const { error } = await supabase.from(kind).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Удалено");
    load();
  };

  // ======= COMPANY SETTINGS =======
  const saveCompany = async () => {
    if (!company) return;
    const { error } = await supabase.from("company_settings").update(company as never).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("Реквизиты сохранены");
    load();
  };

  const newCount = orders.filter((o) => o.status === "new").length;
  const lowStock = products.filter((p) => p.variants?.some((v) => v.stock_boxes > 0 && v.stock_boxes <= 5)).length;
  const outOfStock = products.filter((p) => p.variants?.length > 0 && p.variants.every((v) => v.stock_boxes <= 0)).length;
  const allVariants = products.flatMap((p) => (p.variants ?? []).map((v) => ({ ...v, product_name: p.name_ru, product_slug: p.slug })));

  const TABS: { key: Tab; label: string; icon?: typeof Tag }[] = [
    { key: "orders", label: "Заявки" },
    { key: "products", label: "Товары" },
    { key: "categories", label: "Категории" },
    { key: "stock", label: "Склад", icon: Package },
    { key: "lookups", label: "Справочники", icon: Tag },
    { key: "settings", label: "Реквизиты", icon: SettingsIcon },
  ];

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
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} className={`inline-flex items-center gap-1 rounded-sm px-3 py-1.5 text-sm ${tab === t.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"}`}>
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {t.label}
              </button>
            );
          })}
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
                  <th className="px-3 py-3"></th>
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
                    <td className="px-3 py-2.5 text-right">
                      <Button size="sm" variant="outline" onClick={() => downloadInvoice(o)} title="Скачать счёт-договор">
                        <FileDown className="h-3.5 w-3.5" /> PDF
                      </Button>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Заявок пока нет</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "products" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => openProductDialog()}><Plus className="h-4 w-4" /> Новый товар</Button>
            </div>
            <div className="space-y-3">
              {products.map((p) => (
                <div key={p.id} className="rounded-lg border border-border bg-surface">
                  <div className="flex items-start justify-between gap-3 border-b border-border p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.name_ru}</span>
                        {!p.is_published && <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">черновик</span>}
                        {(p.images?.length ?? 0) > 0 && <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-primary">{p.images.length} фото</span>}
                      </div>
                      <div className="num text-xs text-muted-foreground">/{p.slug} · {categories.find((c) => c.id === p.category_id)?.name_ru ?? "без категории"}</div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="outline" onClick={() => openProductDialog(p)}><Pencil className="h-3.5 w-3.5" /></Button>
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
                    <th className="px-3 py-3">Родитель</th>
                    <th className="px-3 py-3">Slug</th>
                    <th className="px-3 py-3 text-right">Сорт.</th>
                    <th className="px-3 py-3 text-right">Товаров</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="px-3 py-2.5 font-medium">{c.parent_id && <span className="text-muted-foreground">↳ </span>}{c.name_ru}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{categories.find((p) => p.id === c.parent_id)?.name_ru ?? "—"}</td>
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

        {tab === "stock" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface p-4 text-xs">
              <div className="font-semibold">Webhook для внешней системы (1С / МойСклад):</div>
              <div className="mt-1 break-all rounded-md bg-muted px-2 py-1 num">
                {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/inventory-webhook`}
              </div>
              <div className="mt-2 text-muted-foreground">
                POST с заголовком <code className="num">x-webhook-secret</code> и телом <code className="num">{`{"updates":[{"sku":"...","stock_boxes":N}]}`}</code>.
                Установите секрет <code className="num">INVENTORY_WEBHOOK_SECRET</code> в настройках бэкенда.
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">SKU</th>
                    <th className="px-3 py-3">Товар</th>
                    <th className="px-3 py-3 text-right">Остаток</th>
                    <th className="px-3 py-3 text-right">Резерв</th>
                    <th className="px-3 py-3 text-right">Доступно</th>
                    <th className="px-3 py-3">Внешний ID</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {allVariants.map((v) => {
                    const reserved = v.reserved_boxes ?? 0;
                    const avail = Math.max(0, v.stock_boxes - reserved);
                    const low = v.stock_boxes <= 5;
                    return (
                      <tr key={v.id} className="border-t border-border">
                        <td className="px-3 py-2 num">{v.sku}</td>
                        <td className="px-3 py-2">{v.product_name}</td>
                        <td className={`px-3 py-2 text-right num ${low ? "text-warning" : ""}`}>{v.stock_boxes}</td>
                        <td className="px-3 py-2 text-right num">{reserved}</td>
                        <td className="px-3 py-2 text-right num font-semibold">{avail}</td>
                        <td className="px-3 py-2 num text-xs text-muted-foreground">{v.external_id ?? "—"}</td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="outline" onClick={() => setStockOpVariant({ id: v.id, sku: v.sku, stock_boxes: v.stock_boxes, reserved_boxes: v.reserved_boxes })}>
                            <Package className="h-3.5 w-3.5" /> Движение
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "lookups" && (
          <div className="grid gap-4 lg:grid-cols-3">
            {(["materials", "scents", "shapes"] as LookupKind[]).map((kind) => {
              const items = lookupListByKind(kind);
              return (
                <div key={kind} className="rounded-lg border border-border bg-surface">
                  <div className="flex items-center justify-between border-b border-border p-3">
                    <div className="font-semibold">{LOOKUP_LABEL[kind]}</div>
                    <Button size="sm" onClick={() => setEditingLookup({ kind, data: { sort_order: items.length } })}><Plus className="h-3.5 w-3.5" /></Button>
                  </div>
                  <ul className="divide-y divide-border text-sm">
                    {items.map((it) => (
                      <li key={it.id} className="flex items-center justify-between gap-2 p-2.5">
                        <div className="min-w-0">
                          <div className="font-medium">{it.name_ru}</div>
                          <div className="num text-xs text-muted-foreground">{it.slug} · {it.name_en}</div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditingLookup({ kind, data: it })}><Pencil className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteLookup(kind, it.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </li>
                    ))}
                    {items.length === 0 && <li className="p-3 text-center text-xs text-muted-foreground">Пусто</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {tab === "settings" && company && (
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3">
              <h2 className="text-lg font-semibold">Реквизиты компании</h2>
              <p className="text-xs text-muted-foreground">Используются в счёте-договоре, который скачивается из заявок.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Полное название" value={company.legal_name} onChange={(e) => setCompany({ ...company, legal_name: e.target.value })} />
              <Field label="Краткое название" value={company.short_name} onChange={(e) => setCompany({ ...company, short_name: e.target.value })} />
              <Field label="ИНН" value={company.inn} onChange={(e) => setCompany({ ...company, inn: e.target.value })} />
              <Field label="КПП" value={company.kpp} onChange={(e) => setCompany({ ...company, kpp: e.target.value })} />
              <Field label="ОГРН" value={company.ogrn} onChange={(e) => setCompany({ ...company, ogrn: e.target.value })} />
              <Field label="Юридический адрес" value={company.legal_address} onChange={(e) => setCompany({ ...company, legal_address: e.target.value })} />
              <Field label="Почтовый адрес" value={company.postal_address} onChange={(e) => setCompany({ ...company, postal_address: e.target.value })} />
              <Field label="Банк" value={company.bank_name} onChange={(e) => setCompany({ ...company, bank_name: e.target.value })} />
              <Field label="БИК" value={company.bank_bik} onChange={(e) => setCompany({ ...company, bank_bik: e.target.value })} />
              <Field label="Расчётный счёт" value={company.bank_account} onChange={(e) => setCompany({ ...company, bank_account: e.target.value })} />
              <Field label="Корр. счёт" value={company.corr_account} onChange={(e) => setCompany({ ...company, corr_account: e.target.value })} />
              <Field label="Должность подписанта" value={company.director_position} onChange={(e) => setCompany({ ...company, director_position: e.target.value })} />
              <Field label="ФИО подписанта" value={company.director_name} onChange={(e) => setCompany({ ...company, director_name: e.target.value })} />
              <Field label="Телефон" value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} />
              <Field label="E-mail" value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} />
              <div className="md:col-span-2">
                <TextArea label="Условия оплаты" rows={2} value={company.payment_terms} onChange={(e) => setCompany({ ...company, payment_terms: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <TextArea label="Условия доставки" rows={2} value={company.delivery_terms} onChange={(e) => setCompany({ ...company, delivery_terms: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <TextArea label="Текст оферты" rows={3} value={company.offer_text} onChange={(e) => setCompany({ ...company, offer_text: e.target.value })} />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={saveCompany}>Сохранить реквизиты</Button>
            </div>
          </div>
        )}
      </div>

      {/* PRODUCT DIALOG */}
      <Dialog open={!!editingProduct} onOpenChange={(o) => { if (!o) { setEditingProduct(null); setProductGallery([]); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingProduct?.id ? "Редактировать товар" : "Новый товар"}</DialogTitle></DialogHeader>
          {editingProduct && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Slug *" value={editingProduct.slug ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, slug: e.target.value })} />
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Категория</span>
                <select value={editingProduct.category_id ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, category_id: e.target.value || null })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">— без категории —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? "↳ " : ""}{c.name_ru}</option>)}
                </select>
              </label>
              <Field label="Название RU *" value={editingProduct.name_ru ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, name_ru: e.target.value })} />
              <Field label="Название EN *" value={editingProduct.name_en ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, name_en: e.target.value })} />

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Материал</span>
                <select value={editingProduct.material_id ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, material_id: e.target.value || null })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">—</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.name_ru}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Аромат</span>
                <select value={editingProduct.scent_id ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, scent_id: e.target.value || null })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">—</option>
                  {scents.map((s) => <option key={s.id} value={s.id}>{s.name_ru}</option>)}
                </select>
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Форма</span>
                <select value={editingProduct.shape_id ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, shape_id: e.target.value || null })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">—</option>
                  {shapes.map((sh) => <option key={sh.id} value={sh.id}>{sh.name_ru}</option>)}
                </select>
              </label>

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
                <p className="mt-1 text-[11px] text-muted-foreground">Главное фото — используется в карточках. Если пусто, возьмётся первое из галереи.</p>
              </div>
              <div className="md:col-span-2">
                <MultiImageUpload value={productGallery} onChange={setProductGallery} />
              </div>
              <label className="md:col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editingProduct.is_published ?? true} onChange={(e) => setEditingProduct({ ...editingProduct, is_published: e.target.checked })} className="h-4 w-4 accent-primary" />
                Опубликован
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingProduct(null); setProductGallery([]); }}>Отмена</Button>
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
              <Field label="Внешний ID (1С/МойСклад)" value={editingVariant.external_id ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, external_id: e.target.value })} />
              <Field label="Размер" value={editingVariant.size ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, size: e.target.value })} />
              <Field label="Цвет" value={editingVariant.color ?? ""} onChange={(e) => setEditingVariant({ ...editingVariant, color: e.target.value })} />
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
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Родительская категория</span>
                <select value={editingCategory.parent_id ?? ""} onChange={(e) => setEditingCategory({ ...editingCategory, parent_id: e.target.value || null })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">— корневая —</option>
                  {categories.filter((c) => c.id !== editingCategory.id && !c.parent_id).map((c) => (
                    <option key={c.id} value={c.id}>{c.name_ru}</option>
                  ))}
                </select>
              </label>
              <Field label="Сортировка" type="number" value={editingCategory.sort_order ?? 0} onChange={(e) => setEditingCategory({ ...editingCategory, sort_order: Number(e.target.value) })} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCategory(null)}>Отмена</Button>
            <Button onClick={saveCategory}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* LOOKUP DIALOG */}
      <Dialog open={!!editingLookup} onOpenChange={(o) => !o && setEditingLookup(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingLookup?.data.id ? "Редактировать" : "Новая запись"} · {editingLookup && LOOKUP_LABEL[editingLookup.kind]}</DialogTitle></DialogHeader>
          {editingLookup && (
            <div className="grid gap-3">
              <Field label="Slug *" value={editingLookup.data.slug ?? ""} onChange={(e) => setEditingLookup({ ...editingLookup, data: { ...editingLookup.data, slug: e.target.value } })} />
              <Field label="Название RU *" value={editingLookup.data.name_ru ?? ""} onChange={(e) => setEditingLookup({ ...editingLookup, data: { ...editingLookup.data, name_ru: e.target.value } })} />
              <Field label="Название EN" value={editingLookup.data.name_en ?? ""} onChange={(e) => setEditingLookup({ ...editingLookup, data: { ...editingLookup.data, name_en: e.target.value } })} />
              <Field label="Сортировка" type="number" value={editingLookup.data.sort_order ?? 0} onChange={(e) => setEditingLookup({ ...editingLookup, data: { ...editingLookup.data, sort_order: Number(e.target.value) } })} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLookup(null)}>Отмена</Button>
            <Button onClick={saveLookup}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StockOpDialog variant={stockOpVariant} onClose={() => setStockOpVariant(null)} onDone={load} />
    </PublicLayout>
  );
};

export default Admin;
