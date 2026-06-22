import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the http module
vi.mock("../client", () => ({
  http: {
    post: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue({}),
  },
  api: { interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
  apiErrorMessage: vi.fn(),
}));

import { authApi } from "../auth";
import { http } from "../client";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authApi", () => {
  describe("login", () => {
    it("returns the user without exposing JWT values", async () => {
      const mockResponse = {
        user: { id: "1", email: "test@test.com" },
      };
      vi.mocked(http.post).mockResolvedValueOnce(mockResponse);

      const result = await authApi.login({ email: "test@test.com", password: "Pw123456" });

      expect(result).toEqual(mockResponse);
      expect(result).not.toHaveProperty("access");
      expect(result).not.toHaveProperty("refresh");
    });
  });

  describe("register", () => {
    it("returns the new user without exposing JWT values", async () => {
      const mockResponse = {
        user: { id: "2", email: "new@test.com" },
      };
      vi.mocked(http.post).mockResolvedValueOnce(mockResponse);

      const result = await authApi.register({ email: "new@test.com", password: "Pw123456" });

      expect(result).toEqual(mockResponse);
      expect(result).not.toHaveProperty("access");
      expect(result).not.toHaveProperty("refresh");
    });
  });

  describe("logout", () => {
    it("asks the backend to revoke its HttpOnly refresh cookie", async () => {
      await authApi.logout();
      expect(http.post).toHaveBeenCalledWith("/auth/logout", {});
    });

    it("propagates backend failures after notifying auth state", async () => {
      vi.mocked(http.post).mockRejectedValueOnce(new Error("Network error"));
      await expect(authApi.logout()).rejects.toThrow("Network error");
    });
  });

  describe("me", () => {
    it("calls GET /auth/me", async () => {
      const mockUser = { id: "1", email: "test@test.com", is_admin: false };
      vi.mocked(http.get).mockResolvedValueOnce(mockUser);

      const result = await authApi.me();
      expect(result).toEqual(mockUser);
      expect(http.get).toHaveBeenCalledWith("/auth/me");
    });
  });
});
