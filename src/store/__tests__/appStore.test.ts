import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store/appStore";

beforeEach(() => {
  useAppStore.setState({ currency: "RUB", lang: "ru" });
});

describe("appStore", () => {
  it("defaults to RUB and ru", () => {
    const { currency, lang } = useAppStore.getState();
    expect(currency).toBe("RUB");
    expect(lang).toBe("ru");
  });

  it("setCurrency updates currency", () => {
    useAppStore.getState().setCurrency("USD");
    expect(useAppStore.getState().currency).toBe("USD");
  });

  it("setLang updates lang", () => {
    useAppStore.getState().setLang("en");
    expect(useAppStore.getState().lang).toBe("en");
  });

  it("setCurrency does not affect lang", () => {
    useAppStore.getState().setLang("en");
    useAppStore.getState().setCurrency("USD");
    expect(useAppStore.getState().lang).toBe("en");
  });

  it("setLang does not affect currency", () => {
    useAppStore.getState().setCurrency("USD");
    useAppStore.getState().setLang("en");
    expect(useAppStore.getState().currency).toBe("USD");
  });
});
