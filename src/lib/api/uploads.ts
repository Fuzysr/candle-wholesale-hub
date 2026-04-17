import { api } from "./client";
import type { UploadOut } from "./types";

type UploadKind = "product-images" | "company-assets";

const uploadFile = async (kind: UploadKind, file: File): Promise<UploadOut> => {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<UploadOut>(`/admin/uploads/${kind}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
};

export const uploadsApi = {
  uploadProductImage: (file: File) => uploadFile("product-images", file),
  uploadCompanyAsset: (file: File) => uploadFile("company-assets", file),
  delete: async (url: string): Promise<void> => {
    await api.delete("/admin/uploads", { data: { url } });
  },
};
