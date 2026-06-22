import { Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContactMessageOut } from "@/lib/api/contact";
import { cn } from "@/lib/utils";

export type MessagesTabProps = {
  messages: ContactMessageOut[];
  onMarkRead: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
};

export const MessagesTab = ({ messages, onMarkRead, onDelete }: MessagesTabProps) => (
  <div className="space-y-4">
    {messages.length === 0 ? (
      <div className="rounded-lg border border-border bg-surface p-12 text-center text-sm text-muted-foreground">Обращений пока нет</div>
    ) : (
      <div className="space-y-3">
        {messages.map((message) => (
          <div key={message.id} className={cn("rounded-lg border bg-surface p-4 shadow-sm transition-colors", message.is_read ? "border-border" : "border-primary/40 bg-primary/[0.02]")}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{message.name}</span>
                  {!message.is_read && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">Новое</span>}
                </div>
                {message.phone && <div className="mt-0.5 text-xs text-muted-foreground">{message.phone}</div>}
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{message.message}</p>
                <div className="mt-2 text-[11px] text-muted-foreground">{new Date(message.created_at).toLocaleString("ru-RU")}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                {!message.is_read && (
                  <Button size="sm" variant="ghost" title="Отметить прочитанным" onClick={() => void onMarkRead(message.id)}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  title="Удалить"
                  onClick={() => { if (confirm("Удалить обращение?")) void onDelete(message.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

