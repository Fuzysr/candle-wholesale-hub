import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    document.title = "Страница не найдена — 404";
  }, [location.pathname]);

  return (
    <PublicLayout>
      <div className="container flex min-h-[60vh] flex-col items-center justify-center py-12 text-center sm:py-20">
        <div className="num text-5xl font-bold text-primary sm:text-7xl">404</div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Страница не найдена</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Возможно, вы перешли по устаревшей ссылке. Вернитесь на главную или откройте каталог.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild><Link to="/">На главную</Link></Button>
          <Button asChild variant="outline"><Link to="/catalog">В каталог</Link></Button>
        </div>
      </div>
    </PublicLayout>
  );
};

export default NotFound;
