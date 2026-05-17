/**
 * Экспорт прайс-листа в XLSX (Excel-формат) с богатым форматированием.
 *
 * Используем `xlsx-js-style` — форк SheetJS с поддержкой стилей ячеек:
 * жирные заголовки, цвета, рамки, числовые форматы, авто-ширина колонок,
 * autofilter и freeze header. Это даёт оптовому клиенту читаемый прайс
 * сразу при открытии в Excel — не надо настраивать ширины колонок и
 * бороться с автоконвертацией чисел в даты (главная боль CSV-формата).
 */
import * as XLSX from "xlsx-js-style";
import type { Product, ProductVariant } from "@/lib/catalog";
import { availableBoxes, variantBoxPrice } from "@/lib/catalog";

// ---------------------------------------------------------------------------
// Цветовая палитра прайса (HEX без #) — синхронизирована с фирменным
// тёплым свечным стилем, но в чуть более тёмных «офисных» оттенках,
// уместных для документа.
// ---------------------------------------------------------------------------
const COLOR_HEADER_BG = "1F2937"; // slate-800
const COLOR_HEADER_FG = "FFFFFF";
const COLOR_ROW_ALT = "F8FAFC"; // slate-50
const COLOR_BORDER = "E5E7EB"; // gray-200
const COLOR_PRICE_FG = "0F172A"; // slate-900
const COLOR_DISCOUNT_FG = "B45309"; // amber-700
const COLOR_DIM_FG = "94A3B8"; // slate-400
const COLOR_STOCK_LOW = "B91C1C"; // red-700
const COLOR_STOCK_WARN = "B45309"; // amber-700

/** Описание колонки прайса. `width` — желаемая ширина в Excel-units. */
type Column = {
  key: string;
  header: string;
  width: number;
  /** Числовой формат Excel — если значение число, ячейка получит этот fmt. */
  numFmt?: string;
  /** Горизонтальное выравнивание. По умолчанию — left для текста. */
  align?: "left" | "center" | "right";
};

const COLUMNS: Column[] = [
  { key: "sku", header: "SKU", width: 14, align: "left" },
  { key: "name", header: "Название", width: 32, align: "left" },
  { key: "category", header: "Категория", width: 16, align: "left" },
  { key: "material", header: "Материал", width: 14, align: "left" },
  { key: "scent", header: "Аромат", width: 14, align: "left" },
  { key: "shape", header: "Форма", width: 12, align: "left" },
  { key: "size", header: "Размер", width: 10, align: "center" },
  { key: "color", header: "Цвет", width: 12, align: "left" },
  { key: "lengthMm", header: "Длина, мм", width: 10, numFmt: "0", align: "right" },
  { key: "widthMm", header: "Ширина, мм", width: 10, numFmt: "0", align: "right" },
  { key: "heightMm", header: "Высота, мм", width: 10, numFmt: "0", align: "right" },
  { key: "weightGr", header: "Вес, г", width: 9, numFmt: "0", align: "right" },
  { key: "burnHours", header: "Горение, ч", width: 10, numFmt: "0", align: "right" },
  { key: "piecesPerBox", header: "Шт/кор.", width: 9, numFmt: "0", align: "right" },
  { key: "pricePieceRub", header: "Цена шт, ₽", width: 12, numFmt: '#,##0.00\\ "₽"', align: "right" },
  { key: "priceBoxRub", header: "Цена кор., ₽", width: 14, numFmt: '#,##0.00\\ "₽"', align: "right" },
  { key: "stock", header: "Наличие, кор.", width: 13, numFmt: "0", align: "right" },
  { key: "discounts", header: "Скидки от объёма", width: 38, align: "left" },
];

/** Двухзначное округление, без перевода в строку (xlsx сам типизирует). */
const round2 = (n: number): number => {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
};

/** Форматирует tier-скидки в одну строку: "от 5 кор: -3%; от 10 кор: -7%". */
const formatDiscounts = (v: ProductVariant): string => {
  const tiers = (v.volume_discounts ?? [])
    .slice()
    .sort((a, b) => a.min_boxes - b.min_boxes);
  if (tiers.length === 0) return "";
  return tiers
    .map((t) => `от ${t.min_boxes} кор: −${t.discount_percent}%`)
    .join(" · ");
};

