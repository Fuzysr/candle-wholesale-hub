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
    {
      name: "wc-app-prefs",
      // Bump version so any previously-persisted `currency: "USD"` preferences
      // are reset to RUB (the only currency actually surfaced in the UI today).
      version: 2,
      migrate: (persisted: unknown) => {
        const state = (persisted as Partial<AppState>) ?? {};
        return {
          currency: "RUB" as Currency,
          lang: (state.lang as Lang) ?? "ru",
        };
      },
    },
  ),
);
