# Backbone — Visual Styleguide

> Single source of truth for the Backbone web UI. Every new surface must look like it
> was always part of the product. Colours and type below are fixed; do not restyle on
> the side.

Backbone drafts a backend from a frontend, deterministically. Its world is **technical
drafting and structural engineering** — blueprints, drafting instruments, measured rules.
Determinism reads as *precision*, not fuzziness. The UI is a drafting table, not a chat.

---

## 1. Design tokens

All tokens live as CSS custom properties on `:root` in `packages/web/src/styles/tokens.css`
and are surfaced to Tailwind via `theme.extend`. Never hard-code a hex outside the token file.

### 1.1 Colour

Graphite-ink base (deliberately **not** near-black), a **brass / signal-amber** primary that
marks everything *detected from the frontend*, and a **verdigris teal** that marks everything
*generated into the backend*. The two accents are semantic, not decorative.

| Token | Hex | Role |
|-------|-----|------|
| `--ink-900` | `#0E1419` | App background (graphite ink) |
| `--ink-800` | `#121A21` | Sunken wells, canvas ground |
| `--ink-700` | `#161F27` | Surface / cards |
| `--ink-600` | `#1C2833` | Raised surface, popovers |
| `--ink-500` | `#243039` | Hairlines, grid lines, dividers |
| `--ink-400` | `#33424E` | Strong border, drafting rules |
| `--slate-300` | `#8497A6` | Muted / secondary text |
| `--slate-200` | `#AEBECB` | Body text on dark |
| `--paper-100` | `#E8EEF2` | Primary text (near-white, cool) |
| `--brass-600` | `#C8863A` | Detected accent, pressed |
| `--brass-500` | `#E3A44C` | **Detected-from-frontend** (primary accent) |
| `--brass-400` | `#EEBE77` | Detected accent, hover/light |
| `--brass-050` | `#2A2013` | Detected accent tint (fills, chips) |
| `--verd-600` | `#3E9186` | Generated accent, pressed |
| `--verd-500` | `#4FB0A5` | **Generated-into-backend** (secondary accent) |
| `--verd-400` | `#77C7BD` | Generated accent, hover/light |
| `--verd-050` | `#12211F` | Generated accent tint |
| `--danger-500` | `#D9634E` | Errors, destructive, removed-in-diff |
| `--danger-050` | `#251510` | Danger tint |
| `--warn-500` | `#D9A441` | Warnings (reuses brass family, higher chroma) |
| `--info-500` | `#5B93C4` | Neutral info, links |

Semantic aliases (use these in components, not the raw ramp):

| Alias | Maps to | Meaning |
|-------|---------|---------|
| `--bg` | `--ink-900` | Page |
| `--surface` | `--ink-700` | Card / panel |
| `--surface-raised` | `--ink-600` | Popover / menu |
| `--line` | `--ink-500` | Hairline divider |
| `--rule` | `--ink-400` | Measured drafting rule |
| `--text` | `--paper-100` | Primary text |
| `--text-muted` | `--slate-300` | Secondary text |
| `--detected` | `--brass-500` | Anything derived from the frontend |
| `--generated` | `--verd-500` | Anything emitted into the backend |

**Diff palette** (regeneration view): added → `--verd-500`, changed → `--brass-500`,
removed → `--danger-500`, unchanged → `--slate-300`.

Light mode is **not** supported. This is a dark, single-theme tool.

### 1.2 Typography

Three deliberate roles. The IBM Plex superfamily carries the engineering identity; Space
Grotesk gives display type its character; mono carries every source-ref, path, and datum.

| Role | Family | Fallback stack |
|------|--------|----------------|
| Display | **Space Grotesk** | `"Space Grotesk", "IBM Plex Sans", system-ui, sans-serif` |
| Body / UI | **IBM Plex Sans** | `"IBM Plex Sans", system-ui, -apple-system, sans-serif` |
| Mono / data | **IBM Plex Mono** | `"IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace` |

Load from Google Fonts (`fonts.googleapis.com` / `fonts.gstatic.com`) — Space Grotesk
500/600/700, IBM Plex Sans 400/500/600, IBM Plex Mono 400/500.

Type scale (1.200 minor-third, base 14px):