/** Внутренняя строка с уже подготовленными значениями — сериализуется в Excel. */
type Row = Record<string, string | number | null>;

const buildRows = (products: Product[]): Row[] => {
  const rows: Row[] = [];
  for (const p of products) {
    const category = p.category?.name_ru ?? "";
    const material = p.material?.name_ru ?? "";
    const scent = p.scent?.name_ru ?? "";
    const shape = p.shape?.name_ru ?? "";

    for (const v of p.variants ?? []) {
      rows.push({
        sku: v.sku,
        name: p.name_ru,
        category,
        material,
        scent,
        shape,
        size: v.size ?? "",
        color: v.color ?? "",
        // Числовые габариты — в Excel пойдут как реальные числа, не строки,
        // иначе Excel «помогает» и переинтерпретирует «80» как дату.
        lengthMm: v.length_mm ?? null,
        widthMm: v.width_mm ?? null,
        heightMm: v.height_mm ?? null,
        weightGr: v.weight_gr ?? null,
        burnHours: v.burn_time_hours ?? null,
        piecesPerBox: v.pieces_per_box,
        pricePieceRub: round2(Number(v.price_per_piece_rub)),
        priceBoxRub: round2(variantBoxPrice(v, "RUB")),
        stock: availableBoxes(v),
        discounts: formatDiscounts(v),
      });
    }
  }
  return rows;
};

// ---------- Стили ячеек ----------

const baseBorder = {
  top: { style: "thin" as const, color: { rgb: COLOR_BORDER } },
  bottom: { style: "thin" as const, color: { rgb: COLOR_BORDER } },
  left: { style: "thin" as const, color: { rgb: COLOR_BORDER } },
  right: { style: "thin" as const, color: { rgb: COLOR_BORDER } },
};

/** Стиль шапки таблицы — тёмный фон, белый bold-текст, центр, перенос. */
const headerStyle = {
  font: { bold: true, color: { rgb: COLOR_HEADER_FG }, sz: 11, name: "Calibri" },
  fill: { patternType: "solid", fgColor: { rgb: COLOR_HEADER_BG } },
  alignment: { horizontal: "center" as const, vertical: "center" as const, wrapText: true },
  border: {
    top: { style: "medium" as const, color: { rgb: COLOR_HEADER_BG } },
    bottom: { style: "medium" as const, color: { rgb: COLOR_HEADER_BG } },
    left: { style: "thin" as const, color: { rgb: COLOR_HEADER_BG } },
    right: { style: "thin" as const, color: { rgb: COLOR_HEADER_BG } },
  },
};

/**
 * Строит стиль для ячейки тела таблицы. Учитывает чередование строк (zebra),
 * тип колонки (цена → bold + цвет), наличие (≤ 0 → красный, ≤ 5 → амбер) и
 * скидки (есть → акцентный цвет).
 */
type CellContext = {
  col: Column;
  rowIndex: number; // 0-based в теле (для zebra)
  value: string | number | null;
  stock: number;
  hasDiscounts: boolean;
};

const buildBodyStyle = ({
  col,
  rowIndex,
  value,
  stock,
  hasDiscounts,
}: CellContext) => {
  const isAlt = rowIndex % 2 === 1;
  const isPrice = col.key.startsWith("price");
  const isStock = col.key === "stock";
  const isDiscount = col.key === "discounts";

  let fontColor: string | undefined;
  let bold = false;
  let italic = false;

  if (isPrice && typeof value === "number" && value > 0) {
    fontColor = COLOR_PRICE_FG;
    bold = col.key.startsWith("priceBox"); // цены за коробку — главное число
  }
  if (isStock && typeof value === "number") {
    if (value <= 0) {
      fontColor = COLOR_STOCK_LOW;
      bold = true;
    } else if (value <= 5) {
      fontColor = COLOR_STOCK_WARN;
      bold = true;
    }
  }
  if (isDiscount) {
    if (hasDiscounts) {
      fontColor = COLOR_DISCOUNT_FG;
      italic = true;
    } else {
      fontColor = COLOR_DIM_FG;
    }
  }

  return {
    font: {
      name: "Calibri",
      sz: 10,
      ...(bold ? { bold: true } : {}),
      ...(italic ? { italic: true } : {}),
      ...(fontColor ? { color: { rgb: fontColor } } : {}),
    },
    fill: isAlt
      ? { patternType: "solid", fgColor: { rgb: COLOR_ROW_ALT } }
      : { patternType: "none", fgColor: { rgb: "FFFFFF" } },
    alignment: {
      horizontal: (col.align ?? "left") as "left" | "center" | "right",
      vertical: "center" as const,
      wrapText: col.key === "name" || col.key === "discounts",
    },
    border: baseBorder,
    ...(col.numFmt ? { numFmt: col.numFmt } : {}),
  };
};

