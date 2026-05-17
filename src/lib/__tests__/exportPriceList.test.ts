import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx-js-style";
import { buildPriceListWorkbook } from "@/lib/exportPriceList";
import type { Product, ProductVariant } from "@/lib/catalog";

/**
 * Минимальный конструктор товара для тестов экспорта. Заполняем только
 * те поля, которые реально используются в `buildPriceListWorkbook`.
 */
const makeVariant = (overrides: Partial<ProductVariant> = {}): ProductVariant => ({
  id: "v-1",
  product_id: "p-1",
  sku: "SKU-1",
  size: "M",
  color: "white",
  shape: null,
  pieces_per_box: 100,
  price_per_piece_rub: 14.5,
  price_per_piece_usd: 0.16,
  length_mm: 80,
  width_mm: 80,
  height_mm: 120,
  weight_gr: 200,
  burn_time_hours: 30,
  packages_per_box: null,
  box_length_mm: null,
  box_width_mm: null,
  box_height_mm: null,
  box_weight_gr: null,
  stock_boxes: 50,
  reserved_boxes: 10,
  image_url: null,
  external_id: null,
  last_synced_at: null,
  created_at: "2025-01-01",
  updated_at: "2025-01-01",
  volume_discounts: [],
  images: [],
  ...overrides,
});

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: "p-1",
  slug: "candle",
  category_id: null,
  material_id: null,
  scent_id: null,
  shape_id: null,
  name_ru: "Свеча тестовая",
  name_en: "Test candle",
  description_ru: null,
  description_en: null,
  image_url: null,
  is_published: true,
  created_at: "2025-01-01",
  updated_at: "2025-01-01",
  variants: [makeVariant()],
  images: [],
  category: { slug: "cat", name_ru: "Категория", name_en: "Category" },
  material: null,
  scent: null,
  shape: null,
  ...overrides,
});

/** Получает worksheet и значения из ячеек как массив массивов. */
const getSheetAoa = (wb: XLSX.WorkBook): unknown[][] => {
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
};

