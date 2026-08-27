/** Minimal ANSI helpers — the CLI mirrors Backbone's brass/verdigris identity. */
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

function wrap(code: string, s: string): string {
  return useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
}

export const ui = {
  brass: (s: string) => wrap("38;5;179", s), // detected
  verd: (s: string) => wrap("38;5;79", s), // generated
  danger: (s: string) => wrap("38;5;167", s),
  muted: (s: string) => wrap("38;5;245", s),
  bold: (s: string) => wrap("1", s),
  underline: (s: string) => wrap("4", s),
};

export function eyebrow(label: string): string {
  return ui.muted("▏ ") + ui.bold(label.toUpperCase());
}

/** A simple aligned two-column table. */
export function table(rows: string[][], gap = 2): string {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = stripAnsi(cell).length;
      widths[i] = Math.max(widths[i] ?? 0, len);
    });
  }
  return rows
    .map((row) =>
      row
        .map((cell, i) => cell + " ".repeat(Math.max(0, (widths[i] ?? 0) - stripAnsi(cell).length + (i < row.length - 1 ? gap : 0))))
        .join(""),
    )
    .join("\n");
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
