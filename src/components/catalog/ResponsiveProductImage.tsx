import type { CSSProperties } from "react";
import { getResponsiveImageSources } from "@/lib/responsiveImages";

type Props = {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  style?: CSSProperties;
  draggable?: boolean;
};

const ResponsiveProductImage = ({
  src,
  alt,
  className,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
  loading = "lazy",
  fetchPriority = "auto",
  style,
  draggable,
}: Props) => {
  const sources = getResponsiveImageSources(src);
  if (!sources) {
    return <img src={src} alt={alt} loading={loading} decoding="async" fetchPriority={fetchPriority} className={className} style={style} draggable={draggable} />;
  }

  return (
    <picture className="block h-full w-full">
      <source type="image/webp" srcSet={sources.webp} sizes={sizes} />
      <source type="image/jpeg" srcSet={sources.jpeg} sizes={sizes} />
      <img src={src} alt={alt} loading={loading} decoding="async" fetchPriority={fetchPriority} className={className} style={style} draggable={draggable} />
    </picture>
  );
};

export default ResponsiveProductImage;
