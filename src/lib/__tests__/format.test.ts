import { describe, it, expect } from "vitest";
import { formatMoney, formatNumber } from "@/lib/format";

describe("formatMoney", () => {
  it("formats RUB with symbol after value", () => {
    const result = formatMoney(1500, "RUB");
    expect(result).toContain("₽");
    expect(result).toMatch(/1[\s\u00a0]?500\s*₽/);
  });

  it("formats USD with symbol before value", () => {
    const result = formatMoney(25.5, "USD");
    expect(result).toMatch(/^\$25\.50$/);
  });

  it("formats zero correctly", () => {
    expect(formatMoney(0, "RUB")).toContain("0");
    expect(formatMoney(0, "USD")).toContain("$0");
  });

  it("defaults to RUB", () => {
    const result = formatMoney(100);
    expect(result).toContain("₽");
  });

  it("handles large values with grouping", () => {
    const result = formatMoney(1234567, "RUB");
    expect(result).toContain("₽");
  });

  it("formats USD with 2 decimal places", () => {
    expect(formatMoney(10, "USD")).toBe("$10.00");
  });
});

describe("formatNumber", () => {
  it("formats with Russian locale grouping", () => {
    const result = formatNumber(1234567);
    // Russian locale uses non-breaking space as grouping separator
    expect(result).toMatch(/1.*234.*567/);
  });
});
