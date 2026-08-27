/**
 * Extend prism-react-renderer's bundled Prism with the languages Backbone emits (PHP,
 * Python, SQL, …). The global assignment must happen before the component modules load, so
 * this file assigns the global first, then imports the components in dependency order.
 * Imported once (side-effecting) by the code viewer.
 */
import { Prism } from "prism-react-renderer";

// prismjs components attach themselves to `global.Prism`.
(globalThis as unknown as { Prism: typeof Prism }).Prism = Prism;

/* eslint-disable import/first */
// Base grammars other languages extend.
import "prismjs/components/prism-markup";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-markup-templating"; // required by php
// Target + config languages.
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-php";
import "prismjs/components/prism-python";
import "prismjs/components/prism-json";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-ini";

export {};
