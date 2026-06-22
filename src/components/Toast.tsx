"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type Variant = "success" | "error" | "info";
type ToastItem = { id: number; message: string; variant: Variant };

const ToastCtx = createContext<(message: string, variant?: Variant) => void>(
  () => {},
);

// Call this from any client component under <ToastProvider> to pop a toast.
export const useToast = () => useContext(ToastCtx);

let nextId = 1;

const VARIANT = {
  success: { icon: CheckCircle2, color: "var(--color-good)" },
  error: { icon: AlertCircle, color: "var(--color-danger)" },
  info: { icon: Info, color: "var(--color-brand)" },
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback(
    (id: number) => setToasts((t) => t.filter((x) => x.id !== id)),
    [],
  );

  const toast = useCallback(
    (message: string, variant: Variant = "info") => {
      const id = nextId++;
      setToasts((t) => [...t, { id, message, variant }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((t) => {
          const { icon: Icon, color } = VARIANT[t.variant];
          return (
            <div
              key={t.id}
              role="status"
              className="card toast-item pointer-events-auto flex items-start gap-2.5 p-3 shadow-lg"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <Icon size={16} style={{ color }} className="mt-0.5 shrink-0" />
              <span className="flex-1 text-sm text-ink">{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="shrink-0 text-muted hover:text-ink"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
