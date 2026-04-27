import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { authApi, apiErrorMessage } from "@/lib/api";
import { AUTH_ME_KEY } from "@/hooks/useAuth";
import { toast } from "sonner";

const Field = ({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    <input {...props} className="h-10 w-full rounded-md border border-input bg-surface px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
  </label>
);

type Mode = "login" | "register" | "forgot";

const Auth = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const next = params.get("next") || "/account";
  const [mode, setMode] = useState<Mode>("register");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    email: "",
    password: "",
    company_name: "",
    contact_name: "",
    phone: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "forgot") {
        await authApi.requestPasswordReset(form.email);
        // Эндпоинт всегда отвечает `ok: true` — даже если email не
        // зарегистрирован (защита от user-enumeration). Показываем
        // нейтральный текст и возвращаем пользователя на логин: дальше
        // он должен открыть ссылку из письма.
        toast.success("Если такой email есть в системе — мы отправили письмо со ссылкой");
        setMode("login");
        return;
      }

      if (mode === "register") {
        await authApi.register({
          email: form.email,
          password: form.password,
          company_name: form.company_name || null,
          contact_name: form.contact_name || null,
          phone: form.phone || null,
        });
        await queryClient.invalidateQueries({ queryKey: AUTH_ME_KEY });
        toast.success("Аккаунт создан");
        navigate(next);
      } else {
        await authApi.login({ email: form.email, password: form.password });
        await queryClient.invalidateQueries({ queryKey: AUTH_ME_KEY });
        toast.success("Добро пожаловать");
        navigate(next);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось выполнить запрос"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicLayout>
      <div className="container max-w-md py-12">
        <div className="rounded-lg border border-border bg-surface p-6">
          {/*
            Header is centered on a single-column card — we dropped the
            Register/Login tab bar in favour of an inline mode-switch
            prompt below the primary CTA, so there's nothing sharing this
            row to fight for alignment.
          */}
          <h1 className="text-center text-2xl font-semibold tracking-tight">
            {mode === "register" ? "Регистрация компании" : mode === "login" ? "Вход в кабинет" : "Восстановление пароля"}
          </h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            {mode === "register"
              ? "Создайте аккаунт, чтобы оформлять заявки и видеть статусы."
              : mode === "login"
              ? "Войдите, чтобы увидеть свои заявки."
              : "Введите email — пришлём ссылку для смены пароля."}
          </p>

          <div
            className="mt-6 space-y-4"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) handleSubmit(e as unknown as React.FormEvent);
            }}
          >
            {mode === "register" && (
              <>
                <Field label="Название компании *" autoComplete="off" required value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
                <Field label="Контактное лицо *" autoComplete="off" required value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                <Field label="Телефон *" autoComplete="off" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </>
            )}
            <Field label="Email *" type="email" autoComplete="off" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {mode !== "forgot" && (
              <Field label="Пароль *" type="password" autoComplete="new-password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            )}
            <Button type="button" size="lg" className="w-full" disabled={loading} onClick={handleSubmit}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "register" ? "Создать аккаунт" : mode === "login" ? "Войти" : "Отправить ссылку"}
            </Button>
          </div>

          {/*
            Mode-switch prompt below the primary CTA. The copy mirrors the
            classic «have-an-account?» pattern so the page can stay on a
            single card without the old tab bar.
          */}
          <div className="mt-5 space-y-2 text-center text-sm text-muted-foreground">
            {mode === "register" && (
              <p>
                Уже есть аккаунт?{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="font-medium text-foreground transition-colors hover:text-primary hover:underline"
                >
                  Войти
                </button>
              </p>
            )}
            {mode === "login" && (
              <>
                <p>
                  Ещё нет аккаунта?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("register")}
                    className="font-medium text-foreground transition-colors hover:text-primary hover:underline"
                  >
                    Зарегистрироваться
                  </button>
                </p>
                <button
                  type="button"
                  onClick={() => setMode("forgot")}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
                >
                  Забыли пароль?
                </button>
              </>
            )}
            {mode === "forgot" && (
              <button
                type="button"
                onClick={() => setMode("login")}
                className="transition-colors hover:text-foreground hover:underline"
              >
                ← Назад ко входу
              </button>
            )}
          </div>

          {/*
            Legal footer — small muted links with a subtle hover. Both
            currently point at the wholesale terms page; once a dedicated
            privacy policy route exists swap the second link's target.
          */}
          <div className="mt-6 flex items-center justify-center gap-3 text-[11px] text-muted-foreground/70">
            <Link
              to="/wholesale-terms"
              className="transition-colors hover:text-foreground hover:underline"
            >
              Условия опта
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <Link
              to="/wholesale-terms"
              className="transition-colors hover:text-foreground hover:underline"
            >
              Политика обработки данных
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
};

export default Auth;
