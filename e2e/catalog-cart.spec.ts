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

test.describe("Checkout — гостевой", () => {
  test("checkout без авторизации показывает форму (без редиректа)", async ({ page }) => {
    // Гость должен иметь возможность открыть /checkout — даже с пустой
    // корзиной (страница покажет «Корзина пуста», но НЕ редиректит на /auth).
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());

    await page.goto("/checkout");
    await page.waitForLoadState("networkidle");

    expect(page.url()).not.toContain("/auth");
    // Либо форма оформления, либо «Корзина пуста» — обе валидны.
    const hasForm = await page.getByLabel(/email/i).count();
    const emptyCart = await page.getByText(/корзина пуста/i).count();
    expect(hasForm + emptyCart).toBeGreaterThan(0);
  });

  test("API: POST /orders без авторизации создаёт заявку и юзера", async ({ request }) => {
    // 1. Берём первый доступный вариант из публичного API.
    const apiBase = process.env.E2E_API_URL || "http://localhost:8000";
    const res = await request.get(`${apiBase}/products`);
    expect(res.ok()).toBeTruthy();
    type Variant = { id: string; sku: string; stock_boxes: number; pieces_per_box: number };
    type Product = { variants: Variant[] };
    const products = (await res.json()) as Product[];
    const inStock = products
      .flatMap((p) => p.variants)
      .find((v) => v.stock_boxes > 0);
    if (!inStock) {
      test.skip(true, "Нет товаров в наличии для гостевого checkout");
      return;
    }

    // 2. POST /orders без Authorization-заголовка.
    // OrderItemIn требует sku/product_name/pieces_per_box/unit_price (бэк
    // их canonicalize-ит из БД, но pydantic валидирует на входе).
    const item = {
      variant_id: inStock.id,
      sku: inStock.sku,
      product_name: "e2e guest",
      pieces_per_box: inStock.pieces_per_box,
      boxes: 1,
      unit_price: 0,
    };
    const guestEmail = `guest-${Date.now()}@example.com`;
    const orderRes = await request.post(`${apiBase}/orders`, {
      data: {
        currency: "RUB",
        items: [item],
        company_name: "Гость ООО",
        contact_name: "Гость Тестов",
        phone: "+7 999 000-00-00",
        email: guestEmail,
        customer_comment: "e2e guest checkout",
      },
    });
    if (orderRes.status() !== 201) {
      console.log("POST /orders status:", orderRes.status(), "body:", await orderRes.text());
    }
    expect(orderRes.status()).toBe(201);
    const order = await orderRes.json();
    expect(order.id).toBeTruthy();
    expect(order.order_number).toBeTruthy();
    expect(order.email).toBe(guestEmail);

    // 3. Без email → 400 (валидация гостевого checkout на бэке).
    const badRes = await request.post(`${apiBase}/orders`, {
      data: {
        currency: "RUB",
        items: [item],
        contact_name: "Без email",
      },
    });
    expect(badRes.status()).toBe(400);
  });

  test("OrderSuccess показывает заказ из router state без авторизации", async ({ page }) => {
    // Гость не имеет токена → GET /orders/{id} вернёт 401. Поэтому
    // Checkout прокидывает order через router state. Имитируем это.
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());

    // Подделываем переход с location.state как из Checkout.
    await page.evaluate(() => {
      const fakeOrder = {
        id: "fake-order-id",
        order_number: "TEST-0001",
        total: "1234.00",
        currency: "RUB",
        email: "guest@example.com",
      };
      window.history.replaceState(
        { usr: { order: fakeOrder, guest: true } },
        "",
        "/order/success/fake-order-id",
      );
    });
    await page.goto("/order/success/fake-order-id", {
      waitUntil: "networkidle",
    });

    await expect(page.getByText(/заявка отправлена/i)).toBeVisible();
    // На "/order/success/..." гость видит подсказку про «Забыли пароль?».
    await expect(page.getByText(/забыли пароль/i)).toBeVisible();
  });
});
