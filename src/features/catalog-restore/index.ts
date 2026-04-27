/**
 * Public surface of the catalog state-restoration feature.
 *
 * Consumers (the catalog page) should import only from this barrel — the
 * individual modules are implementation details.
 */

export { useCatalogRestore } from "./useCatalogRestore";
export type { CatalogRestoreApi, RestoreOutcome } from "./useCatalogRestore";

export { useCatalogTracking } from "./useCatalogTracking";
export type { CatalogTrackingApi, CatalogTrackingInput } from "./useCatalogTracking";

export { useProductCardRefs } from "./useProductCardRefs";
export type { ProductCardRefs } from "./useProductCardRefs";

export { removeLegacyKeys } from "./storage";

export {
  DEFAULT_FILTER_STATE,
  type CatalogFilterState,
  type CatalogRestoreState,
  type SortKey,
  type ViewMode,
} from "./types";
