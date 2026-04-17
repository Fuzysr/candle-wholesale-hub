/**
 * Access / refresh token persistence.
 *
 * We keep them in `localStorage` so page refreshes keep the session alive.
 * Components that need to react to login/logout subscribe via the
 * `cwh:auth-changed` browser event.
 */

const ACCESS_KEY = "cwh:access";
const REFRESH_KEY = "cwh:refresh";
const EVENT = "cwh:auth-changed";

export const tokenStore = {
  getAccess(): string | null {
    try {
      return localStorage.getItem(ACCESS_KEY);
    } catch {
      return null;
    }
  },
  getRefresh(): string | null {
    try {
      return localStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  set(access: string, refresh?: string | null): void {
    try {
      localStorage.setItem(ACCESS_KEY, access);
      if (refresh !== undefined && refresh !== null) {
        localStorage.setItem(REFRESH_KEY, refresh);
      }
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(EVENT));
  },
  setAccessOnly(access: string): void {
    try {
      localStorage.setItem(ACCESS_KEY, access);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(EVENT));
  },
  clear(): void {
    try {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(EVENT));
  },
  onChange(handler: () => void): () => void {
    const listener = () => handler();
    window.addEventListener(EVENT, listener);
    // also react to changes in other tabs
    const storageListener = (e: StorageEvent) => {
      if (e.key === ACCESS_KEY || e.key === REFRESH_KEY) handler();
    };
    window.addEventListener("storage", storageListener);
    return () => {
      window.removeEventListener(EVENT, listener);
      window.removeEventListener("storage", storageListener);
    };
  },
};
