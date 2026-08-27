import { useEffect, useMemo, useState } from "react";
import { api, type FileContent, type TreeNode } from "../api";
import { CodeViewer } from "./CodeViewer";
import { Button } from "./primitives";

/** VS Code–style explorer: nested tree on the left, code viewer on the right. */
export function FileExplorer({ dir }: { dir: string }) {
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<string | null>(null);
  const [file, setFile] = useState<FileContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load the tree whenever the output dir changes.
  useEffect(() => {
    let alive = true;
    setTree(null);
    setChecked(new Set());
    setFile(null);
    setCurrent(null);
    api
      .generatedTree(dir)
      .then(({ tree }) => {
        if (!alive) return;
        setTree(tree);
        // Expand top-level dirs and open a sensible first file.
        setOpen(new Set(tree.filter((n) => n.type === "dir").map((n) => n.path)));
        const first = firstFile(tree);
        if (first) openFile(first);
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  function openFile(path: string) {
    setCurrent(path);
    api
      .generatedFile(dir, path)
      .then(setFile)
      .catch((e) => setError((e as Error).message));
  }

  function toggleDir(path: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  function toggleCheck(path: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
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

  return (
    <div className="flex flex-col gap-3">
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
        <span className="ml-auto text-small text-text-muted">{fileCount} files</span>
      </div>

      {error && (
        <div className="rounded-md border border-danger-500/50 bg-danger-050 p-3 text-small text-danger-500">{error}</div>
      )}

      <div className="flex min-h-[420px] overflow-hidden rounded-md border border-line max-[900px]:flex-col">
        <div className="w-[264px] shrink-0 overflow-auto border-r border-line bg-surface py-2 max-[900px]:max-h-56 max-[900px]:w-full max-[900px]:border-b max-[900px]:border-r-0">
          {!tree && <div className="px-3 py-2 text-small text-text-muted">Loading tree…</div>}
          {tree &&
            tree.map((n) => (
              <TreeRow
                key={n.path}
                node={n}
                depth={0}
                open={open}
                current={current}
                checked={checked}
                onToggleDir={toggleDir}
                onOpenFile={openFile}
                onCheck={toggleCheck}
              />
            ))}
        </div>
        <div className="flex min-w-0 flex-1">
          {file ? (
            <CodeViewer
              path={file.path}
              language={file.language}
              content={file.content}
              onDownload={() => api.downloadFile(dir, file.path)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-small text-text-muted">
              Select a file to view it.
            </div>
          )}
        </div>
      </div>
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
  onOpenFile,
  onCheck,
}: {
  node: TreeNode;
  depth: number;
  open: Set<string>;
  current: string | null;
  checked: Set<string>;
  onToggleDir: (p: string) => void;
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
        onClick={() => onOpenFile(node.path)}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-small"
      >
        <FileGlyph />
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
function FileGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="shrink-0 text-text-muted">
      <path d="M4 1.5h5L13 5.5V14a.5.5 0 0 1-.5.5h-8A.5.5 0 0 1 4 14z" fill="currentColor" opacity="0.5" />
      <path d="M9 1.5V5a.5.5 0 0 0 .5.5H13" stroke="var(--ink-800)" strokeWidth="1" fill="none" />
    </svg>
  );
}

function firstFile(nodes: TreeNode[]): string | null {
  // Prefer a README at the top level, else the first file encountered depth-first.
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
