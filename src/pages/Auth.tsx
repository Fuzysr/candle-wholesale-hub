import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
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

    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setLoading(false);
      if (error) return toast.error(error.message);
      toast.success("Письмо со ссылкой отправлено на email");
      setMode("login");
      return;
    }

    if (mode === "register") {
      const { error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}${next}`,
          data: {
            company_name: form.company_name,
            contact_name: form.contact_name,
            phone: form.phone,
          },
        },
      });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Аккаунт создан");
      navigate(next);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Добро пожаловать");
      navigate(next);
    }
  };

  return (
    <PublicLayout>
      <div className="container max-w-md py-12">
        <div className="rounded-lg border border-border bg-surface p-6">
          {mode !== "forgot" && (
            <div className="mb-6 inline-flex rounded-md border border-input bg-background p-0.5 text-sm">
              <button type="button" onClick={() => setMode("register")}
                className={`rounded-sm px-3 py-1.5 ${mode === "register" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"}`}>
                Регистрация
              </button>
              <button type="button" onClick={() => setMode("login")}
                className={`rounded-sm px-3 py-1.5 ${mode === "login" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"}`}>
                Вход
              </button>
            </div>
          )}

          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === "register" ? "Регистрация компании" : mode === "login" ? "Вход в кабинет" : "Восстановление пароля"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "register"
              ? "Создайте аккаунт, чтобы оформлять заявки и видеть статусы."
              : mode === "login"
              ? "Войдите, чтобы увидеть свои заявки."
              : "Введите email — пришлём ссылку для смены пароля."}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === "register" && (
              <>
                <Field label="Название компании *" required value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
                <Field label="Контактное лицо *" required value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                <Field label="Телефон *" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </>
            )}
            <Field label="Email *" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {mode !== "forgot" && (
              <Field label="Пароль *" type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            )}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "..." : mode === "register" ? "Создать аккаунт" : mode === "login" ? "Войти" : "Отправить ссылку"}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            {mode === "login" && (
              <button type="button" onClick={() => setMode("forgot")} className="hover:text-foreground hover:underline">
                Забыли пароль?
              </button>
            )}
            {mode === "forgot" && (
              <button type="button" onClick={() => setMode("login")} className="hover:text-foreground hover:underline">
                ← Назад ко входу
              </button>
            )}
            <Link to="/wholesale-terms" className="ml-auto hover:text-foreground hover:underline">
              Условия опта
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
};

export default Auth;
