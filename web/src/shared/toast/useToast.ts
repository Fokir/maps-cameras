// web/src/shared/toast/useToast.ts
import { useContext } from "react";
import { ToastContext } from "./ToastProvider";

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within <ToastProvider>");
  }
  return {
    success: (msg: string) => ctx.push("success", msg),
    error: (msg: string) => ctx.push("error", msg),
    warn: (msg: string) => ctx.push("warn", msg),
    info: (msg: string) => ctx.push("info", msg),
  };
}
