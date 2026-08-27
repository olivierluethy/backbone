import { useEffect, useState } from "react";
import { api, type FsListing } from "../api";
import { Button, Chip, Eyebrow } from "./primitives";

/** Server-backed folder browser. The reliable way to choose a frontend path. */
export function FolderPicker({
  open,
  initialPath,
  onSelect,
  onClose,
}: {
  open: boolean;
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [listing, setListing] = useState<FsListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function load(path?: string) {
    setLoading(true);
    setError(null);
    api
      .fsList(path)
      .then(setListing)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (open) load(initialPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const segments = listing ? listing.current.split("/").filter(Boolean) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(14,20,25,0.72)] p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[72vh] w-full max-w-[640px] flex-col rounded-lg border border-rule bg-surface-raised shadow-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Choose frontend folder"
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <Eyebrow>Choose frontend folder</Eyebrow>
          {listing?.looksLikeProject && <Chip tone="verd">looks like a project</Chip>}
          <button
            onClick={onClose}
            className="ml-auto rounded-sm px-2 text-text-muted hover:text-text"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* breadcrumb */}
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-5 py-2 text-mono">
          <button className="text-text-muted hover:text-text" onClick={() => load("/")}>
            /
          </button>
          {segments.map((seg, i) => {
            const path = "/" + segments.slice(0, i + 1).join("/");
            const isLast = i === segments.length - 1;
            return (
              <span key={path} className="flex items-center gap-1">
                <button
                  className={isLast ? "text-brass-400" : "text-text-muted hover:text-text"}
                  onClick={() => load(path)}
                >
                  {seg}
                </button>
                {!isLast && <span className="text-rule">/</span>}
              </span>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-auto py-1">
          {error && <div className="px-5 py-3 text-small text-danger-500">{error}</div>}
          {loading && <div className="px-5 py-3 text-small text-text-muted">Reading…</div>}
          {listing?.parent && (
            <Row icon=".." label=".." muted onOpen={() => load(listing.parent!)} />
          )}
          {listing?.dirs.map((d) => (
            <Row
              key={d.path}
              icon="folder"
              label={d.name}
              chevron={d.hasChildren}
              onOpen={() => load(d.path)}
            />
          ))}
          {listing && listing.dirs.length === 0 && (
            <div className="px-5 py-3 text-small text-text-muted">No subfolders here.</div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line px-5 py-3">
          <span className="mono min-w-0 flex-1 truncate text-mono text-text-muted" title={listing?.current}>
            {listing?.current ?? "…"}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!listing}
            onClick={() => listing && onSelect(listing.current)}
          >
            Select this folder
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  muted,
  chevron,
  onOpen,
}: {
  icon: string;
  label: string;
  muted?: boolean;
  chevron?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-2 px-5 py-1.5 text-left text-small hover:bg-ink-600"
    >
      <span className="text-brass-400">{icon === "folder" ? "🗀" : icon === ".." ? "↰" : ""}</span>
      <span className={muted ? "text-text-muted" : "text-text"}>{label}</span>
      {chevron && <span className="ml-auto text-text-muted">›</span>}
    </button>
  );
}