/**
 * Строит готовый workbook. Заголовок + строки + стили + autofilter +
 * freeze pane на первой строке. Никаких побочных эффектов — удобно для
 * unit-тестов.
 */
export const buildPriceListWorkbook = (products: Product[]): XLSX.WorkBook => {
  const rows = buildRows(products);

  // Готовим AOA: первая строка — заголовки, далее значения колонок в том
  // же порядке, что и COLUMNS.
  const aoa: (string | number | null)[][] = [
    COLUMNS.map((c) => c.header),
    ...rows.map((r) => COLUMNS.map((c) => r[c.key] ?? "")),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // ---- Стили для заголовка ----
  for (let c = 0; c < COLUMNS.length; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const cell = ws[addr];
    if (cell) cell.s = headerStyle;
  }

  // ---- Стили для тела ----
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const stockNum = typeof row.stock === "number" ? row.stock : 0;
    const hasDiscounts = typeof row.discounts === "string" && row.discounts.length > 0;
    for (let c = 0; c < COLUMNS.length; c += 1) {
      const col = COLUMNS[c];
      const addr = XLSX.utils.encode_cell({ r: i + 1, c });
      const cell = ws[addr];
      if (!cell) continue;
      cell.s = buildBodyStyle({
        col,
        rowIndex: i,
        value: row[col.key] ?? "",
        stock: stockNum,
        hasDiscounts,
      });
    }
  }

  // ---- Ширины колонок ----
  ws["!cols"] = COLUMNS.map((c) => ({ wch: c.width }));

  // ---- Высоты строк ----
  // Шапка чуть выше — туда влезают двухстрочные подписи; тело — стандарт.
  ws["!rows"] = [{ hpt: 32 }, ...rows.map(() => ({ hpt: 20 }))];

  // ---- Autofilter на всю таблицу ----
  if (rows.length > 0) {
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: rows.length, c: COLUMNS.length - 1 },
      }),
    };
  }

  // ---- Freeze pane (заморозка первой строки) ----
  // xlsx-js-style понимает sheet-level `!views` массив. Если в каком-то
  // окружении проигнорируется — просто не будет фриза, остальное работает.
  (ws as unknown as { ["!views"]?: unknown[] })["!views"] = [
    {
      state: "frozen",
      ySplit: 1,
      xSplit: 0,
      topLeftCell: "A2",
      activePane: "bottomLeft",
    },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Прайс-лист");

  // Метаданные документа — отображаются в Excel в «Свойствах файла».
  wb.Props = {
    Title: "Прайс-лист",
    Subject: "Оптовый прайс-лист по свечам",
    Company: "CANDWAX",
    CreatedDate: new Date(),
  };

  return wb;
};

/**
 * Триггерит скачивание готового XLSX в браузере. Имя файла включает
 * текущую дату (YYYY-MM-DD), чтобы клиент не путал свежий прайс со
 * старыми выгрузками.
 */
export const downloadPriceListXlsx = (products: Product[]): void => {
  const wb = buildPriceListWorkbook(products);
  const today = new Date().toISOString().slice(0, 10);
  // `XLSX.writeFile` сам инициирует скачивание в браузере и заодно
  // выставляет правильный mime-type. В Node-окружении он бы записал
  // файл на диск, что нам не нужно — но на клиенте это работает.
  XLSX.writeFile(wb, `price-list_${today}.xlsx`, {
    bookType: "xlsx",
    compression: true,
  });
};
