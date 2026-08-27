import type { Blueprint } from "@backbone/core";
import { Eyebrow, MethodChip, Toggle } from "./primitives";
import { SourceRef } from "./SourceRef";

/** Detected endpoints with per-endpoint include/exclude toggles. */
export function EndpointsTable({
  blueprint,
  root,
  onToggle,
}: {
  blueprint: Blueprint;
  root: string;
  onToggle: (index: number, on: boolean) => void;
}) {
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
  return (
    <div>
      <Eyebrow count={blueprint.endpoints.length}>Endpoints</Eyebrow>
      <p className="mt-1 mb-3 text-small text-text-muted">
        Generated only for operations present in the frontend. 🔒 marks an auth-protected route.
      </p>
      <div className="overflow-x-auto rounded-md border border-line">
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
            {blueprint.endpoints.map((ep, i) => (
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
                <td className="px-3 py-2">{ep.auth.required ? "🔒" : <span className="text-text-muted">·</span>}</td>
                <td className="px-3 py-2">
                  {ep.sourceRefs[0] ? (
                    <SourceRef root={root} file={ep.sourceRefs[0].file} line={ep.sourceRefs[0].line} />
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Toggle on={ep.generate} onChange={(v) => onToggle(i, v)} title="Include endpoint" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
