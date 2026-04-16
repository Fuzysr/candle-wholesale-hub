export type Currency = "RUB" | "USD";
export type Lang = "ru" | "en";

const RATES: Record<Currency, { symbol: string; locale: string }> = {
  RUB: { symbol: "₽", locale: "ru-RU" },
  USD: { symbol: "$", locale: "en-US" },
};

export const formatMoney = (value: number, currency: Currency = "RUB") => {
  const { symbol, locale } = RATES[currency];
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: currency === "USD" ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
  return currency === "USD" ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
};

export const formatNumber = (value: number) =>
  new Intl.NumberFormat("ru-RU").format(value);
