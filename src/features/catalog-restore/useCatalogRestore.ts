import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

import { readState, clearState } from "./storage";
import type { CatalogFilterState, CatalogRestoreState } from "./types";

/**
 * Public API of {@link useCatalogRestore}.
 *
 * The hook reads a *single* snapshot at mount time. Consumers use
 * `initialFilters` / `initialPage` as `useState` lazy initialisers, then
 * call `applyRestore` once data is loaded and the DOM is painted to
 * actually move the viewport.
 */
export type CatalogRestoreApi = {
  /** Filters captured by the previous visit, or `null` if no valid snapshot. */
  initialFilters: CatalogFilterState | null;
  /** Page number to start on (defaults to 1 when no snapshot). */
  initialPage: number;
  /** True when there is a valid snapshot for the current pathname. */
  hasRestoreTarget: boolean;
  /**
   * Run the actual viewport restore. Called by the consumer once products
   * have rendered and refs are populated.
   *
   * @param resolveNode  Lookup that turns `variantId` into a DOM node, or
   *                     `null` if the variant isn't currently rendered.
   * @returns metadata describing what restore strategy ran, useful for tests
   *          and analytics.
   */
  applyRestore: (resolveNode: (variantId: string) => HTMLElement | null) => RestoreOutcome;
  /** Drop the snapshot from storage. Called once restore has succeeded. */
  finalize: () => void;
};

/** Describes which branch of the restore algorithm was taken. */
export type RestoreOutcome =
  | { kind: "noop" }
  | { kind: "scroll-to-card"; variantId: string; scrollY: number }
  | { kind: "scroll-position"; scrollY: number; reason: "no-card" | "card-missing" }
  | { kind: "top"; reason: "fallback" };

const isCatalogPath = (p: string): boolean =>
  p === "/catalog" || p.startsWith("/catalog/");

const isMatchingPathname = (
  snapshot: CatalogRestoreState,
  currentPathname: string,
): boolean => {
  // Exact match — ideal case.
  if (snapshot.pathname === currentPathname) return true;
  // Both are catalog routes — the "Back to catalog" link from a product
  // page may point to `/catalog/{slug}` while the snapshot was saved on
  // `/catalog` (or vice-versa). Treat all catalog paths as matching so
  // scroll position / highlighted card survive the transition.
  if (isCatalogPath(snapshot.pathname) && isCatalogPath(currentPathname)) return true;
  return false;
};

/**
 * Centralised restore orchestration for the catalog page.
 *
 * Lifecycle:
 *
 *   1. On mount the snapshot is read once (sync, no effect) so consumers
 *      can pass `initialFilters`/`initialPage` to `useState` and avoid an
 *      extra render+effect cycle.
 *   2. The catalog renders with restored filters; React Query starts the
 *      product fetch.
 *   3. Once `loading` flips to `false` and the product cards have mounted,
 *      the consumer calls `applyRestore(getNode)`. The hook decides between:
 *         - `scrollIntoView({ block: "center" })` to the saved card,
 *         - or a raw `window.scrollTo(0, scrollY)`,
 *         - or nothing.
 *   4. `finalize()` clears the snapshot so back/forward to a *fresh* catalog
 *      visit doesn't replay an old position.
 *
 * SSR-safe: when the hook runs without `window`, it returns the empty
 * "no snapshot" shape and `applyRestore` is a no-op.
 */
export const useCatalogRestore = (currentPathname: string): CatalogRestoreApi => {
  // Single read on mount. `useRef` so subsequent renders don't reload from
  // storage — the consumer drives state from then on.
  const snapshotRef = useRef<CatalogRestoreState | null>(null);
  const consumedRef = useRef<boolean>(false);

  if (snapshotRef.current === null && !consumedRef.current) {
    const candidate = readState();
    if (candidate && isMatchingPathname(candidate, currentPathname)) {
      snapshotRef.current = candidate;
    } else if (candidate && !isMatchingPathname(candidate, currentPathname)) {
      // Stale snapshot for a different pathname — discard so it doesn't
      // accidentally trigger on a later visit.
      clearState();
    }
  }

  const initialFilters = useMemo<CatalogFilterState | null>(() => {
    return snapshotRef.current?.filters ?? null;
  }, []);
  const initialPage = useMemo<number>(() => {
    return snapshotRef.current?.page ?? 1;
  }, []);
  const hasRestoreTarget = snapshotRef.current !== null;

  const applyRestore = useCallback<CatalogRestoreApi["applyRestore"]>(
    (resolveNode) => {
      const snap = snapshotRef.current;
      if (!snap) return { kind: "noop" };

      // CASE 1 — user clicked a card and is returning to it.
      if (snap.interactedVariantId) {
        const node = resolveNode(snap.interactedVariantId);
        if (node) {
          // `behavior: "auto"` (synchronous) avoids the smooth-scroll race
          // where the user starts interacting before the animation ends.
          node.scrollIntoView({ block: "center", behavior: "auto" });
          return {
            kind: "scroll-to-card",
            variantId: snap.interactedVariantId,
            scrollY: window.scrollY,
          };
        }
        // CASE 3 — variant filtered out. Fall through to scrollY fallback.
        if (snap.scrollY > 0) {
          window.scrollTo(0, snap.scrollY);
          return {
            kind: "scroll-position",
            scrollY: snap.scrollY,
            reason: "card-missing",
          };
        }
        return { kind: "top", reason: "fallback" };
      }

      // CASE 2 — plain navigation, restore raw scroll position.
      if (snap.scrollY > 0) {
        window.scrollTo(0, snap.scrollY);
        return {
          kind: "scroll-position",
          scrollY: snap.scrollY,
          reason: "no-card",
        };
      }
      return { kind: "noop" };
    },
    [],
  );

  const finalize = useCallback(() => {
    snapshotRef.current = null;
    consumedRef.current = true;
    clearState();
  }, []);

  // Defensive cleanup: if the catalog unmounts before `finalize` was called
  // (e.g. user navigated away during restore), keep the snapshot in storage
  // so the next mount can still consume it. We deliberately do nothing here.
  useLayoutEffect(() => {
    return () => {
      // intentional no-op — see comment above
    };
  }, []);

  return { initialFilters, initialPage, hasRestoreTarget, applyRestore, finalize };
};
