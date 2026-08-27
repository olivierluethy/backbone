import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * A shared, on-palette canvas for every diagram (Database ER, Structure entities/directory). It
 * frames a rendered SVG on the drafting-grid ground and adds zoom (buttons / wheel-toward-pointer),
 * click-drag pan, reset, and fit-to-view — so a wall of miniature tables never has to be squinted at.
 */

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const FIT_MARGIN = 0.92;

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/** Give a Mermaid SVG an explicit intrinsic size (from its viewBox) so fit/zoom maths are stable. */
function normalizeSvg(host: HTMLElement): { w: number; h: number } | null {
  const svg = host.querySelector("svg");
  if (!svg) return null;
  const vb = svg.getAttribute("viewBox");
  let w = 0;
  let h = 0;
  if (vb) {
    const parts = vb.split(/\s+/).map(Number);
    w = parts[2] || 0;
    h = parts[3] || 0;
  }
  if (!w || !h) {
    const rect = svg.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
  }
  svg.style.maxWidth = "none";
  svg.style.width = `${w}px`;
  svg.style.height = `${h}px`;
  svg.style.display = "block";
  return { w, h };
}

export function DiagramCanvas({ svg, ariaLabel }: { svg: string; ariaLabel?: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef<{ w: number; h: number } | null>(null);
  const [t, setT] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    const size = sizeRef.current;
    if (!vp || !size || !size.w || !size.h) return;
    const scale = clampScale(Math.min(vp.clientWidth / size.w, vp.clientHeight / size.h) * FIT_MARGIN);
    const tx = (vp.clientWidth - size.w * scale) / 2;
    const ty = (vp.clientHeight - size.h * scale) / 2;
    setT({ scale, tx, ty });
  }, []);

  // Re-normalise and fit whenever the diagram source changes.
  useLayoutEffect(() => {
    if (!contentRef.current) return;
    sizeRef.current = normalizeSvg(contentRef.current);
    const id = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(id);
  }, [svg, fit]);

  const zoomBy = useCallback((factor: number, cx?: number, cy?: number) => {
    setT((prev) => {
      const vp = viewportRef.current;
      const next = clampScale(prev.scale * factor);
      if (!vp || cx === undefined || cy === undefined) {
        // Zoom around the viewport centre.
        const px = (vp?.clientWidth ?? 0) / 2;
        const py = (vp?.clientHeight ?? 0) / 2;
        const ox = (px - prev.tx) / prev.scale;
        const oy = (py - prev.ty) / prev.scale;
        return { scale: next, tx: px - ox * next, ty: py - oy * next };
      }
      const ox = (cx - prev.tx) / prev.scale;
      const oy = (cy - prev.ty) / prev.scale;
      return { scale: next, tx: cx - ox * next, ty: cy - oy * next };
    });
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx: t.tx, ty: t.ty };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setT((prev) => ({
      ...prev,
      tx: drag.current!.tx + (e.clientX - drag.current!.x),
      ty: drag.current!.ty + (e.clientY - drag.current!.y),
    }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  const pct = Math.round(t.scale * 100);

  return (
    <div className="relative">
      <div
        ref={viewportRef}
        role="img"
        aria-label={ariaLabel}
        className={`drafting-grid relative h-[56vh] max-h-[72vh] min-h-[320px] touch-none select-none overflow-hidden rounded-md border border-line ${
          drag.current ? "cursor-grabbing" : "cursor-grab"
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          ref={contentRef}
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.scale})` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      {/* toolbar */}
      <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-rule bg-surface-raised p-0.5 shadow-pop">
        <CtrlButton label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
          −
        </CtrlButton>
        <span className="mono w-11 select-none text-center text-mono text-text-muted" title="Zoom level">
          {pct}%
        </span>
        <CtrlButton label="Zoom in" onClick={() => zoomBy(1.2)}>
          +
        </CtrlButton>
        <CtrlButton label="Reset to 100%" onClick={() => setT({ scale: 1, tx: 0, ty: 0 })}>
          ⌖
        </CtrlButton>
        <button
          onClick={fit}
          className="rounded-sm px-2 py-1 text-small font-medium text-text-muted transition-colors hover:bg-ink-600 hover:text-text"
        >
          Fit
        </button>
      </div>
    </div>
  );
}

function CtrlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-sm text-body text-text-muted transition-colors hover:bg-ink-600 hover:text-text"
    >
      {children}
    </button>
  );
}
