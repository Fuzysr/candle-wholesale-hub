import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { clearState } from "@/features/catalog-restore/storage";

const isCatalogRoute = (pathname: string): boolean =>
  pathname === "/catalog" || pathname.startsWith("/catalog/");

/**
 * Global route-level scroll behaviour.
 * Every navigation scrolls to top. Catalog restore snapshot is cleared
 * on entry so the restore hook doesn't fight.
 */
const ScrollRestoration = () => {
  const { pathname } = useLocation();
  const prevPathname = useRef(pathname);

  useEffect(() => {
    const prev = prevPathname.current;
    prevPathname.current = pathname;
    if (prev === pathname) return;

    if (isCatalogRoute(pathname)) {
      clearState();
    }

    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

export default ScrollRestoration;
