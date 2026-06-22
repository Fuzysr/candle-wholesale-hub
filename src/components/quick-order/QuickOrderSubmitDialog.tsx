import type { Dispatch, FormEventHandler, SetStateAction } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney, type Currency } from "@/lib/format";

export type QuickOrderForm = {
  company_name: string;
  contact_name: string;
  phone: string;
  inn: string;
  email: string;
  delivery_date: string;
  customer_comment: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  form: QuickOrderForm;
  setForm: Dispatch<SetStateAction<QuickOrderForm>>;
  positions: number;
  totalBoxes: number;
  discount: number;
  total: number;
  currency: Currency;
  submitting: boolean;
};

const Field = ({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
    <input
      {...props}
      className="h-10 w-full rounded-md border border-input bg-surface px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  </label>
);

export const QuickOrderSubmitDialog = ({
  open,
  onOpenChange,
  onSubmit,
  form,
  setForm,
  positions,
  totalBoxes,
  discount,
  total,
  currency,
  submitting,
}: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl">
      <form onSubmit={onSubmit} className="space-y-4">
        <DialogHeader>
          <DialogTitle>Оформить быструю заявку</DialogTitle>
          <DialogDescription>
            Проверьте реквизиты и отправьте. Менеджер свяжется и пришлёт счёт в течение 2 часов в рабочее время.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="text-muted-foreground">Позиций: <span className="font-semibold text-foreground">{positions}</span></span>
            <span className="text-muted-foreground">Коробок: <span className="font-semibold text-foreground">{totalBoxes}</span></span>
            {discount > 0 && <span className="font-medium text-amber">Скидка {discount}%</span>}
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Итого</div>
            <div className="price text-xl">{formatMoney(total, currency)}</div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Компания *" required value={form.company_name} onChange={(event) => setForm((current) => ({ ...current, company_name: event.target.value }))} />
          <Field label="ИНН" value={form.inn} onChange={(event) => setForm((current) => ({ ...current, inn: event.target.value }))} />
          <Field label="Контактное лицо *" required value={form.contact_name} onChange={(event) => setForm((current) => ({ ...current, contact_name: event.target.value }))} />
          <Field label="Телефон *" required value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
          <Field label="Email *" required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
          <Field label="Желаемая дата самовывоза" type="date" value={form.delivery_date} onChange={(event) => setForm((current) => ({ ...current, delivery_date: event.target.value }))} />
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground md:col-span-2">
            Заказы отгружаются только самовывозом со склада. Адрес склада менеджер пришлёт вместе со счётом.
          </div>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Комментарий</span>
            <textarea rows={2} value={form.customer_comment} onChange={(event) => setForm((current) => ({ ...current, customer_comment: event.target.value }))} className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
        </div>

        <DialogFooter className="gap-2 pt-2 sm:gap-2">
          <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={submitting}>Отмена</Button>
          <Button type="submit" size="lg" disabled={submitting || positions === 0} className="gap-2">
            {submitting ? "Отправка…" : <>Отправить заявку <Send className="h-4 w-4" /></>}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
);
