import { StreamLanguage } from "@codemirror/language";
import type { Extension } from "@codemirror/state";

// File extension to language mapping
const FILE_LANGUAGE_MAP: Record<string, string> = {
  // Web languages
  css: "css",
  scss: "css",
  sass: "css",
  less: "css",
  html: "html",
  htm: "html",
  xhtml: "html",
  svelte: "html",
  svg: "html",
  vue: "vue",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  jsonc: "json",
  json5: "json",
  md: "markdown",
  mdx: "markdown",
  markdown: "markdown",
  xml: "xml",
  xsd: "xml",
  xsl: "xml",
  xslt: "xml",
  wsdl: "xml",
  rss: "xml",
  atom: "xml",
  plist: "xml",

  // Systems languages
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  hxx: "cpp",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  groovy: "groovy",
  swift: "swift",
  m: "objectivec",
  mm: "objectivec",

  // Scripting languages
  py: "python",
  pyw: "python",
  pyi: "python",
  rb: "ruby",
  rbw: "ruby",
  rake: "ruby",
  gemspec: "ruby",
  php: "php",
  phtml: "php",
  php3: "php",
  php4: "php",
  php5: "php",
  php7: "php",
  phps: "php",
  lua: "lua",
  pl: "perl",
  pm: "perl",
  t: "perl",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  csh: "shell",
  tcsh: "shell",
  ksh: "shell",
  ps1: "powershell",
  psd1: "powershell",
  psm1: "powershell",
  ps1xml: "powershell",

  // Functional languages
  hs: "haskell",
  lhs: "haskell",
  elm: "elm",
  erl: "erlang",
  hrl: "erlang",
  ex: "elixir",
  exs: "elixir",
  clj: "clojure",
  cljs: "clojure",
  cljc: "clojure",
  edn: "clojure",
  lisp: "commonlisp",
  lsp: "commonlisp",
  l: "commonlisp",
  cl: "commonlisp",
  fasl: "commonlisp",
  scm: "scheme",
  ss: "scheme",
  sld: "scheme",
  fs: "fsharp",
  fsi: "fsharp",
  fsx: "fsharp",
  fsscript: "fsharp",
  ml: "ocaml",
  mli: "ocaml",

  // Data & Config languages
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "properties",
  cfg: "properties",
  conf: "properties",
  config: "properties",
  env: "properties",
  properties: "properties",
  sql: "sql",
  sqlite: "sql",
  mysql: "sql",
  pgsql: "sql",
  graphql: "graphql",
  gql: "graphql",

  // Other languages
  r: "r",
  rd: "r",
  rscript: "r",
  jl: "julia",
  coffee: "coffeescript",
  litcoffee: "coffeescript",
  dart: "dart",
  sol: "solidity",
  vy: "vyper",
  cr: "crystal",
  nim: "nim",
  nims: "nim",
  zig: "zig",
  v: "v",
  vv: "v",

  // Template engines
  ejs: "javascript",
  hbs: "html",
  handlebars: "html",
  pug: "pug",
  jade: "pug",
  njk: "html",
  nunjucks: "html",
  twig: "html",
  liquid: "liquid",

  // Build & tooling
  dockerfile: "dockerfile",
  makefile: "makefile",
  mk: "makefile",
  cmake: "cmake",
  ninja: "ninja",
  gyp: "python",
  gyi: "python",
  vcl: "vcl",
  nginx: "nginx",

  // Documentation
  tex: "stex",
  latex: "stex",
  ltx: "stex",
  rst: "rst",

  // Protocol & data formats
  proto: "protobuf",
  thrift: "thrift",
  avdl: "avro",
  avsc: "json",
  capnp: "capnp",

  // Assembly & low-level
  asm: "gas",
  s: "gas",
  nasm: "nasm",

  // Markup & text
  csv: "spreadsheet",
  tsv: "spreadsheet",
  diffs: "diff",
  patch: "diff",
  diff: "diff",
};

