import {
  Flame,
  Flower2,
  Sparkles,
  Gem,
  Lightbulb,
  Church,
  Droplet,
  Droplets,
  Trees,
  Cylinder,
  Box,
  Star,
  Heart,
  Leaf,
  Wind,
  Snowflake,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  Cake,
  Waves,
  Gift,
  Crown,
  Diamond,
  Lamp,
  LampDesk,
  Thermometer,
  Zap,
  Feather,
  Coffee,
  Home,
  Shell,
  Hourglass,
  Rainbow,
  Palette,
  Bath,
  Wine,
  CloudSnow,
  Package,
  type LucideIcon,
} from "lucide-react";

/**
 * Реестр доступных иконок для категорий каталога.
 *
 * Ключ (string) — то, что хранится в БД в `categories.icon`. Если
 * админ-пользователь явно выбрал иконку в админке, фронт сразу резолвит
 * её отсюда. Если поле пустое — используем эвристику по slug/name
 * (см. `PATTERNS` и `FALLBACK_POOL` ниже).
 *
 * При добавлении новой иконки: 1) импорт из lucide, 2) добавить запись
 * сюда. Удалять ключи опасно — могут быть продакшен-категории с такой
 * иконкой; вместо удаления оставляем запись или мигрируем.
 */
export const CATEGORY_ICONS = {
  flame: { Icon: Flame, label: "Огонь / чайные" },
  cylinder: { Icon: Cylinder, label: "Столб / цилиндр" },
  lamp: { Icon: Lamp, label: "Лампадки / фонарики" },
  lampdesk: { Icon: LampDesk, label: "Настольные / подсвечники" },
  lightbulb: { Icon: Lightbulb, label: "Столовая / светильник" },
  zap: { Icon: Zap, label: "Быстрое горение / партийные" },
  thermometer: { Icon: Thermometer, label: "Воск для нагрева / таялки" },
  hourglass: { Icon: Hourglass, label: "Длительного горения" },
  sparkles: { Icon: Sparkles, label: "Ароматические" },
  droplet: { Icon: Droplet, label: "Плавающие" },
  droplets: { Icon: Droplets, label: "SPA / ванные" },
  bath: { Icon: Bath, label: "Банные / релакс" },
  coffee: { Icon: Coffee, label: "Уютные / домашние" },
  home: { Icon: Home, label: "Интерьерные / декор" },
  gem: { Icon: Gem, label: "Декоративные" },
  palette: { Icon: Palette, label: "Цветные / коллекция" },
  rainbow: { Icon: Rainbow, label: "Яркие / разноцветные" },
  feather: { Icon: Feather, label: "Деликатные / лёгкий аромат" },
  church: { Icon: Church, label: "Церковные" },
  heart: { Icon: Heart, label: "Романтика" },
  wine: { Icon: Wine, label: "Винные вечера / ужин" },
  shell: { Icon: Shell, label: "Морские / прибрежные" },
  waves: { Icon: Waves, label: "Морские / океан" },
  leaf: { Icon: Leaf, label: "Натуральные / эко" },
  trees: { Icon: Trees, label: "Уличные / садовые" },
  flower: { Icon: Flower2, label: "Цветочные" },
  sun: { Icon: Sun, label: "Летние / яркие" },
  sunrise: { Icon: Sunrise, label: "Утренние / рассвет" },
  sunset: { Icon: Sunset, label: "Вечерние / закат" },
  moon: { Icon: Moon, label: "Ночные" },
  snowflake: { Icon: Snowflake, label: "Зимние / Новый год" },
  cloudsnow: { Icon: CloudSnow, label: "Зимние / снежные" },
  wind: { Icon: Wind, label: "Ветер / освежающие" },
  star: { Icon: Star, label: "Звёздные" },
  gift: { Icon: Gift, label: "Подарочные" },
  cake: { Icon: Cake, label: "Торты / праздничные" },
  crown: { Icon: Crown, label: "Премиум" },
  diamond: { Icon: Diamond, label: "Люкс" },
  package: { Icon: Package, label: "Оптовые наборы" },
  box: { Icon: Box, label: "Прочее / коробка" },
} as const satisfies Record<string, { Icon: LucideIcon; label: string }>;

export type CategoryIconKey = keyof typeof CATEGORY_ICONS;

/** Опции для admin UI — стабильный порядок по объявлению. */
export const CATEGORY_ICON_OPTIONS: Array<{
  key: CategoryIconKey;
  label: string;
  Icon: LucideIcon;
}> = (Object.keys(CATEGORY_ICONS) as CategoryIconKey[]).map((key) => ({
  key,
  label: CATEGORY_ICONS[key].label,
  Icon: CATEGORY_ICONS[key].Icon,
}));

