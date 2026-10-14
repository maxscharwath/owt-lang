# OWT for JetBrains IDEs

IntelliJ Platform plugin for [OWT](../../README.md) single-file components (`.owt`).

- **OWT file type** with its own icon.
- **Syntax highlighting** from the OWT TextMate grammar (the one maintained in `packages/owt-vscode`),
  including embedded TypeScript and CSS when the IDE's built-in TextMate bundles are enabled.
- **Comment / uncomment** with `//` (line) and `/* */` (block), **brace matching** for `{}`, `[]`, `()`.
- **Language server features** through the IntelliJ Platform LSP API and `@owt/language-server`:
  diagnostics and quick fixes, completion, hover / quick documentation, go to definition and type
  definition, find usages, rename, document symbols (Structure view, breadcrumbs), semantic highlighting,
  formatting, folding, inlay hints, signature help, … (the exact set depends on the IDE version, see
  [the platform's LSP feature table](https://plugins.jetbrains.com/docs/intellij/language-server-protocol.html#supported-features)).
- **Settings** under *Settings | Languages & Frameworks | OWT*.
- **Tools | Restart OWT Language Server** (also reachable from the *Language Services* status bar widget).

## Requirements

| | |
|---|---|
| IDE | Any IntelliJ-based IDE **2025.2 or newer** (`sinceBuild = 252`, no upper bound). |
| LSP features | IDEs that ship the LSP API, **2025.2.1 or newer**: IntelliJ IDEA (Ultimate up to 2025.2, the unified IntelliJ IDEA distribution since 2025.3), WebStorm, PhpStorm, PyCharm (Pro, and unified PyCharm without subscription), GoLand, RubyMine, CLion, Rider, RustRover, DataGrip, DataSpell. Not available in Android Studio or IntelliJ IDEA open-source builds. |
| Elsewhere | Without the LSP API (or with the TextMate plugin disabled) the plugin still loads: you get the file type, comments and — with TextMate — highlighting, but no language server. |
| Node.js | **20 or newer**, to run the language server. |

The LSP integration is declared as an *optional* dependency on `com.intellij.modules.lsp`
(`META-INF/owt-lsp.xml`); TextMate (`org.jetbrains.plugins.textmate`) and the JavaScript plugin (for the
IDE's Node.js interpreter) are optional as well.

## Install

### Build from source

Requirements: JDK 21 (Gradle provisions it through the toolchain resolver if missing) and network access
to Maven Central / the JetBrains repositories. The first build downloads IntelliJ IDEA (~1.5 GB) into the
Gradle cache.

```bash
# optional, but recommended: build the language server so it is bundled with the plugin
pnpm --filter @owt/language-server build

cd packages/owt-jetbrains
./gradlew buildPlugin
# -> build/distributions/owt-jetbrains-<version>.zip
```

What the build picks up from the monorepo (both optional):

| Input | Default location | Ends up in the plugin as | If missing |
|---|---|---|---|
| TextMate grammar | `../owt-vscode/syntaxes/owt.tmLanguage.json` | `textmate/owt/syntaxes/owt.tmLanguage.json` | the minimal grammar in `src/textmate/fallback` is used |
| Language server | `../owt-language-server/dist/` (`index.js`, `lib.*.d.ts`, …; `*.map` excluded) | `server/` (+ a `package.json` marking it CommonJS) | not bundled; the server must come from the project or the settings |

Override them with `-PowtGrammar=<file>` and `-PowtServerDist=<dir>`.

### Install from disk

*Settings | Plugins | ⚙ | Install Plugin from Disk…* → select the zip → restart the IDE if asked.

## How the language server is started

The server runs as `node <server script> --stdio [extra arguments]`, one instance per project, as soon as
an `.owt` file is opened.

**Node.js** — first match wins:
1. *Node.js interpreter* in *Settings | Languages & Frameworks | OWT*;
2. the project's interpreter from *Settings | Languages & Frameworks | Node.js* (when the JavaScript plugin is
   installed; local interpreters only);
3. `node` on `PATH`, then common install locations (Homebrew, `/usr/local/bin`, Volta, fnm, nvm, …).

**Server script** — first match wins:
1. *Language server* in the settings (the `index.js` file, or its `dist/` or package folder);
2. `node_modules/@owt/language-server/dist/index.js`, searched from every project content root upwards
   (like Node's module resolution), so monorepos with hoisted dependencies work;
3. the copy bundled with the plugin (`<plugin dir>/server/index.js`).

**TypeScript** — if `node_modules/typescript/lib/typescript.js` is found the same way, the server is
initialized with `{ "typescript": { "tsdk": "<that lib folder>" } }`; otherwise the initialization options
are empty and the server uses its bundled TypeScript.

If Node.js or the server cannot be found, a notification with a link to the settings is shown once.
Server logs: enable `#com.intellij.platform.lsp` in *Help | Diagnostic Tools | Debug Log Settings…*.

## Settings

*Settings | Languages & Frameworks | OWT* (application-wide, stored in `owt.xml`):

- **Enable OWT language server**
- **Node.js interpreter** — empty = auto-detect
- **Language server** — empty = project `node_modules`, then the bundled copy
- **Extra server arguments** — appended after `--stdio` (shell-like quoting)

The page also shows what is currently resolved for the open project. Applying the settings restarts the
server.

## Development

```bash
./gradlew runIde                          # IntelliJ IDEA 2026.2.3 sandbox with the plugin
./gradlew test                            # editor + LSP integration tests (needs node on PATH)
./gradlew testOldestPlatform              # same tests inside IntelliJ IDEA 2025.2.6.3
./gradlew verifyPlugin                    # Plugin Verifier: 2026.2.3 and 2025.2.6.3
./gradlew verifyPluginProjectConfiguration
./gradlew buildPlugin -PbuildSearchableOptions=false   # faster local builds
```

Gradle properties (`gradle.properties` or `-P…`): `platformVersion` (IDE compiled against, run by
`runIde`), `pluginSinceBuild`, `oldestPlatformVersion`, `verifyIdeVersions` (extra comma-separated IntelliJ
IDEA versions for `verifyPlugin`), `owtGrammar`, `owtServerDist`, `buildSearchableOptions`.

### Compatibility notes

- The plugin is compiled against **2026.2.3** but targets **2025.2+** bytecode (Java 21, Kotlin API 2.1, JVM
  default methods without compatibility bridges). `verifyPluginProjectConfiguration` therefore reports two
  expected warnings (since-build lower than the target platform, Java 21 instead of 25).
- It uses `LspServerSupportProvider` / `ProjectWideLspServerDescriptor` / `LspServerManager`. In 2026.1.4 they
  were renamed (`LspIntegrationProvider`, `ProjectWideLspClientDescriptor`, `LspClientManager`); the old names
  are deprecated but fully supported, and are the only ones available in 2025.x. The Plugin Verifier reports
  them as deprecated usages on 2026.2 and the plugin as compatible with both 2025.2.6.3 and 2026.2.3.
- The bundled TextMate grammar is registered for the OWT file type by reusing the TextMate plugin's
  highlighter (`TextMateSyntaxHighlighterFactory`, `TextMateEditorHighlighterProvider`) and brace matcher.

### Layout

```
src/main/kotlin/dev/owt/ide/
  lang/        file type, language, minimal PSI, commenter
  textmate/    TextMate bundle provider            (META-INF/owt-textmate.xml)
  lsp/         LSP provider, descriptor, restart  (META-INF/owt-lsp.xml)
  node/        Node.js interpreter lookup; javascript/ = JavaScript plugin bridge (META-INF/owt-javascript.xml)
  server/      Node / server / tsdk resolution, plugin directory
  settings/    persistent settings + configurable
src/textmate/  TextMate bundle descriptor (package.json, language-configuration.json) + fallback grammar
src/server/    package.json shipped next to the bundled server
src/test/      light + heavy platform tests, fake LSP server
```
