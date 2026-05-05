import { describe, it, expect } from "vitest";
import axios, { AxiosError, AxiosHeaders } from "axios";
import { apiErrorMessage } from "../client";

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
