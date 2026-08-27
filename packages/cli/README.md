# @backbone/cli — `bb`

The command-line surface for the deterministic pipeline.

```
bb analyze <frontendPath> [--out blueprint.json]   # write + print a Blueprint
bb review [blueprint.json]                          # print a Blueprint summary
bb generate <blueprint.json|frontendPath> --runtime <node|php> --arch <layered|modular> --out <dir> [--dialect sqlite|mysql]
bb regenerate --out <dir> [--frontend <path>]       # additive diff-driven regeneration
bb presets                                          # list template sets
```