export function resolveLanguage(filePath: string): string {
  // Handle Dockerfile without extension
  const lowerPath = filePath.toLowerCase();
  if (
    (lowerPath.includes("dockerfile") || lowerPath.includes("docker")) &&
    (lowerPath.endsWith("dockerfile") || lowerPath.includes("dockerfile."))
  ) {
    return "dockerfile";
  }

  // Handle Makefile
  if (lowerPath.includes("makefile") || lowerPath.endsWith(".mk")) {
    return "makefile";
  }

  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return FILE_LANGUAGE_MAP[ext] ?? "plaintext";
}

export async function loadLanguageSupport(
  language: string
): Promise<Extension[]> {
  if (language === "plaintext") {
    return [];
  }

  try {
    switch (language) {
      // Web languages
      case "css": {
        const { css } = await import("@codemirror/lang-css");
        return [css()];
      }
      case "html": {
        const { html } = await import("@codemirror/lang-html");
        return [html()];
      }
      case "vue": {
        const { vue } = await import("@codemirror/lang-vue");
        return [vue()];
      }
      case "xml": {
        const { xml } = await import("@codemirror/lang-xml");
        return [xml()];
      }
      case "javascript":
      case "typescript": {
        const { javascript } = await import("@codemirror/lang-javascript");
        return [javascript({ typescript: language === "typescript" })];
      }
      case "json": {
        const { json } = await import("@codemirror/lang-json");
        return [json()];
      }
      case "markdown": {
        const { markdown } = await import("@codemirror/lang-markdown");
        return [markdown()];
      }

      // Systems languages
      case "c":
      case "cpp": {
        const { cpp } = await import("@codemirror/lang-cpp");
        return [cpp()];
      }
      case "go": {
        const { go } = await import("@codemirror/lang-go");
        return [go()];
      }
      case "java": {
        const { java } = await import("@codemirror/lang-java");
        return [java()];
      }
      case "rust": {
        const { rust } = await import("@codemirror/lang-rust");
        return [rust()];
      }

      // Scripting languages
      case "python": {
        const { python } = await import("@codemirror/lang-python");
        return [python()];
      }
      case "php": {
        const { php } = await import("@codemirror/lang-php");
        return [php()];
      }
      case "sql": {
        const { sql } = await import("@codemirror/lang-sql");
        return [sql()];
      }
      case "yaml": {
        const { yaml } = await import("@codemirror/lang-yaml");
        return [yaml()];
      }

      // Legacy modes (using StreamLanguage)
      case "ruby": {
        const { ruby } = await import("@codemirror/legacy-modes/mode/ruby");
        return [StreamLanguage.define(ruby)];
      }
      case "shell": {
        const { shell } = await import("@codemirror/legacy-modes/mode/shell");
        return [StreamLanguage.define(shell)];
      }
      case "powershell": {
        const { powerShell } = await import(
          "@codemirror/legacy-modes/mode/powershell"
        );
        return [StreamLanguage.define(powerShell)];
      }
      case "perl": {
        const { perl } = await import("@codemirror/legacy-modes/mode/perl");
        return [StreamLanguage.define(perl)];
      }
      case "lua": {
        const { lua } = await import("@codemirror/legacy-modes/mode/lua");
        return [StreamLanguage.define(lua)];
      }
      case "toml": {
        const { toml } = await import("@codemirror/legacy-modes/mode/toml");
        return [StreamLanguage.define(toml)];
      }
      case "dockerfile": {
        const { dockerFile } = await import(
          "@codemirror/legacy-modes/mode/dockerfile"
        );
        return [StreamLanguage.define(dockerFile)];
      }
      case "makefile":
      case "cmake": {
        const { cmake } = await import("@codemirror/legacy-modes/mode/cmake");
        return [StreamLanguage.define(cmake)];
      }
      case "nginx": {
        const { nginx } = await import("@codemirror/legacy-modes/mode/nginx");
        return [StreamLanguage.define(nginx)];
      }
      case "clojure": {
        const { clojure } = await import(
          "@codemirror/legacy-modes/mode/clojure"
        );
        return [StreamLanguage.define(clojure)];
      }
      case "commonlisp": {
        const { commonLisp } = await import(
          "@codemirror/legacy-modes/mode/commonlisp"
        );
        return [StreamLanguage.define(commonLisp)];
      }
      case "scheme": {
        const { scheme } = await import("@codemirror/legacy-modes/mode/scheme");
        return [StreamLanguage.define(scheme)];
      }
      case "haskell": {
        const { haskell } = await import(
          "@codemirror/legacy-modes/mode/haskell"
        );
        return [StreamLanguage.define(haskell)];
      }
      case "erlang": {
        const { erlang } = await import("@codemirror/legacy-modes/mode/erlang");
        return [StreamLanguage.define(erlang)];
      }
      case "elm": {
        const { elm } = await import("@codemirror/legacy-modes/mode/elm");
        return [StreamLanguage.define(elm)];
      }
      case "coffeescript": {
        const { coffeeScript } = await import(
          "@codemirror/legacy-modes/mode/coffeescript"
        );
        return [StreamLanguage.define(coffeeScript)];
      }
      case "pug": {
        const { pug } = await import("@codemirror/legacy-modes/mode/pug");
        return [StreamLanguage.define(pug)];
      }
      case "diff": {
        const { diff } = await import("@codemirror/legacy-modes/mode/diff");
        return [StreamLanguage.define(diff)];
      }
      case "protobuf": {
        const { protobuf } = await import(
          "@codemirror/legacy-modes/mode/protobuf"
        );
        return [StreamLanguage.define(protobuf)];
      }
      case "properties": {
        const { properties } = await import(
          "@codemirror/legacy-modes/mode/properties"
        );
        return [StreamLanguage.define(properties)];
      }
      case "sass": {
        const { sass } = await import("@codemirror/legacy-modes/mode/sass");
        return [StreamLanguage.define(sass)];
      }
      case "swift": {
        const { swift } = await import("@codemirror/legacy-modes/mode/swift");
        return [StreamLanguage.define(swift)];
      }
      case "kotlin":
      // Kotlin uses clike mode since it's similar to Java
      case "scala": {
        const { scala } = await import("@codemirror/legacy-modes/mode/clike");
        return [StreamLanguage.define(scala)];
      }
      case "groovy": {
        const { groovy } = await import("@codemirror/legacy-modes/mode/groovy");
        return [StreamLanguage.define(groovy)];
      }
      case "r": {
        const { r } = await import("@codemirror/legacy-modes/mode/r");
        return [StreamLanguage.define(r)];
      }
      case "julia": {
        const { julia } = await import("@codemirror/legacy-modes/mode/julia");
        return [StreamLanguage.define(julia)];
      }
      case "objectivec": {
        const { objectiveC } = await import(
          "@codemirror/legacy-modes/mode/clike"
        );
        return [StreamLanguage.define(objectiveC)];
      }
      case "fsharp": {
        const { fSharp } = await import("@codemirror/legacy-modes/mode/mllike");
        return [StreamLanguage.define(fSharp)];
      }
      case "ocaml": {
        const { oCaml } = await import("@codemirror/legacy-modes/mode/mllike");
        return [StreamLanguage.define(oCaml)];
      }
      case "crystal": {
        const { crystal } = await import(
          "@codemirror/legacy-modes/mode/crystal"
        );
        return [StreamLanguage.define(crystal)];
      }
      case "gas": {
        const { gas } = await import("@codemirror/legacy-modes/mode/gas");
        return [StreamLanguage.define(gas)];
      }
      case "elixir":
      case "nim":
      case "vcl":
      case "graphql":
      case "solidity":
      case "vyper":
      case "zig":
      case "v":
      case "dart":
      case "liquid":
      case "ninja":
      case "capnp":
      case "thrift":
      case "avro":
      case "nasm":
      case "stex":
      case "rst":
      case "spreadsheet":
        // These languages are mapped but use plaintext for now
        // until specific parsers are available
        return [];

      default:
        return [];
    }
  } catch {
    // If language loading fails, return empty (plaintext)
    return [];
  }
}
