/**
 * Extend prism-react-renderer's bundled Prism with the languages Backbone emits (PHP,
 * Python, SQL, …). The global must be set BEFORE the prismjs component modules load, and
 * static imports are hoisted — so we assign the global first, then load the components with
 * dynamic import() (runtime-sequenced), which is the pattern prism-react-renderer documents.
 * Memoised: the components load exactly once.
 */
import { Prism } from "prism-react-renderer";

let ready: Promise<void> | null = null;

export function ensurePrismLanguages(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    (globalThis as unknown as { Prism: typeof Prism }).Prism = Prism;
    // Base grammars first, then the ones that extend them (php needs markup-templating).
    await import("prismjs/components/prism-markup");
    await import("prismjs/components/prism-clike");
    await import("prismjs/components/prism-javascript");
    await import("prismjs/components/prism-markup-templating");
    await import("prismjs/components/prism-typescript");
    await import("prismjs/components/prism-jsx");
    await import("prismjs/components/prism-tsx");
    await import("prismjs/components/prism-php");
    await import("prismjs/components/prism-python");
    await import("prismjs/components/prism-json");
    await import("prismjs/components/prism-sql");
    await import("prismjs/components/prism-yaml");
    await import("prismjs/components/prism-bash");
    await import("prismjs/components/prism-markdown");
    await import("prismjs/components/prism-toml");
    await import("prismjs/components/prism-ini");
  })();
  return ready;
}
