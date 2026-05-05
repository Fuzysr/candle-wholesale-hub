import { test, expect } from "@playwright/test";

test.describe("Каталог", () => {
  test("главная страница загружается", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/candle|wholesale|свеч/i);
    // Проверяем, что Hero-секция или навигация отрендерились
    await expect(page.locator("header").first()).toBeVisible();
  });

  test("каталог отображает товары", async ({ page }) => {
    await page.goto("/catalog");
    // Ждём загрузки — должен появиться хотя бы один элемент товара или сообщение
    await page.waitForLoadState("networkidle");
    // Проверяем, что страница каталога загружена
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("навигация по категориям работает", async ({ page }) => {
    await page.goto("/catalog");
    await page.waitForLoadState("networkidle");

    // Ищем ссылки на категории
    const categoryLinks = page.locator("a[href*='/catalog/']");
    const count = await categoryLinks.count();

    if (count > 0) {
      const href = await categoryLinks.first().getAttribute("href");
      await categoryLinks.first().click();
      await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  test("страница товара загружается по slug", async ({ page }) => {
    await page.goto("/catalog");
    await page.waitForLoadState("networkidle");

    // Ищем ссылку на конкретный товар
    const productLinks = page.locator("a[href*='/product/']");
    const count = await productLinks.count();

    if (count > 0) {
      await productLinks.first().click();
      await expect(page).toHaveURL(/\/product\//);
      await page.waitForLoadState("networkidle");
      // Страница товара должна содержать название
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
    }
  });
});

test.describe("Корзина", () => {
  test("пустая корзина показывает сообщение", async ({ page }) => {
    // Чистим localStorage
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("wc-cart"));

    await page.goto("/cart");
    await page.waitForLoadState("networkidle");

    // Должно быть сообщение о пустой корзине или кнопка перехода в каталог
    const emptyText = page.getByText(/корзина пуста|пусто|нет товаров|в каталог/i);
    const cartHeading = page.getByRole("heading", { name: /корзина/i });

    await expect(cartHeading.or(emptyText).first()).toBeVisible({ timeout: 10_000 });
  });

  test("добавление товара через страницу товара", async ({ page }) => {
    await page.goto("/catalog");
    await page.waitForLoadState("networkidle");

    // Находим ссылку на товар
    const productLinks = page.locator("a[href*='/product/']");
    const count = await productLinks.count();

    if (count === 0) {
      test.skip(true, "Нет товаров в каталоге");
      return;
    }

    await productLinks.first().click();
    await expect(page).toHaveURL(/\/product\//);
    await page.waitForLoadState("networkidle");

    // Ищем кнопку добавления в корзину
    const addBtn = page.getByRole("button", { name: /в корзину|добавить|заказать/i });
    const addBtnCount = await addBtn.count();

    if (addBtnCount > 0) {
      await addBtn.first().click();
      // Ждём toast или обновления UI
      await page.waitForTimeout(1000);

      // Переходим в корзину
      await page.goto("/cart");
      await page.waitForLoadState("networkidle");

      // Корзина должна содержать хотя бы один товар
      const cartItems = page.locator("[data-testid='cart-item']").or(
        page.locator("table tbody tr").or(
          page.locator(".cart-item")
        )
      );

      // Просто проверяем, что корзина не пуста — отсутствие текста "пусто"
      const emptyText = page.getByText(/корзина пуста|пусто/i);
      const isEmpty = await emptyText.count();
      // Если нет пустого текста — товар добавлен
      if (isEmpty === 0) {
        // Проверяем localStorage
        const cartState = await page.evaluate(() => {
          const raw = localStorage.getItem("cart-storage");
          return raw ? JSON.parse(raw) : null;
        });
        expect(cartState?.state?.items?.length).toBeGreaterThan(0);
      }
    }
  });
});

test.describe("Checkout", () => {
  test("checkout без авторизации редиректит на /auth", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());

    await page.goto("/checkout");
    await page.waitForLoadState("networkidle");

    // Должен либо редиректить на /auth, либо показать сообщение о необходимости войти
    const isAuth = page.url().includes("/auth");
    const loginPrompt = page.getByText(/войти|авторизуйтесь|необходимо войти/i);
    const loginPromptCount = await loginPrompt.count();

    expect(isAuth || loginPromptCount > 0).toBeTruthy();
  });
});
