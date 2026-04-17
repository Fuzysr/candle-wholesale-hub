import { useRef, useState } from "react";
import { Upload, X, Loader2, ArrowUp, ArrowDown, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiErrorMessage, uploadsApi } from "@/lib/api";
import { toast } from "sonner";

export type GalleryImage = {
  id?: string;            // db id (existing) — undefined for new
  url: string;
  sort_order: number;
};

type Props = {
  value: GalleryImage[];
  onChange: (next: GalleryImage[]) => void;
};

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

const MultiImageUpload = ({ value, onChange }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const sorted = [...value].sort((a, b) => a.sort_order - b.sort_order);

  const reorder = (next: GalleryImage[]) =>
    onChange(next.map((img, i) => ({ ...img, sort_order: i })));

  const handleFiles = async (files: FileList) => {
    setUploading(true);
    try {
      const uploaded: GalleryImage[] = [];
      for (const file of Array.from(files)) {
        if (!ALLOWED.includes(file.type)) { toast.error(`${file.name}: неверный формат`); continue; }
        if (file.size > MAX_SIZE) { toast.error(`${file.name}: больше 5 МБ`); continue; }
        try {
          const { url } = await uploadsApi.uploadProductImage(file);
          uploaded.push({ url, sort_order: 0 });
        } catch (err) {
          toast.error(apiErrorMessage(err, `${file.name}: ошибка загрузки`));
        }
      }
      if (uploaded.length) {
        reorder([...sorted, ...uploaded]);
        toast.success(`Загружено: ${uploaded.length}`);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...sorted];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    reorder(next);
  };

  const remove = async (idx: number) => {
    const img = sorted[idx];
    if (img.url.startsWith("http")) {
      try {
        await uploadsApi.delete(img.url);
      } catch {
        /* ignore — image may be external */
      }
    }
    reorder(sorted.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Галерея ({sorted.length})
        </span>
        <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Добавить фото
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED.join(",")}
        className="hidden"
        onChange={(e) => e.target.files && e.target.files.length && handleFiles(e.target.files)}
      />
      {sorted.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          Нет фото. Первое загруженное будет главным.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {sorted.map((img, i) => (
            <div key={img.id ?? img.url} className="group relative overflow-hidden rounded-md border border-border bg-muted">
              <img src={img.url} alt="" className="aspect-square w-full object-cover" />
              {i === 0 && (
                <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-sm bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary-foreground">
                  <Star className="h-2.5 w-2.5" /> главное
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-background/85 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex gap-0.5">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-sm p-1 hover:bg-accent disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                  <button type="button" onClick={() => move(i, +1)} disabled={i === sorted.length - 1} className="rounded-sm p-1 hover:bg-accent disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                </div>
                <button type="button" onClick={() => remove(i)} className="rounded-sm p-1 text-destructive hover:bg-destructive/10"><X className="h-3 w-3" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">JPG / PNG / WebP, до 5 МБ. Перетаскивание стрелками — первое фото главное.</p>
    </div>
  );
};

export default MultiImageUpload;