| Token | Size / line-height | Weight | Use |
|-------|--------------------|--------|-----|
| `--t-display` | 34px / 38px | 600 | Page hero, stage title |
| `--t-h1` | 24px / 30px | 600 | Section headers |
| `--t-h2` | 19px / 26px | 600 | Card titles, entity names |
| `--t-h3` | 16px / 22px | 600 | Sub-headers |
| `--t-body` | 14px / 21px | 400 | Body, controls |
| `--t-small` | 13px / 18px | 400 | Secondary |
| `--t-mono` | 12.5px / 18px | 400 | Source refs, paths, field types |
| `--t-eyebrow` | 11px / 14px | 600 | Eyebrows, measured labels — `letter-spacing: 0.14em; text-transform: uppercase` |

Display headings use `letter-spacing: -0.01em`. Mono is used verbatim for all
`file:line` source refs, HTTP paths, TS types, and generated file names — never body font.

### 1.3 Spacing, radius, borders, shadow

- **Spacing scale** (px): `2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 56, 72`. Tailwind maps to
  `0.5,1,1.5,2,3,4,5,6,8,10,14,18`. Default panel padding `24`; tight controls `8–12`.
- **Radius**: `--r-sm 4px`, `--r-md 6px`, `--r-lg 10px`, `--r-pill 999px`. Drafting cards
  use `--r-md`; the app is precise, not pillowy — nothing above `10px` except pills/avatars.
- **Borders**: default `1px solid var(--line)`. Emphasis `1px solid var(--rule)`. Accent
  edges use the semantic accent at 1px. Focus ring: `2px solid var(--brass-400)` with
  `outline-offset: 2px`.
- **Shadow** (used sparingly — this is a flat drafting surface): `--shadow-pop:
  0 8px 24px -8px rgba(0,0,0,.55)` for popovers/menus only. Cards are delineated by
  border + surface step, not shadow.

### 1.4 The drafting grid

Canvas backgrounds carry a faint measured grid:
```css
background-color: var(--ink-800);
background-image:
  linear-gradient(var(--ink-500) 1px, transparent 1px),
  linear-gradient(90deg, var(--ink-500) 1px, transparent 1px);
background-size: 24px 24px;
background-position: -1px -1px;
opacity via a 0.35 overlay layer, never full-strength.
```

---

## 2. Signature elements

These are what Backbone is remembered by. Use them; do not invent alternatives.

### 2.1 The measured spine
A vertical ruled edge — the "backbone" — runs down the left of the app shell and of the
Blueprint canvas: a `2px` `--rule` line overlaid with short tick marks every `24px`
(`1px × 6px`, `--ink-400`) and, at stage boundaries, a mono measure label. It signals that
everything is drafted to measure.

### 2.2 Drafting cards (entities)
Entities render as precise cards with **corner registration ticks** (an L-shaped `1px`
mark in each corner, `--rule`), a mono entity header, and a ruled field table. Detected
cards carry a `--detected` top edge (`2px`). Fields show `name`, mono `type`, a nullability
dot, and relation markers. Enum fields list their literal values as mono chips.

### 2.3 Relation connectors
Relations draw as orthogonal SVG connectors (right-angle, never bezier) in `--rule`, with
**cardinality glyphs** at each end: `1` (crow's-foot bar) and `∞` (crow's-foot fork).
Many-to-many draws through a small join-table node.

### 2.4 Measured labels / eyebrows
Section eyebrows use `--t-eyebrow` with a leading tick glyph (`▏`) and often a mono
count/coordinate, e.g. `▏ ENTITIES · 04` — labels encode real counts, not decoration.

---

## 3. Component patterns

- **App shell**: fixed left rail (pipeline stages Analyze → Blueprint → Generate →
  Regenerate, each a measured tick on the spine), top bar with frontend-path + runtime/arch
  selector, main canvas. Rail width `248px`.
- **Buttons**: primary = solid `--brass-500` on `--ink-900` text, `--r-md`, `600` weight,
  height `36px`, padding `0 16px`. Secondary = `1px --rule` ghost on transparent, `--text`.
  Generated actions (Generate) use `--verd-500` solid. Destructive = `--danger-500` ghost.
  Disabled `opacity: .45`. Hover shifts to the `-400` accent; active to `-600`.
- **Chips / tags**: `--r-pill`, `--t-eyebrow`, tinted background (`--brass-050`/`--verd-050`)
  with a `1px` accent border and accent text. HTTP methods are chips: GET=info, POST=verd,
  PUT/PATCH=brass, DELETE=danger.
- **Toggles**: entities/fields/endpoints toggle in/out of generation via a switch; off =
  `opacity .5` + strikethrough on the name. Track `--ink-500`, knob `--paper-100`, on =
  `--verd-500`.
