// Счёт-договор рендерится как HTML и печатается через диалог браузера —
// это даёт идеальную поддержку кириллицы (системные шрифты) и качественный
// внешний вид, а пользователь может сохранить результат как PDF.

export type InvoiceCompany = {
  legal_name: string;
  short_name: string;
  inn: string;
  kpp: string;
  ogrn: string;
  legal_address: string;
  postal_address: string;
  bank_name: string;
  bank_bik: string;
  bank_account: string;
  corr_account: string;
  director_name: string;
  director_position: string;
  phone: string;
  email: string;
  offer_text: string;
  payment_terms: string;
  delivery_terms: string;
};

export type InvoiceCustomer = {
  company_name: string | null;
  contact_name: string | null;
  inn: string | null;
  email: string | null;
  phone: string | null;
};

export type InvoiceOrder = {
  order_number: string;
  created_at: string;
  currency: string;
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  total: number;
  total_boxes: number;
  customer_comment: string | null;
};

export type InvoiceItem = {
  sku: string;
  product_name: string;
  variant_label: string | null;
  pieces_per_box: number;
  boxes: number;
  unit_price: number; // per piece
  line_total: number;
};

const fmtMoney = (n: number, currency: string) =>
  new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(n)) + " " + (currency === "USD" ? "$" : "₽");

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

const escapeHtml = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const nl2br = (s: string | null | undefined) => escapeHtml(s).replace(/\n/g, "<br/>");

