import { Fragment, useEffect, useMemo, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Pencil,
  Trash2,
  FileDown,
  Package,
  Settings as SettingsIcon,
  Tag,
  LayoutDashboard,
  ClipboardList,
  Users,
  Warehouse,
  Percent,
  LogOut,
  Search,
  Download,
  MoreVertical,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import UserMenu from "@/components/layout/UserMenu";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Package01Icon,
  BubbleChatIcon,
} from "@hugeicons/core-free-icons";
import ImageUpload from "@/components/admin/ImageUpload";
import MultiImageUpload, { type GalleryImage } from "@/components/admin/MultiImageUpload";
import StockOpDialog, { type StockOpVariant } from "@/components/admin/StockOpDialog";
import NotFound from "@/pages/NotFound";
import { signOut, useAuth, type AppUser } from "@/hooks/useAuth";
import {
  apiErrorMessage,
  catalogApi,
  companyApi,
  ordersApi,
  stockApi,
  usersApi,
  type AttributeKind,
  type AttributeOut,
  type CategoryOut,
  type CompanySettingsOut,
  type Currency,
  type DiscountTierOut,
  type OrderListOut,
  type OrderStatus,
  type ProductOut,
  type ProductVariantOut,
  type UserOut,
} from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { downloadInvoicePdf } from "@/lib/invoicePdf";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type AdminOrder = OrderListOut;
type AdminVariant = ProductVariantOut;
type AdminProduct = ProductOut;
type AdminCategory = CategoryOut;
type Lookup = AttributeOut;

const STATUSES = ["new", "processing", "awaiting_payment", "payment_review", "invoiced", "paid", "shipped", "completed", "cancelled"] as const;
type LookupKind = AttributeKind;
const LOOKUP_LABEL: Record<LookupKind, string> = { materials: "Материалы", scents: "Ароматы", shapes: "Формы" };

