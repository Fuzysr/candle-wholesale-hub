import { useCallback, useEffect, useRef } from "react";

import { patchState, writeState } from "./storage";
import {
  CATALOG_RESTORE_VERSION,
  type CatalogFilterState,
  type CatalogRestoreState,
} from "./types";

export type CatalogTrackingInput = {
  /** Current pathname — written into every snapshot for route-match guard. */
  pathname: string;
  /** Current filter / sort / view state. */
  filters: CatalogFilterState;
  /** Active pagination page. */
  page: number;
  /** Variant ids currently rendered (after filter/sort/page). Used for the
   *  CASE 3 fallback: if the saved card disappears we know to scroll-Y. */
  loadedVariantIds: string[];
  /** When `false` the tracker stays idle. The catalog enables tracking only
   *  after the initial restore has completed so we don't overwrite the
   *  snapshot with `scrollY=0` from the still-mounting page. */
  enabled: boolean;
};

export type CatalogTrackingApi = {
  /** Record a click-through to a product page. The variant id is written
   *  synchronously so the next page load (during navigation) sees it. */
  trackProductClick: (variantId: string) => void;
};

/**
 * rAF-throttled scroll listener. The browser fires `scroll` at native
 * frame rate (60-120 Hz on modern devices); this collapses bursts to one
 * write per animation frame.
 */
const useThrottledScrollWriter = (
  pathname: string,
  enabled: boolean,
): void => {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let frameId: number | null = null;
    let pendingScrollY = 0;

    const flush = () => {
      frameId = null;
      patchState({ pathname, scrollY: pendingScrollY });
    };

    const onScroll = () => {
      pendingScrollY = window.scrollY;
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(flush);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      // Final flush on unmount captures the position the user actually left
      // on, even if no scroll event fired since the last frame.
      patchState({ pathname, scrollY: window.scrollY });
    };
  }, [pathname, enabled]);
};

/**
 * Tracking layer for the catalog page.
 *
 * Responsibilities:
 *   - Persist the *current* (rather than the *restored*) state of filters,
 *     page, view, and rendered variants whenever they change.
 *   - Persist `scrollY` continuously, throttled via `requestAnimationFrame`.
 *   - Expose `trackProductClick` so the page can record the variant the
 *     user is opening before navigation starts.
 *
 * The hook is fully driven by props; it owns no state of its own. This
 * keeps it easy to reason about and trivial to disable (`enabled=false`)
 * while restore is in progress.
 *
 * Storage writes always go through {@link patchState} so independent
 * observers don't clobber each other.
 */
export const useCatalogTracking = (input: CatalogTrackingInput): CatalogTrackingApi => {
  const { pathname, filters, page, loadedVariantIds, enabled } = input;

  // Throttled scroll persistence.
  useThrottledScrollWriter(pathname, enabled);

  // Whenever filters / page / loaded ids change, push a snapshot. We bundle
  // the full filter object instead of patching individual fields because
  // filters are a single domain concept and partial-updates could leave the
  // snapshot in a contradictory state (e.g. `priceMin` updated but
  // `priceMax` still old).
  useEffect(() => {
    if (!enabled) return;
    // Microtask debounce: collapse multiple state changes in the same tick
    // (e.g. user toggles two filters in one render cycle) into one write.
    const handle = window.setTimeout(() => {
      patchState({ pathname, filters, page, loadedVariantIds });
    }, 50);
    return () => window.clearTimeout(handle);
  }, [enabled, pathname, filters, page, loadedVariantIds]);

  // `trackProductClick` is called synchronously in onClick handlers. We
  // bypass the debounce path — the click is followed *immediately* by a
  // navigation, so any delay risks losing the write.
  const trackProductClick = useCallback(
    (variantId: string) => {
      if (typeof window === "undefined") return;
      // Read latest pathname/filters/page from refs to keep the callback
      // stable across renders (it's passed down to many cards).
      patchState({
        pathname: latestRef.current.pathname,
        filters: latestRef.current.filters,
        page: latestRef.current.page,
        loadedVariantIds: latestRef.current.loadedVariantIds,
        interactedVariantId: variantId,
        scrollY: window.scrollY,
      });
    },
    [],
  );

  // Mirror of the latest input values so the stable callback above always
  // captures fresh data without forcing a new identity.
  const latestRef = useRef<CatalogTrackingInput>(input);
  useEffect(() => {
    latestRef.current = input;
  }, [input]);

  // Bootstrap: write a full snapshot the first time the catalog mounts with
  // tracking enabled, so even a user who scrolls 0px and never touches a
  // filter still has a route-stamped entry to update later.
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const snapshot: CatalogRestoreState = {
      version: CATALOG_RESTORE_VERSION,
      pathname,
      scrollY: window.scrollY,
      page,
      filters,
      interactedVariantId: null,
      loadedVariantIds,
      timestamp: Date.now(),
    };
    writeState(snapshot);
    // Intentionally only on `enabled` flipping true; pathname change is
    // covered by the dedicated effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { trackProductClick };
};
