import { http } from "./client";

export type ContactFormData = {
  name: string;
  phone: string;
  message: string;
};

export type ContactMessageOut = {
  id: string;
  name: string;
  phone: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
};

export const contactApi = {
  submit: (body: ContactFormData) => http.post<{ ok: boolean }>("/contact", body),
  list: () => http.get<ContactMessageOut[]>("/admin/contact-messages"),
  markRead: (id: string) => http.patch<{ ok: boolean }>(`/admin/contact-messages/${id}/read`),
  delete: (id: string) => http.delete<{ ok: boolean }>(`/admin/contact-messages/${id}`),
};
