import { checkPassword, PASSWORD_RULES, type PasswordCheck } from "@/lib/password";
import { Check, X } from "lucide-react";

type Props = {
  password: string;
  show?: boolean;
};

const PasswordStrength = ({ password, show = true }: Props) => {
  if (!show || !password) return null;

  const checks = checkPassword(password);

  return (
    <ul className="mt-1.5 space-y-0.5">
      {PASSWORD_RULES.map(({ key, label }) => {
        const ok = checks[key as keyof PasswordCheck];
        return (
          <li
            key={key}
            className={`flex items-center gap-1.5 text-xs transition-colors duration-200 ${
              ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
            }`}
          >
            {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {label}
          </li>
        );
      })}
    </ul>
  );
};

export default PasswordStrength;
