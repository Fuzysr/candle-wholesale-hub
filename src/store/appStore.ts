import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Currency, Lang } from "@/lib/format";

type AppState = {
  currency: Currency;
  lang: Lang;
  setCurrency: (c: Currency) => void;
  setLang: (l: Lang) => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currency: "RUB",
      lang: "ru",
      setCurrency: (currency) => set({ currency }),
      setLang: (lang) => set({ lang }),
    }),
    { name: "wc-app-prefs" },
  ),
);
