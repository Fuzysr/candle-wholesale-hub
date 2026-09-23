import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileDown,
  Download,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { GalleryImage } from "@/components/admin/MultiImageUpload";
import StockOpDialog, { type StockOpVariant } from "@/components/admin/StockOpDialog";
import { AdminShell, type AdminTab } from "@/components/admin/AdminShell";
import { AdminEntityDialogs } from "@/components/admin/AdminEntityDialogs";
import { ProductDialogs } from "@/components/admin/ProductDialogs";
import {
  ORDER_STATUSES as STATUSES,
  STATUS_LABEL,
} from "@/components/admin/AdminPrimitives";
import { CategoriesTab } from "@/components/admin/tabs/CategoriesTab";
import { ClientsTab } from "@/components/admin/tabs/ClientsTab";
import { DashboardTab } from "@/components/admin/tabs/DashboardTab";
import { DiscountsTab } from "@/components/admin/tabs/DiscountsTab";
import { MessagesTab } from "@/components/admin/tabs/MessagesTab";
import { OrdersTab, type OrdersFilter } from "@/components/admin/tabs/OrdersTab";
import { ProductsTab } from "@/components/admin/tabs/ProductsTab";
import { StockTab } from "@/components/admin/tabs/StockTab";
import { SettingsTab } from "@/components/admin/tabs/SettingsTab";
import { useAdminData } from "@/components/admin/useAdminData";
import NotFound from "@/pages/NotFound";
import { signOut, useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
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
  type VariantImageOut,
} from "@/lib/api";
import { contactApi } from "@/lib/api/contact";
import { formatMoney } from "@/lib/format";
import { downloadInvoicePdf } from "@/lib/invoicePdf";
import { toast } from "sonner";

type AdminOrder = OrderListOut;
type AdminVariant = ProductVariantOut;
type AdminProduct = ProductOut;
type AdminCategory = CategoryOut;
type Lookup = AttributeOut;

const INVOICE_DOWNLOAD_ENABLED = false;

