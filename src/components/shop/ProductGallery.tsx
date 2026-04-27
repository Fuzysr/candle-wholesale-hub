import { useState } from "react";
import { getProductImage } from "@/lib/productImages";

type Props = { images: string[]; alt: string };

const ProductGallery = ({ images, alt }: Props) => {
  const list = images.length ? images : [""];
  const [active, setActive] = useState(0);
  const current = list[active] ?? list[0];

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <img
          src={getProductImage(current)}
          alt={alt}
          className="aspect-square w-full object-cover"
        />
      </div>
      {list.length > 1 && (
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
          {list.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setActive(i)}
              className={`overflow-hidden rounded-md border bg-surface transition-colors ${
                i === active ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40"
              }`}
              aria-label={`Фото ${i + 1}`}
            >
              <img src={getProductImage(src)} alt="" className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductGallery;
