import { beforeEach, describe, expect, it, vi } from "vitest";
import axios, { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { api, apiErrorMessage } from "../client";

beforeEach(() => {
  vi.restoreAllMocks();
});

const unauthorizedAdapter = () => {
  let calls = 0;
  return vi.fn(async (config): Promise<AxiosResponse> => {
    calls += 1;
    if (calls === 1) {
      const error = new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config);
      error.response = {
        data: { detail: "expired access" },
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        config,
      };
      throw error;
    }
    return {
      data: { ok: true },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  });
};

describe("refresh interceptor", () => {
  it("reuses HttpOnly cookies rotated by another tab", async () => {
    vi.spyOn(axios, "post").mockRejectedValueOnce(new Error("refresh already used"));
    vi.spyOn(axios, "get").mockResolvedValueOnce({ data: { id: "user-1" } });
    const adapter = unauthorizedAdapter();

    const response = await api.get("/protected", { adapter });

    expect(response.data).toEqual({ ok: true });
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining("/auth/me"), {
      withCredentials: true,
    });
  });

  it("rejects when neither refresh nor the cross-tab cookie probe succeeds", async () => {
    vi.spyOn(axios, "post").mockRejectedValueOnce(new Error("refresh revoked"));
    vi.spyOn(axios, "get").mockRejectedValueOnce(new Error("not authenticated"));

    await expect(api.get("/protected", { adapter: unauthorizedAdapter() })).rejects.toThrow(
      "Unauthorized",
    );

    expect(axios.get).toHaveBeenCalledTimes(1);
  });
});

describe("apiErrorMessage", () => {
  const makeAxiosError = (detail: unknown, status = 400): AxiosError => {
    const error = new AxiosError("Request failed");
    error.response = {
      data: { detail },
      status,
      statusText: "Bad Request",
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
    error.isAxiosError = true;
    return error;
  };

  it("extracts string detail from axios error", () => {
    const err = makeAxiosError("Email already registered", 409);
    expect(apiErrorMessage(err)).toBe("Email already registered");
  });

  it("extracts message from structured detail object", () => {
    const err = makeAxiosError({
      message: "Недостаточно товара на складе: SKU-1",
      out_of_stock: [{ sku: "SKU-1" }],
    }, 409);
    expect(apiErrorMessage(err)).toBe("Недостаточно товара на складе: SKU-1");
  });

  it("extracts msg from FastAPI validation error array", () => {
    const err = makeAxiosError([
      { msg: "field required", loc: ["body", "email"], type: "value_error.missing" },
    ], 422);
    expect(apiErrorMessage(err)).toBe("field required");
  });

  it("falls back to error.message for axios errors without detail", () => {
    const err = new AxiosError("Network Error");
    err.isAxiosError = true;
    expect(apiErrorMessage(err)).toBe("Network Error");
  });

  it("handles plain Error objects", () => {
    expect(apiErrorMessage(new Error("Something broke"))).toBe("Something broke");
  });

  it("returns fallback for unknown error types", () => {
    expect(apiErrorMessage("string error")).toBe("Неизвестная ошибка");
    expect(apiErrorMessage(null)).toBe("Неизвестная ошибка");
    expect(apiErrorMessage(undefined)).toBe("Неизвестная ошибка");
  });

  it("uses custom fallback message", () => {
    expect(apiErrorMessage(42, "Произошла ошибка")).toBe("Произошла ошибка");
  });

  it("ignores empty validation array", () => {
    const err = makeAxiosError([], 422);
    expect(apiErrorMessage(err)).toBe("Request failed");
  });
});