// Сумма прописью (рубли + копейки)
const amountInWords = (value: number, currency: string): string => {
  const units0 = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const units1 = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

  const triadToWords = (n: number, female: boolean): string => {
    const out: string[] = [];
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;
    if (h) out.push(hundreds[h]);
    if (t === 1) out.push(teens[u]);
    else {
      if (t) out.push(tens[t]);
      if (u) out.push(female ? units1[u] : units0[u]);
    }
    return out.join(" ");
  };

  const pluralRu = (n: number, forms: [string, string, string]) => {
    const m100 = n % 100;
    const m10 = n % 10;
    if (m100 >= 11 && m100 <= 14) return forms[2];
    if (m10 === 1) return forms[0];
    if (m10 >= 2 && m10 <= 4) return forms[1];
    return forms[2];
  };

  const rub = Math.floor(value);
  const kop = Math.round((value - rub) * 100);

  const billions = Math.floor(rub / 1_000_000_000);
  const millions = Math.floor((rub % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((rub % 1_000_000) / 1_000);
  const ones = rub % 1_000;

  const parts: string[] = [];
  if (billions) parts.push(`${triadToWords(billions, false)} ${pluralRu(billions, ["миллиард", "миллиарда", "миллиардов"])}`);
  if (millions) parts.push(`${triadToWords(millions, false)} ${pluralRu(millions, ["миллион", "миллиона", "миллионов"])}`);
  if (thousands) parts.push(`${triadToWords(thousands, true)} ${pluralRu(thousands, ["тысяча", "тысячи", "тысяч"])}`);
  if (ones || parts.length === 0) parts.push(triadToWords(ones, false) || "ноль");

  const wholeWords = parts.join(" ").trim().replace(/\s+/g, " ");
  const capitalized = wholeWords.charAt(0).toUpperCase() + wholeWords.slice(1);

  if (currency === "USD") {
    return `${capitalized} долл. ${String(kop).padStart(2, "0")} цент.`;
  }
  const rubWord = pluralRu(rub, ["рубль", "рубля", "рублей"]);
  return `${capitalized} ${rubWord} ${String(kop).padStart(2, "0")} коп.`;
};

const buildInvoiceHtml = (
  company: InvoiceCompany,
  customer: InvoiceCustomer,
  order: InvoiceOrder,
  items: InvoiceItem[],
): string => {
  const totalPositions = items.length;

  const itemsRows = items.map((it, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td>
        <div class="sku">${escapeHtml(it.sku)}</div>
        <div class="pname">${escapeHtml(it.product_name)}${it.variant_label ? ` · ${escapeHtml(it.variant_label)}` : ""}</div>
      </td>
      <td class="num">${it.pieces_per_box}</td>
      <td class="num">${it.boxes}</td>
      <td class="num">${escapeHtml(fmtMoney(it.unit_price, order.currency))}</td>
      <td class="num strong">${escapeHtml(fmtMoney(it.line_total, order.currency))}</td>
    </tr>`).join("");

  type Row = [string, string];
  const sellerRows: Row[] = ([
    ["Получатель", company.legal_name || ""],
    ["ИНН", company.inn || ""],
    ["КПП", company.kpp || ""],
    company.ogrn ? ["ОГРН", company.ogrn] : null,
    company.legal_address ? ["Юр. адрес", company.legal_address] : null,
    company.postal_address ? ["Почт. адрес", company.postal_address] : null,
    ["Банк", company.bank_name || ""],
    ["БИК", company.bank_bik || ""],
    ["Р/счёт", company.bank_account || ""],
    ["К/счёт", company.corr_account || ""],
    ["Телефон", company.phone || ""],
    ["E-mail", company.email || ""],
  ] as Array<Row | null>).filter((r): r is Row => !!r && !!r[1]);

  const buyerRows: Row[] = ([
    ["Покупатель", customer.company_name || "—"],
    customer.inn ? ["ИНН", customer.inn] : null,
    customer.contact_name ? ["Контактное лицо", customer.contact_name] : null,
    customer.phone ? ["Телефон", customer.phone] : null,
    customer.email ? ["E-mail", customer.email] : null,
  ] as Array<Row | null>).filter((r): r is Row => !!r && !!r[1]);

  const renderRows = (rows: Array<[string, string]>) =>
    rows.map(([k, v]) => `<tr><td class="k">${escapeHtml(k)}</td><td class="v">${escapeHtml(v)}</td></tr>`).join("");

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>Счёт-договор № ${escapeHtml(order.order_number)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Inter', 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
    font-size: 11px;
    color: #0f172a;
    background: #f8fafc;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    max-width: 210mm;
    margin: 0 auto;
    padding: 14mm;
    background: #fff;
  }
  @media print {
    body { background: #fff; }
    .page { padding: 0; max-width: none; }
    .no-print { display: none !important; }
  }
  .toolbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; gap: 8px; justify-content: flex-end;
    padding: 10px 14px; background: #0f172a; color: #fff;
  }
  .toolbar button {
    background: #f59e0b; color: #0f172a; border: 0;
    padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer;
    font-family: inherit; font-size: 12px;
  }
  .toolbar button.secondary { background: #475569; color: #fff; }
  .toolbar button:hover { filter: brightness(1.05); }
  header.head {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px;
  }
  .head h1 {
    font-size: 22px; margin: 0 0 4px 0; letter-spacing: -0.01em;
  }
  .head .sub { color: #475569; font-size: 11px; }
  .brand {
    text-align: right;
  }
  .brand .name { font-weight: 700; font-size: 13px; }
  .brand .meta { color: #64748b; font-size: 10px; line-height: 1.45; }
  .parties {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
    margin-bottom: 14px;
  }
  .party {
    border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; background: #f8fafc;
  }
  .party h3 {
    margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.06em; color: #64748b; font-weight: 600;
  }
  .party table { width: 100%; border-collapse: collapse; }
  .party td { padding: 2px 0; vertical-align: top; font-size: 10.5px; }
  .party td.k { color: #64748b; width: 38%; padding-right: 8px; }
  .party td.v { color: #0f172a; font-weight: 500; word-break: break-word; }

  table.items {
    width: 100%; border-collapse: collapse; margin-bottom: 10px;
    font-size: 10.5px;
  }
  table.items thead th {
    background: #0f172a; color: #fff; text-align: left;
    padding: 8px 8px; font-weight: 600; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  table.items thead th.num { text-align: right; }
  table.items tbody td {
    padding: 8px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top;
  }
  table.items tbody tr:nth-child(even) td { background: #f8fafc; }
  table.items td.num { text-align: right; white-space: nowrap; }
  table.items td.strong { font-weight: 700; }
  table.items .sku { font-family: 'JetBrains Mono', 'Consolas', monospace; font-size: 9.5px; color: #64748b; }
  table.items .pname { margin-top: 2px; }

  .totals {
    display: flex; justify-content: flex-end; margin-bottom: 16px;
  }
  .totals table { border-collapse: collapse; min-width: 280px; }
  .totals td { padding: 5px 10px; font-size: 11px; }
  .totals td.k { color: #475569; text-align: right; }
  .totals td.v { text-align: right; font-weight: 600; white-space: nowrap; }
  .totals tr.grand td { font-size: 14px; padding-top: 10px; border-top: 2px solid #0f172a; }
  .totals tr.grand td.v { color: #0f172a; font-weight: 800; }

  .summary-line {
    margin: 8px 0 16px 0; padding: 10px 12px;
    border: 1px dashed #cbd5e1; border-radius: 6px;
    background: #fffbeb; font-size: 11px;
  }
  .summary-line .lbl { color: #64748b; }
  .summary-line .val { font-weight: 700; }

  .block { margin-bottom: 12px; page-break-inside: avoid; }
  .block h4 {
    margin: 0 0 4px 0; font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.04em; color: #475569; font-weight: 600;
  }
  .block .body { font-size: 10.5px; line-height: 1.5; color: #0f172a; white-space: pre-wrap; }

  .signs {
    display: grid; grid-template-columns: 1fr 1fr; gap: 24px;
    margin-top: 28px; page-break-inside: avoid;
  }
  .sign .role { font-size: 10px; color: #64748b; margin-bottom: 26px; }
  .sign .line { border-bottom: 1px solid #0f172a; height: 1px; margin-bottom: 4px; }
  .sign .name { font-size: 11px; font-weight: 600; }
  .sign .hint { font-size: 9px; color: #94a3b8; }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">Печать / Сохранить PDF</button>
    <button class="secondary" onclick="window.close()">Закрыть</button>
  </div>
  <div class="page">
    <header class="head">
      <div>
        <h1>Счёт-договор № ${escapeHtml(order.order_number)}</h1>
        <div class="sub">от ${escapeHtml(fmtDate(order.created_at))}</div>
      </div>
      <div class="brand">
        <div class="name">${escapeHtml(company.short_name || company.legal_name || "")}</div>
        <div class="meta">
          ${company.phone ? `тел.: ${escapeHtml(company.phone)}<br/>` : ""}
          ${company.email ? `e-mail: ${escapeHtml(company.email)}` : ""}
        </div>
      </div>
    </header>

    <section class="parties">
      <div class="party">
        <h3>Поставщик</h3>
        <table>${renderRows(sellerRows)}</table>
      </div>
      <div class="party">
        <h3>Покупатель</h3>
        <table>${renderRows(buyerRows)}</table>
      </div>
    </section>

    <table class="items">
      <thead>
        <tr>
          <th style="width:28px;">№</th>
          <th>Артикул / товар</th>
          <th class="num" style="width:70px;">Шт./кор.</th>
          <th class="num" style="width:60px;">Кор.</th>
          <th class="num" style="width:100px;">Цена за шт.</th>
          <th class="num" style="width:110px;">Сумма</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>

    <div class="totals">
      <table>
        <tr><td class="k">Позиций:</td><td class="v">${totalPositions}</td></tr>
        <tr><td class="k">Всего коробок:</td><td class="v">${order.total_boxes}</td></tr>
        <tr><td class="k">Подытог:</td><td class="v">${escapeHtml(fmtMoney(order.subtotal, order.currency))}</td></tr>
        ${order.discount_percent > 0 ? `
          <tr><td class="k">Скидка ${order.discount_percent}%:</td><td class="v">− ${escapeHtml(fmtMoney(order.discount_amount, order.currency))}</td></tr>
        ` : ""}
        <tr class="grand"><td class="k">Итого к оплате:</td><td class="v">${escapeHtml(fmtMoney(order.total, order.currency))}</td></tr>
      </table>
    </div>

    <div class="summary-line">
      <span class="lbl">Сумма прописью:</span> <span class="val">${escapeHtml(amountInWords(Number(order.total), order.currency))}</span>
    </div>

    ${company.payment_terms ? `
      <div class="block">
        <h4>Условия оплаты</h4>
        <div class="body">${nl2br(company.payment_terms)}</div>
      </div>` : ""}
    ${company.delivery_terms ? `
      <div class="block">
        <h4>Условия отгрузки / самовывоза</h4>
        <div class="body">${nl2br(company.delivery_terms)}</div>
      </div>` : ""}
    ${order.customer_comment ? `
      <div class="block">
        <h4>Комментарий покупателя</h4>
        <div class="body">${nl2br(order.customer_comment)}</div>
      </div>` : ""}
    ${company.offer_text ? `
      <div class="block">
        <h4>Оферта</h4>
        <div class="body">${nl2br(company.offer_text)}</div>
      </div>` : ""}

    <div class="signs">
      <div class="sign">
        <div class="role">${escapeHtml(company.director_position || "Руководитель")}</div>
        <div class="line"></div>
        <div class="name">${escapeHtml(company.director_name || "")}</div>
        <div class="hint">подпись / Ф.И.О.</div>
      </div>
      <div class="sign">
        <div class="role">Покупатель</div>
        <div class="line"></div>
        <div class="name">&nbsp;</div>
        <div class="hint">подпись / Ф.И.О.</div>
      </div>
    </div>
  </div>
  <script>
    // Автоматически открываем диалог печати после полной загрузки шрифтов.
    window.addEventListener('load', function () {
      setTimeout(function () { try { window.focus(); window.print(); } catch (e) {} }, 250);
    });
  </script>
</body>
</html>`;
};

export const generateInvoiceHtml = buildInvoiceHtml;

export const downloadInvoicePdf = (
  company: InvoiceCompany,
  customer: InvoiceCustomer,
  order: InvoiceOrder,
  items: InvoiceItem[],
) => {
  const html = buildInvoiceHtml(company, customer, order, items);
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1200");
  if (!win) {
    // Если поп-ап заблокирован — fallback: скачать как HTML-файл.
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Счёт_${order.order_number}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
};
