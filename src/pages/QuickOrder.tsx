import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, Download, Plus, Trash2, FileSpreadsheet } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { catalogApi, stockApi } from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import { useCartStore } from "@/store/cartStore";
import { formatMoney } from "@/lib/format";
import { computeDiscount, productName, type Product } from "@/lib/catalog";
import { toast } from "sonner";

type Row = { sku: string; qty: number };

const QuickOrder = () => {
  const navigate = useNavigate();
  const { currency, lang } = useAppStore();
  const addItem = useCartStore((s) => s.addItem);
  const [rows, setRows] = useState<Row[]>([{ sku: "", qty: 1 }, { sku: "", qty: 1 }, { sku: "", qty: 1 }]);

  const [productsQ, tiersQ] = useQueries({
    queries: [
      { queryKey: ["products"], queryFn: () => catalogApi.listProducts() },
      { queryKey: ["discount-tiers"], queryFn: () => stockApi.listDiscountTiers() },
    ],
  });
  const products: Product[] = productsQ.data ?? [];
  const tiers = tiersQ.data ?? [];

  const skuIndex = useMemo(() => {
    const map = new Map<string, { p: Product; v: Product["variants"][number] }>();
    products.forEach((p) => p.variants?.forEach((v) => map.set(v.sku.toUpperCase(), { p, v })));
    return map;
  }, [products]);

  const enriched = useMemo(() => {
    return rows.map((r) => {
      const found = skuIndex.get(r.sku.trim().toUpperCase());
      if (!found) return { ...r, valid: false as const, error: r.sku ? "SKU не найден" : null, p: null, v: null, sum: 0 };
      const { p, v } = found;
      const price = currency === "RUB" ? Number(v.price_per_piece_rub) : Number(v.price_per_piece_usd);
      const qty = Math.max(0, Math.min(r.qty, v.stock_boxes));
      const sum = price * v.pieces_per_box * qty;
      const stockError = qty < r.qty ? `Доступно ${v.stock_boxes} кор.` : null;
      return { ...r, valid: true as const, error: stockError, p, v, sum };
    });
  }, [rows, skuIndex, currency]);

  const totalBoxes = enriched.reduce((s, r) => s + (r.v ? Math.min(r.qty, r.v.stock_boxes) : 0), 0);
  const subtotal = enriched.reduce((s, r) => s + r.sum, 0);
  const discount = computeDiscount(totalBoxes, tiers);
  const total = subtotal - (subtotal * discount) / 100;

  const updateRow = (idx: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addRow = () => setRows((rs) => [...rs, { sku: "", qty: 1 }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const handleImport = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<{ sku?: string; SKU?: string; qty?: number; кол?: number; "коробок"?: number }>(sheet);
    const next: Row[] = data.map((r) => ({
      sku: String(r.sku ?? r.SKU ?? "").trim(),
      qty: Number(r.qty ?? r["коробок"] ?? r["кол"] ?? 1) || 1,
    })).filter((r) => r.sku);
    if (next.length === 0) {
      toast.error("В файле не найдены строки. Проверьте колонки sku и qty.");
      return;
    }
    setRows(next);
    toast.success(`Импортировано ${next.length} позиций`);
  };

  const handleTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { sku: "PIL-070-IV", qty: 8 },
      { sku: "TAP-024-WH", qty: 12 },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Order");
    XLSX.writeFile(wb, "wholesale-candles-template.xlsx");
  };

  const handleExport = () => {
    const data = enriched.filter((r) => r.v).map((r) => ({
      sku: r.sku, name: productName(r.p!, lang), qty: r.qty, unit_price: currency === "RUB" ? r.v!.price_per_piece_rub : r.v!.price_per_piece_usd, line_total: r.sum,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Order");
    XLSX.writeFile(wb, "order.xlsx");
  };

  const handleSendToCart = () => {
    let added = 0;
    enriched.forEach((r) => {
      if (!r.v || !r.p || r.qty <= 0) return;
      const qty = Math.min(r.qty, r.v.stock_boxes);
      if (qty <= 0) return;
      addItem({
        variantId: r.v.id, productId: r.p.id, sku: r.v.sku,
        productName: productName(r.p, lang),
        variantLabel: [r.v.size, r.v.color, r.v.shape].filter(Boolean).join(" · "),
        image: r.p.image_url,
        piecesPerBox: r.v.pieces_per_box,
        priceRub: Number(r.v.price_per_piece_rub),
        priceUsd: Number(r.v.price_per_piece_usd),
        stockBoxes: r.v.stock_boxes,
      }, qty);
      added++;
    });
    if (added === 0) { toast.error("Нет валидных позиций"); return; }
    toast.success(`Добавлено ${added} позиций`);
    navigate("/cart");
  };

  return (
    <PublicLayout>
      <div className="container py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow mb-2">Для опытных закупщиков</div>
            <h1 className="text-3xl font-semibold tracking-tight">Быстрый заказ</h1>
            <p className="mt-1 text-sm text-muted-foreground">Введите артикулы списком, импортируйте Excel или повторите прошлую заявку.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-surface px-3 text-sm font-medium hover:bg-accent">
              <Upload className="h-4 w-4" /> Импорт Excel
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
            </label>
            <Button variant="outline" onClick={handleTemplate}><FileSpreadsheet className="h-4 w-4" /> Шаблон</Button>
            <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4" /> Экспорт</Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-3 w-44">Артикул</th>
                <th className="px-3 py-3">Товар</th>
                <th className="px-3 py-3 text-right w-24">Кор.</th>
                <th className="px-3 py-3 text-right w-32">Цена / кор</th>
                <th className="px-3 py-3 text-right w-32">Сумма</th>
                <th className="px-3 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((r, i) => (
                <tr key={i} className="border-t border-border align-top">
                  <td className="px-3 py-2.5">
                    <input
                      list="sku-list"
                      value={r.sku}
                      onChange={(e) => updateRow(i, { sku: e.target.value })}
                      placeholder="PIL-070-IV"
                      className="num h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {r.error && <div className="mt-1 text-[11px] text-destructive">{r.error}</div>}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.v ? (
                      <div>
                        <div className="font-medium">{productName(r.p!, lang)}</div>
                        <div className="text-xs text-muted-foreground">{[r.v.size, r.v.color, r.v.shape].filter(Boolean).join(" · ")} · {r.v.pieces_per_box} шт/кор</div>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <input
                      type="number" min={1} value={r.qty}
                      onChange={(e) => updateRow(i, { qty: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                      className="h-9 w-20 rounded-md border border-input bg-background px-2 text-right text-sm font-semibold tabular-nums"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">{r.v ? <span className="price">{formatMoney((currency === "RUB" ? Number(r.v.price_per_piece_rub) : Number(r.v.price_per_piece_usd)) * r.v.pieces_per_box, currency)}</span> : "—"}</td>
                  <td className="px-3 py-2.5 text-right"><span className="price">{r.sum ? formatMoney(r.sum, currency) : "—"}</span></td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => removeRow(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="sku-list">
            {Array.from(skuIndex.values()).map(({ v }) => (
              <option key={v.id} value={v.sku} />
            ))}
          </datalist>
          <div className="border-t border-border p-3">
            <Button variant="ghost" size="sm" onClick={addRow}><Plus className="h-4 w-4" /> Добавить строку</Button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface p-5">
          <div className="space-y-1 text-sm">
            <div className="text-muted-foreground">Коробок: <span className="price text-foreground">{totalBoxes}</span></div>
            <div className="text-muted-foreground">Сумма: <span className="price text-foreground">{formatMoney(subtotal, currency)}</span></div>
            {discount > 0 && <div className="text-primary">Скидка {discount}%</div>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Итого</div>
            <div className="price text-3xl">{formatMoney(total, currency)}</div>
          </div>
          <div className="flex w-full justify-end gap-2 md:w-auto">
            <Button asChild variant="outline"><Link to="/catalog">В каталог</Link></Button>
            <Button size="lg" onClick={handleSendToCart} disabled={totalBoxes === 0}>В корзину →</Button>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
};

export default QuickOrder;
