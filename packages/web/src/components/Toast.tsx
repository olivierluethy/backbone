import { useEffect, useState } from "react";

/**
 * A single, transient bottom-right toast. Module-level so any code (including the project store) can
 * fire one without prop-drilling; only the latest is shown — a new toast replaces the current.
 */

export type ToastTone = "success" | "error" | "neutral";
interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

let seq = 0;
let listener: ((t: ToastMessage) => void) | null = null;

export function toast(message: string, tone: ToastTone = "neutral"): void {
  listener?.({ id: ++seq, message, tone });
}

const markerTone: Record<ToastTone, string> = {
  success: "before:bg-verd-500",
  error: "before:bg-danger-500",
  neutral: "before:bg-rule",
};

export function Toaster() {
  const [current, setCurrent] = useState<ToastMessage | null>(null);

  useEffect(() => {
    listener = (t) => setCurrent(t);
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    const handle = window.setTimeout(() => setCurrent(null), 2800);
    return () => window.clearTimeout(handle);
  }, [current]);

  if (!current) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex justify-end">
      <div
        key={current.id}
        role="status"
        className={`toast-in pointer-events-auto relative overflow-hidden rounded-md border border-rule bg-surface-raised py-2.5 pl-4 pr-4 text-small text-text shadow-pop before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:content-[''] ${markerTone[current.tone]}`}
      >
        {current.message}
      </div>
    </div>
  );
}
