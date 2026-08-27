/**
 * Language-aware file icons for the explorer tree (styleguide §9.1). One `iconFor(name)` mapping
 * backs a single `FileIcon` component so every place that lists files shows the same measured
 * lettermark tile — a rounded square in a palette accent with a 1–3 char monospace code. Extend the
 * language coverage by adding one entry to `iconFor`.
 */

interface IconSpec {
  /** 1–3 char code rendered inside the tile; squeezed to a fixed width so length never matters. */
  label: string;
  /** CSS custom property (without `var(...)`) used for the stroke, tint fill and text. */
  color: string;
  /** Lockfiles get a small underline bar to read as "manifest / lock". */
  lock?: boolean;
}

const BRASS = "--brass-500"; // frontend source
const VERD = "--verd-500"; // runtime source
const INFO = "--info-500"; // data / config / docs
const SLATE = "--slate-300"; // neutral / fallback

const BY_EXT: Record<string, IconSpec> = {
  // Runtime source
  py: { label: "PY", color: VERD },
  php: { label: "PHP", color: VERD },
  // Frontend source
  ts: { label: "TS", color: BRASS },
  tsx: { label: "TSX", color: BRASS },
  js: { label: "JS", color: BRASS },
  jsx: { label: "JSX", color: BRASS },
  mjs: { label: "JS", color: BRASS },
  cjs: { label: "JS", color: BRASS },
  // Data / config
  json: { label: "{}", color: INFO },
  yml: { label: "YML", color: INFO },
  yaml: { label: "YML", color: INFO },
  sql: { label: "SQL", color: INFO },
  toml: { label: "TOML", color: INFO },
  ini: { label: "INI", color: SLATE },
  cfg: { label: "CFG", color: SLATE },
  // Docs
  md: { label: "MD", color: INFO },
  txt: { label: "TXT", color: SLATE },
  // Shell
  sh: { label: "SH", color: SLATE },
  lock: { label: "LCK", color: SLATE, lock: true },
};

/** Specific filenames that override the extension mapping (lockfiles, dotfiles, entrypoints). */
const BY_NAME: Record<string, IconSpec> = {
  "package.json": { label: "PKG", color: SLATE, lock: true },
  "composer.json": { label: "PKG", color: SLATE, lock: true },
  "package-lock.json": { label: "LCK", color: SLATE, lock: true },
  "composer.lock": { label: "LCK", color: SLATE, lock: true },
  "requirements.txt": { label: "REQ", color: SLATE, lock: true },
  "pnpm-lock.yaml": { label: "LCK", color: SLATE, lock: true },
  dockerfile: { label: "DOK", color: INFO },
  ".gitkeep": { label: "GIT", color: SLATE },
  ".gitignore": { label: "GIT", color: SLATE },
};

/** Resolve the icon spec for a file name (case-insensitive). Never throws. */
export function iconFor(name: string): IconSpec {
  const lower = name.toLowerCase();
  if (BY_NAME[lower]) return BY_NAME[lower];
  if (lower.startsWith(".env")) return { label: "ENV", color: INFO };
  if (lower.startsWith(".")) {
    // Generic dotfile — code from the first letters after the dot.
    const code = lower.replace(/^\.+/, "").replace(/[^a-z0-9]/g, "").slice(0, 3).toUpperCase();
    return { label: code || "•", color: SLATE };
  }
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  return BY_EXT[ext] ?? { label: "•", color: SLATE };
}

/**
 * The measured lettermark tile. Rendered as SVG so the tile is crisp at any size and the code is
 * fitted to a fixed width (`textLength`) regardless of how many characters it has.
 */
export function FileIcon({ name, size = 15 }: { name: string; size?: number }) {
  const { label, color, lock } = iconFor(name);
  const c = `var(${color})`;
  const pad = size * 0.06;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className="shrink-0"
      aria-hidden="true"
      role="presentation"
    >
      <rect
        x={0.75}
        y={0.75}
        width={14.5}
        height={14.5}
        rx={3}
        fill={c}
        fillOpacity={0.12}
        stroke={c}
        strokeOpacity={0.85}
        strokeWidth={1}
      />
      <text
        x={8}
        y={label.length > 2 ? 10.4 : 10.6}
        textAnchor="middle"
        fill={c}
        fontFamily="var(--font-mono)"
        fontSize={label.length > 2 ? 5.4 : 6.6}
        fontWeight={600}
        textLength={label.length > 1 ? 11 - pad : undefined}
        lengthAdjust="spacingAndGlyphs"
      >
        {label}
      </text>
      {lock && <rect x={4.5} y={12.4} width={7} height={1.1} rx={0.55} fill={c} fillOpacity={0.7} />}
    </svg>
  );
}
