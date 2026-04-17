import { http } from "./client";
import type { CompanySettingsOut, CompanySettingsUpdate } from "./types";

export const companyApi = {
  get: () => http.get<CompanySettingsOut>("/company-settings"),
  update: (body: CompanySettingsUpdate) =>
    http.patch<CompanySettingsOut>("/admin/company-settings", body),
};
