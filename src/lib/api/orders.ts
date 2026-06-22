import { api, http } from "./client";
import type {
  OrderCreate,
  OrderListOut,
  OrderOut,
  OrderQuoteIn,
  OrderQuoteOut,
  OrderUpdateAdmin,
} from "./types";

export const ordersApi = {
  quote: (body: OrderQuoteIn) => http.post<OrderQuoteOut>("/orders/quote", body),
  create: (body: OrderCreate) => http.post<OrderOut>("/orders", body),
  listMine: () => http.get<OrderListOut[]>("/orders"),
  getById: (id: string) => http.get<OrderOut>(`/orders/${id}`),

  adminList: () => http.get<OrderListOut[]>("/admin/orders"),
  adminGetById: (id: string) => http.get<OrderOut>(`/admin/orders/${id}`),
  adminUpdate: (id: string, body: OrderUpdateAdmin) =>
    http.patch<OrderOut>(`/admin/orders/${id}`, body),
  /**
   * Отправить клиенту письмо по конкретной заявке.
   * Адрес получателя backend подставит сам из заявки — передавать его
   * с клиента нельзя (чтобы endpoint нельзя было использовать как open-relay).
   */
  adminContact: (
    orderId: string,
    body: { subject: string; body: string },
  ) =>
    http.post<{ ok: boolean; queued_to: string }>(
      `/admin/orders/${orderId}/contact`,
      body,
    ),

  /**
   * Админ одобряет заявку → статус `awaiting_payment`.
   * Клиенту уходит email с суммой и реквизитами.
   */
  adminApprove: (orderId: string) =>
    http.post<{ ok: boolean; new_status: string }>(
      `/admin/orders/${orderId}/approve`,
    ),

  /**
   * Админ подтверждает получение оплаты → статус `paid`.
   */
  adminConfirmPayment: (orderId: string) =>
    http.post<{ ok: boolean; new_status: string }>(
      `/admin/orders/${orderId}/confirm-payment`,
    ),

  /**
   * Админ отклоняет заявку → статус `cancelled`.
   * Клиенту уходит email с причиной отказа.
   */
  adminReject: (orderId: string, reason: string) =>
    http.post<{ ok: boolean; new_status: string }>(
      `/admin/orders/${orderId}/reject`,
      { reason },
    ),

  /**
   * Админ отмечает заказ как собранный → статус `shipped` (готов к выдаче).
   * Клиенту уходит email «Заказ собран — можете забирать».
   */
  adminMarkReady: (orderId: string) =>
    http.post<{ ok: boolean; new_status: string }>(
      `/admin/orders/${orderId}/mark-ready`,
    ),

  /**
   * Клиент загружает скриншот/фото чека оплаты.
   * Использует FormData (multipart), поэтому идём через `api` напрямую.
   */
  uploadReceipt: async (
    orderId: string,
    file: File,
  ): Promise<{ ok: boolean; receipt_url: string; new_status: string }> => {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post<{
      ok: boolean;
      receipt_url: string;
      new_status: string;
    }>(`/orders/${orderId}/receipt`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },
};
