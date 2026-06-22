/**
 * Axios instance with request + response interceptors:
 *
 * - request: send HttpOnly auth cookies and the readable CSRF token
 * - response: on 401 to any non-auth endpoint, try to refresh once; if that
 *   fails, clear tokens and let the UI redirect to /auth
 *
 * Concurrent 401s in one tab share the same in-flight refresh promise. A
 * losing tab probes `/auth/me` after refresh failure: cookies rotated by the
 * winning tab are shared by the browser even though they are HttpOnly.
 */
import axios, {
  AxiosError,
  AxiosHeaders,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

import { notifyAuthChanged } from "./auth-session";

type RefreshOut = { ok: true };
const CSRF_COOKIE = "cwh_csrf";
const CSRF_HEADER = "X-CSRF-Token";

const getCsrfToken = (): string | null => {
  const encoded = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${CSRF_COOKIE}=`))
    ?.slice(CSRF_COOKIE.length + 1);
  return encoded ? decodeURIComponent(encoded) : null;
};

const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  `${window.location.protocol}//${window.location.hostname}:8000`;

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.request.use((config) => {
  const csrf = getCsrfToken();
  if (csrf) {
    const headers =
      config.headers instanceof AxiosHeaders ? config.headers : new AxiosHeaders(config.headers);
    headers.set(CSRF_HEADER, decodeURIComponent(csrf));
    config.headers = headers;
  }
  return config;
});

let refreshPromise: Promise<boolean> | null = null;

const refreshAccessToken = async (): Promise<boolean> => {
  try {
    const csrf = getCsrfToken();
    await axios.post<RefreshOut>(
      `${BASE_URL}/auth/refresh`,
      {},
      {
        withCredentials: true,
        headers: csrf ? { [CSRF_HEADER]: csrf } : undefined,
      },
    );
    notifyAuthChanged(true);
    return true;
  } catch {
    // Another tab may have completed rotation first. HttpOnly cookies are
    // invisible to JS, so verify the shared access cookie with a clean probe.
    try {
      await axios.get(`${BASE_URL}/auth/me`, { withCredentials: true });
      return true;
    } catch {
      notifyAuthChanged(false);
      return false;
    }
  }
};

const shouldAttemptRefresh = (config: RetriableConfig | undefined) => {
  if (!config) return false;
  if (config._retry) return false;
  const url = (config.url ?? "").toString();
  // Do not loop on the auth endpoints themselves.
  if (url.includes("/auth/login")) return false;
  if (url.includes("/auth/register")) return false;
  if (url.includes("/auth/refresh")) return false;
  if (url.includes("/auth/password/")) return false;
  if (url.includes("/auth/logout")) return false;
  return true;
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as RetriableConfig | undefined;

    if (status === 401 && shouldAttemptRefresh(original)) {
      if (!refreshPromise) refreshPromise = refreshAccessToken();
      let refreshed = false;
      try {
        refreshed = await refreshPromise;
      } finally {
        refreshPromise = null;
      }
      if (refreshed && original) {
        original._retry = true;
        return api.request(original);
      }
    }

    return Promise.reject(error);
  },
);

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

export type ApiError = {
  status: number;
  detail: string;
};

/** Extract a human-readable message out of an axios error. */
export const apiErrorMessage = (err: unknown, fallback = "Неизвестная ошибка"): string => {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { detail?: unknown } | undefined;
    const detail = data?.detail;
    if (typeof detail === "string") return detail;
    // Структурированные ошибки вроде `{message, out_of_stock: [...]}` —
    // например, 409 от POST /orders при нехватке остатков на складе.
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const obj = detail as { message?: unknown };
      if (typeof obj.message === "string") return obj.message;
    }
    if (Array.isArray(detail) && detail.length) {
      // FastAPI validation errors are arrays of `{msg, loc, type}`.
      const first = detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
};

type RequestCfg = AxiosRequestConfig;

export const http = {
  async get<T>(url: string, config?: RequestCfg): Promise<T> {
    const res: AxiosResponse<T> = await api.get(url, config);
    return res.data;
  },
  async post<T, B = unknown>(url: string, body?: B, config?: RequestCfg): Promise<T> {
    const res: AxiosResponse<T> = await api.post(url, body, config);
    return res.data;
  },
  async patch<T, B = unknown>(url: string, body?: B, config?: RequestCfg): Promise<T> {
    const res: AxiosResponse<T> = await api.patch(url, body, config);
    return res.data;
  },
  async put<T, B = unknown>(url: string, body?: B, config?: RequestCfg): Promise<T> {
    const res: AxiosResponse<T> = await api.put(url, body, config);
    return res.data;
  },
  async delete<T>(url: string, config?: RequestCfg): Promise<T> {
    const res: AxiosResponse<T> = await api.delete(url, config);
    return res.data;
  },
};
