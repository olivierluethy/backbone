import { useEffect, useMemo, useRef, useState } from "react";
import { api, type FileContent, type TreeNode } from "../api";
import { CodeViewer } from "./CodeViewer";
import { FileIcon } from "./FileIcon";
import { OpenInVscode } from "./OpenInVscode";
import { Button } from "./primitives";

const MIN_TREE = 160;
const MAX_TREE = 520;
const MIN_FONT = 9;
const MAX_FONT = 22;

/**
 * VS Code–grade explorer: a resizable tree, a tab strip with single-click preview and
 * double-click-to-pin tabs, an optional side-by-side split editor (via the Split action or by
 * dragging a tab to the right), editor zoom, per-file + project Copy / Download / Open-in-VS-Code.
 * The editor is read-only — this is a viewer.
 */
export function FileExplorer({
  dir,
  vscodeAvailable,
  refreshKey,
}: {
  dir: string;
  vscodeAvailable: boolean;
  /** Changes on every (re)generation so the tree re-fetches even when the output dir is unchanged. */
  refreshKey?: string;
}) {
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Tabs + editor state.
  const [cache, setCache] = useState<Record<string, FileContent>>({});
  const [tabs, setTabs] = useState<string[]>([]); // pinned (double-clicked) files
  const [preview, setPreview] = useState<string | null>(null); // transient (single-click)
  const [primary, setPrimary] = useState<string | null>(null); // focused file in the left pane
  const [secondary, setSecondary] = useState<string | null>(null); // right split pane, null = single
  const [fontSize, setFontSize] = useState(12);
  const [treeWidth, setTreeWidth] = useState(248);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [dragOverSplit, setDragOverSplit] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const prevDirRef = useRef<string | null>(null);

  // Load the tree when the output dir changes (full reset) or when a regeneration bumps refreshKey
  // (soft refresh: keep open tabs that still exist, drop the ones reconciled away, re-fetch contents).
  useEffect(() => {
    let alive = true;
    const dirChanged = prevDirRef.current !== dir;
    prevDirRef.current = dir;

    if (dirChanged) {
      setTree(null);
      setChecked(new Set());
      setCache({});
      setTabs([]);
      setPreview(null);
      setPrimary(null);
      setSecondary(null);
    } else {
      // Same dir, fresh generation: contents may have changed, so invalidate the cache.
      setCache({});
    }

    api
      .generatedTree(dir)
      .then(({ tree }) => {
        if (!alive) return;
        setTree(tree);
        const files = filePaths(tree);
        if (dirChanged) {
          setOpen(new Set(tree.filter((n) => n.type === "dir").map((n) => n.path)));
          const first = firstFile(tree);
          if (first) select(first, false);
          return;
        }
        // Prune tabs/preview/split that point at files removed by reconciliation.
        setTabs((t) => t.filter((p) => files.has(p)));
        setPreview((p) => (p && files.has(p) ? p : null));
        setSecondary((s) => (s && files.has(s) ? s : null));
        setChecked((prev) => new Set([...prev].filter((p) => files.has(p))));
        // Re-fetch the still-open focused files (cache was just cleared). A vanished primary keeps
        // its path so the editor can show a clear "file no longer exists" state.
        for (const p of [primary, secondary]) {
          if (p && files.has(p)) {
            api
              .generatedFile(dir, p)
              .then((f) => alive && setCache((c) => ({ ...c, [p]: f })))
              .catch(() => {});
          }
        }
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir, refreshKey]);

  /** Fetch a file into the cache if not already present. */
  function ensure(path: string) {
    if (cache[path]) return;
    api
      .generatedFile(dir, path)
      .then((f) => setCache((c) => ({ ...c, [path]: f })))
      .catch((e) => setError((e as Error).message));
  }

  /** Single-click = preview (transient); double-click (pin=true) = persistent tab. */
  function select(path: string, pin: boolean) {
    ensure(path);
    setPrimary(path);
    if (pin) {
      setTabs((t) => (t.includes(path) ? t : [...t, path]));
      setPreview((p) => (p === path ? null : p));
    } else if (!tabs.includes(path)) {
      setPreview(path);
    }
  }

  function closeTab(path: string) {
    setTabs((t) => t.filter((p) => p !== path));
    if (preview === path) setPreview(null);
    if (secondary === path) setSecondary(null);
    if (primary === path) {
      const remaining = [...tabs.filter((p) => p !== path), ...(preview && preview !== path ? [preview] : [])];
      setPrimary(remaining[remaining.length - 1] ?? null);
    }
  }

  function openInSplit(path: string) {
    ensure(path);
    setSecondary(path);
  }

  function zoom(delta: number) {
    setFontSize((f) => Math.min(MAX_FONT, Math.max(MIN_FONT, f + delta)));
  }

  // --- Resizing (tree width + split ratio) via pointer drag ---
  function startTreeDrag(e: React.PointerEvent) {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const left = containerRef.current?.getBoundingClientRect().left ?? 0;
      setTreeWidth(Math.min(MAX_TREE, Math.max(MIN_TREE, ev.clientX - left)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startSplitDrag(e: React.PointerEvent) {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const rect = editorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setSplitRatio(Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / rect.width)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  async function downloadProject() {
    setBusy(true);
    try {
      await api.downloadProject(dir);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadSelected() {
    if (!checked.size) return;
    setBusy(true);
    try {
      await api.downloadSelected(dir, [...checked]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const fileCount = useMemo(() => (tree ? countFiles(tree) : 0), [tree]);
  // Tab strip = pinned tabs, plus the transient preview shown last (italic) if not pinned.
  const stripTabs = useMemo(() => {
    const list = tabs.map((p) => ({ path: p, transient: false }));
    if (preview && !tabs.includes(preview)) list.push({ path: preview, transient: true });
    return list;
  }, [tabs, preview]);

  const treeFiles = useMemo(() => (tree ? filePaths(tree) : new Set<string>()), [tree]);
  const primaryFile = primary ? cache[primary] : null;
  const secondaryFile = secondary ? cache[secondary] : null;
  const primaryMissing = !!primary && !!tree && !treeFiles.has(primary);
  const secondaryMissing = !!secondary && !!tree && !treeFiles.has(secondary);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="generate" onClick={downloadProject} disabled={busy}>
          Download project (.zip)
        </Button>
        <Button variant="ghost" onClick={downloadSelected} disabled={busy || checked.size === 0}>
          Download selected{checked.size ? ` (${checked.size})` : ""}
        </Button>
        {checked.size > 0 && (
          <button className="text-small text-text-muted underline hover:text-text" onClick={() => setChecked(new Set())}>
            clear selection
          </button>
        )}
        <OpenInVscode dir={dir} available={vscodeAvailable} label="Open project in VS Code" />
        <span className="ml-auto flex items-center gap-2 text-small text-text-muted">
          <span>{fileCount} files</span>
          <ZoomControl fontSize={fontSize} onZoom={zoom} onReset={() => setFontSize(12)} />
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-danger-500/50 bg-danger-050 p-3 text-small text-danger-500">{error}</div>
      )}

      <div
        ref={containerRef}
        className="flex min-h-[440px] overflow-hidden rounded-md border border-line max-[900px]:flex-col"
      >
        {/* Tree pane (resizable) */}
        <div
          className="shrink-0 overflow-auto border-r border-line bg-surface py-2 max-[900px]:max-h-56 max-[900px]:w-full max-[900px]:border-b max-[900px]:border-r-0"
          style={{ width: treeWidth }}
        >
          {!tree && <div className="px-3 py-2 text-small text-text-muted">Loading tree…</div>}
          {tree &&
            tree.map((n) => (
              <TreeRow
                key={n.path}
                node={n}
                depth={0}
                open={open}
                current={primary}
                checked={checked}
                onToggleDir={(p) =>
                  setOpen((prev) => {
                    const next = new Set(prev);
                    next.has(p) ? next.delete(p) : next.add(p);
                    return next;
                  })
                }
                onPreviewFile={(p) => select(p, false)}
                onOpenFile={(p) => select(p, true)}
                onCheck={(p) =>
                  setChecked((prev) => {
                    const next = new Set(prev);
                    next.has(p) ? next.delete(p) : next.add(p);
                    return next;
                  })
                }
              />
            ))}
        </div>

        {/* Draggable splitter (tree ↔ editor) */}
        <div
          onPointerDown={startTreeDrag}
          className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-brass-500/40 max-[900px]:hidden"
          title="Drag to resize"
        />

        {/* Editor area (tabs + one or two code panes) */}
        <div className="flex min-w-0 flex-1 flex-col">
          {stripTabs.length > 0 && (
            <div className="flex items-stretch gap-0 overflow-x-auto border-b border-line bg-ink-800">
              {stripTabs.map((t) => (
                <TabButton
                  key={t.path}
                  path={t.path}
                  transient={t.transient}
                  active={primary === t.path}
                  onClick={() => {
                    ensure(t.path);
                    setPrimary(t.path);
                  }}
                  onClose={() => closeTab(t.path)}
                  onDragStartTab={(e) => e.dataTransfer.setData("text/bb-path", t.path)}
                />
              ))}
            </div>
          )}

          <div
            ref={editorRef}
            className="relative flex min-h-0 flex-1"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("text/bb-path")) {
                e.preventDefault();
                const rect = editorRef.current?.getBoundingClientRect();
                if (rect) setDragOverSplit(e.clientX - rect.left > rect.width * 0.6);
              }
            }}
            onDragLeave={() => setDragOverSplit(false)}
            onDrop={(e) => {
              const path = e.dataTransfer.getData("text/bb-path");
              setDragOverSplit(false);
              if (path && e.clientX - (editorRef.current?.getBoundingClientRect().left ?? 0) > (editorRef.current?.clientWidth ?? 0) * 0.6) {
                openInSplit(path);
              }
            }}
          >
            {primaryMissing ? (
              <div className="min-w-0 flex-1" style={secondary ? { flex: `0 0 ${splitRatio * 100}%` } : undefined}>
                <MissingFile path={primary!} onClose={() => closeTab(primary!)} />
              </div>
            ) : primaryFile ? (
              <div className="min-w-0 flex-1" style={secondary ? { flex: `0 0 ${splitRatio * 100}%` } : undefined}>
                <CodeViewer
                  path={primaryFile.path}
                  language={primaryFile.language}
                  content={primaryFile.content}
                  fontSize={fontSize}
                  onDownload={() => api.downloadFile(dir, primaryFile.path)}
                  actions={
                    <>
                      {!secondary && (
                        <MiniButton label="Split" title="Open beside" onClick={() => openInSplit(primaryFile.path)} />
                      )}
                      <OpenInVscode dir={dir} path={primaryFile.path} available={vscodeAvailable} label="VS Code" compact />
                    </>
                  }
                />
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-small text-text-muted">
                Single-click a file to preview · double-click to open a tab.
              </div>
            )}

            {secondary && (
              <>
                <div
                  onPointerDown={startSplitDrag}
                  className="w-1 shrink-0 cursor-col-resize bg-line transition-colors hover:bg-brass-500/40"
                  title="Drag to resize"
                />
                <div className="min-w-0 flex-1">
                  {secondaryMissing ? (
                    <MissingFile path={secondary!} onClose={() => setSecondary(null)} />
                  ) : secondaryFile && (
                    <CodeViewer
                      path={secondaryFile.path}
                      language={secondaryFile.language}
                      content={secondaryFile.content}
                      fontSize={fontSize}
                      onDownload={() => api.downloadFile(dir, secondaryFile.path)}
                      actions={
                        <>
                          <MiniButton label="Close split" title="Close the split pane" onClick={() => setSecondary(null)} />
                          <OpenInVscode dir={dir} path={secondaryFile.path} available={vscodeAvailable} label="VS Code" compact />
                        </>
                      }
                    />
                  )}
                </div>
              </>
            )}

            {dragOverSplit && (
              <div className="pointer-events-none absolute inset-y-0 right-0 w-2/5 border-l-2 border-brass-400 bg-brass-050/40" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ZoomControl({ fontSize, onZoom, onReset }: { fontSize: number; onZoom: (d: number) => void; onReset: () => void }) {
  return (
    <span className="inline-flex items-center overflow-hidden rounded-sm border border-rule">
      <button className="px-1.5 py-0.5 text-text-muted hover:bg-ink-600 hover:text-text" onClick={() => onZoom(-1)} title="Zoom out">
        −
      </button>
      <button
        className="border-x border-rule px-1.5 py-0.5 text-mono text-text-muted hover:bg-ink-600 hover:text-text"
        onClick={onReset}
        title="Reset zoom"
      >
        {fontSize}px
      </button>
      <button className="px-1.5 py-0.5 text-text-muted hover:bg-ink-600 hover:text-text" onClick={() => onZoom(1)} title="Zoom in">
        +
      </button>
    </span>
  );
}

function MiniButton({ label, title, onClick }: { label: string; title?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded-sm border border-rule px-2 py-0.5 text-eyebrow font-semibold uppercase tracking-eyebrow text-text-muted transition-colors hover:bg-ink-600 hover:text-text"
    >
      {label}
    </button>
  );
}

function TabButton({
  path,
  transient,
  active,
  onClick,
  onClose,
  onDragStartTab,
}: {
  path: string;
  transient: boolean;
  active: boolean;
  onClick: () => void;
  onClose: () => void;
  onDragStartTab: (e: React.DragEvent) => void;
}) {
  const name = path.split("/").pop() ?? path;
  return (
    <div
      draggable
      onDragStart={onDragStartTab}
      onClick={onClick}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`group/tab flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-line px-3 py-1.5 text-mono ${
        active ? "bg-ink-700 text-text shadow-[inset_0_-2px_0_var(--brass-500)]" : "text-text-muted hover:bg-ink-700"
      }`}
      title={path}
    >
      <FileIcon name={name} size={13} />
      <span className={transient ? "italic" : ""}>{name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="rounded-sm px-1 text-text-muted opacity-0 hover:text-danger-500 group-hover/tab:opacity-100"
        title="Close"
      >
        ×
      </button>
    </div>
  );
}

function TreeRow({
  node,
  depth,
  open,
  current,
  checked,
  onToggleDir,
  onPreviewFile,
  onOpenFile,
  onCheck,
}: {
  node: TreeNode;
  depth: number;
  open: Set<string>;
  current: string | null;
  checked: Set<string>;
  onToggleDir: (p: string) => void;
  onPreviewFile: (p: string) => void;
  onOpenFile: (p: string) => void;
  onCheck: (p: string) => void;
}) {
  const isOpen = open.has(node.path);
  const pad = { paddingLeft: `${8 + depth * 14}px` };

  if (node.type === "dir") {
    return (
      <div className="group/dir">
        <button
          onClick={() => onToggleDir(node.path)}
          style={pad}
          className="flex h-7 w-full items-center gap-1.5 pr-2 text-left text-small text-text hover:bg-ink-600"
        >
          <span className={`text-mono text-text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}>▸</span>
          <FolderGlyph />
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen &&
          node.children?.map((c) => (
            <TreeRow
              key={c.path}
              node={c}
              depth={depth + 1}
              open={open}
              current={current}
              checked={checked}
              onToggleDir={onToggleDir}
              onPreviewFile={onPreviewFile}
              onOpenFile={onOpenFile}
              onCheck={onCheck}
            />
          ))}
      </div>
    );
  }

  const isCurrent = current === node.path;
  const isChecked = checked.has(node.path);
  return (
    <div
      style={pad}
      className={`group/file flex h-7 items-center gap-1.5 pr-2 ${
        isCurrent ? "bg-ink-600 shadow-[inset_2px_0_0_var(--verd-500)]" : "hover:bg-ink-600"
      }`}
    >
      <input
        type="checkbox"
        checked={isChecked}
        onChange={() => onCheck(node.path)}
        onClick={(e) => e.stopPropagation()}
        className={`h-3 w-3 shrink-0 accent-verd-500 ${
          isChecked ? "opacity-100" : "opacity-0 group-hover/file:opacity-100"
        }`}
        title="Select for download"
      />
      <button
        onClick={() => onPreviewFile(node.path)}
        onDoubleClick={() => onOpenFile(node.path)}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-small"
        title="Single-click to preview · double-click to open a tab"
      >
        <FileIcon name={node.name} />
        <span className={`truncate ${node.generated ? "text-verd-400" : "text-text"}`}>{node.name}</span>
      </button>
    </div>
  );
}

function FolderGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="shrink-0 text-brass-400">
      <path
        d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3l1.5 1.5H13A1.5 1.5 0 0 1 14.5 5v6A1.5 1.5 0 0 1 13 12.5H3A1.5 1.5 0 0 1 1.5 11z"
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  );
}
/** A clear editor state for a tab whose file was removed by a regeneration (styleguide §9.2). */
function MissingFile({ path, onClose }: { path: string; onClose: () => void }) {
  const name = path.split("/").pop() ?? path;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-ink-800 p-8 text-center">
      <FileIcon name={name} size={28} />
      <div className="text-small text-text">
        <span className="mono text-brass-400">{name}</span> no longer exists.
      </div>
      <p className="max-w-sm text-small text-text-muted">
        It was removed when the backend was regenerated for the current runtime. Pick another file
        from the tree.
      </p>
      <button
        onClick={onClose}
        className="rounded-sm border border-rule px-3 py-1 text-eyebrow font-semibold uppercase tracking-eyebrow text-text-muted transition-colors hover:bg-ink-600 hover:text-text"
      >
        Close tab
      </button>
    </div>
  );
}

/** Flat set of every file path in a tree, for existence checks after a refresh. */
function filePaths(nodes: TreeNode[], out: Set<string> = new Set()): Set<string> {
  for (const n of nodes) {
    if (n.type === "file") out.add(n.path);
    else if (n.children) filePaths(n.children, out);
  }
  return out;
}

function firstFile(nodes: TreeNode[]): string | null {
  const readme = nodes.find((n) => n.type === "file" && /readme/i.test(n.name));
  if (readme) return readme.path;
  for (const n of nodes) {
    if (n.type === "file") return n.path;
    if (n.children) {
      const f = firstFile(n.children);
      if (f) return f;
    }
  }
  return null;
}

function countFiles(nodes: TreeNode[]): number {
  return nodes.reduce((n, node) => n + (node.type === "file" ? 1 : countFiles(node.children ?? [])), 0);
}