/**
 * Эвристика на случай, если у категории не задан явный icon: матчим по
 * подстрокам в slug + name_ru + name_en. Порядок важен — более
 * специфичные паттерны должны идти выше.
 */
const PATTERNS: Array<{ keys: string[]; key: CategoryIconKey }> = [
  { keys: ["tealight", "чайн", "paraffin", "парафин"], key: "flame" },
  { keys: ["pillar", "столб", "колонн"], key: "cylinder" },
  { keys: ["lamp", "lantern", "фонар", "лампад"], key: "lamp" },
  { keys: ["taper", "столов", "обед", "ужин", "подсвечник"], key: "lampdesk" },
  { keys: ["party", "birthday", "торт", "праздн"], key: "cake" },
  { keys: ["sparkl", "aromat", "scented", "ароматич", "ароматн"], key: "sparkles" },
  { keys: ["melt", "wax melt", "таял", "нагрев"], key: "thermometer" },
  { keys: ["long", "slow", "длительн", "долгогор"], key: "hourglass" },
  { keys: ["spa", "ванн", "баня", "сауна"], key: "bath" },
  { keys: ["relax", "уют", "cozy", "home", "дом"], key: "coffee" },
  { keys: ["decor", "декор", "интерьер"], key: "home" },
  { keys: ["church", "церков", "храм", "венч"], key: "church" },
  { keys: ["floating", "плаваю", "вода"], key: "droplet" },
  { keys: ["romantic", "романтик", "love", "влюбл"], key: "heart" },
  { keys: ["wine", "dinner", "dine", "вечер", "ужин", "вино"], key: "wine" },
  { keys: ["outdoor", "garden", "улиц", "сад"], key: "trees" },
  { keys: ["sea", "ocean", "берег", "прибреж", "раков"], key: "shell" },
  { keys: ["wave", "волн", "морск"], key: "waves" },
  { keys: ["gift", "подар", "набор", "set"], key: "gift" },
  { keys: ["soy", "соев", "натурал", "eco", "эко", "бамбук"], key: "leaf" },
  { keys: ["flower", "цвет", "ваниль", "лаванд", "роз", "жасмин", "пион"], key: "flower" },
  { keys: ["color", "colour", "цветн", "яркий", "коллекц"], key: "palette" },
  { keys: ["winter", "xmas", "christmas", "зим", "новогод", "рождеств", "снег"], key: "snowflake" },
  { keys: ["summer", "лет", "жар"], key: "sun" },
  { keys: ["morning", "утр", "рассвет"], key: "sunrise" },
  { keys: ["evening", "закат", "вечерн"], key: "sunset" },
  { keys: ["night", "ночн"], key: "moon" },
  { keys: ["wind", "ветер", "обдув", "свеж"], key: "wind" },
  { keys: ["star", "звезд"], key: "star" },
  { keys: ["premium", "премиум", "vip"], key: "crown" },
  { keys: ["luxe", "luxury", "люкс", "элит"], key: "diamond" },
  { keys: ["wholesale", "bulk", "опт", "набор"], key: "package" },
];

// Пул иконок-fallback на случай, если ни паттерны не сработали, ни
// явная иконка не задана. Детерминированный хэш slug гарантирует, что
// одна и та же категория всегда получает одну и ту же иконку, но
// соседние карточки выглядят по-разному.
const FALLBACK_POOL: CategoryIconKey[] = [
  "flame",
  "sparkles",
  "lamp",
  "gem",
  "lightbulb",
  "star",
  "heart",
  "leaf",
  "flower",
  "cylinder",
  "coffee",
  "droplet",
  "box",
];

const hashString = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

/**
 * Резолвит иконку категории. Приоритет:
 *   1. Явный ключ `icon`, заданный в админке (если валидный).
 *   2. Эвристика по slug + name_ru + name_en.
 *   3. Детерминированный fallback из пула.
 */
export const getCategoryIcon = (
  slug?: string | null,
  nameRu?: string | null,
  nameEn?: string | null,
  icon?: string | null,
): LucideIcon => {
  if (icon && icon in CATEGORY_ICONS) {
    return CATEGORY_ICONS[icon as CategoryIconKey].Icon;
  }
  const haystack = `${slug ?? ""} ${nameRu ?? ""} ${nameEn ?? ""}`.toLowerCase();
  for (const { keys, key } of PATTERNS) {
    if (keys.some((k) => haystack.includes(k))) return CATEGORY_ICONS[key].Icon;
  }
  const seed = slug || nameRu || nameEn || "category";
  const fallbackKey = FALLBACK_POOL[hashString(seed) % FALLBACK_POOL.length];
  return CATEGORY_ICONS[fallbackKey].Icon;
};