const Admin = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const {
    orders,
    products,
    categories,
    materials,
    scents,
    shapes,
    companyData,
    discountTiers,
    users,
    contactMessages,
    reloadProducts,
    reloadCategories,
    reloadAttributes,
    reloadOrders,
    reloadCompany,
    reloadDiscounts,
    reloadContactMessages,
  } = useAdminData(isAdmin);

  const [company, setCompany] = useState<CompanySettingsOut | null>(null);
  useEffect(() => {
    if (companyData) setCompany(companyData);
  }, [companyData]);

  const [tab, setTab] = useState<AdminTab>("dashboard");

  /*
    Fire the toast BEFORE tearing down the session so Sonner has the message
    in its portal before the sidebar-triggered redirect unmounts this tree.
    Mirrors the Account-page sign-out flow (see AccountSettings).
  */
  const handleSignOut = async () => {
    toast.success("Вы успешно вышли из аккаунта");
    navigate("/");
    await signOut();
  };

  const [editingProduct, setEditingProduct] = useState<Partial<AdminProduct> | null>(null);
  const [productGallery, setProductGallery] = useState<GalleryImage[]>([]);
  const [editingCategory, setEditingCategory] = useState<Partial<AdminCategory> | null>(null);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const categorySaveInFlight = useRef(false);
  const [editingVariant, setEditingVariant] = useState<(Partial<AdminVariant> & { product_id: string }) | null>(null);
  const [variantDiscounts, setVariantDiscounts] = useState<{ min_boxes: number; discount_percent: number }[]>([]);
  const [variantImages, setVariantImages] = useState<VariantImageOut[]>([]);
  const [variantImgUploading, setVariantImgUploading] = useState(false);
  const [bulkVariant, setBulkVariant] = useState<{ product_id: string } | null>(null);
  const [bulkSizes, setBulkSizes] = useState("");
  const [bulkColors, setBulkColors] = useState("");
  const [bulkPiecesPerBox, setBulkPiecesPerBox] = useState(1);
  const [bulkPrice, setBulkPrice] = useState(0);
  const [bulkSkuPrefix, setBulkSkuPrefix] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
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
      manufacturing_method: editingVariant.manufacturing_method || null,
      has_scent: Boolean(editingVariant.has_scent),
      pieces_per_box: Number(editingVariant.pieces_per_box) || 1,
      price_per_piece_rub: Number(editingVariant.price_per_piece_rub) || 0,
      price_per_piece_usd: Number(editingVariant.price_per_piece_usd) || 0,
      length_mm: editingVariant.length_mm ? Number(editingVariant.length_mm) : null,
      width_mm: editingVariant.width_mm ? Number(editingVariant.width_mm) : null,
      height_mm: editingVariant.height_mm ? Number(editingVariant.height_mm) : null,
      weight_gr: editingVariant.weight_gr ? Number(editingVariant.weight_gr) : null,
      burn_time_hours: editingVariant.burn_time_hours ? Number(editingVariant.burn_time_hours) : null,
      packages_per_box: editingVariant.packages_per_box ? Number(editingVariant.packages_per_box) : null,
      box_length_mm: editingVariant.box_length_mm ? Number(editingVariant.box_length_mm) : null,
      box_width_mm: editingVariant.box_width_mm ? Number(editingVariant.box_width_mm) : null,
      box_height_mm: editingVariant.box_height_mm ? Number(editingVariant.box_height_mm) : null,
      box_weight_gr: editingVariant.box_weight_gr ? Number(editingVariant.box_weight_gr) : null,
      stock_boxes: Number(editingVariant.stock_boxes) || 0,
      image_url: editingVariant.image_url || null,
      external_id: editingVariant.external_id || null,
    };

    try {
      let variantId = editingVariant.id;
      if (variantId) {
        await catalogApi.updateVariant(variantId, body);
      } else {
        const created = await catalogApi.createVariant(editingVariant.product_id, body);
        variantId = created.id;
      }
      // Save volume discounts
      const validDiscounts = variantDiscounts.filter((d) => d.min_boxes > 0 && d.discount_percent > 0);
      await catalogApi.replaceVolumeDiscounts(variantId, validDiscounts);
      toast.success("Сохранено");
      setEditingVariant(null);
      setVariantDiscounts([]);
      reloadProducts();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось сохранить вариацию"));
    }
  };

  const saveBulkVariants = async () => {
    if (!bulkVariant) return;
    const sizes = bulkSizes.split(",").map((s) => s.trim()).filter(Boolean);
    const colors = bulkColors.split(",").map((s) => s.trim()).filter(Boolean);
    if (sizes.length === 0 && colors.length === 0) return toast.error("Укажите хотя бы размеры или цвета");
    if (!bulkSkuPrefix.trim()) return toast.error("Укажите SKU-префикс");

    // Build combinations
    const combos: { size: string | null; color: string | null; skuSuffix: string }[] = [];
    if (sizes.length > 0 && colors.length > 0) {
      for (const s of sizes) for (const c of colors) combos.push({ size: s, color: c, skuSuffix: `${s}-${c}` });
    } else if (sizes.length > 0) {
      for (const s of sizes) combos.push({ size: s, color: null, skuSuffix: s });
    } else {
      for (const c of colors) combos.push({ size: null, color: c, skuSuffix: c });
    }

    setBulkSaving(true);
    let ok = 0;
    let fail = 0;
    for (const combo of combos) {
      try {
        const sku = `${bulkSkuPrefix.trim()}-${combo.skuSuffix}`.toUpperCase().replace(/\s+/g, "-");
        await catalogApi.createVariant(bulkVariant.product_id, {
          sku,
          size: combo.size,
          color: combo.color,
          shape: null,
          manufacturing_method: null,
          has_scent: false,
          pieces_per_box: bulkPiecesPerBox,
          price_per_piece_rub: bulkPrice,
          price_per_piece_usd: 0,
          stock_boxes: 0,
          image_url: null,
          external_id: null,
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkSaving(false);
    if (ok > 0) toast.success(`Создано ${ok} вариаций`);
    if (fail > 0) toast.error(`Не удалось создать ${fail} шт. (возможно дубли SKU)`);
    setBulkVariant(null);
    setBulkSizes("");
    setBulkColors("");
    setBulkSkuPrefix("");
    setBulkPrice(0);
    setBulkPiecesPerBox(1);
    reloadProducts();
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
    if (!editingCategory || categorySaveInFlight.current) return;
    const payload = {
      slug: editingCategory.slug || "",
      name_ru: editingCategory.name_ru || "",
      name_en: editingCategory.name_en || editingCategory.name_ru || "",
      icon: editingCategory.icon || null,
      sort_order: Number(editingCategory.sort_order) || 0,
      parent_id: editingCategory.parent_id || null,
      show_on_home: editingCategory.show_on_home === true,
      home_image_url: editingCategory.home_image_url || null,
    };
    if (!payload.slug || !payload.name_ru) return toast.error("Заполните slug и название");

    categorySaveInFlight.current = true;
    setIsSavingCategory(true);
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
    } finally {
      categorySaveInFlight.current = false;
      setIsSavingCategory(false);
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
  const unreadMessagesCount = contactMessages.filter((m) => !m.is_read).length;
  const processingCount = orders.filter((o) => o.status === "processing" || o.status === "invoiced").length;
  const lowStock = products.filter((p) => p.variants?.some((v) => v.stock_boxes > 0 && v.stock_boxes <= 5)).length;
  const outOfStock = products.filter((p) => p.variants?.length > 0 && p.variants.every((v) => v.stock_boxes <= 0)).length;
  const allVariants = products.flatMap((p) => (p.variants ?? []).map((v) => ({ ...v, product_name: p.name_ru, product_slug: p.slug })));
  const tiers: DiscountTierOut[] = discountTiers;

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

  const allUsers: UserOut[] = users;
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
      toast.success("Заявка одобрена");
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
      toast.success("Заказ отмечен как готовый");
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
    if (!p.is_published) return { label: "Снят", cls: "bg-muted text-muted-foreground" };
    const variants = p.variants ?? [];
    const total = variants.reduce(
      (s, v) => s + Math.max(0, v.stock_boxes),
      0,
    );
    if (total === 0) return { label: "Нет", cls: "bg-destructive/15 text-destructive" };
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

  // Render guards deliberately live after every hook. Returning earlier made
  // the loading render call fewer hooks than the loaded render, which violates
  // React's hook ordering contract and can crash during authentication.
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

  return (
    <AdminShell
      tab={tab}
      setTab={setTab}
      newOrdersBadge={newCount}
      newMessagesBadge={unreadMessagesCount}
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
        <DashboardTab
          newCount={newCount}
          newTodayCount={newTodayCount}
          processingCount={processingCount}
          monthRevenue={monthRevenue}
          activeClients={activeClients}
          recentOrders={recentOrders}
          popularProducts={popularProducts}
          onViewOrders={() => setTab("orders")}
        />
      )}

      {/* ───── Clients (real users from DB) ───── */}
      {tab === "clients" && (
        <ClientsTab users={allUsers} orderStats={clientOrderStats} />
      )}

      {/* ───── Discount tiers ───── */}
      {tab === "discounts" && (
        <DiscountsTab
          tiers={tiers}
          onCreate={() => setEditingDiscount({ min_boxes: 10, discount_percent: 5 })}
          onEdit={setEditingDiscount}
          onDelete={deleteDiscount}
        />
      )}


      {tab === "orders" && (
        <OrdersTab
          ordersFilter={ordersFilter}
          ordersCountByFilter={ordersCountByFilter}
          ordersSearch={ordersSearch}
          selectedOrderIds={selectedOrderIds}
          filteredOrders={filteredOrders}
          pagedOrders={pagedOrders}
          allOnPageSelected={allOnPageSelected}
          someOnPageSelected={someOnPageSelected}
          pageOrderIds={pageOrderIds}
          safeOrderPage={safeOrderPage}
          totalOrderPages={totalOrderPages}
          ordersPerPage={ORDERS_PER_PAGE}
          onFilterChange={setOrdersFilter}
          onSearchChange={setOrdersSearch}
          onPageChange={setOrdersPage}
          onToggleAllOnPage={toggleAllOnPage}
          onToggleSelected={toggleOrderSelected}
          onClearSelection={clearOrderSelection}
          onBulkConfirm={bulkConfirmOrders}
          onBulkReject={bulkRejectOrders}
          onExport={exportOrdersCsv}
          onApprove={approveOrder}
          onReject={rejectOrder}
          onConfirmPayment={confirmPayment}
          onMarkReady={markReady}
          onMarkCompleted={markCompleted}
          onOpen={setOpenOrderId}
          onContactOrderChange={setContactOrder}
          onContactSubjectChange={setContactSubject}
          onContactBodyChange={setContactBody}
          onUpdateStatus={updateStatus}
        />
      )}

      {tab === "products" && (
        <ProductsTab
          productsSearch={productsSearch}
          productsCategory={productsCategory}
          categories={categories}
          selectedProductIds={selectedProductIds}
          allVisibleProductsSelected={allVisibleProductsSelected}
          someVisibleProductsSelected={someVisibleProductsSelected}
          visibleProductIds={visibleProductIds}
          filteredProducts={filteredProducts}
          expandedProducts={expandedProducts}
          onSearchChange={setProductsSearch}
          onCategoryChange={setProductsCategory}
          onOpenProduct={openProductDialog}
          onBulkPublish={bulkSetProductsPublished}
          onBulkDelete={bulkDeleteProducts}
          onClearSelection={clearProductSelection}
          onToggleAllVisible={toggleAllVisibleProducts}
          onToggleSelected={toggleProductSelected}
          onToggleExpanded={toggleProductExpanded}
          onDeleteProduct={deleteProduct}
          onOpenBulkGenerator={(productId, skuPrefix) => {
            setBulkSkuPrefix(skuPrefix);
            setBulkVariant({ product_id: productId });
          }}
          onCreateVariant={(productId) => {
            setVariantDiscounts([]);
            setEditingVariant({ product_id: productId, pieces_per_box: 1 });
          }}
          onEditVariant={(variant) => {
            setVariantDiscounts(
              (variant.volume_discounts ?? []).map((discount) => ({
                min_boxes: discount.min_boxes,
                discount_percent: discount.discount_percent,
              })),
            );
            setVariantImages([...(variant.images ?? [])].sort((a, b) => a.sort_order - b.sort_order));
            setEditingVariant(variant);
          }}
          onDeleteVariant={deleteVariant}
          getProductImage={productImage}
          getProductPricePerBox={productPricePerBox}
          getProductStockTotal={productStockTotal}
          getProductStatus={productStatus}
          getProductSku={productSku}
        />
      )}

      {tab === "categories" && (
        <CategoriesTab
          categories={categories}
          products={products}
          onCreate={() => setEditingCategory({ sort_order: categories.length })}
          onEdit={setEditingCategory}
          onDelete={deleteCategory}
          onChanged={reloadCategories}
        />
      )}


      {tab === "messages" && (
        <MessagesTab
          messages={contactMessages}
          onMarkRead={async (id) => {
            try {
              await contactApi.markRead(id);
              await reloadContactMessages();
            } catch (err) {
              toast.error(apiErrorMessage(err, "Ошибка"));
            }
          }}
          onDelete={async (id) => {
            try {
              await contactApi.delete(id);
              toast.success("Удалено");
              await reloadContactMessages();
            } catch (err) {
              toast.error(apiErrorMessage(err, "Ошибка"));
            }
          }}
        />
      )}


      {tab === "stock" && (
        <StockTab variants={allVariants} onStockOperation={setStockOpVariant} />
      )}

      {tab === "settings" && (
        <SettingsTab
          company={company}
          materials={materials}
          scents={scents}
          shapes={shapes}
          onCompanyChange={setCompany}
          onSaveCompany={saveCompany}
          onEditLookup={setEditingLookup}
          onDeleteLookup={deleteLookup}
        />
      )}

      <ProductDialogs
        editingProduct={editingProduct}
        productGallery={productGallery}
        editingVariant={editingVariant}
        variantDiscounts={variantDiscounts}
        variantImages={variantImages}
        variantImgUploading={variantImgUploading}
        bulkVariant={bulkVariant}
        bulkSizes={bulkSizes}
        bulkColors={bulkColors}
        bulkPiecesPerBox={bulkPiecesPerBox}
        bulkPrice={bulkPrice}
        bulkSkuPrefix={bulkSkuPrefix}
        bulkSaving={bulkSaving}
        categories={categories}
        materials={materials}
        scents={scents}
        shapes={shapes}
        setEditingProduct={setEditingProduct}
        setProductGallery={setProductGallery}
        setEditingVariant={setEditingVariant}
        setVariantDiscounts={setVariantDiscounts}
        setVariantImages={setVariantImages}
        setVariantImgUploading={setVariantImgUploading}
        setBulkVariant={setBulkVariant}
        setBulkSizes={setBulkSizes}
        setBulkColors={setBulkColors}
        setBulkPiecesPerBox={setBulkPiecesPerBox}
        setBulkPrice={setBulkPrice}
        setBulkSkuPrefix={setBulkSkuPrefix}
        onSaveProduct={saveProduct}
        onSaveVariant={saveVariant}
        onSaveBulkVariants={saveBulkVariants}
        onProductsChanged={reloadProducts}
      />
      <AdminEntityDialogs
        editingCategory={editingCategory}
        editingLookup={editingLookup}
        editingDiscount={editingDiscount}
        categories={categories}
        setEditingCategory={setEditingCategory}
        isSavingCategory={isSavingCategory}
        setEditingLookup={setEditingLookup}
        setEditingDiscount={setEditingDiscount}
        onSaveCategory={saveCategory}
        onSaveLookup={saveLookup}
        onSaveDiscount={saveDiscount}
      />
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
            {/* FROZEN: Invoice download temporarily hidden */}
            {INVOICE_DOWNLOAD_ENABLED && openOrderQ.data && (
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
                        ? "Заявка отклонена"
                        : `Отклонено заявок: ${ok}`,
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
