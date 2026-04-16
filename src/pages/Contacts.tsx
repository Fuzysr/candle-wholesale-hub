import { Mail, Phone, MapPin, Clock } from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";

const Contacts = () => {
  return (
    <PublicLayout>
      <div className="container max-w-3xl py-12">
        <div className="eyebrow mb-3">Связаться</div>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Контакты</h1>
        <p className="mt-3 text-muted-foreground">
          Отдел оптовых продаж готов ответить на вопросы по ассортименту, ценам и логистике.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {[
            { icon: Mail, title: "Email", value: "sales@wholesale.candles", href: "mailto:sales@wholesale.candles" },
            { icon: Phone, title: "Телефон", value: "+7 (000) 000-00-00", href: "tel:+70000000000" },
            { icon: MapPin, title: "Склад", value: "Москва, ул. Складская, 1" },
            { icon: Clock, title: "Часы работы", value: "Пн–Пт, 10:00–19:00 МСК" },
          ].map((c) => (
            <div key={c.title} className="rounded-lg border border-border bg-surface p-5">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
                <c.icon className="h-5 w-5" />
              </div>
              <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{c.title}</div>
              {c.href ? (
                <a href={c.href} className="mt-1 block text-base font-medium hover:text-primary">{c.value}</a>
              ) : (
                <div className="mt-1 text-base font-medium">{c.value}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </PublicLayout>
  );
};

export default Contacts;
