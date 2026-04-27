import { http } from "./client";
import type { UserOut } from "./types";

export const usersApi = {
  adminList: () => http.get<UserOut[]>("/admin/users"),
  adminOrderStats: (userId: string) =>
    http.get<{ order_count: number; total_revenue: number }>(
      `/admin/users/${userId}/order-stats`,
    ),
  adminSendEmail: (body: { to_email: string; subject: string; body: string }) =>
    http.post<{ ok: boolean }>("/admin/send-email", body),
};
