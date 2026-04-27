import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Upload,
  Download,
  Plus,
  Trash2,
  FileSpreadsheet,
  ImageOff,
  Package,
  Send,
} from "lucide-react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
// `xlsx-js-style` is a drop-in superset of the community `xlsx` package that
// preserves cell-level styling (fills, fonts, borders) when writing .xlsx
// files. We use it here so the ИТОГО row can be highlighted green.
import * as XLSX from "xlsx-js-style";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Reveal from "@/components/ui/reveal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  apiErrorMessage,
  catalogApi,
  ordersApi,
  profileApi,
  stockApi,
} from "@/lib/api";
import { AUTH_ME_KEY, useAuth } from "@/hooks/useAuth";
import { useAppStore } from "@/store/appStore";
import { formatMoney } from "@/lib/format";
import {
  computeDiscount,
  productName,
  productGalleryUrls,
  type Product,
} from "@/lib/catalog";
import { getProductImage } from "@/lib/productImages";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Row = { sku: string; qty: number };
type Variant = Product["variants"][number];
type SkuMatch = { p: Product; v: Variant };

const variantLabel = (v: Variant) =>
  [v.size, v.color, v.shape].filter(Boolean).join(" · ");

/** Unified product-thumbnail helper: gets the first image of the product. */
const thumbFor = (p: Product | null | undefined) => {
  if (!p) return null;
  return getProductImage(productGalleryUrls(p)[0] ?? p.image_url ?? null);
};

/** Small inline label+input helper for the submit dialog. Kept local so the
 *  dialog can be self-contained without pulling in a shared form primitive. */
