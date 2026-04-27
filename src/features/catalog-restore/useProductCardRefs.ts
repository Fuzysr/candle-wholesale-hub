import { useCallback, useEffect, useRef } from "react";

/**
 * Typed map of `variantId → HTMLElement` for product cards/rows.
 *
 * The catalog renders the same variants both as grid cards and as table
 * rows; both register through `registerRef`. The `interactedVariantId` from
 * the restore snapshot is then resolved via `getNode` to get a concrete
 * DOM node we can call `scrollIntoView` on — no `querySelector`, no
 * coupling to data-attributes that future contributors might forget.
 *
 * The hook intentionally does NOT trigger re-renders when the map changes:
 *   - `registerRef` is stable across renders (`useCallback([])`).
 *   - The map is held in a `useRef`, so writes during the render commit
 *     phase don't schedule extra renders.
 *
 * On unmount the map is cleared to release strong references to detached
 * DOM nodes (defensive — React would normally let them be GC'd, but this
 * documents the intent and helps in dev-tools profiling).
 */
export type ProductCardRefs = {
  /**
   * Ref callback to attach on each card/row element. Pass `null` (which
   * React does on unmount) to unregister.
   *
   * Usage:
   *   <article ref={(el) => registerRef(v.id, el)} />
   */
  registerRef: (variantId: string, node: HTMLElement | null) => void;
  /** Resolve a node by variant id, or `null` if it isn't currently mounted. */
  getNode: (variantId: string) => HTMLElement | null;
  /** Snapshot of currently registered variant ids. */
  getRegisteredIds: () => string[];
};

export const useProductCardRefs = (): ProductCardRefs => {
  const mapRef = useRef<Map<string, HTMLElement>>(new Map());

  const registerRef = useCallback((variantId: string, node: HTMLElement | null) => {
    if (node) {
      mapRef.current.set(variantId, node);
    } else {
      mapRef.current.delete(variantId);
    }
  }, []);

  const getNode = useCallback(
    (variantId: string): HTMLElement | null => mapRef.current.get(variantId) ?? null,
    [],
  );

  const getRegisteredIds = useCallback((): string[] => Array.from(mapRef.current.keys()), []);

  useEffect(() => {
    // Capture the current ref so the cleanup closes over the same Map even
    // if a future render replaces `mapRef` (it won't, but eslint's
    // exhaustive-deps rule and React's strict mode appreciate the care).
    const map = mapRef.current;
    return () => {
      map.clear();
    };
  }, []);

  return { registerRef, getNode, getRegisteredIds };
};
