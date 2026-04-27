/**
 * Domain types for the catalog state-restoration feature.
 *
 * The shape is intentionally serialisation-friendly:
 *   - All collections are arrays (never `Set` / `Map`) so JSON.stringify
 *     round-trips without custom replacers.
 *   - Optional values use `null` (not `undefined`) for the same reason.
 */

export type SortKey = "newest" | "price-asc" | "price-desc" | "name" | "stock";

export type ViewMode = "grid" | "table";

/**
 * Filter / sort / view state — exactly what the catalog page exposes through
 * its UI controls. Persisted as part of the restore snapshot so a returning
 * user sees the same filtered list, not the default one.
 */
export type CatalogFilterState = {
  search: string;
  categorySlug: string | null;
  categoryIds: string[];
  onlyInStock: boolean;
  colorIds: string[];
  materialIds: string[];
  scentIds: string[];
  shapeIds: string[];
  priceMin: string;
  priceMax: string;
  sort: SortKey;
  view: ViewMode;
};

/**
 * Atomic snapshot persisted to `sessionStorage` under a single key. All
 * restoration data lives in one object so partial writes can never desync
 * (e.g. scrollY updated but variant id stale).
 *
 * `version` lets us evolve the schema later without crashing on old data —
 * mismatched versions are treated as "no saved state".
 */
export type CatalogRestoreState = {
  version: 1;
  /** The pathname the snapshot was captured on (e.g. `/catalog/candles`). */
  pathname: string;
  /** Raw `window.scrollY` at last sample. */
  scrollY: number;
  /** Active page in pagination (1-based). */
  page: number;
  /** All filter / sort / view inputs. */
  filters: CatalogFilterState;
  /** Variant id of the card the user last clicked through to. `null` if the
   *  user navigated away without opening a product. */
  interactedVariantId: string | null;
  /** Variant ids that were rendered the last time we saved. Used to detect
   *  CASE 3 — the saved variant has been filtered out of the new view. */
  loadedVariantIds: string[];
  /** Epoch ms of last write — used by the TTL guard. */
  timestamp: number;
};

export const CATALOG_RESTORE_VERSION = 1 as const;

/** 30 minutes — older snapshots are treated as expired and discarded. */
export const CATALOG_RESTORE_TTL_MS = 30 * 60 * 1000;

/** Single sessionStorage key for the whole feature. */
export const CATALOG_RESTORE_STORAGE_KEY = "catalog_restore_state";

/** Default filter state used when no snapshot is available. Kept here so the
 *  catalog page and the storage layer agree on what "empty" means. */
export const DEFAULT_FILTER_STATE: CatalogFilterState = {
  search: "",
  categorySlug: null,
  categoryIds: [],
  onlyInStock: true,
  colorIds: [],
  materialIds: [],
  scentIds: [],
  shapeIds: [],
  priceMin: "",
  priceMax: "",
  sort: "newest",
  view: "grid",
};
