import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { apiErrorMessage, authApi } from "@/lib/api";
import { isPasswordValid } from "@/lib/password";
import PasswordStrength from "@/components/PasswordStrength";
import { toast } from "sonner";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const ready = !!token;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return toast.error("Токен восстановления отсутствует в ссылке");
    if (!isPasswordValid(password)) return toast.error("Пароль не соответствует требованиям безопасности");
    if (password !== confirm) return toast.error("Пароли не совпадают");
    setLoading(true);
    try {
      await authApi.confirmPasswordReset(token, password);
      toast.success("Пароль обновлён. Войдите с новым паролем");
      navigate("/auth");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Не удалось обновить пароль"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicLayout>
      <div className="container max-w-md py-12">
        <div className="rounded-lg border border-border bg-surface p-6">
          <h1 className="text-2xl font-semibold tracking-tight">Новый пароль</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ready
              ? "Задайте новый пароль для входа в кабинет."
              : "Откройте ссылку из письма с токеном восстановления."}
          </p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Новый пароль
              </span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <PasswordStrength password={password} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Повторите пароль
              </span>
              <input
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <Button type="submit" size="lg" className="w-full" disabled={loading || !ready}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
            </Button>
          </form>
        </div>
      </div>
    </PublicLayout>
  );
};

export default ResetPassword;
