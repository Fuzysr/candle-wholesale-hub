/**
 * Client-side password validation — mirrors backend rules from
 * `backend/app/schemas/auth.py::_PASSWORD_RE`.
 *
 * Requirements:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 */

export type PasswordCheck = {
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasDigit: boolean;
};

export const PASSWORD_MIN_LENGTH = 8;

export const checkPassword = (pw: string): PasswordCheck => ({
  minLength: pw.length >= PASSWORD_MIN_LENGTH,
  hasUpper: /[A-Z]/.test(pw),
  hasLower: /[a-z]/.test(pw),
  hasDigit: /\d/.test(pw),
});

export const isPasswordValid = (pw: string): boolean => {
  const c = checkPassword(pw);
  return c.minLength && c.hasUpper && c.hasLower && c.hasDigit;
};

export const PASSWORD_RULES: { key: keyof PasswordCheck; label: string }[] = [
  { key: "minLength", label: "Минимум 8 символов" },
  { key: "hasUpper", label: "Заглавная буква (A-Z)" },
  { key: "hasLower", label: "Строчная буква (a-z)" },
  { key: "hasDigit", label: "Цифра (0-9)" },
];
