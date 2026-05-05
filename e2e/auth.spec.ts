import { test, expect } from "@playwright/test";

// Уникальный email для каждого прогона
const uniqueEmail = () => `e2e-${Date.now()}@test.local`;

test.describe("Регистрация", () => {
  test("успешная регистрация с валидными данными", async ({ page }) => {
    const email = uniqueEmail();
    await page.goto("/auth");

    // Переключаемся на регистрацию (по умолчанию уже register)
    await expect(page.getByRole("heading", { name: /регистрация/i })).toBeVisible();

    await page.getByLabel(/название компании/i).fill("E2E Test Co");
    await page.getByLabel(/контактное лицо/i).fill("Тест Тестов");
    await page.getByLabel(/телефон/i).fill("+79991234567");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/пароль/i).fill("StrongPw1");

    // Индикатор силы пароля должен показать все зелёные
    await expect(page.getByText("Минимум 8 символов")).toBeVisible();

    await page.getByRole("button", { name: /создать аккаунт/i }).click();

    // После успешной регистрации редирект на /account
    await expect(page).toHaveURL(/\/account/, { timeout: 10_000 });
  });

  test("отклоняет слабый пароль (только строчные)", async ({ page }) => {
    await page.goto("/auth");

    await page.getByLabel(/название компании/i).fill("Weak Co");
    await page.getByLabel(/контактное лицо/i).fill("Тест");
    await page.getByLabel(/телефон/i).fill("+79990000000");
    await page.getByLabel(/email/i).fill(uniqueEmail());
    await page.getByLabel(/пароль/i).fill("weakpassword1");

    await page.getByRole("button", { name: /создать аккаунт/i }).click();

    // Должен показать toast с ошибкой, НЕ редирект
    await expect(page.getByText(/требованиям безопасности/i)).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/auth/);
  });

  test("отклоняет пароль без цифр", async ({ page }) => {
    await page.goto("/auth");

    await page.getByLabel(/название компании/i).fill("NoDig Co");
    await page.getByLabel(/контактное лицо/i).fill("Тест");
    await page.getByLabel(/телефон/i).fill("+79990000000");
    await page.getByLabel(/email/i).fill(uniqueEmail());
    await page.getByLabel(/пароль/i).fill("NoDigitsHere");

    await page.getByRole("button", { name: /создать аккаунт/i }).click();

    await expect(page.getByText(/требованиям безопасности/i)).toBeVisible({ timeout: 5_000 });
  });

  test("показывает 409 при повторной регистрации", async ({ page }) => {
    const email = uniqueEmail();

    // Первая регистрация
    await page.goto("/auth");
    await page.getByLabel(/название компании/i).fill("Dup Co");
    await page.getByLabel(/контактное лицо/i).fill("Тест");
    await page.getByLabel(/телефон/i).fill("+79990000000");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/пароль/i).fill("StrongPw1");
    await page.getByRole("button", { name: /создать аккаунт/i }).click();
    await expect(page).toHaveURL(/\/account/, { timeout: 10_000 });

    // Чистим localStorage и пробуем ту же почту
    await page.evaluate(() => localStorage.clear());
    await page.goto("/auth");
    await page.getByLabel(/название компании/i).fill("Dup Co 2");
    await page.getByLabel(/контактное лицо/i).fill("Тест 2");
    await page.getByLabel(/телефон/i).fill("+79990000001");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/пароль/i).fill("StrongPw1");
    await page.getByRole("button", { name: /создать аккаунт/i }).click();

    // Должна быть ошибка — email занят
    await expect(page.getByText(/already registered|уже зарегистрирован/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Логин", () => {
  const email = `login-${Date.now()}@test.local`;
  const password = "LoginTest1";

  test.beforeAll(async ({ browser }) => {
    // Регистрируем пользователя через API
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/auth");
    await page.getByLabel(/название компании/i).fill("Login Co");
    await page.getByLabel(/контактное лицо/i).fill("Login User");
    await page.getByLabel(/телефон/i).fill("+79990000000");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/пароль/i).fill(password);
    await page.getByRole("button", { name: /создать аккаунт/i }).click();
    await expect(page).toHaveURL(/\/account/, { timeout: 10_000 });
    await ctx.close();
  });

  test("успешный логин с правильными данными", async ({ page }) => {
    await page.goto("/auth");

    // Переключаемся на логин
    await page.getByRole("button", { name: /войти$/i }).click();
    await expect(page.getByRole("heading", { name: /вход в кабинет/i })).toBeVisible();

    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/пароль/i).fill(password);
    await page.getByRole("button", { name: /^войти$/i }).click();

    await expect(page).toHaveURL(/\/account/, { timeout: 10_000 });
  });

  test("отклоняет неправильный пароль", async ({ page }) => {
    await page.goto("/auth");
    await page.getByRole("button", { name: /войти$/i }).click();

    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/пароль/i).fill("WrongPassword1");
    await page.getByRole("button", { name: /^войти$/i }).click();

    // Должна быть ошибка
    await expect(page.getByText(/invalid|неверн|ошибка/i)).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/auth/);
  });
});

test.describe("Логаут", () => {
  test("выход из аккаунта очищает сессию", async ({ page }) => {
    // Устанавливаем desktop viewport — UserMenu скрыт на мобильных
    await page.setViewportSize({ width: 1280, height: 800 });

    const email = uniqueEmail();

    // Регистрация
    await page.goto("/auth");
    await page.getByLabel(/название компании/i).fill("Logout Co");
    await page.getByLabel(/контактное лицо/i).fill("Тест");
    await page.getByLabel(/телефон/i).fill("+79990000000");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/пароль/i).fill("LogoutTest1");
    await page.getByRole("button", { name: /создать аккаунт/i }).click();
    await expect(page).toHaveURL(/\/account/, { timeout: 10_000 });

    // UserMenu trigger имеет aria-label="Кабинет"
    const userMenuBtn = page.getByRole("button", { name: /кабинет/i });
    await expect(userMenuBtn).toBeVisible({ timeout: 5_000 });
    await userMenuBtn.click();

    // В dropdown ищем «Выйти»
    const logoutBtn = page.getByRole("menuitem", { name: /выйти/i });
    await expect(logoutBtn).toBeVisible({ timeout: 3_000 });
    await logoutBtn.click();

    // После выхода — редирект на главную
    await expect(page).toHaveURL("/", { timeout: 5_000 });

    // Проверяем, что токены удалены
    const hasToken = await page.evaluate(() => !!localStorage.getItem("cwh:access"));
    expect(hasToken).toBe(false);
  });
});

test.describe("Забыли пароль", () => {
  test("отправка формы восстановления пароля", async ({ page }) => {
    await page.goto("/auth");

    // Переключаемся на логин, потом на забыли пароль
    await page.getByRole("button", { name: /войти$/i }).click();
    await page.getByText(/забыли пароль/i).click();

    await expect(page.getByRole("heading", { name: /восстановление/i })).toBeVisible();

    await page.getByLabel(/email/i).fill("test@example.com");
    await page.getByRole("button", { name: /отправить/i }).click();

    // Всегда показывает одно и то же сообщение (anti-enumeration)
    await expect(page.getByText(/если такой email|письмо/i)).toBeVisible({ timeout: 5_000 });
  });
});
