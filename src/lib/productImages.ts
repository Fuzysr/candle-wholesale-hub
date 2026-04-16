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
  return productImageMap[key] ?? pillarIvory;
};
