import { Link } from "react-router-dom";

const SiteFooter = () => {
  return (
    <footer className="mt-24 border-t border-border bg-surface">
      <div className="container grid gap-10 py-12 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-foreground text-background text-sm font-bold">
              WC
            </span>
            <span className="font-semibold tracking-tight">
              Wholesale<span className="text-primary">.</span>Candles
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground max-w-xs">
            Оптовый поставщик свечей для декораторов, флористов, отелей и event-агентств.
          </p>
        </div>

        <div>
          <div className="eyebrow mb-3">Магазин</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/catalog" className="hover:text-primary">Каталог</Link></li>
            <li><Link to="/quick-order" className="hover:text-primary">Быстрый заказ</Link></li>
            <li><Link to="/wholesale-terms" className="hover:text-primary">Условия опта</Link></li>
          </ul>
        </div>

        <div>
          <div className="eyebrow mb-3">Кабинет</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/auth" className="hover:text-primary">Регистрация</Link></li>
            <li><Link to="/auth" className="hover:text-primary">Вход</Link></li>
            <li><Link to="/account" className="hover:text-primary">Мои заявки</Link></li>
          </ul>
        </div>

        <div>
          <div className="eyebrow mb-3">Контакты</div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>sales@wholesale.candles</li>
            <li>+7 (000) 000-00-00</li>
            <li>Пн–Пт, 10:00–19:00</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="container flex flex-col items-start justify-between gap-2 py-5 text-xs text-muted-foreground md:flex-row md:items-center">
          <span>© {new Date().getFullYear()} Wholesale Candles. Все права защищены.</span>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-foreground">Политика конфиденциальности</Link>
            <Link to="/offer" className="hover:text-foreground">Договор оферты</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
