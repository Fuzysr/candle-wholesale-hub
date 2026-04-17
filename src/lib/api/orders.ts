import { http } from "./client";
import type {
  OrderCreate,
  OrderListOut,
  OrderOut,
  OrderUpdateAdmin,
} from "./types";

export const ordersApi = {
  create: (body: OrderCreate) => http.post<OrderOut>("/orders", body),
  listMine: () => http.get<OrderListOut[]>("/orders"),
  getById: (id: string) => http.get<OrderOut>(`/orders/${id}`),

  adminList: () => http.get<OrderListOut[]>("/admin/orders"),
  adminGetById: (id: string) => http.get<OrderOut>(`/admin/orders/${id}`),
  adminUpdate: (id: string, body: OrderUpdateAdmin) =>
    http.patch<OrderOut>(`/admin/orders/${id}`, body),
};
