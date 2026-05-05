import { describe, it, expect, beforeEach, vi } from "vitest";
import { tokenStore } from "../token-store";

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
  localStorage.clear();
  vi.clearAllMocks();
});

describe("authApi", () => {
  describe("login", () => {
    it("persists tokens on successful login", async () => {
      const mockResponse = {
        access: "test-access",
        refresh: "test-refresh",
        token_type: "bearer",
        user: { id: "1", email: "test@test.com" },
      };
      vi.mocked(http.post).mockResolvedValueOnce(mockResponse);

      const result = await authApi.login({ email: "test@test.com", password: "Pw123456" });

      expect(result).toEqual(mockResponse);
      expect(tokenStore.getAccess()).toBe("test-access");
      expect(tokenStore.getRefresh()).toBe("test-refresh");
    });
  });

  describe("register", () => {
    it("persists tokens on successful registration", async () => {
      const mockResponse = {
        access: "reg-access",
        refresh: "reg-refresh",
        token_type: "bearer",
        user: { id: "2", email: "new@test.com" },
      };
      vi.mocked(http.post).mockResolvedValueOnce(mockResponse);

      const result = await authApi.register({ email: "new@test.com", password: "Pw123456" });

      expect(result).toEqual(mockResponse);
      expect(tokenStore.getAccess()).toBe("reg-access");
      expect(tokenStore.getRefresh()).toBe("reg-refresh");
    });
  });

  describe("logout (BUG-2 fix)", () => {
    it("clears localStorage immediately", () => {
      tokenStore.set("access-tok", "refresh-tok");
      authApi.logout();
      expect(tokenStore.getAccess()).toBeNull();
      expect(tokenStore.getRefresh()).toBeNull();
    });

    it("calls POST /auth/logout with the refresh token", () => {
      tokenStore.set("access-tok", "refresh-tok");
      authApi.logout();
      expect(http.post).toHaveBeenCalledWith("/auth/logout", { refresh: "refresh-tok" });
    });

    it("does not call backend when no refresh token exists", () => {
      tokenStore.setAccessOnly("access-only");
      authApi.logout();
      expect(http.post).not.toHaveBeenCalled();
    });

    it("does not throw when backend revocation fails", () => {
      tokenStore.set("access-tok", "refresh-tok");
      vi.mocked(http.post).mockRejectedValueOnce(new Error("Network error"));
      // Should not throw — fire-and-forget
      expect(() => authApi.logout()).not.toThrow();
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
