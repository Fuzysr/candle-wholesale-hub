import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, TextArea } from "@/components/admin/AdminPrimitives";
import type { AttributeKind, AttributeOut, CompanySettingsOut } from "@/lib/api";

const LOOKUP_LABEL: Record<AttributeKind, string> = {
  materials: "Материалы",
  scents: "Ароматы",
  shapes: "Формы",
};

type LookupEditor = { kind: AttributeKind; data: Partial<AttributeOut> };

interface SettingsTabProps {
  company: CompanySettingsOut | null;
  materials: AttributeOut[];
  scents: AttributeOut[];
  shapes: AttributeOut[];
  onCompanyChange: (company: CompanySettingsOut) => void;
  onSaveCompany: () => void;
  onEditLookup: (editor: LookupEditor) => void;
  onDeleteLookup: (kind: AttributeKind, id: string) => void;
}

export function SettingsTab({
  company,
  materials,
  scents,
  shapes,
  onCompanyChange,
  onSaveCompany,
  onEditLookup,
  onDeleteLookup,
}: SettingsTabProps) {
  const lookups: Record<AttributeKind, AttributeOut[]> = { materials, scents, shapes };

  return (
    <div className="space-y-6">
      {company && (
        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="mb-3">
            <h2 className="text-lg font-semibold">Реквизиты компании</h2>
            <p className="text-xs text-muted-foreground">
              Используются в счёте-договоре, который открывается из заявок (печать / сохранение в PDF).
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Полное название" value={company.legal_name} onChange={(e) => onCompanyChange({ ...company, legal_name: e.target.value })} />
            <Field label="Краткое название" value={company.short_name} onChange={(e) => onCompanyChange({ ...company, short_name: e.target.value })} />
            <Field label="ИНН" value={company.inn} onChange={(e) => onCompanyChange({ ...company, inn: e.target.value })} />
            <Field label="КПП" value={company.kpp} onChange={(e) => onCompanyChange({ ...company, kpp: e.target.value })} />
            <Field label="ОГРН" value={company.ogrn} onChange={(e) => onCompanyChange({ ...company, ogrn: e.target.value })} />
            <Field label="Юридический адрес" value={company.legal_address} onChange={(e) => onCompanyChange({ ...company, legal_address: e.target.value })} />
            <Field label="Почтовый адрес" value={company.postal_address} onChange={(e) => onCompanyChange({ ...company, postal_address: e.target.value })} />
            <Field label="Банк" value={company.bank_name} onChange={(e) => onCompanyChange({ ...company, bank_name: e.target.value })} />
            <Field label="БИК" value={company.bank_bik} onChange={(e) => onCompanyChange({ ...company, bank_bik: e.target.value })} />
            <Field label="Расчётный счёт" value={company.bank_account} onChange={(e) => onCompanyChange({ ...company, bank_account: e.target.value })} />
            <Field label="Корр. счёт" value={company.corr_account} onChange={(e) => onCompanyChange({ ...company, corr_account: e.target.value })} />
            <Field label="Должность подписанта" value={company.director_position} onChange={(e) => onCompanyChange({ ...company, director_position: e.target.value })} />
            <Field label="ФИО подписанта" value={company.director_name} onChange={(e) => onCompanyChange({ ...company, director_name: e.target.value })} />
            <Field label="Телефон" value={company.phone} onChange={(e) => onCompanyChange({ ...company, phone: e.target.value })} />
            <Field label="E-mail" value={company.email} onChange={(e) => onCompanyChange({ ...company, email: e.target.value })} />
            <div className="md:col-span-2">
              <TextArea label="Условия оплаты" rows={2} value={company.payment_terms} onChange={(e) => onCompanyChange({ ...company, payment_terms: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <TextArea label="Условия отгрузки / самовывоза" rows={2} value={company.delivery_terms} onChange={(e) => onCompanyChange({ ...company, delivery_terms: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <TextArea label="Текст оферты" rows={3} value={company.offer_text} onChange={(e) => onCompanyChange({ ...company, offer_text: e.target.value })} />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={onSaveCompany}>Сохранить реквизиты</Button>
          </div>
        </div>
      )}

      <div>
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Справочники</h2>
          <p className="text-xs text-muted-foreground">Материалы, ароматы и формы — используются в карточке товара.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {(Object.keys(lookups) as AttributeKind[]).map((kind) => {
            const items = lookups[kind];
            return (
              <div key={kind} className="rounded-lg border border-border bg-surface shadow-sm">
                <div className="flex items-center justify-between border-b border-border p-3">
                  <div className="font-semibold">{LOOKUP_LABEL[kind]}</div>
                  <Button size="sm" onClick={() => onEditLookup({ kind, data: { sort_order: items.length } })}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <ul className="divide-y divide-border text-sm">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 p-2.5">
                      <div className="min-w-0">
                        <div className="font-medium">{item.name_ru}</div>
                        <div className="num text-xs text-muted-foreground">{item.slug} · {item.name_en}</div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button size="sm" variant="ghost" onClick={() => onEditLookup({ kind, data: item })}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => onDeleteLookup(kind, item.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </li>
                  ))}
                  {items.length === 0 && <li className="p-3 text-center text-xs text-muted-foreground">Пусто</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
