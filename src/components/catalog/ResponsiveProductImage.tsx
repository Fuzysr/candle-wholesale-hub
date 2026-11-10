import { useEffect, useState, type CSSProperties } from "react";
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
  const [useOriginal, setUseOriginal] = useState(false);
  const sources = getResponsiveImageSources(src);
  useEffect(() => setUseOriginal(false), [src]);

  const fallbackImage = (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      className={className}
      style={style}
      draggable={draggable}
    />
  );

  if (useOriginal) return fallbackImage;
  if (!sources) {
    return fallbackImage;
  }

  return (
    <picture className="block h-full w-full">
      <source type="image/webp" srcSet={sources.webp} sizes={sizes} />
      <source type="image/jpeg" srcSet={sources.jpeg} sizes={sizes} />
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        className={className}
        style={style}
        draggable={draggable}
        onError={() => setUseOriginal(true)}
      />
    </picture>
  );
};

export default ResponsiveProductImage;
