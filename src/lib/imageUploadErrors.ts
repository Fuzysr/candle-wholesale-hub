import axios from "axios";
import { apiErrorMessage } from "@/lib/api";

export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

export const validateImageFile = (file: File): string | null => {
  if (file.size === 0) return "Файл пустой. Выберите другое изображение.";
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return "Неподдерживаемый формат. Загрузите JPG, PNG, WebP или AVIF.";
  }
  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    return "Файл слишком большой. Максимальный размер — 5 МБ.";
  }
  return null;
};

/** Converts upload/security errors into actionable messages without exposing backend internals. */
export const imageUploadErrorMessage = (error: unknown, fileName?: string): string => {
  const prefix = fileName ? `${fileName}: ` : "";
  const raw = apiErrorMessage(error, "").trim();
  const normalized = raw.toLowerCase();
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;

  if (normalized.includes("declared content-type") && normalized.includes("actual content")) {
    return `${prefix}расширение файла не совпадает с его содержимым. Пересохраните изображение как JPG, PNG, WebP или AVIF и загрузите снова.`;
  }
  if (normalized.includes("unsupported content type")) {
    return `${prefix}неподдерживаемый формат. Загрузите JPG, PNG, WebP или AVIF.`;
  }
  if (normalized.includes("file content does not match") || normalized.includes("supported image format")) {
    return `${prefix}файл повреждён или не является изображением. Пересохраните его и попробуйте снова.`;
  }
  if (normalized.includes("empty upload")) {
    return `${prefix}файл пустой. Выберите другое изображение.`;
  }
  if (status === 413 || normalized.includes("file too large")) {
    return `${prefix}файл слишком большой. Максимальный размер — 5 МБ.`;
  }
  if (status === 401) return `${prefix}сессия истекла. Войдите в админку снова.`;
  if (status === 403) return `${prefix}у вашей учётной записи нет прав на загрузку изображений.`;
  if (status && status >= 500) return `${prefix}сервер временно не может загрузить изображение. Попробуйте ещё раз позже.`;
  if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
    return `${prefix}загрузка заняла слишком много времени. Проверьте соединение и попробуйте снова.`;
  }
  if (axios.isAxiosError(error) && (!error.response || error.code === "ERR_NETWORK")) {
    return `${prefix}нет соединения с сервером. Проверьте интернет и повторите загрузку.`;
  }

  // Russian backend validation messages are already suitable for display.
  if (/[А-Яа-яЁё]/.test(raw)) return `${prefix}${raw}`;
  return `${prefix}не удалось загрузить изображение. Проверьте формат, размер файла и соединение.`;
};
