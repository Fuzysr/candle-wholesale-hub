import { describe, it, expect, beforeEach, vi } from "vitest";

// We need to test tokenStore in isolation. Since it reads/writes localStorage
// directly, we mock localStorage and window events.

const ACCESS_KEY = "cwh:access";
const REFRESH_KEY = "cwh:refresh";
const EVENT = "cwh:auth-changed";

// Import after env is ready (jsdom provides localStorage)
let tokenStore: typeof import("../token-store").tokenStore;

beforeEach(async () => {
  localStorage.clear();
  vi.restoreAllMocks();
  // Re-import to get a fresh module
  const mod = await import("../token-store");
  tokenStore = mod.tokenStore;
});

describe("tokenStore", () => {
  describe("getAccess / getRefresh", () => {
    it("returns null when no token is stored", () => {
      expect(tokenStore.getAccess()).toBeNull();
      expect(tokenStore.getRefresh()).toBeNull();
    });

    it("returns stored values", () => {
      localStorage.setItem(ACCESS_KEY, "a-tok");
      localStorage.setItem(REFRESH_KEY, "r-tok");
      expect(tokenStore.getAccess()).toBe("a-tok");
      expect(tokenStore.getRefresh()).toBe("r-tok");
    });

    it("returns null if localStorage throws", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });
      expect(tokenStore.getAccess()).toBeNull();
      expect(tokenStore.getRefresh()).toBeNull();
    });
  });

  describe("set", () => {
    it("stores both access and refresh tokens", () => {
      tokenStore.set("access-1", "refresh-1");
      expect(localStorage.getItem(ACCESS_KEY)).toBe("access-1");
      expect(localStorage.getItem(REFRESH_KEY)).toBe("refresh-1");
    });

    it("stores only access when refresh is not provided", () => {
      tokenStore.set("access-1");
      expect(localStorage.getItem(ACCESS_KEY)).toBe("access-1");
      expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    });

    it("dispatches auth-changed event", () => {
      const handler = vi.fn();
      window.addEventListener(EVENT, handler);
      tokenStore.set("a", "r");
      expect(handler).toHaveBeenCalledTimes(1);
      window.removeEventListener(EVENT, handler);
    });
  });

  describe("setAccessOnly", () => {
    it("updates only the access token", () => {
      tokenStore.set("old-access", "old-refresh");
      tokenStore.setAccessOnly("new-access");
      expect(localStorage.getItem(ACCESS_KEY)).toBe("new-access");
      expect(localStorage.getItem(REFRESH_KEY)).toBe("old-refresh");
    });

    it("dispatches auth-changed event", () => {
      const handler = vi.fn();
      window.addEventListener(EVENT, handler);
      tokenStore.setAccessOnly("a");
      expect(handler).toHaveBeenCalledTimes(1);
      window.removeEventListener(EVENT, handler);
    });
  });

  describe("clear", () => {
    it("removes both tokens", () => {
      tokenStore.set("a", "r");
      tokenStore.clear();
      expect(localStorage.getItem(ACCESS_KEY)).toBeNull();
      expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    });

    it("dispatches auth-changed event", () => {
      const handler = vi.fn();
      window.addEventListener(EVENT, handler);
      tokenStore.clear();
      expect(handler).toHaveBeenCalledTimes(1);
      window.removeEventListener(EVENT, handler);
    });
  });

  describe("onChange", () => {
    it("calls handler on auth-changed event and returns unsubscribe fn", () => {
      const handler = vi.fn();
      const unsub = tokenStore.onChange(handler);

      tokenStore.set("a", "r");
      expect(handler).toHaveBeenCalledTimes(1);

      tokenStore.clear();
      expect(handler).toHaveBeenCalledTimes(2);

      unsub();
      tokenStore.set("b", "c");
      expect(handler).toHaveBeenCalledTimes(2); // no more calls
    });

    it("reacts to StorageEvent from other tabs", () => {
      const handler = vi.fn();
      tokenStore.onChange(handler);

      window.dispatchEvent(
        new StorageEvent("storage", { key: ACCESS_KEY }),
      );
      expect(handler).toHaveBeenCalledTimes(1);

      window.dispatchEvent(
        new StorageEvent("storage", { key: REFRESH_KEY }),
      );
      expect(handler).toHaveBeenCalledTimes(2);

      // Unrelated key — no call
      window.dispatchEvent(
        new StorageEvent("storage", { key: "other-key" }),
      );
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});
