import { http } from "./client";
import { notifyAuthChanged } from "./auth-session";
import type { LoginOut, PasswordResetRequestOut, UserOut } from "./types";

export type RegisterPayload = {
  email: string;
  password: string;
  company_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
};

export type LoginPayload = {
  email: string;
  password: string;
  mfa_code?: string;
};

const completeLogin = (data: LoginOut): LoginOut => {
  notifyAuthChanged(true);
  return data;
};

export const authApi = {
  register: async (payload: RegisterPayload): Promise<LoginOut> =>
    completeLogin(await http.post<LoginOut>("/auth/register", payload)),

  login: async (payload: LoginPayload): Promise<LoginOut> =>
    completeLogin(await http.post<LoginOut>("/auth/login", payload)),

  refresh: (): Promise<{ ok: true }> => http.post<{ ok: true }>("/auth/refresh", {}),

  me: async (): Promise<UserOut> => http.get<UserOut>("/auth/me"),

  logout: async (): Promise<void> => {
    try {
      await http.post("/auth/logout", {});
    } finally {
      notifyAuthChanged(false);
    }
  },

  requestPasswordReset: (email: string): Promise<PasswordResetRequestOut> =>
    http.post<PasswordResetRequestOut>("/auth/password/reset-request", { email }),

  confirmPasswordReset: (token: string, password: string): Promise<void> =>
    http.post<void>("/auth/password/reset-confirm", { token, password }),
};
