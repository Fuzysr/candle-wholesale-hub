import { Link } from "react-router-dom";
import { Clock3, MapPin, PackageCheck } from "lucide-react";

const TopBar = () => (
  <div className="hidden w-full bg-foreground text-background lg:block">
    <div className="container flex h-9 items-center justify-between text-xs">
      <div className="flex items-center gap-6 text-background/75">
        <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-primary" />Склад в Москве</span>
        <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-primary" />Счёт в течение 2 часов</span>
        <span className="flex items-center gap-1.5"><PackageCheck className="h-3.5 w-3.5 text-primary" />Минимум — 1 коробка</span>
      </div>
      <div className="flex items-center gap-5">
        <a href="tel:+78005551234" className="font-semibold hover:text-primary">+7 (800) 555-12-34</a>
        <Link to="/contacts" className="text-background/70 hover:text-background">Помощь менеджера</Link>
      </div>
    </div>
  </div>
);

export default TopBar;
