# @backbone/web

The pipeline UI: analyse a frontend → review & edit the Blueprint → generate → regenerate.
A thin Express server runs the deterministic analyzer/generators on disk; a Vite + React +
Tailwind client (built strictly against `docs/STYLEGUIDE.md`) drives it. No AI anywhere.

```bash
pnpm --filter @backbone/web dev     # server :5411 + client :5410 (open :5410)
```

Stages (left rail / measured spine): **Analyze** (frontend path → Analyze), **Blueprint**
(drafting cards with relation connectors + cardinality; entity/field/endpoint toggles; source
popovers), **Generate** (runtime × architecture × dialect, rendered GENERATION_REPORT + file
tree), **Regenerate** (additive change set). Download the edited `blueprint.json` any time.
