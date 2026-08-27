import { useEffect } from "react";
import { Button, Eyebrow } from "./primitives";

/**
 * A small, focused confirmation modal (§6.1 shell). Used for intentional destructive actions like
 * clearing persisted project data — states the consequence and lists exactly what is removed.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  bullets,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  bullets?: string[];
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-[rgba(14,20,25,0.72)] p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[480px] flex-col rounded-lg border border-rule bg-surface-raised shadow-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <Eyebrow>{title}</Eyebrow>
          <button
            onClick={onClose}
            className="ml-auto rounded-sm px-2 text-text-muted hover:text-text"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-small text-text">{message}</p>
          {bullets && bullets.length > 0 && (
            <ul className="mt-3 space-y-1">
              {bullets.map((b) => (
                <li key={b} className="mono flex items-center gap-2 text-mono text-text-muted">
                  <span className="text-rule">−</span>
                  {b}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger-solid" : "primary"} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
