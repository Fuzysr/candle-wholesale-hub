import { describe, it, expect } from "vitest";
import { checkPassword, isPasswordValid, PASSWORD_MIN_LENGTH } from "@/lib/password";

describe("checkPassword", () => {
  it("all false for empty string", () => {
    const c = checkPassword("");
    expect(c.minLength).toBe(false);
    expect(c.hasUpper).toBe(false);
    expect(c.hasLower).toBe(false);
    expect(c.hasDigit).toBe(false);
  });

  it("detects uppercase", () => {
    expect(checkPassword("A").hasUpper).toBe(true);
    expect(checkPassword("a").hasUpper).toBe(false);
  });

  it("detects lowercase", () => {
    expect(checkPassword("a").hasLower).toBe(true);
    expect(checkPassword("A").hasLower).toBe(false);
  });

  it("detects digit", () => {
    expect(checkPassword("1").hasDigit).toBe(true);
    expect(checkPassword("a").hasDigit).toBe(false);
  });

  it("detects min length", () => {
    expect(checkPassword("a".repeat(PASSWORD_MIN_LENGTH)).minLength).toBe(true);
    expect(checkPassword("a".repeat(PASSWORD_MIN_LENGTH - 1)).minLength).toBe(false);
  });
});

describe("isPasswordValid", () => {
  it("accepts valid passwords", () => {
    expect(isPasswordValid("StrongPw1")).toBe(true);
    expect(isPasswordValid("MyP@ssw0rd")).toBe(true);
    expect(isPasswordValid("abcDEF123")).toBe(true);
  });

  it("rejects too short", () => {
    expect(isPasswordValid("Ab1xxxx")).toBe(false); // 7 chars
  });

  it("rejects no uppercase", () => {
    expect(isPasswordValid("alllower1")).toBe(false);
  });

  it("rejects no lowercase", () => {
    expect(isPasswordValid("ALLUPPER1")).toBe(false);
  });

  it("rejects no digit", () => {
    expect(isPasswordValid("NoDigitsHere")).toBe(false);
  });

  it("rejects all digits", () => {
    expect(isPasswordValid("12345678")).toBe(false);
  });
});
