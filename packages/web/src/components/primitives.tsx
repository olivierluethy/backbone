import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Shared UI primitives, all derived from the styleguide tokens. */

export function Eyebrow({ children, count }: { children: ReactNode; count?: number | string }) {
  return (
    <div className="eyebrow flex items-center gap-2">
      <span className="text-rule">▏</span>
      <span>{children}</span>
      {count !== undefined && <span className="font-mono text-text-muted">· {count}</span>}
    </div>
  );
}

type Variant = "primary" | "generate" | "ghost" | "danger";

export function Button({
  variant = "ghost",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "inline-flex h-9 items-center gap-2 rounded-md px-4 text-body font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed";
  const styles: Record<Variant, string> = {
    primary: "bg-brass-500 text-ink-900 hover:bg-brass-400 active:bg-brass-600",
    generate: "bg-verd-500 text-ink-900 hover:bg-verd-400 active:bg-verd-600",
    ghost: "border border-rule text-text hover:bg-ink-600",
    danger: "border border-danger-500 text-danger-500 hover:bg-danger-050",
  };
  return (
    <button className={`${base} ${styles[variant]}`} {...rest}>
      {children}
    </button>
  );
}

const methodChip: Record<string, string> = {
  GET: "bg-ink-600 text-info-500 border-info-500/40",
  POST: "bg-verd-050 text-verd-400 border-verd-500/50",
  PUT: "bg-brass-050 text-brass-400 border-brass-500/50",
  PATCH: "bg-brass-050 text-brass-400 border-brass-500/50",
  DELETE: "bg-danger-050 text-danger-500 border-danger-500/50",
};

export function MethodChip({ method }: { method: string }) {
  return (
    <span
      className={`mono inline-flex items-center rounded-pill border px-2 py-0.5 text-eyebrow font-semibold ${
        methodChip[method] ?? "bg-ink-600 text-text-muted border-rule"
      }`}
    >
      {method}
    </span>
  );
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brass" | "verd" }) {
  const tones = {
    neutral: "bg-ink-600 text-text-muted border-rule",
    brass: "bg-brass-050 text-brass-400 border-brass-500/50",
    verd: "bg-verd-050 text-verd-400 border-verd-500/50",
  };
  return (
    <span className={`mono inline-flex items-center rounded-pill border px-2 py-0.5 text-eyebrow ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Toggle({ on, onChange, title }: { on: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      title={title}
      onClick={() => onChange(!on)}
      className={`relative h-[18px] w-8 shrink-0 rounded-pill border transition-colors ${
        on ? "bg-verd-500 border-verd-500" : "bg-ink-500 border-rule"
      }`}
    >
      <span
        className={`absolute top-[1px] h-[14px] w-[14px] rounded-pill bg-paper-100 transition-all ${
          on ? "left-[15px]" : "left-[1px]"
        }`}
      />
    </button>
  );
}
