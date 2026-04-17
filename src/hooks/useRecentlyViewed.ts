import { useCallback, useEffect, useState } from "react";

const KEY = "recently_viewed_v1";
const MAX = 12;

export type RecentItem = {
  id: string;
  slug: string;
  name_ru: string;
  name_en: string;
  image_url: string | null;
  viewed_at: number;
};

const read = (): RecentItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentItem[]) : [];
  } catch {
    return [];
  }
};

const write = (items: RecentItem[]) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
};

export const useRecentlyViewed = (excludeId?: string) => {
  const [items, setItems] = useState<RecentItem[]>([]);

  useEffect(() => {
    setItems(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setItems(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const push = useCallback((item: Omit<RecentItem, "viewed_at">) => {
    const next = [
      { ...item, viewed_at: Date.now() },
      ...read().filter((p) => p.id !== item.id),
    ].slice(0, MAX);
    write(next);
    setItems(next);
  }, []);

  const filtered = excludeId ? items.filter((i) => i.id !== excludeId) : items;

  return { items: filtered, push };
};
