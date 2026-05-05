/**
 * Axios instance with request + response interceptors:
 *
 * - request: attach `Bearer <access>` if a token is present
 * - response: on 401 to any non-auth endpoint, try to refresh once; if that
 *   fails, clear tokens and let the UI redirect to /auth
 *
 * Concurrent 401s share the same in-flight refresh promise so we never ping
 * `/auth/refresh` more than once at a time.
 */
import axios, {
  AxiosError,
  AxiosHeaders,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

import { tokenStore } from "./token-store";
import type { AccessToken } from "./types";

type RefreshOut = { access: string; refresh: string; token_type: string };

const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  `${window.location.protocol}//${window.location.hostname}:8000`;

export const api = axios.create({
  baseURL: BASE_URL,
  // We deliberately don't send cookies — auth is Bearer token in a header.
  withCredentials: false,
});

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.request.use((config) => {
  const token = tokenStore.getAccess();
  if (token) {
    const headers =
      config.headers instanceof AxiosHeaders ? config.headers : new AxiosHeaders(config.headers);
    headers.set("Authorization", `Bearer ${token}`);
    config.headers = headers;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

const refreshAccessToken = async (): Promise<string | null> => {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return null;
  try {
    const { data } = await axios.post<RefreshOut>(
      `${BASE_URL}/auth/refresh`,
      { refresh },
      { withCredentials: false },
    );
    tokenStore.set(data.access, data.refresh);
    return data.access;
  } catch {
    tokenStore.clear();
    return null;
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
  return !!tokenStore.getRefresh();
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as RetriableConfig | undefined;

    if (status === 401 && shouldAttemptRefresh(original)) {
      if (!refreshPromise) refreshPromise = refreshAccessToken();
      let newToken: string | null = null;
      try {
        newToken = await refreshPromise;
      } finally {
        refreshPromise = null;
      }
      if (newToken && original) {
        original._retry = true;
        const headers =
          original.headers instanceof AxiosHeaders
            ? original.headers
            : new AxiosHeaders(original.headers);
        headers.set("Authorization", `Bearer ${newToken}`);
        original.headers = headers;
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
