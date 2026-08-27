import type { FrontendInfo } from "@backbone/core";

/**
 * The detected frontend framework, shown as a prominent brass "detected-from-frontend" badge
 * (brass is the styleguide's detected accent). Renders "Undetected" in muted ink when the
 * analyzer found no conclusive signal — never a guess.
 */
export function FrontendBadge({ frontend }: { frontend?: FrontendInfo }) {
  const detected = !!frontend?.detected;

  return (
    <div
      className={
        "inline-flex items-center gap-3 rounded-md border px-3 py-2 " +
        (detected ? "border-brass-500/50 bg-brass-050" : "border-line bg-surface")
      }
    >
      <span className="eyebrow text-text-muted">Frontend</span>
      <FrameworkGlyph detected={detected} />
      {detected ? (
        <span className="flex items-baseline gap-2">
          <span className="font-display text-h3 font-semibold text-brass-400">
            {frontend!.displayName}
          </span>
          {frontend!.version && <span className="mono text-mono text-brass-500">{frontend!.version}</span>}
          {frontend!.meta && <span className="text-small text-text-muted">· {frontend!.meta}</span>}
        </span>
      ) : (
        <span className="text-small text-text-muted">Undetected — no conclusive dependency or source signal.</span>
      )}
    </div>
  );
}

/** A small drafting glyph — a filled node for detected, a hollow one when undetected. */
function FrameworkGlyph({ detected }: { detected: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0">
      <circle
        cx="7"
        cy="7"
        r="5"
        fill={detected ? "var(--brass-500)" : "none"}
        stroke={detected ? "var(--brass-400)" : "var(--rule)"}
        strokeWidth="1.5"
      />
    </svg>
  );
}
