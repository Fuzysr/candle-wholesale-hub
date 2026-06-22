import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({
  api: {},
  http: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

import { ordersApi } from "../orders";
import { http } from "../client";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ordersApi.quote", () => {
  it("requests the canonical server-side price", async () => {
    const payload = {
      currency: "RUB" as const,
      items: [{
        variant_id: "variant-1",
        boxes: 2,
      }],
    };
    const quote = {
      total_boxes: 2,
      subtotal: 2000,
      discount_percent: 5,
      discount_amount: 100,
      total: 1900,
    };
    vi.mocked(http.post).mockResolvedValueOnce(quote);

    await expect(ordersApi.quote(payload)).resolves.toEqual(quote);
    expect(http.post).toHaveBeenCalledWith("/orders/quote", payload);
  });
});
