import type { Blueprint, Endpoint } from "@backbone/core";
import { Eyebrow, MethodChip, Toggle } from "./primitives";
import { SourceRef } from "./SourceRef";
import { useProject } from "../store/ProjectContext";

/** Canonical HTTP-method order for consistent presentation within and across groups. */
const METHOD_ORDER = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
function methodRank(m: string): number {
  const i = METHOD_ORDER.indexOf(m as (typeof METHOD_ORDER)[number]);
  return i === -1 ? METHOD_ORDER.length : i;
}

/** An endpoint paired with its index in the original blueprint, so toggles hit the right one. */
interface IndexedEndpoint {
  ep: Endpoint;
  index: number;
}
interface ResourceGroup {
  name: string;
  endpoints: IndexedEndpoint[];
}

/**
 * The resource an endpoint belongs to: its detected entity, else the first meaningful path segment
 * (skipping an `api`/`v1`-style prefix and route parameters), else a `general` bucket.
 */
function resourceOf(ep: Endpoint): string {
  if (ep.entity) return ep.entity;
  const segments = ep.path
    .split("/")
    .filter(Boolean)
    .filter((s) => !s.startsWith(":") && !s.startsWith("{"));
  for (const seg of segments) {
    if (/^(api|v\d+|rest|graphql)$/i.test(seg)) continue;
    return seg;
  }
  return segments[0] ?? "general";
}

/** Group endpoints by resource; groups and their rows are ordered deterministically. */
function groupEndpoints(blueprint: Blueprint): ResourceGroup[] {
  const map = new Map<string, IndexedEndpoint[]>();
  blueprint.endpoints.forEach((ep, index) => {
    const key = resourceOf(ep);
    const list = map.get(key) ?? [];
    list.push({ ep, index });
    map.set(key, list);
  });
  return [...map.entries()]
    .map(([name, endpoints]) => ({
      name,
      endpoints: endpoints.sort(
        (a, b) => methodRank(a.ep.method) - methodRank(b.ep.method) || a.ep.path.localeCompare(b.ep.path),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Detected endpoints, grouped by resource into collapsible sections, with per-endpoint toggles. */
export function EndpointsTable({
  blueprint,
  root,
  onToggle,
}: {
  blueprint: Blueprint;
  root: string;
  onToggle: (index: number, on: boolean) => void;
}) {
  const { expandedGroups, setGroupExpanded } = useProject();

  if (blueprint.endpoints.length === 0) {
    return (
      <div>
        <Eyebrow count={0}>Endpoints</Eyebrow>
        <p className="mt-3 rounded-md border border-line bg-surface p-4 text-small text-text-muted">
          No API calls were detected in the frontend. Add fetch/axios/typed-client calls and
          re-analyze to generate endpoints.
        </p>
      </div>
    );
  }

  const groups = groupEndpoints(blueprint);

  return (
    <div>
      <Eyebrow count={blueprint.endpoints.length}>Endpoints</Eyebrow>
      <p className="mt-1 mb-3 text-small text-text-muted">
        Grouped by resource — {groups.length} {groups.length === 1 ? "group" : "groups"}. Generated
        only for operations present in the frontend. 🔒 marks an auth-protected route.
      </p>
      <div className="space-y-2">
        {groups.map((g) => (
          <Group
            key={g.name}
            group={g}
            root={root}
            open={expandedGroups[g.name] ?? true}
            onOpen={(v) => setGroupExpanded(g.name, v)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

function Group({
  group,
  root,
  open,
  onOpen,
  onToggle,
}: {
  group: ResourceGroup;
  root: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  onToggle: (index: number, on: boolean) => void;
}) {
  const methods = [...new Set(group.endpoints.map((e) => e.ep.method))].sort(
    (a, b) => methodRank(a) - methodRank(b),
  );

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <button
        onClick={() => onOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 bg-surface px-3 py-2.5 text-left transition-colors hover:bg-ink-600"
      >
        <span
          className={`text-text-muted transition-transform duration-[120ms] ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          ›
        </span>
        <span className="font-display text-h3 font-semibold capitalize text-text">{group.name}</span>
        <span className="mono text-small text-text-muted">· {group.endpoints.length}</span>
        <span className="ml-auto flex flex-wrap items-center gap-1">
          {methods.map((m) => (
            <MethodChip key={m} method={m} />
          ))}
        </span>
      </button>

      {open && (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full border-collapse text-small">
            <thead>
              <tr className="border-b border-line text-left">
                {["Method", "Path", "Operation", "Entity", "Auth", "Source", ""].map((h) => (
                  <th key={h} className="eyebrow px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.endpoints.map(({ ep, index }) => (
                <tr
                  key={`${ep.method} ${ep.path}`}
                  className={`border-b border-line/60 last:border-0 ${ep.generate ? "" : "opacity-45"}`}
                >
                  <td className="px-3 py-2">
                    <MethodChip method={ep.method} />
                  </td>
                  <td className={`mono px-3 py-2 ${ep.generate ? "" : "line-through"}`}>{ep.path}</td>
                  <td className="px-3 py-2 text-text-muted">{ep.operation}</td>
                  <td className="px-3 py-2">{ep.entity ?? <span className="text-text-muted">—</span>}</td>
                  <td className="px-3 py-2">
                    {ep.auth.required ? "🔒" : <span className="text-text-muted">·</span>}
                  </td>
                  <td className="px-3 py-2">
                    {ep.sourceRefs[0] ? (
                      <SourceRef root={root} file={ep.sourceRefs[0].file} line={ep.sourceRefs[0].line} />
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Toggle on={ep.generate} onChange={(v) => onToggle(index, v)} title="Include endpoint" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Compact auth summary. */
export function AuthSummary({ blueprint }: { blueprint: Blueprint }) {
  const { auth } = blueprint;
  return (
    <div>
      <Eyebrow>Auth</Eyebrow>
      <div className="mt-3 rounded-md border border-line bg-surface p-4">
        {auth.required ? (
          <>
            <p className="text-body text-text">
              Auth <span className="text-brass-400">required</span> — detected from a login/register
              call or bearer-token usage.
            </p>
            <p className="mt-2 text-small text-text-muted">
              Generates <span className="mono">POST /auth/register</span>,{" "}
              <span className="mono">POST /auth/login</span>, <span className="mono">GET /auth/me</span>,
              a JWT verification middleware, a role guard, and a reserved{" "}
              <span className="mono">users</span> table.
            </p>
            {auth.roles.length > 0 && (
              <p className="mt-2 text-small text-text-muted">
                Roles: {auth.roles.map((r) => <span key={r} className="mono text-brass-400">{r} </span>)}
              </p>
            )}
          </>
        ) : (
          <p className="text-body text-text-muted">
            No auth detected — no login/register call or bearer token in the frontend. No auth code
            is generated.
          </p>
        )}
      </div>
    </div>
  );
}