/**
 * Human-friendly labels + pill palette for every order status the backend can
 * return. Used by `StatusPill` in the dashboard / orders / clients views so
 * admins see Russian copy with colour that encodes urgency (blue = fresh,
 * amber = in-progress, green = done, muted = cancelled).
 */
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  new: { label: "Новая", cls: "bg-info/10 text-info" },
  processing: { label: "В работе", cls: "bg-warning/15 text-warning" },
  awaiting_payment: { label: "Ждёт оплаты", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  payment_review: { label: "Проверка чека", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  invoiced: { label: "Счёт", cls: "bg-primary/15 text-primary" },
  paid: { label: "Оплачен", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  shipped: { label: "Готов", cls: "bg-success/15 text-success" },
  completed: { label: "Завершён", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Отменён", cls: "bg-muted text-muted-foreground" },
};

const StatusPill = ({ status }: { status: string }) => {
  const s = STATUS_LABEL[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", s.cls)}>
      {s.label}
    </span>
  );
};

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

type Tab =
  | "dashboard"
  | "orders"
  | "products"
  | "categories"
  | "clients"
  | "stock"
  | "discounts"
  | "settings";

/**
 * Sidebar navigation definition. `badgeKey` references a numeric field on the
 * dashboard-stat bag below, so Заявки can surface the «new-orders» count as a
 * red pill without each call-site rebuilding the label.
 */
const NAV: { key: Tab; label: string; icon: ComponentType<{ className?: string }>; badgeKey?: "newOrders" }[] = [
  { key: "dashboard", label: "Дашборд", icon: LayoutDashboard },
  { key: "orders", label: "Заявки", icon: ClipboardList, badgeKey: "newOrders" },
  { key: "products", label: "Товары", icon: Package },
  { key: "categories", label: "Категории", icon: Tag },
  { key: "clients", label: "Клиенты", icon: Users },
  { key: "stock", label: "Склад", icon: Warehouse },
  { key: "discounts", label: "Скидки", icon: Percent },
  { key: "settings", label: "Настройки", icon: SettingsIcon },
];

/** Page title shown in the topbar for every sidebar destination. */
const TAB_TITLE: Record<Tab, string> = {
  dashboard: "Дашборд",
  orders: "Заявки",
  products: "Товары",
  categories: "Категории",
  clients: "Клиенты",
  stock: "Склад",
  discounts: "Скидки",
  settings: "Настройки",
};

/* ────────────────────────── Shell ────────────────────────── */

const AdminSidebar = ({
  tab,
  setTab,
  newOrdersBadge,
  onSignOut,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  newOrdersBadge: number;
  onSignOut: () => void;
}) => {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar-background lg:flex">
      {/* Brand block — matches the «МирСвечи admin» mark in the design. */}
      <Link to="/" className="flex items-center gap-2 border-b border-sidebar-border px-5 py-5">
        <span className="text-lg font-semibold tracking-tight text-foreground">МирСвечи</span>
        <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
          admin
        </span>
      </Link>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = tab === n.key;
          const badge = n.badgeKey === "newOrders" && newOrdersBadge > 0 ? newOrdersBadge : null;
          return (
            <button
              key={n.key}
              type="button"
              onClick={() => setTab(n.key)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{n.label}</span>
              {badge !== null && (
                <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-5 text-primary-foreground">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sign-out lives at the bottom of the rail so it doesn't fight with
          the real nav for user attention but is always reachable. */}
      <div className="border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Выйти
        </button>
      </div>
    </aside>
  );
};

const AdminTopbar = ({
  title,
  actions,
  onMenuToggle,
}: {
  title: string;
  actions?: React.ReactNode;
  onMenuToggle?: () => void;
}) => {
  const dateStr = new Date().toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
      <div className="flex items-center gap-3">
        {onMenuToggle && (
          <button
            type="button"
            onClick={onMenuToggle}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
            aria-label="Меню"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <h1 className="text-lg font-semibold tracking-tight sm:text-2xl">{title}</h1>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        {actions}
        <span className="hidden text-sm text-muted-foreground sm:inline">{dateStr}</span>
        {/*
          Единый с публичным хедером компонент профиля. В админке
          нет мобильного drawer'а, поэтому кнопка видна на всех ширинах
          (alwaysVisible).
        */}
        <UserMenu alwaysVisible />
      </div>
    </header>
  );
};

const AdminShell = ({
  tab,
  setTab,
  user,
  newOrdersBadge,
  onSignOut,
  actions,
  children,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  user: AppUser;
  newOrdersBadge: number;
  onSignOut: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-muted/30">
      <AdminSidebar tab={tab} setTab={setTab} newOrdersBadge={newOrdersBadge} onSignOut={onSignOut} />

      {/* Mobile admin nav Sheet */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[260px] p-0 lg:hidden">
          <div className="flex h-full flex-col bg-sidebar-background">
            <SheetHeader className="border-b border-sidebar-border px-5 py-4">
              <SheetTitle className="flex items-center gap-2 text-left">
                <span className="text-lg font-semibold tracking-tight">МирСвечи</span>
                <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">admin</span>
              </SheetTitle>
            </SheetHeader>
            <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
              {NAV.map((n) => {
                const Icon = n.icon;
                const active = tab === n.key;
                const badge = n.badgeKey === "newOrders" && newOrdersBadge > 0 ? newOrdersBadge : null;
                return (
                  <button
                    key={n.key}
                    type="button"
                    onClick={() => { setTab(n.key); setMobileNavOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{n.label}</span>
                    {badge !== null && (
                      <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-5 text-primary-foreground">{badge}</span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-sidebar-border p-3">
              <button
                type="button"
                onClick={() => { onSignOut(); setMobileNavOpen(false); }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-4 w-4" /> Выйти
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <main className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar title={TAB_TITLE[tab]} actions={actions} onMenuToggle={() => setMobileNavOpen(true)} />
        <div className="flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
};

/* ────────────────────────── KPI card ────────────────────────── */

type KpiTone = "muted" | "warn" | "ok" | "primary";
const KPI_TONE: Record<KpiTone, string> = {
  muted: "text-muted-foreground",
  warn: "text-warning",
  ok: "text-success",
  primary: "text-primary",
};

const KpiCard = ({
  label,
  value,
  delta,
  deltaTone = "muted",
}: {
  label: string;
  value: string | number;
  delta?: string;
  deltaTone?: KpiTone;
}) => (
  <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
    {delta && <div className={cn("mt-2 text-xs", KPI_TONE[deltaTone])}>{delta}</div>}
  </div>
);

const Admin = () => {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = !!user?.isAdmin;

  const [
    ordersQ,
    productsQ,
    categoriesQ,
    materialsQ,
    scentsQ,
    shapesQ,
    companyQ,
    discountTiersQ,
    usersQ,
  ] = useQueries({
    queries: [
      { queryKey: ["admin", "orders"], queryFn: () => ordersApi.adminList(), enabled: isAdmin },
      { queryKey: ["admin", "products"], queryFn: () => catalogApi.adminListProducts(), enabled: isAdmin },
      { queryKey: ["categories"], queryFn: () => catalogApi.listCategories(), enabled: isAdmin },
      { queryKey: ["attributes", "materials"], queryFn: () => catalogApi.listAttributes("materials"), enabled: isAdmin },
      { queryKey: ["attributes", "scents"], queryFn: () => catalogApi.listAttributes("scents"), enabled: isAdmin },
      { queryKey: ["attributes", "shapes"], queryFn: () => catalogApi.listAttributes("shapes"), enabled: isAdmin },
      { queryKey: ["company-settings"], queryFn: () => companyApi.get(), enabled: isAdmin },
      { queryKey: ["discount-tiers"], queryFn: () => stockApi.listDiscountTiers(), enabled: isAdmin },
      { queryKey: ["admin", "users"], queryFn: () => usersApi.adminList(), enabled: isAdmin },
    ],
  });

  const orders: AdminOrder[] = ordersQ.data ?? [];
  const products: AdminProduct[] = productsQ.data ?? [];
  const categories: AdminCategory[] = categoriesQ.data ?? [];
  const materials: Lookup[] = materialsQ.data ?? [];
  const scents: Lookup[] = scentsQ.data ?? [];
  const shapes: Lookup[] = shapesQ.data ?? [];

  const [company, setCompany] = useState<CompanySettingsOut | null>(null);
  useEffect(() => {
    if (companyQ.data) setCompany(companyQ.data);
  }, [companyQ.data]);

  const [tab, setTab] = useState<Tab>("dashboard");

  /*
    Fire the toast BEFORE tearing down the session so Sonner has the message
    in its portal before the sidebar-triggered redirect unmounts this tree.
    Mirrors the Account-page sign-out flow (see AccountSettings).
  */
  const handleSignOut = async () => {
    toast.success("Вы успешно вышли из аккаунта");
    await signOut();
    // Once `user` becomes null the guard below renders <NotFound />, which
    // hides /admin from non-admins. The user can navigate away from there
    // via the regular header — no programmatic redirect needed.
  };

  const [editingProduct, setEditingProduct] = useState<Partial<AdminProduct> | null>(null);
  const [productGallery, setProductGallery] = useState<GalleryImage[]>([]);
  const [editingCategory, setEditingCategory] = useState<Partial<AdminCategory> | null>(null);
  const [editingVariant, setEditingVariant] = useState<(Partial<AdminVariant> & { product_id: string }) | null>(null);
  const [stockOpVariant, setStockOpVariant] = useState<StockOpVariant | null>(null);
  const [editingLookup, setEditingLookup] = useState<{ kind: LookupKind; data: Partial<Lookup> } | null>(null);
  const [editingDiscount, setEditingDiscount] = useState<Partial<DiscountTierOut> | null>(null);

  /* ---------- Delete confirmation modal ---------- */
  const [deleteConfirm, setDeleteConfirm] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [suppressDeleteConfirm, setSuppressDeleteConfirm] = useState(
    () => localStorage.getItem("admin_suppress_delete_confirm") === "1",
  );

  /* ---------- Orders-page UI state ---------- */
  type OrdersFilter = "all" | "new" | "processing" | "ready" | "completed" | "cancelled";
  const ORDERS_PER_PAGE = 6;
  const [ordersFilter, setOrdersFilter] = useState<OrdersFilter>("all");
  const [ordersSearch, setOrdersSearch] = useState("");
  const [ordersPage, setOrdersPage] = useState(1);
  /**
   * When the user opens a row via «Открыть» / «Редактировать» we want to see the
   * item composition — fetched lazily via useQuery so the admin-list table
   * itself stays lightweight. `null` closes the detail dialog.
   */
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  /**
   * Выделение заявок в таблице — хранится как Set<id>.
   * Bulk-actions bar появляется внизу экрана при наличии выделенных.
   */
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  /** «Связаться» dialog — stores the order whose customer should be emailed. */
  const [contactOrder, setContactOrder] = useState<AdminOrder | null>(null);
  const [contactSubject, setContactSubject] = useState("");
  const [contactBody, setContactBody] = useState("");
  const [contactSending, setContactSending] = useState(false);

  /** «Отклонить» dialog — stores the order(s) to reject with a reason. */
  const [rejectTarget, setRejectTarget] = useState<AdminOrder | AdminOrder[] | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSending, setRejectSending] = useState(false);
  // Reset pagination whenever the active filter or the search term changes.
  useEffect(() => setOrdersPage(1), [ordersFilter, ordersSearch]);

  const openOrderQ = useQuery({
    queryKey: ["admin", "orders", openOrderId, "detail"],
    queryFn: () => ordersApi.adminGetById(openOrderId!),
    enabled: !!openOrderId,
  });

  /* ---------- Products-page UI state ---------- */
  const [productsSearch, setProductsSearch] = useState("");
  const [productsCategory, setProductsCategory] = useState("");
  // Products get a compact «flat table» look with expandable rows for variants,
  // so we track which rows are expanded by product id.
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  // Точно так же, как в таблице заявок, храним выделение товаров
  // как Set<id>, чтобы select-all в шапке мог работать.
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const toggleProductExpanded = (id: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reloadProducts = () => queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
  const reloadCategories = () => queryClient.invalidateQueries({ queryKey: ["categories"] });
  const reloadAttributes = (kind: AttributeKind) =>
    queryClient.invalidateQueries({ queryKey: ["attributes", kind] });
  const reloadOrders = () => queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
  const reloadCompany = () => queryClient.invalidateQueries({ queryKey: ["company-settings"] });
  const reloadDiscounts = () => queryClient.invalidateQueries({ queryKey: ["discount-tiers"] });

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-muted/30">
        <div className="border-b border-border bg-surface px-6 py-3">
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="container flex-1 py-10">
          <div className="space-y-6">
            <Skeleton className="h-8 w-48" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }
  // Non-admin visitors (anonymous or logged-in clients) get a 404 instead
  // of a redirect to /auth or an "access denied" screen. This avoids
  // leaking the existence of the admin route to outsiders and matches the
  // behaviour of any other unknown URL on the site.
  if (!user || !user.isAdmin) return <NotFound />;

  const updateStatus = async (id: string, status: string) => {
    try {
      await ordersApi.adminUpdate(id, { status: status as OrderStatus });
      toast.success("Статус обновлён");
      reloadOrders();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось обновить статус"));
    }
  };

  // ======= INVOICE =======
  const downloadInvoice = async (order: AdminOrder) => {
    if (!company) return toast.error("Заполните реквизиты компании в разделе «Настройки»");
    try {
      const full = await ordersApi.adminGetById(order.id);
      downloadInvoicePdf(
        company,
        {
          company_name: order.company_name,
          contact_name: order.contact_name,
          inn: order.inn,
          email: order.email,
          phone: order.phone,
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
        full.items.map((it) => ({
          sku: it.sku,
          product_name: it.product_name,
          variant_label: it.variant_label,
          pieces_per_box: it.pieces_per_box,
          boxes: it.boxes,
          unit_price: Number(it.unit_price),
          line_total: Number(it.line_total),
        })),
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось загрузить позиции заявки"));
    }
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
      // EN-поля убраны из UI (скроено от каталога), но бэкенд
      // всё еще их требует — подкладываем RU-значение как fallback,
      // чтобы валидация не фейлилась.
      name_en: editingProduct.name_en || editingProduct.name_ru || "",
      description_ru: editingProduct.description_ru || null,
      description_en: editingProduct.description_en || editingProduct.description_ru || null,
      image_url: editingProduct.image_url || null,
      category_id: editingProduct.category_id || null,
      material_id: editingProduct.material_id || null,
      scent_id: editingProduct.scent_id || null,
      shape_id: editingProduct.shape_id || null,
      is_published: editingProduct.is_published ?? true,
    };
    if (!payload.slug || !payload.name_ru) return toast.error("Заполните slug и название");

    try {
      const saved = editingProduct.id
        ? await catalogApi.updateProduct(editingProduct.id, payload)
        : await catalogApi.createProduct(payload);
      const productId = saved.id;

      // Sync gallery: delete removed, reorder existing, append new ones.
      const existing = (editingProduct.images ?? []) as { id: string; url: string; sort_order: number }[];
      const keepIds = new Set(productGallery.filter((g) => g.id).map((g) => g.id!));
      await Promise.all(
        existing
          .filter((e) => !keepIds.has(e.id))
          .map((e) => catalogApi.deleteImage(e.id).catch(() => null)),
      );
      for (let i = 0; i < productGallery.length; i++) {
        const img = productGallery[i];
        if (img.id) {
          await catalogApi.updateImage(img.id, { sort_order: i });
        } else {
          await catalogApi.createImage(productId, { url: img.url, sort_order: i });
        }
      }
      // Auto-set image_url to the first gallery image when it's empty.
      if (!payload.image_url && productGallery[0]?.url) {
        await catalogApi.updateProduct(productId, { image_url: productGallery[0].url });
      }

      toast.success("Сохранено");
      setEditingProduct(null);
      setProductGallery([]);
      reloadProducts();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось сохранить товар"));
    }
  };

  const deleteProductExec = async (id: string) => {
    try {
      await catalogApi.deleteProduct(id);
      toast.success("Удалено");
      reloadProducts();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось удалить товар"));
    }
  };

  const deleteProduct = (id: string) => {
    if (suppressDeleteConfirm) { deleteProductExec(id); return; }
    setDeleteConfirm({
      message: "Удалить товар вместе со всеми вариациями?",
      onConfirm: () => deleteProductExec(id),
    });
  };

  // ======= VARIANTS =======
  const saveVariant = async () => {
    if (!editingVariant) return;
    const sku = (editingVariant.sku || "").trim();
    if (!sku) return toast.error("Укажите SKU");

    const body = {
      sku,
      size: editingVariant.size || null,
      color: editingVariant.color || null,
      shape: editingVariant.shape || null,
      pieces_per_box: Number(editingVariant.pieces_per_box) || 1,
      price_per_piece_rub: Number(editingVariant.price_per_piece_rub) || 0,
      price_per_piece_usd: Number(editingVariant.price_per_piece_usd) || 0,
      stock_boxes: Number(editingVariant.stock_boxes) || 0,
      image_url: editingVariant.image_url || null,
      external_id: editingVariant.external_id || null,
    };

    try {
      if (editingVariant.id) {
        await catalogApi.updateVariant(editingVariant.id, body);
      } else {
        await catalogApi.createVariant(editingVariant.product_id, body);
      }
      toast.success("Сохранено");
      setEditingVariant(null);
      reloadProducts();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось сохранить вариацию"));
    }
  };

  const deleteVariant = async (id: string) => {
    if (!confirm("Удалить вариацию?")) return;
    try {
      await catalogApi.deleteVariant(id);
      toast.success("Удалено");
      reloadProducts();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось удалить вариацию"));
    }
  };

  // ======= CATEGORIES =======
  const saveCategory = async () => {
    if (!editingCategory) return;
    const payload = {
      slug: editingCategory.slug || "",
      name_ru: editingCategory.name_ru || "",
      name_en: editingCategory.name_en || editingCategory.name_ru || "",
      sort_order: Number(editingCategory.sort_order) || 0,
      parent_id: editingCategory.parent_id || null,
    };
    if (!payload.slug || !payload.name_ru) return toast.error("Заполните slug и название");

    try {
      if (editingCategory.id) {
        await catalogApi.updateCategory(editingCategory.id, payload);
      } else {
        await catalogApi.createCategory(payload);
      }
      toast.success("Сохранено");
      setEditingCategory(null);
      reloadCategories();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось сохранить категорию"));
    }
  };

  const deleteCategoryExec = async (id: string) => {
    try {
      await catalogApi.deleteCategory(id);
      toast.success("Удалено");
      reloadCategories();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось удалить категорию"));
    }
  };

  const deleteCategory = (id: string) => {
    if (suppressDeleteConfirm) { deleteCategoryExec(id); return; }
    setDeleteConfirm({
      message: "Удалить категорию? Подкатегории и товары в ней останутся без родителя/категории.",
      onConfirm: () => deleteCategoryExec(id),
    });
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
    try {
      if (data.id) {
        await catalogApi.updateAttribute(kind, data.id, payload);
      } else {
        await catalogApi.createAttribute(kind, payload);
      }
      toast.success("Сохранено");
      setEditingLookup(null);
      reloadAttributes(kind);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось сохранить запись"));
    }
  };

  const deleteLookupExec = async (kind: LookupKind, id: string) => {
    try {
      await catalogApi.deleteAttribute(kind, id);
      toast.success("Удалено");
      reloadAttributes(kind);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось удалить запись"));
    }
  };

  const deleteLookup = (kind: LookupKind, id: string) => {
    if (suppressDeleteConfirm) { deleteLookupExec(kind, id); return; }
    setDeleteConfirm({
      message: "Удалить запись справочника?",
      onConfirm: () => deleteLookupExec(kind, id),
    });
  };

  // ======= COMPANY SETTINGS =======
  const saveCompany = async () => {
    if (!company) return;
    try {
      const { id: _id, updated_at: _updated_at, ...rest } = company;
      await companyApi.update(rest);
      toast.success("Реквизиты сохранены");
      reloadCompany();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось сохранить реквизиты"));
    }
  };

  // ======= DISCOUNT TIERS =======
  const saveDiscount = async () => {
    if (!editingDiscount) return;
    const min_boxes = Number(editingDiscount.min_boxes);
    const discount_percent = Number(editingDiscount.discount_percent);
    if (!Number.isFinite(min_boxes) || min_boxes < 1) {
      return toast.error("Минимум коробок — 1");
    }
    if (!Number.isFinite(discount_percent) || discount_percent < 0 || discount_percent > 100) {
      return toast.error("Процент скидки должен быть 0–100");
    }
    const body = { min_boxes, discount_percent };
    try {
      if (editingDiscount.id) {
        await stockApi.updateDiscountTier(editingDiscount.id, body);
      } else {
        await stockApi.createDiscountTier(body);
      }
      toast.success("Скидка сохранена");
      setEditingDiscount(null);
      reloadDiscounts();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось сохранить скидку"));
    }
  };

  const deleteDiscount = async (id: string) => {
    if (!confirm("Удалить скидку?")) return;
    try {
      await stockApi.deleteDiscountTier(id);
      toast.success("Удалено");
      reloadDiscounts();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось удалить скидку"));
    }
  };

  const newCount = orders.filter((o) => o.status === "new").length;
  const processingCount = orders.filter((o) => o.status === "processing" || o.status === "invoiced").length;
  const lowStock = products.filter((p) => p.variants?.some((v) => v.stock_boxes > 0 && v.stock_boxes <= 5)).length;
  const outOfStock = products.filter((p) => p.variants?.length > 0 && p.variants.every((v) => v.stock_boxes <= 0)).length;
  const allVariants = products.flatMap((p) => (p.variants ?? []).map((v) => ({ ...v, product_name: p.name_ru, product_slug: p.slug })));
  const tiers: DiscountTierOut[] = discountTiersQ.data ?? [];

  /*
    Dashboard-only derivations. Kept in one place so the KPI strip and the
    «Последние заявки» / «Популярные товары» cards share one source of truth —
    cheaper than recomputing per-render and easier to swap out for a real
    /admin/analytics endpoint later.
  */
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const monthStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, []);
  const newTodayCount = orders.filter(
    (o) => o.status === "new" && new Date(o.created_at) >= todayStart,
  ).length;
  const monthRevenue = useMemo(
    () =>
      orders
        .filter(
          (o) =>
            new Date(o.created_at) >= monthStart &&
            ["paid", "shipped", "completed"].includes(o.status),
        )
        .reduce((sum, o) => sum + Number(o.total), 0),
    [orders, monthStart],
  );

  const allUsers: UserOut[] = usersQ.data ?? [];
  const clientUsers = useMemo(
    () => allUsers.filter((u) => u.role === "client"),
    [allUsers],
  );
  const activeClients = clientUsers.length;

  const clientOrderStats = useMemo(() => {
    const map = new Map<string, { orders: number; total: number; lastAt: string }>();
    for (const o of orders) {
      const uid = o.user_id;
      if (!uid) continue;
      const existing = map.get(uid);
      if (!existing) {
        map.set(uid, { orders: 1, total: Number(o.total), lastAt: o.created_at });
      } else {
        existing.orders += 1;
        existing.total += Number(o.total);
        if (new Date(o.created_at) > new Date(existing.lastAt)) {
          existing.lastAt = o.created_at;
        }
      }
    }
    return map;
  }, [orders]);

  const recentOrders = useMemo(
    () =>
      [...orders]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        )
        .slice(0, 5),
    [orders],
  );

  /*
    «Популярные товары» — until the backend exposes sales aggregates we use
    total stock as a stable proxy so the card always has something to show.
    Swap with per-product sold-count once /admin/stats/top-products lands.
  */
  const popularProducts = useMemo(
    () =>
      [...products]
        .map((p) => ({
          id: p.id,
          name_ru: p.name_ru,
          slug: p.slug,
          image_url: p.image_url ?? p.images?.[0]?.url ?? null,
          totalStock: (p.variants ?? []).reduce(
            (s, v) => s + Math.max(0, v.stock_boxes),
            0,
          ),
        }))
        .sort((a, b) => b.totalStock - a.totalStock)
        .slice(0, 5),
    [products],
  );

  /** Compact money format — «2.4M ₽» for large totals so the KPI card stays punchy. */
  const formatCompactMoney = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M ₽`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K ₽`;
    return `${Math.round(v)} ₽`;
  };

  /* ---------- Orders filtering + pagination ---------- */

  /*
    Each UI filter maps to one or more backend statuses. «В работе» covers both
    `processing` and `invoiced` (invoice issued but not paid) so admins see a
    single in-progress bucket; «Завершены» rolls up paid / shipped / completed.
  */
  const ORDER_FILTER_MATCH: Record<OrdersFilter, (s: string) => boolean> = {
    all: () => true,
    new: (s) => s === "new",
    processing: (s) => ["processing", "invoiced", "awaiting_payment", "payment_review", "paid"].includes(s),
    ready: (s) => s === "shipped",
    completed: (s) => s === "completed",
    cancelled: (s) => s === "cancelled",
  };

  const ordersCountByFilter = useMemo(
    () => ({
      all: orders.length,
      new: orders.filter((o) => ORDER_FILTER_MATCH.new(o.status)).length,
      processing: orders.filter((o) => ORDER_FILTER_MATCH.processing(o.status)).length,
      ready: orders.filter((o) => ORDER_FILTER_MATCH.ready(o.status)).length,
      completed: orders.filter((o) => ORDER_FILTER_MATCH.completed(o.status)).length,
      cancelled: orders.filter((o) => ORDER_FILTER_MATCH.cancelled(o.status)).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders],
  );

  const filteredOrders = useMemo(() => {
    const q = ordersSearch.trim().toLowerCase();
    return orders
      .filter((o) => ORDER_FILTER_MATCH[ordersFilter](o.status))
      .filter((o) => {
        if (!q) return true;
        return (
          o.order_number.toLowerCase().includes(q) ||
          (o.company_name ?? "").toLowerCase().includes(q) ||
          (o.email ?? "").toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, ordersFilter, ordersSearch]);

  const totalOrderPages = Math.max(
    1,
    Math.ceil(filteredOrders.length / ORDERS_PER_PAGE),
  );
  const safeOrderPage = Math.min(ordersPage, totalOrderPages);
  const pagedOrders = filteredOrders.slice(
    (safeOrderPage - 1) * ORDERS_PER_PAGE,
    safeOrderPage * ORDERS_PER_PAGE,
  );

  const confirmOrder = (o: AdminOrder) => updateStatus(o.id, "processing");
  const rejectOrder = (o: AdminOrder) => {
    setRejectTarget(o);
    setRejectReason("");
  };

  const approveOrder = async (o: AdminOrder) => {
    try {
      await ordersApi.adminApprove(o.id);
      toast.success("Заявка одобрена — клиенту отправлено письмо с реквизитами");
      reloadOrders();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось одобрить заявку"));
    }
  };

  const confirmPayment = async (o: AdminOrder) => {
    try {
      await ordersApi.adminConfirmPayment(o.id);
      toast.success("Оплата подтверждена");
      reloadOrders();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось подтвердить оплату"));
    }
  };

  const markReady = async (o: AdminOrder) => {
    try {
      await ordersApi.adminMarkReady(o.id);
      toast.success("Заказ отмечен как готовый — клиенту отправлено уведомление");
      reloadOrders();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось отметить заказ"));
    }
  };

  const markCompleted = (o: AdminOrder) => updateStatus(o.id, "completed");

  /* ---------- Orders selection (header checkbox + row checkboxes) ---------- */
  // Всё что видно на текущей странице — из него считаем состояние
  // «выбраны-все / часть / никто» для header-checkbox'a.
  const pageOrderIds = useMemo(() => pagedOrders.map((o) => o.id), [pagedOrders]);
  const selectedOnPageCount = pageOrderIds.reduce(
    (n, id) => n + (selectedOrderIds.has(id) ? 1 : 0),
    0,
  );
  const allOnPageSelected =
    pageOrderIds.length > 0 && selectedOnPageCount === pageOrderIds.length;
  const someOnPageSelected =
    selectedOnPageCount > 0 && !allOnPageSelected;

  const toggleAllOnPage = () => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        pageOrderIds.forEach((id) => next.delete(id));
      } else {
        pageOrderIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleOrderSelected = (id: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /**
   * Exports the given orders to a proper .xlsx file so Excel on Windows
   * displays Cyrillic correctly. Uses xlsx-js-style for header formatting.
   *
   * By default экспортирует все отфильтрованные заявки. Если передать
   * подмножество — используется bulk-action «Экспорт выбранных».
   */
  const exportOrdersCsv = (rowsToExport: AdminOrder[] = filteredOrders) => {
    import("xlsx-js-style").then((XLSX) => {
      const header = [
        "Номер",
        "Дата",
        "Клиент",
        "Контакт",
        "Email",
        "Телефон",
        "Коробок",
        "Сумма",
        "Валюта",
        "Статус",
      ];
      const rows = rowsToExport.map((o) => [
        o.order_number,
        new Date(o.created_at).toLocaleDateString("ru-RU"),
        o.company_name,
        o.contact_name,
        o.email,
        o.phone,
        o.total_boxes,
        Number(o.total),
        o.currency,
        STATUS_LABEL[o.status]?.label ?? o.status,
      ]);

      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

      // Style header row
      const headerStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "333333" } },
        alignment: { horizontal: "center" as const },
      };
      header.forEach((_, i) => {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
        if (cell) cell.s = headerStyle;
      });

      // Auto-fit column widths
      ws["!cols"] = header.map((h, i) => {
        const maxLen = Math.max(
          h.length,
          ...rows.map((r) => String(r[i] ?? "").length),
        );
        return { wch: Math.min(maxLen + 2, 40) };
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Заявки");
      XLSX.writeFile(wb, `orders-${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  };

  /* ---------- Bulk order actions ---------- */

  const clearOrderSelection = () => setSelectedOrderIds(new Set());

  /**
   * Меняет статус у множества заявок одним batch'ем. Подходит и для
   * «Подтвердить» (new → processing), и для «Отклонить» (… → cancelled).
   * Нерелевантные статусы пропускаются, чтобы кнопка не ломала уже
   * завершённые заявки. Все ошибки агрегируются в один toast.
   */
  const bulkUpdateOrderStatus = async (
    targetIds: string[],
    nextStatus: OrderStatus,
    filterFn: (o: AdminOrder) => boolean,
    labels: { confirm?: string; successSingular: string; successPlural: string },
  ) => {
    const applicable = orders.filter(
      (o) => targetIds.includes(o.id) && filterFn(o),
    );
    if (applicable.length === 0) {
      toast.error("Нет подходящих заявок для действия");
      return;
    }
    if (labels.confirm && !confirm(labels.confirm.replace("{n}", String(applicable.length)))) {
      return;
    }
    const results = await Promise.allSettled(
      applicable.map((o) =>
        ordersApi.adminUpdate(o.id, { status: nextStatus }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const fail = results.length - ok;
    if (ok > 0) {
      toast.success(
        ok === 1
          ? labels.successSingular
          : labels.successPlural.replace("{n}", String(ok)),
      );
    }
    if (fail > 0) {
      toast.error(`Не удалось обновить ${fail} шт.`);
    }
    clearOrderSelection();
    reloadOrders();
  };

  const bulkConfirmOrders = (ids: string[]) =>
    bulkUpdateOrderStatus(
      ids,
      "processing",
      (o) => o.status === "new",
      {
        successSingular: "Заявка подтверждена",
        successPlural: "Подтверждено заявок: {n}",
      },
    );

  const bulkRejectOrders = (ids: string[]) => {
    const applicable = orders.filter(
      (o) => ids.includes(o.id) && o.status !== "cancelled" && o.status !== "completed",
    );
    if (applicable.length === 0) {
      toast.error("Нет подходящих заявок для отклонения");
      return;
    }
    setRejectTarget(applicable);
    setRejectReason("");
  };

  /* ---------- Product helpers (row-level summary) ---------- */

  /**
   * Products in the redesign show a single price/stock/status row, so we
   * collapse the variants into a product-level summary. Variants are still
   * editable via the expandable drawer underneath the row.
   */
  const productSku = (p: AdminProduct) => p.variants?.[0]?.sku ?? "—";
  const productPricePerBox = (p: AdminProduct): number | null => {
    const v = p.variants?.[0];
    if (!v) return null;
    return Number(v.price_per_piece_rub) * v.pieces_per_box;
  };
  const productStockTotal = (p: AdminProduct) =>
    (p.variants ?? []).reduce((s, v) => s + Math.max(0, v.stock_boxes), 0);
  const productStatus = (p: AdminProduct): { label: string; cls: string } => {
    const variants = p.variants ?? [];
    const total = variants.reduce(
      (s, v) => s + Math.max(0, v.stock_boxes),
      0,
    );
    if (total === 0) return { label: "Нет", cls: "bg-muted text-muted-foreground" };
    if (variants.some((v) => v.stock_boxes > 0 && v.stock_boxes <= 5)) {
      return { label: "Мало", cls: "bg-warning/15 text-warning" };
    }
    return { label: "Активен", cls: "bg-success/15 text-success" };
  };
  const productImage = (p: AdminProduct) =>
    p.image_url ?? p.images?.[0]?.url ?? null;

  const filteredProducts = useMemo(() => {
    const q = productsSearch.trim().toLowerCase();
    return products
      .filter((p) => !productsCategory || p.category_id === productsCategory)
      .filter((p) => {
        if (!q) return true;
        return (
          p.name_ru.toLowerCase().includes(q) ||
          (p.variants ?? []).some((v) =>
            v.sku.toLowerCase().includes(q),
          )
        );
      });
  }, [products, productsSearch, productsCategory]);

  /* ---------- Products selection (header checkbox + row checkboxes) ---------- */
  const visibleProductIds = useMemo(
    () => filteredProducts.map((p) => p.id),
    [filteredProducts],
  );
  const selectedVisibleProductCount = visibleProductIds.reduce(
    (n, id) => n + (selectedProductIds.has(id) ? 1 : 0),
    0,
  );
  const allVisibleProductsSelected =
    visibleProductIds.length > 0 &&
    selectedVisibleProductCount === visibleProductIds.length;
  const someVisibleProductsSelected =
    selectedVisibleProductCount > 0 && !allVisibleProductsSelected;

  const toggleAllVisibleProducts = () => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (allVisibleProductsSelected) {
        visibleProductIds.forEach((id) => next.delete(id));
      } else {
        visibleProductIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };
  const toggleProductSelected = (id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ---------- Bulk product actions ---------- */

  const clearProductSelection = () => setSelectedProductIds(new Set());

  /**
   * Массовое переключение флага публикации. Применяется только к тем
   * товарам, у которых is_published отличается от целевого значения,
   * чтобы не дёргать backend зря.
   */
  const bulkSetProductsPublished = async (ids: string[], published: boolean) => {
    const applicable = products.filter(
      (p) => ids.includes(p.id) && p.is_published !== published,
    );
    if (applicable.length === 0) {
      toast.error(
        published
          ? "Все выбранные товары уже опубликованы"
          : "Все выбранные товары уже скрыты",
      );
      return;
    }
    const results = await Promise.allSettled(
      applicable.map((p) =>
        catalogApi.updateProduct(p.id, { is_published: published }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const fail = results.length - ok;
    if (ok > 0) {
      toast.success(
        published
          ? `Опубликовано товаров: ${ok}`
          : `Снято с публикации: ${ok}`,
      );
    }
    if (fail > 0) toast.error(`Не удалось обновить ${fail} шт.`);
    clearProductSelection();
    reloadProducts();
  };

  /**
   * Массовое удаление. Требует подтверждения — действие необратимое и
   * каскадно сносит вариации / фото / остатки.
   */
  const bulkDeleteProductsExec = async (ids: string[]) => {
    const applicable = products.filter((p) => ids.includes(p.id));
    if (applicable.length === 0) return;
    const results = await Promise.allSettled(
      applicable.map((p) => catalogApi.deleteProduct(p.id)),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const fail = results.length - ok;
    if (ok > 0) toast.success(`Удалено товаров: ${ok}`);
    if (fail > 0) toast.error(`Не удалось удалить ${fail} шт.`);
    clearProductSelection();
    reloadProducts();
  };

  const bulkDeleteProducts = (ids: string[]) => {
    const applicable = products.filter((p) => ids.includes(p.id));
    if (applicable.length === 0) return;
    if (suppressDeleteConfirm) { bulkDeleteProductsExec(ids); return; }
    setDeleteConfirm({
      message: `Удалить выбранные товары (${applicable.length} шт.) вместе со всеми вариациями и фото?`,
      onConfirm: () => bulkDeleteProductsExec(ids),
    });
  };

  return (
    <AdminShell
      tab={tab}
      setTab={setTab}
      user={user}
      newOrdersBadge={newCount}
      onSignOut={handleSignOut}
      actions={
        tab === "orders" ? (
          <Button variant="outline" size="sm" className="h-9" onClick={() => exportOrdersCsv()}>
            <Download className="h-4 w-4" /> Экспорт
          </Button>
        ) : null
      }
    >
      {/* ───── Dashboard ───── */}
      {tab === "dashboard" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Новые заявки"
              value={newCount}
              delta={newTodayCount > 0 ? `+${newTodayCount} за сегодня` : "сегодня пусто"}
              deltaTone={newTodayCount > 0 ? "ok" : "muted"}
            />
            <KpiCard
              label="В обработке"
              value={processingCount}
              delta={processingCount > 0 ? `${processingCount} в работе` : "нет в работе"}
              deltaTone={processingCount > 0 ? "warn" : "muted"}
            />
            <KpiCard
              label="Выручка (мес.)"
              value={formatCompactMoney(monthRevenue)}
              delta={monthRevenue > 0 ? "за текущий месяц" : "пока нет продаж"}
              deltaTone={monthRevenue > 0 ? "ok" : "muted"}
            />
            <KpiCard
              label="Активных клиентов"
              value={activeClients}
              delta={lowStock > 0 ? `${lowStock} SKU мало на складе` : "склад в норме"}
              deltaTone={lowStock > 0 ? "warn" : "muted"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            {/* Recent orders.
                Structured as a single <table> so the «Статус» and «Все заявки →»
                header labels sit directly above their columns (status pill /
                amount) — the previous flex header floated them freely and broke
                the visual alignment called out in the design. */}
            <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {/* Title spans the number + company columns on the left. */}
                    <th
                      colSpan={2}
                      className="px-5 pb-3 pt-5 text-left text-sm font-semibold"
                    >
                      Последние заявки
                    </th>
                    <th className="px-10 pb-3 pt-5 text-sm font-medium text-primary/80">
                      <div className="flex justify-end">Статус</div>
                    </th>
                    <th className="px-5 pb-3 pt-5 text-right text-sm">
                      <button
                        type="button"
                        onClick={() => setTab("orders")}
                        className="font-medium text-primary transition-colors hover:underline"
                      >
                        Все заявки →
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="p-8 text-center text-sm text-muted-foreground"
                      >
                        Заявок пока нет
                      </td>
                    </tr>
                  ) : (
                    recentOrders.map((o) => (
                      <tr key={o.id} className="border-t border-border">
                        <td className="num whitespace-nowrap px-5 py-3 font-semibold">
                          #{o.order_number}
                        </td>
                        <td className="py-3 pl-10 pr-5 text-muted-foreground">
                          {o.company_name}
                        </td>
                        <td className="px-8 py-3">
                          <div className="flex justify-end">
                            <StatusPill status={o.status} />
                          </div>
                        </td>
                        <td className="price px-5 py-3 text-right">
                          {formatMoney(Number(o.total), o.currency as Currency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Popular products */}
            <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <h3 className="font-semibold">Популярные товары</h3>
              <ul className="mt-4 space-y-3">
                {popularProducts.length === 0 ? (
                  <li className="text-sm text-muted-foreground">Нет товаров</li>
                ) : (
                  popularProducts.map((p) => (
                    <li key={p.id} className="flex items-center gap-3">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                        {p.image_url && (
                          <img
                            src={p.image_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{p.name_ru}</div>
                        <div className="num text-xs text-muted-foreground">
                          {p.totalStock} коробок
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ───── Clients (real users from DB) ───── */}
      {tab === "clients" && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Компания</th>
                <th className="px-4 py-3">Контакт</th>
                <th className="px-4 py-3">Email / телефон</th>
                <th className="px-4 py-3">Роль</th>
                <th className="px-4 py-3 text-right">Заявок</th>
                <th className="px-4 py-3 text-right">Оборот</th>
                <th className="px-4 py-3">Регистрация</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((u) => {
                const stats = clientOrderStats.get(u.id);
                return (
                  <tr key={u.id} className="border-t border-border align-top">
                    <td className="px-4 py-3 font-medium">{u.company_name || "—"}</td>
                    <td className="px-4 py-3">{u.contact_name || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div>{u.email}</div>
                      <div>{u.phone || ""}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        u.role === "admin" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                      )}>
                        {u.role === "admin" ? "Админ" : "Клиент"}
                      </span>
                    </td>
                    <td className="num px-4 py-3 text-right">{stats?.orders ?? 0}</td>
                    <td className="price px-4 py-3 text-right">
                      {formatMoney(stats?.total ?? 0, "RUB")}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString("ru-RU")}
                    </td>
                  </tr>
                );
              })}
              {allUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    Пользователей пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ───── Discount tiers ───── */}
      {tab === "discounts" && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Оптовые пороги: скидка применяется автоматически, когда количество
              коробок в заявке достигает указанного значения.
            </p>
            <Button onClick={() => setEditingDiscount({ min_boxes: 10, discount_percent: 5 })}>
              <Plus className="h-4 w-4" /> Новая скидка
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">От (коробок)</th>
                  <th className="px-4 py-3 text-right">Скидка, %</th>
                  <th className="px-4 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="num px-4 py-3">{t.min_boxes}</td>
                    <td className="num px-4 py-3 text-right text-primary">
                      {t.discount_percent}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditingDiscount(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteDiscount(t.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {tiers.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-muted-foreground">
                      Скидок пока нет
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="space-y-5">
          {/* Filter tabs — mirrors the counts shown in the sidebar badge,
              with the active tab highlighted by an underline bar. */}
          <div className="flex items-center gap-6 border-b border-border">
            {([
              { key: "all", label: "Все" },
              { key: "new", label: "Новые" },
              { key: "processing", label: "В работе" },
              { key: "ready", label: "Готовы" },
              { key: "completed", label: "Завершенные" },
              { key: "cancelled", label: "Отменённые" },
            ] as { key: OrdersFilter; label: string }[]).map((t) => {
              const active = ordersFilter === t.key;
              const count = ordersCountByFilter[t.key];
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setOrdersFilter(t.key)}
                  className={cn(
                    "relative flex items-center gap-2 pb-3 pt-1 text-sm transition-colors",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span>{t.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 text-xs font-medium",
                      active
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                  {active && (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Поиск по номеру, клиенту..."
              value={ordersSearch}
              onChange={(e) => setOrdersSearch(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-surface pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/*
            Bulk-actions bar — появляется, когда выбрана хотя бы одна заявка.
            Кнопки применяют одно действие сразу ко всем выделенным: статус
            меняется batch-запросом, «Экспорт» выгружает только выбранные,
            «Снять выделение» очищает Set. Нерелевантные заявки (например,
            уже cancelled) автоматически пропускаются в bulkUpdateOrderStatus.
          */}
          {selectedOrderIds.size > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-5xl flex-wrap items-center gap-3 rounded-t-lg border border-primary/30 bg-background/95 px-4 py-3 text-sm shadow-lg backdrop-blur-sm">
              <span className="font-medium text-foreground">
                Выбрано: <span className="num text-primary">{selectedOrderIds.size}</span>
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-success/30 bg-success/10 text-success hover:border-success/60 hover:bg-success/15 hover:text-success"
                  onClick={() => bulkConfirmOrders(Array.from(selectedOrderIds))}
                >
                  Подтвердить
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-destructive/30 bg-destructive/10 text-destructive hover:border-destructive/60 hover:bg-destructive/15 hover:text-destructive"
                  onClick={() => bulkRejectOrders(Array.from(selectedOrderIds))}
                >
                  Отклонить
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() =>
                    exportOrdersCsv(
                      filteredOrders.filter((o) => selectedOrderIds.has(o.id)),
                    )
                  }
                >
                  <Download className="h-4 w-4" /> Экспорт выбранных
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-muted-foreground hover:text-foreground"
                  onClick={clearOrderSelection}
                >
                  Снять выделение
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-3">
                    {/* Checkbox «выбрать всё на странице».
                        `indeterminate` устанавливается через ref—
                        этого свойства нет у React-пропсов. */}
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someOnPageSelected;
                      }}
                      onChange={toggleAllOnPage}
                      disabled={pageOrderIds.length === 0}
                      aria-label="Выбрать все заявки на странице"
                      className="h-4 w-4 cursor-pointer rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </th>
                  <th className="px-4 py-3">№</th>
                  <th className="px-4 py-3">Клиент</th>
                  <th className="px-4 py-3">Дата</th>
                  <th className="px-4 py-3 text-right">Сумма</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Действия</th>
                </tr>
              </thead>
              <tbody>
                {pagedOrders.map((o) => {
                  const isNew = o.status === "new";
                  return (
                    <tr key={o.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedOrderIds.has(o.id)}
                          onChange={() => toggleOrderSelected(o.id)}
                          aria-label={`Выбрать заявку ${o.order_number}`}
                          className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                        />
                      </td>
                      <td className="num px-4 py-3 font-semibold">#{o.order_number}</td>
                      <td className="px-4 py-3">{o.company_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString("ru-RU", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                        })}
                      </td>
                      <td className="price px-4 py-3 text-right">
                        {formatMoney(Number(o.total), o.currency as Currency)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={o.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isNew && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => approveOrder(o)}
                                className="h-8 border-success/30 bg-success/10 text-success hover:border-success/60 hover:bg-success/15 hover:text-success"
                              >
                                Одобрить
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => rejectOrder(o)}
                                className="h-8 border-destructive/30 bg-destructive/10 text-destructive hover:border-destructive/60 hover:bg-destructive/15 hover:text-destructive"
                              >
                                Отклонить
                              </Button>
                            </>
                          )}
                          {o.status === "processing" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => approveOrder(o)}
                              className="h-8 border-success/30 bg-success/10 text-success hover:border-success/60 hover:bg-success/15 hover:text-success"
                            >
                              Одобрить
                            </Button>
                          )}
                          {o.status === "payment_review" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => confirmPayment(o)}
                              className="h-8 border-success/30 bg-success/10 text-success hover:border-success/60 hover:bg-success/15 hover:text-success"
                            >
                              Оплата ✓
                            </Button>
                          )}
                          {o.status === "paid" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markReady(o)}
                              className="h-8 border-success/30 bg-success/10 text-success hover:border-success/60 hover:bg-success/15 hover:text-success"
                            >
                              Готово
                            </Button>
                          )}
                          {o.status === "shipped" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markCompleted(o)}
                              className="h-8 border-muted-foreground/30 bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              Выдан
                            </Button>
                          )}
                          {/* ⋮-кнопка — outline-вариант с рамкой (как на скрине). Кнопка
                              счёта-договора перенесена в диалог заявки чтобы меню стало лаконичным. */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 w-8 p-0"
                                aria-label="Действия"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              {/* Иконки из hugeicons (free сет), по просьбе пользователя.
                                  `gap-3` — ~12px между иконкой и текстом,
                                  `strokeWidth={2}` делает контур потолще — ближе
                                  к solid-стилю из макета. */}
                              <DropdownMenuItem className="gap-3" onClick={() => setOpenOrderId(o.id)}>
                                <HugeiconsIcon icon={Package01Icon} size={16} strokeWidth={2} />
                                Открыть
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-3"
                                onClick={() => {
                                  setContactOrder(o);
                                  setContactSubject(`По заявке #${o.order_number}`);
                                  setContactBody("");
                                }}
                              >
                                <HugeiconsIcon icon={BubbleChatIcon} size={16} strokeWidth={2} />
                                Связаться
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="gap-3 text-xs">
                                  Изменить статус
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="w-40">
                                  {STATUSES.filter((s) => s !== o.status).map((s) => (
                                    <DropdownMenuItem
                                      key={s}
                                      onClick={() => updateStatus(o.id, s)}
                                      className="text-xs"
                                    >
                                      {STATUS_LABEL[s]?.label ?? s}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {pagedOrders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-muted-foreground">
                      Заявок не найдено
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination footer — rendered only when there's something to page */}
          {filteredOrders.length > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Показано {(safeOrderPage - 1) * ORDERS_PER_PAGE + 1}–
                {Math.min(safeOrderPage * ORDERS_PER_PAGE, filteredOrders.length)} из{" "}
                {filteredOrders.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setOrdersPage((p) => Math.max(1, p - 1))}
                  disabled={safeOrderPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalOrderPages }, (_, i) => i + 1).map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant={n === safeOrderPage ? "default" : "outline"}
                    className="h-8 w-8 p-0"
                    onClick={() => setOrdersPage(n)}
                  >
                    {n}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setOrdersPage((p) => Math.min(totalOrderPages, p + 1))}
                  disabled={safeOrderPage === totalOrderPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "products" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Поиск товара..."
                value={productsSearch}
                onChange={(e) => setProductsSearch(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-surface pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="relative">
              <select
                value={productsCategory}
                onChange={(e) => setProductsCategory(e.target.value)}
                className="h-10 appearance-none rounded-md border border-input bg-surface pl-3 pr-8 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Категория: Все</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parent_id ? "↳ " : ""}
                    {c.name_ru}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <Button size="sm" className="ml-auto h-10" onClick={() => openProductDialog()}>
              <Plus className="h-4 w-4" /> Добавить товар
            </Button>
          </div>

          {/*
            Bulk-actions bar для товаров — параллельно bar'у заявок.
            Появляется, когда выделен хотя бы один товар. «Опубликовать» /
            «Снять с публикации» батчат `is_published`, «Удалить» —
            необратимое каскадное удаление через confirm().
          */}
          {selectedProductIds.size > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-5xl flex-wrap items-center gap-3 rounded-t-lg border border-primary/30 bg-background/95 px-4 py-3 text-sm shadow-lg backdrop-blur-sm">
              <span className="font-medium text-foreground">
                Выбрано: <span className="num text-primary">{selectedProductIds.size}</span>
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-success/30 bg-success/10 text-success hover:border-success/60 hover:bg-success/15 hover:text-success"
                  onClick={() => bulkSetProductsPublished(Array.from(selectedProductIds), true)}
                >
                  Опубликовать
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => bulkSetProductsPublished(Array.from(selectedProductIds), false)}
                >
                  Снять с публикации
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-destructive/30 bg-destructive/10 text-destructive hover:border-destructive/60 hover:bg-destructive/15 hover:text-destructive"
                  onClick={() => bulkDeleteProducts(Array.from(selectedProductIds))}
                >
                  <Trash2 className="h-4 w-4" /> Удалить
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-muted-foreground hover:text-foreground"
                  onClick={clearProductSelection}
                >
                  Снять выделение
                </Button>
              </div>
            </div>
          )}

          {/* Flat product table (variants live in the expandable drawer below each row) */}
          <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-3">
                    {/* Checkbox «выбрать все видимые товары».
                        Таблица товаров не пагинируется — берём весь
                        отфильтрованный набор. */}
                    <input
                      type="checkbox"
                      checked={allVisibleProductsSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someVisibleProductsSelected;
                      }}
                      onChange={toggleAllVisibleProducts}
                      disabled={visibleProductIds.length === 0}
                      aria-label="Выбрать все товары"
                      className="h-4 w-4 cursor-pointer rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </th>
                  <th className="w-16 px-4 py-3">Фото</th>
                  <th className="px-4 py-3">Название</th>
                  <th className="px-4 py-3">Категория</th>
                  <th className="px-4 py-3 text-right">Цена/кор.</th>
                  <th className="px-4 py-3 text-right">Остаток</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="w-24 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => {
                  const img = productImage(p);
                  const price = productPricePerBox(p);
                  const stock = productStockTotal(p);
                  const status = productStatus(p);
                  const sku = productSku(p);
                  const expanded = expandedProducts.has(p.id);
                  return (
                    <Fragment key={p.id}>
                      <tr className="border-t border-border hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedProductIds.has(p.id)}
                            onChange={() => toggleProductSelected(p.id)}
                            aria-label={`Выбрать ${p.name_ru}`}
                            className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-10 w-10 overflow-hidden rounded-md bg-muted">
                            {img && (
                              <img src={img} alt="" className="h-full w-full object-cover" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {/*
                            Clicking the name toggles the variants drawer — the ✏️
                            button on the right still opens the product dialog so
                            the row has two clearly-separated affordances.
                          */}
                          <button
                            type="button"
                            onClick={() => toggleProductExpanded(p.id)}
                            className="group flex items-center gap-2 text-left"
                          >
                            <div>
                              <div className="font-medium">
                                {p.name_ru}
                                {!p.is_published && (
                                  <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                                    черновик
                                  </span>
                                )}
                              </div>
                              <div className="num text-xs text-muted-foreground">
                                SKU: {sku}
                              </div>
                            </div>
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 text-muted-foreground transition-transform",
                                expanded && "rotate-180",
                              )}
                            />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {categories.find((c) => c.id === p.category_id)?.name_ru ?? "—"}
                        </td>
                        <td className="price px-4 py-3 text-right">
                          {price !== null ? formatMoney(price, "RUB") : "—"}
                        </td>
                        <td
                          className={cn(
                            "num px-4 py-3 text-right",
                            stock === 0
                              ? "text-muted-foreground"
                              : stock <= 5
                                ? "text-warning"
                                : "text-success",
                          )}
                        >
                          {stock}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                              status.cls,
                            )}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openProductDialog(p)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteProduct(p.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-t border-border bg-muted/30">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="mb-2 flex items-center justify-between">
                              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Вариации ({p.variants?.length ?? 0})
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setEditingVariant({
                                    product_id: p.id,
                                    pieces_per_box: 1,
                                  })
                                }
                              >
                                <Plus className="h-3.5 w-3.5" /> Вариация
                              </Button>
                            </div>
                            <div className="overflow-x-auto rounded-md border border-border bg-surface">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/50 text-left uppercase tracking-wider text-muted-foreground">
                                  <tr>
                                    <th className="w-10 px-3 py-2">Фото</th>
                                    <th className="px-3 py-2">SKU</th>
                                    <th className="px-3 py-2">Размер</th>
                                    <th className="px-3 py-2">Цвет</th>
                                    <th className="px-3 py-2 text-right">Шт/кор</th>
                                    <th className="px-3 py-2 text-right">RUB/шт</th>
                                    <th className="px-3 py-2 text-right">Кор.</th>
                                    <th className="px-3 py-2"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.variants?.map((v) => (
                                    <tr key={v.id} className="border-t border-border">
                                      <td className="px-3 py-2">
                                        <div className="h-8 w-8 overflow-hidden rounded bg-muted">
                                          {v.image_url ? (
                                            <img src={v.image_url} alt="" className="h-full w-full object-cover" />
                                          ) : (
                                            <div className="flex h-full w-full items-center justify-center text-[9px] text-muted-foreground">—</div>
                                          )}
                                        </div>
                                      </td>
                                      <td className="num px-3 py-2">{v.sku}</td>
                                      <td className="px-3 py-2">{v.size ?? "—"}</td>
                                      <td className="px-3 py-2">{v.color ?? "—"}</td>
                                      <td className="num px-3 py-2 text-right">{v.pieces_per_box}</td>
                                      <td className="num px-3 py-2 text-right">{v.price_per_piece_rub}</td>
                                      <td className="num px-3 py-2 text-right">{v.stock_boxes}</td>
                                      <td className="px-3 py-2 text-right">
                                        <div className="inline-flex gap-1">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setEditingVariant(v)}
                                          >
                                            <Pencil className="h-3 w-3" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => deleteVariant(v.id)}
                                            className="text-destructive hover:text-destructive"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                  {(!p.variants || p.variants.length === 0) && (
                                    <tr>
                                      <td
                                        colSpan={8}
                                        className="p-3 text-center text-muted-foreground"
                                      >
                                        Нет вариаций
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="p-10 text-center text-muted-foreground"
                    >
                      Товаров не найдено
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
                {`${import.meta.env.VITE_API_URL ?? "http://localhost:8000"}/inventory/webhook`}
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

      {/* ───── Settings (company details + folded lookups) ───── */}
      {tab === "settings" && (
        <div className="space-y-6">
          {company && (
            <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <div className="mb-3">
                <h2 className="text-lg font-semibold">Реквизиты компании</h2>
                <p className="text-xs text-muted-foreground">
                  Используются в счёте-договоре, который открывается из заявок (печать / сохранение в PDF).
                </p>
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
                  <TextArea label="Условия отгрузки / самовывоза" rows={2} value={company.delivery_terms} onChange={(e) => setCompany({ ...company, delivery_terms: e.target.value })} />
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

          {/*
            Справочники are folded inside Настройки because the 8-item
            sidebar in the redesign has no slot for them — they're
            admin-internal and editing them is rare, so sharing a page
            with Реквизиты is the right trade-off.
          */}
          <div>
            <div className="mb-3">
              <h2 className="text-lg font-semibold">Справочники</h2>
              <p className="text-xs text-muted-foreground">
                Материалы, ароматы и формы — используются в карточке товара.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {(["materials", "scents", "shapes"] as LookupKind[]).map((kind) => {
                const items = lookupListByKind(kind);
                return (
                  <div key={kind} className="rounded-lg border border-border bg-surface shadow-sm">
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
          </div>
        </div>
      )}

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
              <Field label="Название *" value={editingProduct.name_ru ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, name_ru: e.target.value })} />

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
                <TextArea label="Описание" rows={3} value={editingProduct.description_ru ?? ""} onChange={(e) => setEditingProduct({ ...editingProduct, description_ru: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <ImageUpload
                  value={editingProduct.image_url ?? null}
                  onChange={(url) => setEditingProduct({ ...editingProduct, image_url: url })}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Главное фото — используется в карточках. Если пусто, возьмётся первое из галереи.</p>
              </div>
              <div className="md:col-span-2">
                <MultiImageUpload
                  value={productGallery}
                  onChange={setProductGallery}
                  mainImageUrl={editingProduct.image_url ?? null}
                />
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
              <div className="md:col-span-2">
                <ImageUpload
                  value={editingVariant.image_url ?? null}
                  onChange={(url) => setEditingVariant({ ...editingVariant, image_url: url })}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Фото вариации — используется вместо общего фото товара, если задано.</p>
              </div>
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
              <Field label="Название *" value={editingCategory.name_ru ?? ""} onChange={(e) => setEditingCategory({ ...editingCategory, name_ru: e.target.value })} />
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

      {/* DISCOUNT DIALOG */}
      <Dialog open={!!editingDiscount} onOpenChange={(o) => !o && setEditingDiscount(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingDiscount?.id ? "Редактировать скидку" : "Новая скидка"}
            </DialogTitle>
          </DialogHeader>
          {editingDiscount && (
            <div className="grid gap-3">
              <Field
                label="От (коробок) *"
                type="number"
                min={1}
                value={editingDiscount.min_boxes ?? 1}
                onChange={(e) =>
                  setEditingDiscount({
                    ...editingDiscount,
                    min_boxes: Number(e.target.value),
                  })
                }
              />
              <Field
                label="Скидка, % *"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={editingDiscount.discount_percent ?? 0}
                onChange={(e) =>
                  setEditingDiscount({
                    ...editingDiscount,
                    discount_percent: Number(e.target.value),
                  })
                }
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDiscount(null)}>Отмена</Button>
            <Button onClick={saveDiscount}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ORDER DETAIL DIALOG (opened from the ⋮ menu: Открыть / Редактировать) */}
      <Dialog open={!!openOrderId} onOpenChange={(o) => !o && setOpenOrderId(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Заявка {openOrderQ.data ? `#${openOrderQ.data.order_number}` : ""}
            </DialogTitle>
          </DialogHeader>
          {openOrderQ.isLoading && (
            <div className="space-y-4 py-6">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}
          {openOrderQ.data && (
            <div className="space-y-4">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Клиент:</span>{" "}
                  <span className="font-medium">{openOrderQ.data.company_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Контакт:</span>{" "}
                  {openOrderQ.data.contact_name} · {openOrderQ.data.phone}
                </div>
                <div>
                  <span className="text-muted-foreground">E-mail:</span>{" "}
                  {openOrderQ.data.email}
                </div>
                <div>
                  <span className="text-muted-foreground">Дата:</span>{" "}
                  {new Date(openOrderQ.data.created_at).toLocaleString("ru-RU")}
                </div>
                {openOrderQ.data.customer_comment && (
                  <div className="sm:col-span-2">
                    <span className="text-muted-foreground">Комментарий:</span>{" "}
                    {openOrderQ.data.customer_comment}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Статус:</span>
                <select
                  value={openOrderQ.data.status}
                  onChange={async (e) => {
                    const next = e.target.value;
                    await updateStatus(openOrderQ.data!.id, next);
                    openOrderQ.refetch();
                  }}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]?.label ?? s}
                    </option>
                  ))}
                </select>
              </div>

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
                    {openOrderQ.data.items.map((it) => (
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
                            openOrderQ.data!.currency as Currency,
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
                    {openOrderQ.data.total_boxes}
                  </span>
                </span>
                <div className="price text-base font-semibold">
                  {formatMoney(
                    Number(openOrderQ.data.total),
                    openOrderQ.data.currency as Currency,
                  )}
                </div>
              </div>

              {openOrderQ.data.payment_receipt_url && (
                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Чек оплаты
                  </div>
                  {openOrderQ.data.payment_receipt_url.match(/\.(jpe?g|png|webp|avif)$/i) ? (
                    <a
                      href={openOrderQ.data.payment_receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <img
                        src={openOrderQ.data.payment_receipt_url}
                        alt="Чек оплаты"
                        className="max-h-64 rounded-md border border-border object-contain"
                      />
                    </a>
                  ) : (
                    <a
                      href={openOrderQ.data.payment_receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Открыть файл чека →
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {openOrderQ.data && (
              <Button
                variant="outline"
                onClick={() => downloadInvoice(openOrderQ.data as AdminOrder)}
              >
                <FileDown className="h-4 w-4" /> Счёт-договор
              </Button>
            )}
            <Button onClick={() => setOpenOrderId(null)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StockOpDialog variant={stockOpVariant} onClose={() => setStockOpVariant(null)} onDone={reloadProducts} />

      {/* DELETE CONFIRMATION MODAL */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Подтвердите удаление</DialogTitle>
            <DialogDescription>{deleteConfirm?.message}</DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={suppressDeleteConfirm}
              onCheckedChange={(v) => {
                const val = !!v;
                setSuppressDeleteConfirm(val);
                if (val) localStorage.setItem("admin_suppress_delete_confirm", "1");
                else localStorage.removeItem("admin_suppress_delete_confirm");
              }}
            />
            Больше не показывать
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Отмена</Button>
            <Button
              variant="destructive"
              onClick={() => { deleteConfirm?.onConfirm(); setDeleteConfirm(null); }}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CONTACT CUSTOMER EMAIL DIALOG */}
      <Dialog open={!!contactOrder} onOpenChange={(o) => !o && setContactOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Связаться с клиентом</DialogTitle>
            <DialogDescription>
              Отправка письма на {contactOrder?.email ?? "—"}
              {contactOrder?.company_name ? ` (${contactOrder.company_name})` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Тема</span>
              <input
                value={contactSubject}
                onChange={(e) => setContactSubject(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Сообщение</span>
              <textarea
                value={contactBody}
                onChange={(e) => setContactBody(e.target.value)}
                rows={6}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                placeholder="Текст письма…"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactOrder(null)} disabled={contactSending}>Отмена</Button>
            <Button
              disabled={!contactBody.trim() || contactSending}
              onClick={async () => {
                // Быстрый UX-фильтр: если у заявки нет email, даже
                // запрос делать не будем — backend всё равно вернёт 422,
                // но так пользователь увидит ошибку мгновенно.
                if (!contactOrder?.id) return;
                if (!contactOrder.email) {
                  toast.error("У клиента не указан email");
                  return;
                }
                setContactSending(true);
                try {
                  // Ходим в /admin/orders/{id}/contact — backend сам
                  // берёт email из заявки и уходит в SMTP фоном, поэтому
                  // ответ приходит мгновенно независимо от провайдера.
                  await ordersApi.adminContact(contactOrder.id, {
                    subject: contactSubject,
                    body: contactBody,
                  });
                  toast.success("Письмо поставлено в очередь");
                  setContactOrder(null);
                } catch (err) {
                  toast.error(apiErrorMessage(err, "Не удалось отправить письмо"));
                } finally {
                  setContactSending(false);
                }
              }}
            >
              {contactSending ? "Отправка…" : "Отправить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REJECT ORDER DIALOG */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Отклонить заявку</DialogTitle>
            <DialogDescription>
              {Array.isArray(rejectTarget)
                ? `Отклонение ${rejectTarget.length} заявок. Укажите причину — она будет отправлена каждому клиенту.`
                : rejectTarget
                  ? `Заявка №${rejectTarget.order_number} (${rejectTarget.company_name ?? rejectTarget.email ?? "—"})`
                  : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Причина отклонения
              <textarea
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                rows={3}
                placeholder="Например: товар временно отсутствует на складе…"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={rejectSending}>Отмена</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectSending}
              onClick={async () => {
                if (!rejectTarget) return;
                setRejectSending(true);
                try {
                  const targets = Array.isArray(rejectTarget) ? rejectTarget : [rejectTarget];
                  const results = await Promise.allSettled(
                    targets.map((o) => ordersApi.adminReject(o.id, rejectReason.trim())),
                  );
                  const ok = results.filter((r) => r.status === "fulfilled").length;
                  const fail = results.length - ok;
                  if (ok > 0) {
                    toast.success(
                      ok === 1
                        ? "Заявка отклонена — клиенту отправлено письмо"
                        : `Отклонено заявок: ${ok} — клиентам отправлены письма`,
                    );
                  }
                  if (fail > 0) toast.error(`Не удалось отклонить: ${fail} шт.`);
                  setRejectTarget(null);
                  clearOrderSelection();
                  reloadOrders();
                } catch (err) {
                  toast.error(apiErrorMessage(err, "Не удалось отклонить заявку"));
                } finally {
                  setRejectSending(false);
                }
              }}
            >
              {rejectSending ? "Отклонение…" : "Отклонить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
};

export default Admin;
