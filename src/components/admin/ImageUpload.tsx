import { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadsApi } from "@/lib/api";
import {
  ALLOWED_IMAGE_TYPES,
  imageUploadErrorMessage,
  validateImageFile,
} from "@/lib/imageUploadErrors";
import { getProductImage } from "@/lib/productImages";
import { toast } from "sonner";

type Props = {
  value: string | null;
  onChange: (url: string | null) => void;
  /** Which bucket to upload into. Defaults to product images. */
  kind?: "product" | "company";
};

const ImageUpload = ({ value, onChange, kind = "product" }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const preview = value ? (value.startsWith("http") ? value : getProductImage(value)) : null;

  const upload = (file: File) =>
    kind === "company" ? uploadsApi.uploadCompanyAsset(file) : uploadsApi.uploadProductImage(file);

  const handleFile = async (file: File) => {
    const validationError = validateImageFile(file);
    if (validationError) return toast.error(validationError);
    setUploading(true);
    try {
      const { url } = await upload(file);
      onChange(url);
      toast.success("Изображение загружено");
    } catch (err) {
      toast.error(imageUploadErrorMessage(err, file.name));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (value && value.startsWith("http")) {
      try {
        await uploadsApi.delete(value);
      } catch {
        /* file may live outside our buckets — ignore */
      }
    }
    onChange(null);
  };

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden space-y-2">
      <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Изображение товара
      </span>
      <div className="flex items-start gap-3">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          {preview ? (
            <img src={preview} alt="preview" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-muted-foreground">
              нет фото
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-3.5 w-3.5" />
              {value ? "Заменить" : "Загрузить"}
            </Button>
            {value && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRemove}
                disabled={uploading}
                className="text-destructive hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" /> Удалить
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            JPG / PNG / WebP, до 5 МБ. Квадрат 1:1 рекомендуется.
          </p>
          {value && (
            <p className="w-full truncate text-[11px] text-muted-foreground" title={value}>
              {value}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageUpload;
