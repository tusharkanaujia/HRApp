import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';

type ToastKind = 'info' | 'success' | 'warn';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  ttlMs?: number;
}

interface ToastContextValue {
  pushToast: (t: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;
}

const ToastCtx = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

const DEFAULT_TTL = 4500;
const MAX_STACK = 5;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: string) => {
    setToasts(t => t.filter(x => x.id !== id));
    const handle = timers.current.get(id);
    if (handle) { clearTimeout(handle); timers.current.delete(id); }
  }, []);

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = `t${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts(prev => {
      const next = [{ ...t, id }, ...prev];
      // Cap the stack — drop oldest
      if (next.length > MAX_STACK) {
        const dropped = next.slice(MAX_STACK);
        dropped.forEach(d => {
          const h = timers.current.get(d.id);
          if (h) { clearTimeout(h); timers.current.delete(d.id); }
        });
        return next.slice(0, MAX_STACK);
      }
      return next;
    });
    const ttl = t.ttlMs ?? DEFAULT_TTL;
    if (ttl > 0) {
      const handle = setTimeout(() => dismissToast(id), ttl);
      timers.current.set(id, handle);
    }
    return id;
  }, [dismissToast]);

  useEffect(() => () => {
    timers.current.forEach(h => clearTimeout(h));
    timers.current.clear();
  }, []);

  return (
    <ToastCtx.Provider value={{ pushToast, dismissToast }}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </ToastCtx.Provider>
  );
}

const KIND_STYLE: Record<ToastKind, { Icon: React.ElementType; cls: string }> = {
  info:    { Icon: Info,           cls: 'bg-blue-50 border-blue-200 text-blue-900' },
  success: { Icon: CheckCircle2,   cls: 'bg-emerald-50 border-emerald-200 text-emerald-900' },
  warn:    { Icon: AlertTriangle,  cls: 'bg-amber-50 border-amber-200 text-amber-900' },
};

function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80 pointer-events-none">
      {toasts.map(t => {
        const { Icon, cls } = KIND_STYLE[t.kind];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border shadow-lg px-4 py-3 flex items-start gap-3 animate-[slideIn_0.18s_ease-out] ${cls}`}
          >
            <Icon size={18} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.message && <p className="text-xs mt-0.5 opacity-90 break-words">{t.message}</p>}
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              className="text-current opacity-50 hover:opacity-100 flex-shrink-0"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
