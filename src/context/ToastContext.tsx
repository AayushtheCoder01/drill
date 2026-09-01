import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface ToastCtx {
  toast: (msg: string, ms?: number) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((m: string, ms?: number) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), ms || 2600);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="toast" hidden={msg == null}>
        {msg}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): (msg: string, ms?: number) => void {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.toast;
}
