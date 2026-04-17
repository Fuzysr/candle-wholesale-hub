import pillarIvory from "@/assets/products/pillar-ivory.jpg";
import taperWhite from "@/assets/products/taper-white.jpg";
import tealight from "@/assets/products/tealight.jpg";
import jarAmber from "@/assets/products/jar-amber.jpg";
import sphere from "@/assets/products/sphere.jpg";
import floating from "@/assets/products/floating.jpg";

export const productImageMap: Record<string, string> = {
  "pillar-ivory": pillarIvory,
  "taper-white": taperWhite,
  tealight,
  "jar-amber": jarAmber,
  sphere,
  floating,
};

export const getProductImage = (key?: string | null): string => {
  if (!key) return pillarIvory;
  // Full URL (uploaded to Storage or external) — use as-is
  if (key.startsWith("http://") || key.startsWith("https://") || key.startsWith("/")) return key;
  // Otherwise treat as a static asset key
  return productImageMap[key] ?? pillarIvory;
};
