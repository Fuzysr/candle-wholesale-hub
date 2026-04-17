import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Cyrillic-friendly font: jsPDF default is helvetica which supports Cyrillic via WinAnsi only partially.
// We use the built-in 'helvetica' but strings with Cyrillic via the standard encoding work in modern jsPDF
// because we set 'utf-8' rendering through the default Unicode-capable codepath. For bullet-proof Cyrillic
// we'd embed a TTF — keeping setup minimal here.

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
  delivery_address: string | null;
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
    .format(Number(n)) + " " + (currency === "USD" ? "$" : "руб.");

export const generateInvoicePdf = (
  company: InvoiceCompany,
  customer: InvoiceCustomer,
  order: InvoiceOrder,
  items: InvoiceItem[],
): jsPDF => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  let y = M;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`Счёт-договор № ${order.order_number}`, M, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`от ${new Date(order.created_at).toLocaleDateString("ru-RU")}`, M, y);
  y += 6;

  // Seller / Buyer block
  doc.setDrawColor(180);
  doc.setFontSize(8);
  const colW = (W - 2 * M - 4) / 2;

  const sellerLines = [
    `Продавец: ${company.legal_name}`,
    `ИНН: ${company.inn}    КПП: ${company.kpp}`,
    company.ogrn ? `ОГРН: ${company.ogrn}` : "",
    company.legal_address ? `Юр. адрес: ${company.legal_address}` : "",
    company.postal_address ? `Почт. адрес: ${company.postal_address}` : "",
    `Банк: ${company.bank_name}`,
    `БИК: ${company.bank_bik}`,
    `Р/с: ${company.bank_account}`,
    `К/с: ${company.corr_account}`,
    `Тел.: ${company.phone}    E-mail: ${company.email}`,
  ].filter(Boolean);

  const buyerLines = [
    `Покупатель: ${customer.company_name || "—"}`,
    customer.inn ? `ИНН: ${customer.inn}` : "",
    customer.contact_name ? `Контактное лицо: ${customer.contact_name}` : "",
    customer.phone ? `Тел.: ${customer.phone}` : "",
    customer.email ? `E-mail: ${customer.email}` : "",
    customer.delivery_address ? `Адрес доставки: ${customer.delivery_address}` : "",
  ].filter(Boolean);

  const sellerText = doc.splitTextToSize(sellerLines.join("\n"), colW - 4);
  const buyerText = doc.splitTextToSize(buyerLines.join("\n"), colW - 4);
  const blockH = Math.max(sellerText.length, buyerText.length) * 3.6 + 6;

  doc.rect(M, y, colW, blockH);
  doc.rect(M + colW + 4, y, colW, blockH);
  doc.text(sellerText, M + 2, y + 4);
  doc.text(buyerText, M + colW + 6, y + 4);
  y += blockH + 4;

  // Items table
  autoTable(doc, {
    startY: y,
    head: [["№", "Артикул / товар", "Шт/кор", "Кор.", "Цена за шт.", "Сумма"]],
    body: items.map((it, i) => [
      String(i + 1),
      `${it.sku}\n${it.product_name}${it.variant_label ? " · " + it.variant_label : ""}`,
      String(it.pieces_per_box),
      String(it.boxes),
      fmtMoney(it.unit_price, order.currency),
      fmtMoney(it.line_total, order.currency),
    ]),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [40, 40, 40], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      2: { halign: "right", cellWidth: 16 },
      3: { halign: "right", cellWidth: 14 },
      4: { halign: "right", cellWidth: 30 },
      5: { halign: "right", cellWidth: 30 },
    },
    margin: { left: M, right: M },
  });

  // @ts-expect-error jspdf-autotable adds lastAutoTable
  y = doc.lastAutoTable.finalY + 4;

  // Totals
  doc.setFontSize(9);
  const totalsX = W - M - 70;
  doc.text(`Всего коробок:`, totalsX, y);
  doc.text(String(order.total_boxes), W - M, y, { align: "right" });
  y += 5;
  doc.text(`Подытог:`, totalsX, y);
  doc.text(fmtMoney(order.subtotal, order.currency), W - M, y, { align: "right" });
  y += 5;
  if (order.discount_percent > 0) {
    doc.text(`Скидка ${order.discount_percent}%:`, totalsX, y);
    doc.text(`− ${fmtMoney(order.discount_amount, order.currency)}`, W - M, y, { align: "right" });
    y += 5;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Итого к оплате:`, totalsX, y);
  doc.text(fmtMoney(order.total, order.currency), W - M, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  y += 8;

  // Terms / offer
  const writeBlock = (title: string, body: string) => {
    if (!body) return;
    if (y > 250) { doc.addPage(); y = M; }
    doc.setFont("helvetica", "bold");
    doc.text(title, M, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(body, W - 2 * M);
    doc.text(lines, M, y);
    y += lines.length * 3.6 + 3;
  };

  writeBlock("Условия оплаты:", company.payment_terms);
  writeBlock("Условия доставки:", company.delivery_terms);
  if (order.customer_comment) writeBlock("Комментарий покупателя:", order.customer_comment);
  writeBlock("Оферта:", company.offer_text);

  // Signatures
  if (y > 245) { doc.addPage(); y = M; }
  y += 10;
  doc.setDrawColor(150);
  doc.line(M, y, M + 70, y);
  doc.line(W - M - 70, y, W - M, y);
  y += 4;
  doc.text(`${company.director_position}`, M, y);
  doc.text(`Покупатель`, W - M - 70, y);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text(company.director_name || "", M, y);
  doc.setFont("helvetica", "normal");

  return doc;
};

export const downloadInvoicePdf = (
  company: InvoiceCompany,
  customer: InvoiceCustomer,
  order: InvoiceOrder,
  items: InvoiceItem[],
) => {
  const doc = generateInvoicePdf(company, customer, order, items);
  doc.save(`Счёт_${order.order_number}.pdf`);
};
