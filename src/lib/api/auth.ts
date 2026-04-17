import { http } from "./client";
import { tokenStore } from "./token-store";
import type { AccessToken, LoginOut, PasswordResetRequestOut, UserOut } from "./types";

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
};

const persistLogin = (data: LoginOut): LoginOut => {
  tokenStore.set(data.access, data.refresh);
  return data;
};

export const authApi = {
  register: async (payload: RegisterPayload): Promise<LoginOut> =>
    persistLogin(await http.post<LoginOut>("/auth/register", payload)),

  login: async (payload: LoginPayload): Promise<LoginOut> =>
    persistLogin(await http.post<LoginOut>("/auth/login", payload)),

  refresh: async (refresh: string): Promise<AccessToken> =>
    http.post<AccessToken>("/auth/refresh", { refresh }),

  me: async (): Promise<UserOut> => http.get<UserOut>("/auth/me"),

  logout: () => {
    tokenStore.clear();
  },

  requestPasswordReset: (email: string): Promise<PasswordResetRequestOut> =>
    http.post<PasswordResetRequestOut>("/auth/password/reset-request", { email }),

  confirmPasswordReset: (token: string, password: string): Promise<void> =>
    http.post<void>("/auth/password/reset-confirm", { token, password }),
};