- **Tables**: header row `--t-eyebrow` `--text-muted`, `1px --line` row rules, mono for
  type/path columns, `12px` vertical cell padding.
- **Source-ref links**: mono, `--info-500`, underline on hover, render `path:line`; clicking
  reveals the source snippet in a popover.
- **Code / report blocks**: mono on `--ink-800`, `1px --line`, `--r-md`, `16px` padding,
  `overflow-x:auto`.
- **Empty states**: a drafting-grid panel with a measured eyebrow, one plain sentence of
  direction, and the single next action. Never a mood illustration.
- **Diff rows**: left gutter glyph `+ / ~ / − / ·` in the diff palette colour, mono label.

## 4. Interactive states & quality floor

- Focus is always visible: `2px --brass-400` ring, `2px` offset. Never remove outlines.
- Hover on interactive surfaces lifts background one ink step (`--ink-700`→`--ink-600`).
- Transitions: `120ms ease` for colour/background, `180ms ease` for panel/disclosure.
  Respect `prefers-reduced-motion: reduce` — drop transforms and non-essential transitions.
- Responsive down to `768px`: the left rail collapses to a top strip; canvas scrolls.
  Wide content (ERD, tables, code) scrolls inside its own `overflow-x:auto` container; the
  page body never scrolls horizontally.
- Keyboard: all toggles, selectors, and stage nav reachable and operable.

## 5. Voice

Plain, precise, engineering register. Sentence case. Name things by what the developer
controls: "Detected 4 entities", "Generate backend", "Regenerate — 2 additive migrations".
Errors state what happened and the fix, in the tool's voice, no apology. Empty screens
invite the next action. Never sell; describe.

## 6. Iteration 2 — explorer, viewer, modal, badges, structure

These extend the system above; they introduce no new hues. Every colour still comes from the
ink ramp + brass/verdigris/signal tokens.

### 6.1 Modal / dialog (folder picker)
A centred panel over a `rgba(14,20,25,.72)` scrim (the `--ink-900` ground at 72%). Panel:
`--surface-raised` background, `1px --rule` border, `--r-lg`, `--shadow-pop`, max-width `640px`,
max-height `72vh`. Header carries a measured eyebrow + close control; a **breadcrumb** row uses
mono `--text-muted` with `/` separators and a brass current segment; the body is a scrollable
list of rows. A sticky footer holds the primary confirm ("Select this folder", brass) and a
ghost cancel. Focus is trapped; `Esc` closes; the scrim is clickable to dismiss.

### 6.2 File explorer (VS Code–style)
Two panes inside one `1px --line` framed surface, split ~`260px` tree / flexible viewer.
- **Tree**: rows `28px` tall, `--t-small`, indented `14px` per depth. A folder row shows a
  disclosure chevron (rotates `90°` when open, `120ms`) and a **folder glyph** in `--brass-400`;
  a file row shows a **file glyph** in `--text-muted` and, on the owned `generated/` boundary,
  the filename in `--verd-400` to reinforce "generated". Hover lifts to `--ink-600`; the open
  file row is `--ink-600` with a `2px --verd-500` left marker. A checkbox (appears on hover /
  when any are checked) drives multi-select.
- **Viewer**: header bar (`--ink-800`, `1px --line` bottom) with the mono file path on the left
  and **Copy** + **Download this file** ghost icon-buttons on the right; body is the code block.

### 6.3 Code viewer
Mono `--t-mono`, `--ink-800` ground, a `44px` line-number gutter in `--slate-300` separated by a
`1px --line` rule, `overflow:auto`, wide code scrolls within its own container. Syntax colours map
to the palette — no rainbow: keyword `--brass-400`, string `--verd-400`, number `--info-500`,
comment `--slate-300` italic, function/entity name `--paper-100`, punctuation `--slate-200`,
operator `--brass-500`. The focused source line (popover) keeps its brass tint.

### 6.4 Status badges (result summary)
A wrapping row of **labelled badges**: each is a `--surface` chip, `1px --line`, `--r-md`,
`6px 10px`, with an eyebrow label above a `--text` value. Semantic values keep their accent —
mode `Regenerate` = brass, `Generate` = verd; auth = brass; "migration added" = verd, "none" =
`--text-muted`. Date-times render locale-formatted (`27 Aug 2026, 18:14`) with the raw ISO in the
`title`. The block leads with a one-line mode explanation in `--text-muted`.

