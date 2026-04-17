import { http } from "./client";
import type { ProfileUpdateIn, UserOut } from "./types";

export const profileApi = {
  get: () => http.get<UserOut>("/profile"),
  update: (body: ProfileUpdateIn) => http.patch<UserOut>("/profile", body),
};