const Field = ({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
    <input
      {...props}
      className="h-10 w-full rounded-md border border-input bg-surface px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  </label>
);

const EMPTY_FORM = {
  company_name: "",
  contact_name: "",
  phone: "",
  inn: "",
  email: "",
  delivery_date: "",
  customer_comment: "",
};

const QuickOrder = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currency, lang } = useAppStore();
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([
    { sku: "", qty: 1 },
    { sku: "", qty: 1 },
    { sku: "", qty: 1 },
  ]);

  /* ────────────────── Submit-order dialog state ──────────────────
     Quick Order used to funnel everything through the cart; now the CTA
     opens a compact confirmation dialog that posts straight to
     `ordersApi.create()`, matching Checkout's payload shape but without
     the route change. */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [productsQ, tiersQ] = useQueries({
    queries: [
      { queryKey: ["products"], queryFn: () => catalogApi.listProducts() },
      { queryKey: ["discount-tiers"], queryFn: () => stockApi.listDiscountTiers() },
    ],
  });
  const products: Product[] = productsQ.data ?? [];
  const tiers = tiersQ.data ?? [];

  /*
    Fast SKU → {product, variant} lookup. Keys are uppercased so matching is
    case-insensitive (users commonly lowercase by accident).
  */
  const skuIndex = useMemo(() => {
    const map = new Map<string, SkuMatch>();
    products.forEach((p) =>
      p.variants?.forEach((v) => map.set(v.sku.toUpperCase(), { p, v })),
    );
    return map;
  }, [products]);

  /*
    Flat array of all {p, v} pairs — used as the search corpus for the custom
    dropdown. Built once from the index so suggestions filter in-memory.
  */
  const allMatches = useMemo(() => Array.from(skuIndex.values()), [skuIndex]);

  const enriched = useMemo(() => {
    return rows.map((r) => {
      const found = skuIndex.get(r.sku.trim().toUpperCase());
      if (!found) {
        return {
          ...r,
          valid: false as const,
          error: r.sku ? "SKU не найден" : null,
          p: null,
          v: null,
          sum: 0,
        };
      }
      const { p, v } = found;
      const price =
        currency === "RUB"
          ? Number(v.price_per_piece_rub)
          : Number(v.price_per_piece_usd);
      const qty = Math.max(0, Math.min(r.qty, v.stock_boxes));
      const sum = price * v.pieces_per_box * qty;
      const stockError = qty < r.qty ? `Доступно ${v.stock_boxes} кор.` : null;
      return { ...r, valid: true as const, error: stockError, p, v, sum };
    });
  }, [rows, skuIndex, currency]);

  const totalBoxes = enriched.reduce(
    (s, r) => s + (r.v ? Math.min(r.qty, r.v.stock_boxes) : 0),
    0,
  );
  const subtotal = enriched.reduce((s, r) => s + r.sum, 0);
  const discount = computeDiscount(totalBoxes, tiers);
  const total = subtotal - (subtotal * discount) / 100;

  const updateRow = (idx: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addRow = () => setRows((rs) => [...rs, { sku: "", qty: 1 }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  /* ────────────────────── Custom SKU autocomplete ──────────────────────
    The browser's native <datalist> dropdown is unstyled and pops up for every
    input that has history in it — it covers the next rows and looks jarring.
    We suppress it with autoComplete="off" and render our own keyboard-
    navigable popover below the focused cell. Only one row's dropdown is
    visible at a time, tracked by `openRowIdx`.
  */
  const [openRowIdx, setOpenRowIdx] = useState<number | null>(null);
  const [activeSugIdx, setActiveSugIdx] = useState(-1);

  /*
    Suggestions for the currently-focused row, sorted by match quality:
    1) exact SKU match, 2) SKU prefix, 3) SKU substring, 4) product-name
    substring. Capped at 8 entries so the popover fits without scrolling.
  */
  const suggestions = useMemo<SkuMatch[]>(() => {
    if (openRowIdx === null) return [];
    const raw = rows[openRowIdx]?.sku ?? "";
    const q = raw.trim().toUpperCase();
    if (!q) return [];
    const scored: { m: SkuMatch; s: number }[] = [];
    for (const m of allMatches) {
      const sku = m.v.sku.toUpperCase();
      const name = productName(m.p, lang).toUpperCase();
      let s = 0;
      if (sku === q) s = 100;
      else if (sku.startsWith(q)) s = 80;
      else if (sku.includes(q)) s = 60;
      else if (name.includes(q)) s = 40;
      if (s) scored.push({ m, s });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 8).map((x) => x.m);
  }, [openRowIdx, rows, allMatches, lang]);

  // Reset the keyboard-active row whenever the list changes.
  useEffect(() => {
    setActiveSugIdx(-1);
  }, [suggestions.length, openRowIdx]);

  // Global click-outside listener: if the user clicks anywhere that's NOT the
  // currently-open row, close the dropdown. Uses a data-attribute to scope.
  useEffect(() => {
    if (openRowIdx === null) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest(`[data-sku-row="${openRowIdx}"]`)) {
        setOpenRowIdx(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openRowIdx]);

  const pickSuggestion = (rowIdx: number, m: SkuMatch) => {
    updateRow(rowIdx, { sku: m.v.sku });
    setOpenRowIdx(null);
  };

  const onSkuKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number) => {
    if (e.key === "Escape") {
      setOpenRowIdx(null);
      return;
    }
    if (openRowIdx !== rowIdx || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSugIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSugIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeSugIdx >= 0) {
      e.preventDefault();
      pickSuggestion(rowIdx, suggestions[activeSugIdx]);
    } else if (e.key === "Tab" && activeSugIdx >= 0) {
      // Tab auto-completes the highlighted suggestion without advancing focus.
      pickSuggestion(rowIdx, suggestions[activeSugIdx]);
    }
  };

  /* ────────────────────── Import / export / cart ────────────────────── */

  const handleImport = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) {
      toast.error("Не удалось прочитать файл");
      return;
    }

    /*
      Read as array-of-arrays so we can transparently skip any preamble rows
      (our new template has a title + instructions banner above the grid).
      We then locate the header row by scanning for an «Артикул»/«SKU» cell,
      which lets us accept both the rich template and any flat file the user
      might hand-roll in Excel/Google Sheets.
    */
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
    });

    const headerRowIdx = aoa.findIndex((row) =>
      row.some((cell) => {
        const s = String(cell ?? "").trim().toLowerCase();
        return s === "sku" || s === "артикул";
      }),
    );

    if (headerRowIdx === -1) {
      toast.error("В файле не найдена колонка «Артикул»");
      return;
    }

    const headers = aoa[headerRowIdx].map((h) =>
      String(h ?? "").trim().toLowerCase(),
    );
    const skuCol = headers.findIndex((h) => h === "sku" || h === "артикул");
    const qtyCol = headers.findIndex((h) =>
      ["qty", "коробок", "кол-во", "количество", "кор", "кор."].includes(h),
    );

    const next: Row[] = [];
    for (let i = headerRowIdx + 1; i < aoa.length; i++) {
      const row = aoa[i];
      const sku = String(row[skuCol] ?? "").trim();
      if (!sku) continue;
      const qty =
        qtyCol >= 0 ? Math.max(1, Number(row[qtyCol]) || 1) : 1;
      next.push({ sku, qty });
    }

    if (next.length === 0) {
      toast.error("В файле не найдены строки с артикулами");
      return;
    }
    setRows(next);
    toast.success(`Импортировано ${next.length} позиций`);
  };

  const handleTemplate = () => {
    /*
      Previously the template was a bare two-column grid («sku» / «qty»)
      with English headers — visually dry and confusing for shop owners.
      This version builds a proper blank order form:
        • Cyrillic title + usage instructions banner at the top
        • Russian column headers with a sensible «Комментарий» column
        • Realistic example rows the user can overwrite
        • Five blank rows pre-filled with qty=1 as scaffolding
        • Column widths that fit long product names
        • Integer number format on the qty column
      Import stays compatible because `handleImport` locates the header row
      dynamically instead of assuming row 1.
    */
    const aoa: (string | number)[][] = [
      ["Бланк быстрого заказа — Candles Wholesale", "", ""],
      [
        "Заполните «Артикул» и «Коробок», сохраните файл и загрузите его обратно на странице «Быстрый заказ».",
        "",
        "",
      ],
      ["", "", ""],
      ["Артикул", "Коробок", "Комментарий"],
      ["PIL-070-IV", 8, "Пример: столбовые свечи, слоновая кость"],
      ["TAP-024-WH", 12, "Пример: столовые свечи, белые"],
      ["", 1, ""],
      ["", 1, ""],
      ["", 1, ""],
      ["", 1, ""],
      ["", 1, ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Column widths — fits 18-char SKUs, two-digit qty, and a roomy notes
    // column without manual resizing in Excel.
    ws["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 48 }];

    // Merge the banner so the title + hint read as one block instead of
    // three disconnected cells.
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
    ];

    // Force integer display on the «Коробок» column so users don't end up
    // with "8.00" / scientific notation after editing.
    for (let r = 4; r <= 10; r++) {
      const addr = `B${r + 1}`;
      if (ws[addr]) ws[addr].z = "0";
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Заказ");
    XLSX.writeFile(wb, "bystryj-zakaz-shablon.xlsx");
    toast.success("Шаблон скачан");
  };

  const handleExport = () => {
    /*
      Previously the export was a five-column English dump
      (sku/name/qty/unit_price/line_total) with cramped default widths
      and no totals — it matched the old template's ugly aesthetic.
      This version mirrors the rebuilt template:
        • Title + summary banner across the top (merged)
        • Russian headers, wide "Товар" column, separate variant column
        • Per-box price alongside per-piece price (shop owners order by box)
        • Proper currency number format (₽ / $) and integer format for qty
        • ИТОГО row at the bottom with total boxes, discount, grand total
        • Filename stamped with ISO date so multiple exports don't collide
    */
    const validRows = enriched.filter((r) => r.v && r.p);
    if (validRows.length === 0) {
      toast.error("Нет валидных позиций для экспорта");
      return;
    }

    const isRub = currency === "RUB";
    // Excel number format codes. The quoted symbol prevents Excel from
    // interpreting the glyph as a literal character in the format string.
    const moneyFmt = isRub ? '#,##0.00 "₽"' : '"$"#,##0.00';
    const now = new Date();
    const dateStr = now.toLocaleDateString("ru-RU");

    const aoa: (string | number)[][] = [
      [`Заказ — Candles Wholesale · ${dateStr}`, "", "", "", "", "", "", ""],
      [
        `Позиций: ${validRows.length} · Коробок: ${totalBoxes}${
          discount > 0 ? ` · Скидка: ${discount}%` : ""
        }`,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      ["", "", "", "", "", "", "", ""],
      [
        "Артикул",
        "Товар",
        "Вариант",
        "Коробок",
        "Шт./кор.",
        "Цена за шт.",
        "Цена за коробку",
        "Сумма",
      ],
    ];

    validRows.forEach((r) => {
      const pricePerPiece = isRub
        ? Number(r.v!.price_per_piece_rub)
        : Number(r.v!.price_per_piece_usd);
      const pricePerBox = pricePerPiece * r.v!.pieces_per_box;
      aoa.push([
        r.sku,
        productName(r.p!, lang),
        variantLabel(r.v!) || "—",
        r.qty,
        r.v!.pieces_per_box,
        pricePerPiece,
        pricePerBox,
        r.sum,
      ]);
    });

    // Blank separator + totals row so the grand total reads as a summary,
    // not just another line item.
    aoa.push(["", "", "", "", "", "", "", ""]);
    aoa.push([
      "ИТОГО",
      "",
      "",
      totalBoxes,
      "",
      "",
      discount > 0 ? `Скидка ${discount}%` : "",
      total,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Column widths tuned to content: short SKU/qty columns, generous room
    // for product name and variant strings, money columns wide enough for
    // thousand separators + currency symbol.
    ws["!cols"] = [
      { wch: 16 }, // Артикул
      { wch: 38 }, // Товар
      { wch: 22 }, // Вариант
      { wch: 10 }, // Коробок
      { wch: 10 }, // Шт./кор.
      { wch: 14 }, // Цена за шт.
      { wch: 18 }, // Цена за коробку
      { wch: 16 }, // Сумма
    ];

    // Merge title + summary banner across all 8 columns.
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
    ];

    // Apply number formats row-by-row. Excel addresses are 1-indexed; data
    // starts at row 5 (after title/summary/blank/header).
    const dataStartRow = 5;
    const dataEndRow = dataStartRow + validRows.length - 1;
    for (let r = dataStartRow; r <= dataEndRow; r++) {
      // Integer columns (boxes, pieces per box).
      for (const col of ["D", "E"] as const) {
        const addr = `${col}${r}`;
        if (ws[addr]) ws[addr].z = "0";
      }
      // Money columns (unit price, box price, line total).
      for (const col of ["F", "G", "H"] as const) {
        const addr = `${col}${r}`;
        if (ws[addr]) ws[addr].z = moneyFmt;
      }
    }

    // Totals row: D = integer boxes, H = grand total money.
    const totalsRow = dataEndRow + 2;
    if (ws[`D${totalsRow}`]) ws[`D${totalsRow}`].z = "0";
    if (ws[`H${totalsRow}`]) ws[`H${totalsRow}`].z = moneyFmt;

    /*
      Highlight the ИТОГО row with a green fill + bold white text so it
      pops against the plain data grid. `xlsx-js-style` preserves the
      `.s` style property when writing the workbook — the base `xlsx`
      package would silently drop it. Colours use ARGB hex: "FF" alpha
      prefix + 6-digit RGB. Greens picked from Tailwind's `green-600`
      (#16A34A) and `green-700` (#15803D) for the border.
    */
    const totalsFill = {
      font: { bold: true, color: { rgb: "FFFFFFFF" }, sz: 12 },
      fill: { patternType: "solid", fgColor: { rgb: "FF16A34A" } },
      alignment: { horizontal: "left", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF15803D" } },
        bottom: { style: "thin", color: { rgb: "FF15803D" } },
      },
    } as const;

    for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"] as const) {
      const addr = `${col}${totalsRow}`;
      // aoa_to_sheet can omit cells with empty-string values, which would
      // leave visible gaps in the green band — materialise them so the
      // fill spans every column.
      if (!ws[addr]) ws[addr] = { t: "s", v: "" };
      ws[addr].s = totalsFill;
    }
    // Right-align the quantity and money cells so numbers sit under their
    // respective column headers instead of hugging the left edge.
    for (const col of ["D", "H"] as const) {
      const addr = `${col}${totalsRow}`;
      if (ws[addr])
        ws[addr].s = {
          ...totalsFill,
          alignment: { horizontal: "right", vertical: "center" },
        };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Заказ");
    const stamp = now.toISOString().slice(0, 10);
    XLSX.writeFile(wb, `zakaz-${stamp}.xlsx`);
    toast.success("Экспорт скачан");
  };

  /* ────────────────── Quick-order submission ──────────────────
     Collect only the rows that resolved to a real variant with positive
     stock; these become the `items[]` payload for `POST /orders`. */
  const validItems = useMemo(
    () =>
      enriched
        .filter((r) => r.v && r.p && r.qty > 0)
        .map((r) => ({
          variant_id: r.v!.id,
          sku: r.v!.sku,
          product_name: productName(r.p!, lang),
          variant_label: variantLabel(r.v!),
          pieces_per_box: r.v!.pieces_per_box,
          boxes: Math.min(r.qty, r.v!.stock_boxes),
          unit_price:
            currency === "RUB"
              ? Number(r.v!.price_per_piece_rub)
              : Number(r.v!.price_per_piece_usd),
        }))
        .filter((i) => i.boxes > 0),
    [enriched, lang, currency],
  );

  // When the dialog opens, prefill missing fields from the auth profile so
  // the user only has to touch what's changed. `||` guards keep anything the
  // user already typed intact across reopens.
  useEffect(() => {
    if (!dialogOpen || !user) return;
    setForm((f) => ({
      ...f,
      company_name: f.company_name || user.profile.company_name || "",
      contact_name: f.contact_name || user.profile.contact_name || "",
      phone: f.phone || user.profile.phone || "",
      inn: f.inn || user.profile.inn || "",
      email: f.email || user.user.email || "",
    }));
  }, [dialogOpen, user]);

  const openSubmitDialog = () => {
    if (validItems.length === 0) {
      toast.error("Нет валидных позиций");
      return;
    }
    // Unauthenticated users can't create orders — bounce them to /auth and
    // come back here after sign-in.
    if (!user) {
      toast.info("Войдите, чтобы отправить заявку");
      navigate("/auth?next=/quick-order");
      return;
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || submitting || validItems.length === 0) return;
    setSubmitting(true);
    try {
      const order = await ordersApi.create({
        currency,
        // Доставки нет — только самовывоз. Адрес не передаётся.
        delivery_address: null,
        delivery_date: form.delivery_date || null,
        customer_comment: form.customer_comment || null,
        company_name: form.company_name,
        contact_name: form.contact_name,
        phone: form.phone,
        inn: form.inn,
        email: form.email,
        items: validItems,
      });

      // Best-effort profile snapshot update — mirrors what Checkout does so
      // the next order is pre-filled. Failure here is non-fatal; the order
      // has already been persisted server-side.
      try {
        await profileApi.update({
          company_name: form.company_name || null,
          contact_name: form.contact_name || null,
          phone: form.phone || null,
          inn: form.inn || null,
        });
        queryClient.invalidateQueries({ queryKey: AUTH_ME_KEY });
      } catch {
        /* non-fatal */
      }

      toast.success("Заявка отправлена");
      // Reset the rows so the user gets a clean slate if they come back.
      setRows([
        { sku: "", qty: 1 },
        { sku: "", qty: 1 },
        { sku: "", qty: 1 },
      ]);
      setDialogOpen(false);
      navigate(`/order/success/${order.id}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось создать заявку"));
    } finally {
      setSubmitting(false);
    }
  };

  if (productsQ.isPending) {
    return (
      <PublicLayout>
        <div className="container py-8 md:py-10">
          <div className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-72" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="container py-8 md:py-10">
        {/* ───────── Header + toolbar ───────── */}
        <Reveal delay={0} y={18}>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="eyebrow mb-2">Для опытных закупщиков</div>
              <h1 className="font-semibold tracking-tight text-[clamp(1.5rem,4vw,1.875rem)]">Быстрый заказ</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Введите артикулы списком, импортируйте Excel или повторите прошлую заявку.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-surface px-3 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent hover:shadow-sm">
                <Upload className="h-4 w-4" /> Импорт Excel
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) =>
                    e.target.files?.[0] && handleImport(e.target.files[0])
                  }
                />
              </label>
              <Button variant="outline" onClick={handleTemplate}>
                <FileSpreadsheet className="h-4 w-4" /> Шаблон
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4" /> Экспорт
              </Button>
            </div>
          </div>
        </Reveal>

        {/* ───────── Rows card ───────── */}
        <Reveal delay={120} y={22}>
          <div className="rounded-lg border border-border bg-surface shadow-sm">
            {/* Header row */}
            <div className="hidden grid-cols-[180px_1fr_100px_130px_130px_40px] items-center gap-3 border-b border-border bg-muted/50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:grid">
              <span>Артикул</span>
              <span>Товар</span>
              <span className="text-right">Кор.</span>
              <span className="text-right">Цена / кор</span>
              <span className="text-right">Сумма</span>
              <span />
            </div>

            {/* Body rows */}
            <div className="divide-y divide-border">
              {enriched.map((r, i) => {
                const thumb = thumbFor(r.p);
                const rowIsOpen = openRowIdx === i;
                return (
                  <div
                    key={i}
                    data-sku-row={i}
                    className={cn(
                      "grid grid-cols-1 items-center gap-3 px-4 py-3",
                      "md:grid-cols-[180px_1fr_100px_130px_130px_40px]",
                      rowIsOpen && "bg-accent/20",
                      "transition-colors",
                    )}
                  >
                    {/* SKU input + custom dropdown */}
                    <div className="relative">
                      <input
                        type="text"
                        // Suppress the native browser autofill popup — our
                        // themed dropdown replaces it.
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        value={r.sku}
                        onChange={(e) => {
                          updateRow(i, { sku: e.target.value });
                          setOpenRowIdx(i);
                        }}
                        onFocus={() => setOpenRowIdx(i)}
                        onKeyDown={(e) => onSkuKeyDown(e, i)}
                        placeholder="PIL-070-IV"
                        aria-autocomplete="list"
                        aria-expanded={rowIsOpen && suggestions.length > 0}
                        className={cn(
                          "num h-9 w-full rounded-md border border-input bg-background px-2 text-sm uppercase tracking-wider outline-none transition-all duration-200",
                          "hover:border-primary/30",
                          "focus:border-primary/60 focus:ring-4 focus:ring-primary/15",
                        )}
                      />
                      {r.error && (
                        <div className="mt-1 text-[11px] font-medium text-destructive">
                          {r.error}
                        </div>
                      )}

                      {/* Custom suggestion dropdown */}
                      {rowIsOpen && suggestions.length > 0 && (
                        <div
                          role="listbox"
                          className={cn(
                            "absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden",
                            "rounded-lg border border-border/70 bg-popover shadow-lg shadow-black/5",
                            "animate-in fade-in slide-in-from-top-1 duration-150",
                            // Expand past the narrow SKU column so product
                            // names have room to breathe.
                            "min-w-[min(360px,calc(100vw-3rem))]",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-3 py-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              Артикулы
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {suggestions.length} из {allMatches.length}
                            </span>
                          </div>
                          <ul className="max-h-72 overflow-y-auto py-1">
                            {suggestions.map((m, idx) => {
                              const active = idx === activeSugIdx;
                              const url = thumbFor(m.p);
                              return (
                                <li key={m.v.id}>
                                  <button
                                    type="button"
                                    // Prevent input blur before click fires.
                                    onMouseDown={(e) => e.preventDefault()}
                                    onMouseEnter={() => setActiveSugIdx(idx)}
                                    onClick={() => pickSuggestion(i, m)}
                                    role="option"
                                    aria-selected={active}
                                    className={cn(
                                      "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                                      active
                                        ? "bg-accent/70 text-foreground"
                                        : "hover:bg-accent/60",
                                    )}
                                  >
                                    {url ? (
                                      <img
                                        src={url}
                                        alt=""
                                        loading="lazy"
                                        className="h-9 w-9 shrink-0 rounded-md border border-border/50 bg-muted object-cover"
                                      />
                                    ) : (
                                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border/50 bg-muted text-muted-foreground">
                                        <Package className="h-4 w-4" />
                                      </span>
                                    )}
                                    <span className="flex min-w-0 flex-1 flex-col">
                                      <span className="num truncate text-xs font-semibold uppercase tracking-wider text-primary">
                                        {m.v.sku}
                                      </span>
                                      <span className="truncate text-sm font-medium text-foreground">
                                        {productName(m.p, lang)}
                                      </span>
                                      <span className="truncate text-[11px] text-muted-foreground">
                                        {variantLabel(m.v) || "—"} ·{" "}
                                        {m.v.pieces_per_box} шт/кор ·{" "}
                                        {m.v.stock_boxes} кор.
                                      </span>
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Product info with thumbnail */}
                    <div className="min-w-0 md:col-auto">
                      {r.v && r.p ? (
                        <div className="flex items-center gap-3">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              loading="lazy"
                              className="h-10 w-10 shrink-0 rounded-md border border-border/60 bg-muted object-cover shadow-sm"
                            />
                          ) : (
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border/60 bg-muted text-muted-foreground">
                              <ImageOff className="h-4 w-4" />
                            </span>
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {productName(r.p, lang)}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {variantLabel(r.v) || "—"} · {r.v.pieces_per_box} шт/кор
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>

                    {/* Boxes qty */}
                    <div className="md:text-right">
                      <input
                        type="number"
                        min={1}
                        value={r.qty}
                        onChange={(e) =>
                          updateRow(i, {
                            qty: Math.max(
                              1,
                              parseInt(e.target.value || "1", 10),
                            ),
                          })
                        }
                        className="h-9 w-24 rounded-md border border-input bg-background px-2 text-right text-sm font-semibold tabular-nums outline-none transition-all duration-200 hover:border-primary/30 focus:border-primary/60 focus:ring-4 focus:ring-primary/15 md:w-20"
                      />
                    </div>

                    {/* Unit price per box */}
                    <div className="md:text-right">
                      {r.v ? (
                        <span className="price text-sm">
                          {formatMoney(
                            (currency === "RUB"
                              ? Number(r.v.price_per_piece_rub)
                              : Number(r.v.price_per_piece_usd)) *
                              r.v.pieces_per_box,
                            currency,
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>

                    {/* Line total */}
                    <div className="md:text-right">
                      {r.sum ? (
                        <span className="price text-sm font-semibold">
                          {formatMoney(r.sum, currency)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>

                    {/* Delete row */}
                    <div className="md:text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        aria-label="Удалить строку"
                        className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add-row footer */}
            <div className="border-t border-border p-3">
              <Button variant="ghost" size="sm" onClick={addRow}>
                <Plus className="h-4 w-4" /> Добавить строку
              </Button>
            </div>
          </div>
        </Reveal>

        {/* ───────── Summary / CTA ───────── */}
        <Reveal delay={220} y={22}>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
            <div className="space-y-1 text-sm">
              <div className="text-muted-foreground">
                Коробок:{" "}
                <span className="price text-foreground">{totalBoxes}</span>
              </div>
              <div className="text-muted-foreground">
                Сумма:{" "}
                <span className="price text-foreground">
                  {formatMoney(subtotal, currency)}
                </span>
              </div>
              {discount > 0 && (
                <div className="font-medium text-primary">Скидка {discount}%</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Итого
              </div>
              <div className="price text-3xl">{formatMoney(total, currency)}</div>
            </div>
            {/*
              Both CTAs get `size="lg"` so they share the exact same height and
              padding — the only visual difference is variant (outline vs.
              filled primary), which communicates the secondary vs. primary
              intent without size inconsistency.
            */}
            <div className="flex w-full justify-end gap-2 md:w-auto">
              <Button asChild variant="outline" size="lg">
                <Link to="/catalog">В каталог</Link>
              </Button>
              <Button
                size="lg"
                onClick={openSubmitDialog}
                disabled={validItems.length === 0 || authLoading}
                className="gap-2"
              >
                Отправить заявку <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Reveal>
      </div>

      {/* ───────── Submit-order dialog ───────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Оформить быструю заявку</DialogTitle>
              <DialogDescription>
                Проверьте реквизиты и отправьте. Менеджер свяжется и пришлёт
                счёт в течение 2 часов в рабочее время.
              </DialogDescription>
            </DialogHeader>

            {/* Compact order summary so the user sees what's about to be
                submitted without scrolling back to the main grid. */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <span className="text-muted-foreground">
                  Позиций:{" "}
                  <span className="font-semibold text-foreground">
                    {validItems.length}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  Коробок:{" "}
                  <span className="font-semibold text-foreground">
                    {totalBoxes}
                  </span>
                </span>
                {discount > 0 && (
                  <span className="font-medium text-primary">
                    Скидка {discount}%
                  </span>
                )}
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Итого
                </div>
                <div className="price text-xl">
                  {formatMoney(total, currency)}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Компания *"
                required
                value={form.company_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, company_name: e.target.value }))
                }
              />
              <Field
                label="ИНН"
                value={form.inn}
                onChange={(e) =>
                  setForm((f) => ({ ...f, inn: e.target.value }))
                }
              />
              <Field
                label="Контактное лицо *"
                required
                value={form.contact_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contact_name: e.target.value }))
                }
              />
              <Field
                label="Телефон *"
                required
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
              <Field
                label="Email *"
                required
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
              <Field
                label="Желаемая дата самовывоза"
                type="date"
                value={form.delivery_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, delivery_date: e.target.value }))
                }
              />
              <div className="md:col-span-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Заказы отгружаются только самовывозом со склада. Адрес склада менеджер пришлёт вместе со счётом.
              </div>
              <div className="md:col-span-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Комментарий
                  </span>
                  <textarea
                    rows={2}
                    value={form.customer_comment}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        customer_comment: e.target.value,
                      }))
                    }
                    className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                size="lg"
                disabled={submitting || validItems.length === 0}
                className="gap-2"
              >
                {submitting ? (
                  "Отправка…"
                ) : (
                  <>
                    Отправить заявку <Send className="h-4 w-4" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
};

export default QuickOrder;