### 6.5 Structure diagram (Mermaid)
Rendered on the drafting-grid ground inside a framed, scrollable surface. The Mermaid theme is
overridden to the system: node fill `--ink-700`, node border `--rule`, entity/class titles
`--brass-400`, edges `--rule`, edge labels (cardinality) `--text-muted`, text `--paper-100`,
font the mono stack. Two toggle chips switch **Directory** vs **Entities**; a ghost "Copy Mermaid
source" sits in the header.

### 6.6 Tabbed results
Generate results use an underline tab row (Report · Files · Database · Structure): active tab
`--text` with a `2px --brass-500` bottom marker, inactive `--text-muted`. Tabs are buttons,
keyboard-operable.

## 7. Iteration 3 — selectors, frontend badge, database view, pro explorer

These extend the system above; they introduce **no new hues** — every colour still comes from the
ink ramp + brass (detected) / verdigris (generated) / signal tokens.

### 7.1 Dependent selectors (runtime → framework → architecture)
Three segmented controls in one framed `--surface` panel. Selecting a runtime narrows the framework
set; selecting a framework narrows the architecture set. Architecture options that are **not valid**
for the framework are `disabled` at `opacity .3` with a `not-allowed` cursor and a `title` tooltip
carrying the one-line reason from the capability matrix. Options that are valid but not yet
generatable render in `--slate-300` (muted, still disabled) with an explanatory tooltip. The
framework default architecture is marked with a trailing `★`. A one-line architecture description
(mono eyebrow + sentence) sits under the panel.

### 7.2 Detected-frontend badge
The analyzer's detected frontend framework renders as a **brass detected badge**: an inline pill,
`1px --brass-500/50` border on `--brass-050`, a measured `Frontend` eyebrow, a small drafting glyph
(filled `--brass-500` circle when detected, hollow `--rule` when not), the framework name in
`--brass-400` display, the version in mono `--brass-500`, and build-tool/language meta in
`--text-muted`. Undetected → neutral `--surface` pill with a muted "Undetected" sentence. Brass is
correct here: the frontend is the *detected* input.

### 7.3 Database (ER) view
A dedicated relational diagram, separate from the structure/directory diagram. Rendered as a Mermaid
`erDiagram` on the drafting-grid ground in a framed, scrollable surface, themed with the same
Mermaid overrides as §6.5. A **cardinality legend** precedes it: three mono chips `1:1 / 1:N / N:N`
(`--brass-400` on `--ink-800`, `1px --rule`) with `--text-muted` labels. Relations draw with
crow's-foot notation (`||--||`, `||--o{`, `}o--o{`); tables list columns with `PK`/`FK` markers.
A ghost "Copy diagram source" sits in the header.

### 7.4 VS Code–grade explorer
Extends §6.2. The tree ↔ editor split gains a **draggable splitter** (`1px` hit-strip, hover
`--brass-500/40`); tree width clamps `160–520px`. A **tab strip** (`--ink-800`, `1px --line` bottom)
holds open files: single-click **previews** (transient tab, name italic), double-click **pins** a
persistent tab; the active tab is `--ink-700` with a `2px --brass-500` bottom marker and a hover-in
`×` close. A file may be opened **side by side** (Split action, or drag a tab to the right 40% — a
`--brass-050/40` drop overlay with a `2px --brass-400` left edge shows the target); the split
divider is draggable (`--line`, hover brass). An **editor zoom** control (− / `Npx` reset / +) sits
in the toolbar; the code font-size/line-height scale from it (default tighter, `12px`). The editor
stays read-only.

### 7.5 Open in VS Code
A ghost action (`1px --rule`, neutral bracket glyph — no external branding) at project level (result
header + explorer toolbar) and per file (viewer header, compact). Disabled at `opacity .4` with a
tooltip when the host `code` CLI is absent; a `vscode://file/…` deep link is the fallback. Transient
status text in mono (`--verd-400` opening / `--warn-500` cli-missing / `--danger-500` error).

## 8. Iteration 4 — persistence, grouped endpoints, diagram canvas, transparent change set

These extend the system above; they introduce **no new hues** — every colour still comes from the
ink ramp + brass (detected) / verdigris (generated) / signal tokens.

### 8.1 Persistence & the "Clear project data" action
Project working state persists client-side, keyed per analysed project. Persistence is invisible in
the chrome — nothing new is shown for "it saved". The **Clear project data** control is a destructive
ghost action (`1px --danger-500`, `--danger-500` text, hover `--danger-050`) that lives in the top bar
beside the blueprint actions, and only appears once a project has persisted state. It opens a
**confirm dialog** (§6.1 modal shell): measured eyebrow header, one plain sentence of consequence, a
mono bullet list of exactly what is removed (Blueprint · endpoints · database · directory · change
set), a ghost **Cancel** and a solid `--danger-500` **Clear project data** confirm. `Esc` and scrim
dismiss. On confirm the UI resets to the empty Welcome state and a **toast** confirms.

