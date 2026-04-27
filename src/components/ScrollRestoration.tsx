import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const isCatalogRoute = (pathname: string): boolean =>
  pathname === "/catalog" || pathname.startsWith("/catalog/");

/**
 * Global route-level scroll behaviour.
 *
 * Responsibilities are intentionally narrow:
 *   - On every navigation to a *non-catalog* route, scroll the window to
 *     the top so users always start from the beginning of the new page.
 *   - On navigation *to* a catalog route, do nothing — the catalog page
 *     owns its own restore via the `catalog-restore` feature.
 *
 * Catalog scroll persistence used to live here; it now belongs to
 * `useCatalogTracking` so the entire restore lifecycle (filters, page,
 * scroll, last-clicked card) is co-located in one place.
 */
const ScrollRestoration = () => {
  const { pathname } = useLocation();
  const prevPathname = useRef(pathname);

  useEffect(() => {
    const prev = prevPathname.current;
    prevPathname.current = pathname;
    if (prev === pathname) return;

    // Catalog manages its own viewport — leave it alone.
    if (isCatalogRoute(pathname)) return;

    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

export default ScrollRestoration;
