import { test, expect } from "@playwright/test";

test.describe("Навигация по публичным страницам", () => {
  test("главная → каталог", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const catalogLink = page.getByRole("link", { name: /каталог|catalog/i }).first();
    if (await catalogLink.count() > 0) {
      await catalogLink.click();
      await expect(page).toHaveURL(/\/catalog/);
    }
  });

  test("контакты загружаются", async ({ page }) => {
    await page.goto("/contacts");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
  });

  test("условия опта загружаются", async ({ page }) => {
    await page.goto("/wholesale-terms");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
  });

  test("галерея загружается", async ({ page }) => {
    await page.goto("/gallery");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
  });

  test("404 для несуществующей страницы", async ({ page }) => {
    await page.goto("/this-does-not-exist-12345");
    await page.waitForLoadState("networkidle");
    // Должна быть страница NotFound — ищем текст 404 или "не найдена"
    const notFound = page.getByText(/404|не найден|not found/i);
    await expect(notFound.first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Защищённые маршруты", () => {
  test("/account без токена показывает auth-gate или редиректит", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());

    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    // Должен либо редирект на /auth, либо показать форму логина/регистрации
    const url = page.url();
    const hasAuth = url.includes("/auth");
    const loginText = page.getByText(/войти|вход|регистрация|авторизуйтесь/i);

    expect(hasAuth || (await loginText.count()) > 0).toBeTruthy();
  });

  test("/admin без токена показывает ошибку или редиректит", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());

    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    const hasAuth = url.includes("/auth");
    const forbidden = page.getByText(
      /404|не найден|not found|доступ|запрещ|forbidden|войти|вход/i,
    );

    expect(hasAuth || (await forbidden.count()) > 0).toBeTruthy();
  });
});

test.describe("Security headers (через API)", () => {
  test("API возвращает security headers", async ({ request }) => {
    const resp = await request.get("http://localhost:8000/health");
    expect(resp.status()).toBe(200);

    const headers = resp.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
  });
});
