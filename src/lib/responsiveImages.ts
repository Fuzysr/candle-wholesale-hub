type ImageFormat = "webp" | "jpg";

const WIDTHS = [320, 640, 960, 1280] as const;

const optimizedUrl = (source: string, width: number, format: ImageFormat): string | null => {
  try {
    const url = new URL(source, window.location.origin);
    if (!url.pathname.includes("/uploads/product-images/")) return null;
    const marker = "/uploads/product-images/";
    const markerIndex = url.pathname.indexOf(marker);
    const key = url.pathname.slice(markerIndex + marker.length);
    if (!key || key.includes("/")) return null;
    // Pillow may not be built with AVIF support on every production image.
    // Keep those legacy files on the original URL instead of creating a
    // picture source that could fail before the fallback is considered.
    if (key.toLowerCase().endsWith(".avif")) return null;
    // Preserve a possible reverse-proxy prefix such as `/api` so this works
    // both with a direct backend origin and with the production `/api` route.
    const prefix = url.pathname.slice(0, markerIndex)
      || (url.origin === window.location.origin ? "/api" : "");
    const mediaPath = `${url.origin}${prefix}/media/product-images/${encodeURIComponent(key)}`;
    return `${mediaPath}?width=${width}&format=${format}`;
  } catch {
    return null;
  }
};

export type ResponsiveImageSources = {
  webp: string;
  jpeg: string;
};

/** Build srcset URLs only for backend-managed uploads. Static/mock images use src. */
export const getResponsiveImageSources = (source: string): ResponsiveImageSources | null => {
  const webp = WIDTHS.map((width) => optimizedUrl(source, width, "webp"));
  const jpeg = WIDTHS.map((width) => optimizedUrl(source, width, "jpg"));
  if (webp.some((url) => !url) || jpeg.some((url) => !url)) return null;
  return {
    webp: webp.map((url, index) => `${url} ${WIDTHS[index]}w`).join(", "),
    jpeg: jpeg.map((url, index) => `${url} ${WIDTHS[index]}w`).join(", "),
  };
};