describe("buildPriceListWorkbook", () => {
  it("creates a workbook with one sheet named 'Прайс-лист'", () => {
    const wb = buildPriceListWorkbook([makeProduct()]);
    expect(wb.SheetNames).toEqual(["Прайс-лист"]);
  });

  it("writes the expected header row in the first row", () => {
    const wb = buildPriceListWorkbook([]);
    const aoa = getSheetAoa(wb);
    const header = aoa[0] as string[];
    expect(header).toContain("SKU");
    expect(header).toContain("Название");
    expect(header).toContain("Цена кор., ₽");
    expect(header).toContain("Наличие, кор.");
    expect(header).toContain("Скидки от объёма");
  });

  it("emits one body row per variant (plus the header)", () => {
    const p = makeProduct({
      variants: [
        makeVariant({ id: "v-1", sku: "A-1" }),
        makeVariant({ id: "v-2", sku: "A-2" }),
        makeVariant({ id: "v-3", sku: "A-3" }),
      ],
    });
    const aoa = getSheetAoa(buildPriceListWorkbook([p]));
    expect(aoa).toHaveLength(4); // 1 header + 3 body
  });

  it("stores prices as numbers (not strings) so Excel renders them as currency", () => {
    const wb = buildPriceListWorkbook([
      makeProduct({
        variants: [makeVariant({ price_per_piece_rub: 10, pieces_per_box: 50 })],
      }),
    ]);
    const ws = wb.Sheets[wb.SheetNames[0]];
    // Колонка "Цена кор., ₽" находится по индексу 15 (0-based) в COLUMNS
    const cell = ws[XLSX.utils.encode_cell({ r: 1, c: 15 })];
    expect(cell.t).toBe("n"); // n = number type
    expect(cell.v).toBe(500); // 10 × 50
  });

  it("uses available stock (stock_boxes - reserved_boxes), not raw stock", () => {
    const wb = buildPriceListWorkbook([
      makeProduct({
        variants: [makeVariant({ stock_boxes: 100, reserved_boxes: 30 })],
      }),
    ]);
    const ws = wb.Sheets[wb.SheetNames[0]];
    // Колонка "Наличие, кор." имеет индекс 16
    const cell = ws[XLSX.utils.encode_cell({ r: 1, c: 16 })];
    expect(cell.v).toBe(70);
  });

  it("formats volume discount tiers as 'от N кор: −X%' joined by ' · '", () => {
    const wb = buildPriceListWorkbook([
      makeProduct({
        variants: [
          makeVariant({
            volume_discounts: [
              { id: "d2", variant_id: "v-1", min_boxes: 10, discount_percent: 5, created_at: "" },
              { id: "d1", variant_id: "v-1", min_boxes: 5, discount_percent: 3, created_at: "" },
            ],
          }),
        ],
      }),
    ]);
    const ws = wb.Sheets[wb.SheetNames[0]];
    // Колонка "Скидки от объёма" — последняя (индекс 17)
    const cell = ws[XLSX.utils.encode_cell({ r: 1, c: 17 })];
    expect(cell.v).toContain("от 5 кор: −3%");
    expect(cell.v).toContain("от 10 кор: −5%");
  });

  it("applies bold white-on-dark style to the header row", () => {
    const wb = buildPriceListWorkbook([makeProduct()]);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const header = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
    expect(header.s?.font?.bold).toBe(true);
    expect(header.s?.font?.color?.rgb).toBe("FFFFFF");
    expect(header.s?.fill?.fgColor?.rgb).toBeDefined();
  });

  it("sets explicit column widths so Excel doesn't squash long text", () => {
    const wb = buildPriceListWorkbook([makeProduct()]);
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(Array.isArray(ws["!cols"])).toBe(true);
    // 18 колонок — каждая с шириной > 0
    expect(ws["!cols"]).toHaveLength(18);
    expect(ws["!cols"]?.every((c) => (c.wch ?? 0) > 0)).toBe(true);
  });

  it("enables autofilter across the data range", () => {
    const wb = buildPriceListWorkbook([
      makeProduct({ variants: [makeVariant(), makeVariant({ id: "v-2", sku: "A-2" })] }),
    ]);
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws["!autofilter"]).toBeDefined();
    expect(ws["!autofilter"]?.ref).toMatch(/^A1:R\d+$/);
  });

  it("freezes the header row via sheet views", () => {
    const wb = buildPriceListWorkbook([makeProduct()]);
    const ws = wb.Sheets[wb.SheetNames[0]] as Record<string, unknown>;
    const views = ws["!views"] as Array<Record<string, unknown>> | undefined;
    expect(views).toBeDefined();
    expect(views?.[0]?.state).toBe("frozen");
    expect(views?.[0]?.ySplit).toBe(1);
  });

  it("highlights out-of-stock rows with red bold stock cell", () => {
    const wb = buildPriceListWorkbook([
      makeProduct({
        variants: [makeVariant({ stock_boxes: 0, reserved_boxes: 0 })],
      }),
    ]);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const stockCell = ws[XLSX.utils.encode_cell({ r: 1, c: 16 })];
    expect(stockCell.s?.font?.bold).toBe(true);
    expect(stockCell.s?.font?.color?.rgb).toBe("B91C1C");
  });

  it("applies zebra striping to alternating body rows", () => {
    const wb = buildPriceListWorkbook([
      makeProduct({
        variants: [
          makeVariant({ id: "v-1", sku: "A-1" }),
          makeVariant({ id: "v-2", sku: "A-2" }),
        ],
      }),
    ]);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const firstBody = ws[XLSX.utils.encode_cell({ r: 1, c: 0 })];
    const secondBody = ws[XLSX.utils.encode_cell({ r: 2, c: 0 })];
    // Чередование: одна строка с заливкой #F8FAFC, другая — белая.
    expect(firstBody.s?.fill?.fgColor?.rgb).not.toBe(secondBody.s?.fill?.fgColor?.rgb);
  });

  it("handles products with no variants without throwing", () => {
    expect(() => buildPriceListWorkbook([makeProduct({ variants: [] })])).not.toThrow();
  });
});
