/**
 * Storage layer for catalog restore state.
 *
 * Encapsulates every interaction with `sessionStorage` so the rest of the
 * codebase never touches the raw key. Pure functions, SSR-safe, defensive
 * against:
 *   - missing `window`/`sessionStorage` (SSR, private mode quotas)
 *   - JSON parse errors (corrupted entry, schema drift)
 *   - version mismatches (old snapshot from a previous deploy)
 *   - stale entries past the TTL
 */

import {
  CATALOG_RESTORE_STORAGE_KEY,
  CATALOG_RESTORE_TTL_MS,
  CATALOG_RESTORE_VERSION,
  type CatalogRestoreState,
} from "./types";

const isBrowser = (): boolean =>
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

/**
 * Type guard that validates the runtime shape of a parsed snapshot.
 * Returning `false` causes `readState` to discard the entry.
 */
const isValidState = (raw: unknown): raw is CatalogRestoreState => {
  if (!raw || typeof raw !== "object") return false;
  const s = raw as Partial<CatalogRestoreState>;
  return (
    s.version === CATALOG_RESTORE_VERSION &&
    typeof s.pathname === "string" &&
    typeof s.scrollY === "number" &&
    typeof s.page === "number" &&
    typeof s.timestamp === "number" &&
    (s.interactedVariantId === null || typeof s.interactedVariantId === "string") &&
    Array.isArray(s.loadedVariantIds) &&
    typeof s.filters === "object" &&
    s.filters !== null
  );
};

/**
 * Read the persisted snapshot. Returns `null` when:
 *   - we are on the server (no `sessionStorage`),
 *   - the entry is missing,
 *   - the JSON is malformed,
 *   - the schema version doesn't match,
 *   - the entry has expired (older than {@link CATALOG_RESTORE_TTL_MS}).
 *
 * Expired / invalid entries are eagerly removed so the next read is fast.
 */
export const readState = (): CatalogRestoreState | null => {
  if (!isBrowser()) return null;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(CATALOG_RESTORE_STORAGE_KEY);
  } catch {
    // Some privacy modes throw on getItem.
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearState();
    return null;
  }

  if (!isValidState(parsed)) {
    clearState();
    return null;
  }

  if (Date.now() - parsed.timestamp > CATALOG_RESTORE_TTL_MS) {
    clearState();
    return null;
  }

  return parsed;
};

/**
 * Persist the snapshot, stamping it with the current timestamp. Failures
 * (quota exceeded, security errors) are swallowed silently — restoration is
 * a UX nicety, not a correctness requirement.
 */
export const writeState = (state: CatalogRestoreState): void => {
  if (!isBrowser()) return;
  try {
    const stamped: CatalogRestoreState = { ...state, timestamp: Date.now() };
    window.sessionStorage.setItem(
      CATALOG_RESTORE_STORAGE_KEY,
      JSON.stringify(stamped),
    );
  } catch {
    /* ignore */
  }
};

/**
 * Atomically read-modify-write a partial update. Used by the tracking hook
 * so several independent observers (scroll listener, filter effect, click
 * handler) can update different fields without clobbering each other.
 *
 * If no valid prior state exists, the patch is merged on top of an empty
 * skeleton — but only when the patch carries enough info (a `pathname`) to
 * identify the page. Otherwise the call is a no-op.
 */
export const patchState = (
  patch: Partial<Omit<CatalogRestoreState, "version" | "timestamp">>,
): void => {
  if (!isBrowser()) return;
  const prev = readState();
  if (!prev) {
    // Without a prior snapshot we can't safely guess pathname / filters.
    // The catalog page bootstraps the first full write; subsequent calls
    // here patch on top of it.
    if (!patch.pathname) return;
  }
  const next: CatalogRestoreState = {
    version: CATALOG_RESTORE_VERSION,
    pathname: patch.pathname ?? prev?.pathname ?? "",
    scrollY: patch.scrollY ?? prev?.scrollY ?? 0,
    page: patch.page ?? prev?.page ?? 1,
    filters: patch.filters ?? prev?.filters ?? {
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
      lengthMin: "",
      lengthMax: "",
      widthMin: "",
      widthMax: "",
      heightMin: "",
      heightMax: "",
      sort: "newest",
      view: "grid",
    },
    interactedVariantId:
      patch.interactedVariantId !== undefined
        ? patch.interactedVariantId
        : prev?.interactedVariantId ?? null,
    loadedVariantIds: patch.loadedVariantIds ?? prev?.loadedVariantIds ?? [],
    timestamp: Date.now(),
  };
  writeState(next);
};

/** Remove the snapshot entirely. Errors are ignored. */
export const clearState = (): void => {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(CATALOG_RESTORE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

/**
 * Best-effort cleanup of the *old* sessionStorage keys used by the previous
 * restoration implementation. Called once on app startup so the new feature
 * starts from a clean slate without leaving orphan entries.
 */
export const removeLegacyKeys = (): void => {
  if (!isBrowser()) return;
  const legacy = [
    "wc-catalog-page",
    "wc-catalog-scroll",
    "wc-catalog-variant",
    "wc-catalog-product-url",
  ];
  for (const key of legacy) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
};