### 8.2 Toast (transient confirmation)
A single bottom-right toast: `--surface-raised`, `1px --rule`, `--r-md`, `--shadow-pop`, `10px 14px`,
a `2px` left marker in the semantic accent (`--verd-500` success · `--danger-500` error · `--rule`
neutral), a mono eyebrow-less line of `--text`. Slides up `180ms ease`, auto-dismisses after ~2.8s,
respects `prefers-reduced-motion`. Never stacks more than one; a new toast replaces the current.

### 8.3 Grouped endpoints
The flat endpoints table becomes **collapsible resource groups**. Each group is a framed row on
`--surface`: a header button (`--ink-700`, hover `--ink-600`) carrying a disclosure chevron
(rotates `90°` open, `120ms`), the resource name in `--t-h3` `--text`, a mono `· N` count, and a
compact **method tally** of the group's HTTP-method chips. Expanded, the group reveals the existing
endpoint rows (method chip, mono path, operation, entity, `🔒` auth, source-ref, generate toggle) —
unchanged in content, only reparented. Methods order consistently **GET · POST · PUT · PATCH ·
DELETE**. Resource = the endpoint's `entity`, else the first non-parameter path segment, else
`general`. Group open/closed state persists with the project.

### 8.4 Shared diagram canvas (zoom / pan / fit)
One reusable canvas frames every diagram (Database ER, Structure entities, Structure directory). The
frame is the drafting-grid ground (§1.4) in a `1px --line` surface, `overflow:hidden`, `min-height`
`320px`, `max-height` `72vh`. A **toolbar** sits top-right inside the frame: ghost icon-buttons
`−` / `reset` / `+` / **Fit** (`1px --rule`, `--surface-raised`, `28px`), plus a mono `NN%` zoom
readout in `--text-muted`. The diagram is a transform layer (`translate()` + `scale()`,
`transform-origin: 0 0`); **click-drag pans** (cursor `grab`→`grabbing`), **wheel/⌘-wheel zooms**
toward the pointer, **Fit** frames the content with an `~8%` margin, **reset** returns to 100% at
top-left. Zoom range `0.2–4×`. Controls are keyboard-focusable; `prefers-reduced-motion` drops the
ease. The header above the frame keeps the existing eyebrow, mode toggles, and **Copy … source**.

### 8.5 Database ER — readable default
The ER diagram renders at a **readable default** (fit-to-view on first paint, never sub-legible) inside
§8.4. Tables list every column with `PK`/`FK` markers; relations carry crow's-foot cardinality with an
explicit `1:1 / 1:N / N:N` label; the three-chip cardinality legend (§7.3) still precedes the frame.

### 8.6 Compact structure
Both structure diagrams are **compact**: shorter node labels, tighter Mermaid spacing
(`nodeSpacing`/`rankSpacing` reduced), and the **Directory** view groups files inside their folder as
nested Mermaid `subgraph`s (folder title `--brass-400`, files `--text`, the `generated/` boundary in
`--verd-400`) rather than one sprawling left-to-right graph. Large trees fit via §8.4's Fit control.

### 8.7 Transparent change set
The regeneration change set leads with an **impact summary header**: two mono tallies
`entities — X added · Y modified · Z deleted` and `endpoints — …`, each count coloured in the diff
palette (added `--verd-500`, modified `--brass-500`, deleted `--danger-500`, zero `--text-muted`), and
a one-line **legend** for the `+ / ~ / −` markers. Below, changes group by kind under measured
sub-eyebrows. Each change is a **diff row**: a gutter glyph (`+`/`~`/`−`) in its palette colour, a mono
label, and a `--text-muted` **context clause** explaining the change where derivable ("new type
detected", "no longer called by the frontend", "migration appended"). **Deletions are explicit** —
labelled `deleted`, name struck through in `--danger-500`. **Modifications show field-level detail**:
the changed entity lists its added/removed/changed fields as inline mono chips in the diff palette.
Unchanged items are omitted. The whole set is computed deterministically from the blueprint diff and
persists with the project, so it never flickers between generations.

### 8.8 English-locale timestamps
All rendered date-times use an explicit English locale (`en-GB`, `27 Aug 2026, 10:41 PM`) — never the
host's default locale — with the raw ISO string in the `title`.
