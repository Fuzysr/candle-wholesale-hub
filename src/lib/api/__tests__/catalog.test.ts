import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { catalogApi } from "../catalog";
import { http } from "../client";
import type { ProductOut } from "../types";

const products = (start: number, count: number): ProductOut[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `product-${start + index}`,
  })) as ProductOut[];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("catalogApi product pagination", () => {
  it("passes typed server-side catalog filters through unchanged", async () => {
    const response = {
      items: products(0, 1),
      total: 1,
      page: 2,
      page_size: 24,
      pages: 3,
      has_next: true,
      has_previous: true,
    };
    vi.mocked(http.get).mockResolvedValueOnce(response);

    await expect(catalogApi.searchProducts({
      page: 2,
      category_ids: ["category-1", "category-2"],
      q: "amber",
      in_stock: true,
      colors: ["ivory"],
      manufacturing_methods: ["Пресованные"],
      has_scent: false,
      price_min: 100,
      burn_time_min: 20,
      currency: "USD",
      sort: "price-asc",
      language: "en",
    })).resolves.toEqual(response);

    expect(http.get).toHaveBeenCalledWith("/products/search", {
      params: {
        page: 2,
        category_ids: ["category-1", "category-2"],
        q: "amber",
        in_stock: true,
        colors: ["ivory"],
        manufacturing_methods: ["Пресованные"],
        has_scent: false,
        price_min: 100,
        burn_time_min: 20,
        currency: "USD",
        sort: "price-asc",
        language: "en",
      },
      paramsSerializer: { indexes: null },
    });
  });

  it("loads every public product page", async () => {
    vi.mocked(http.get)
      .mockResolvedValueOnce(products(0, 200))
      .mockResolvedValueOnce(products(200, 3));

    const result = await catalogApi.listProducts();

    expect(result).toHaveLength(203);
    expect(result.at(-1)?.id).toBe("product-202");
    expect(http.get).toHaveBeenNthCalledWith(1, "/products", {
      params: { offset: 0, limit: 200 },
    });
    expect(http.get).toHaveBeenNthCalledWith(2, "/products", {
      params: { offset: 200, limit: 200 },
    });
  });

  it("uses the same pagination contract for admin products", async () => {
    vi.mocked(http.get).mockResolvedValueOnce(products(0, 2));

    await catalogApi.adminListProducts();

    expect(http.get).toHaveBeenCalledWith("/admin/products", {
      params: { offset: 0, limit: 200 },
    });
  });

  it("stops safely when a server repeats a full page", async () => {
    const repeatedPage = products(0, 200);
    vi.mocked(http.get)
      .mockResolvedValueOnce(repeatedPage)
      .mockResolvedValueOnce(repeatedPage);

    await expect(catalogApi.listProducts()).rejects.toThrow(
      "Pagination made no progress",
    );
    expect(http.get).toHaveBeenCalledTimes(2);
  });
});
