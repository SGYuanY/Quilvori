# Contributing to Quilvori

Quilvori is a local writing and collection workspace for SillyTavern. Contributions can improve editing, import/export compatibility, AI workflows, accessibility, translations, documentation, or the public-source resource directory.

The canonical repository is [ShangguanQian/Quilvori](https://github.com/ShangguanQian/Quilvori). The maintained English documentation is [README.md](README.md); [README.zh.md](README.zh.md) and the other language editions describe the same application.

## Set up a development copy

Use Node.js 22 or 24, npm, and Git. Python 3 is optional for serving the web app.

```bash
git clone https://github.com/ShangguanQian/Quilvori.git
cd Quilvori
npm ci
```

Start the desktop app:

```bash
npm start
```

This calls [scripts/start.mjs](scripts/start.mjs), resolves the local Electron installation, and starts from the project root regardless of the caller’s working directory. It stays attached for development and forwards Ctrl+C. Windows users can also double-click [Start-Quilvori.cmd](Start-Quilvori.cmd); that wrapper uses detached launch and keeps failures visible. Neither entry point installs dependencies automatically or uses a global Electron. Run `npm ci` if dependencies are missing.

To keep a manual desktop test separate from personal data, pass an explicit test profile:

```bash
npm start -- --user-data-dir="/absolute/path/to/disposable-profile"
```

Use an absolute platform-appropriate path, quoted when it contains spaces. Normal launches reuse the existing application window; a deliberate test profile has its own data.

For the web app, serve the repository root on a loopback address:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

On Windows, `py -m http.server 8765 --bind 127.0.0.1` is an equivalent option. Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/). The web app has no bundler or build step, and does not need npm packages merely to run in a browser. Desktop development and the validation commands use Node.js.

Use a separate browser profile or port for manual tests with sample data. Each browser origin has its own library. Save an existing session and export a full-library backup before testing changes against personal data; a test should not need someone's real card collection or API key.

## Source layout

| Location | Responsibility |
| --- | --- |
| Root `*.html` files | Page entry points and ordered script/style loading. |
| `js/ui.js`, `js/views.js`, `js/workspace.js` | Shell, routes, editors, settings, navigation, and interaction. |
| `js/store.js`, `js/formats.js`, `js/png.js` | Library storage, SillyTavern formats, and card PNG data. |
| `js/model.js`, `js/ai-tasks.js`, `js/studio.js`, `js/creation.js` | Model transport, typed tasks, editing proposals, and creation sessions. |
| `js/organize*.js`, `js/review.js` | Lossless organization and readable review reports. |
| `js/folder-import.js`, `js/link-import*.js` | Local-folder and public-link import workflows. |
| `js/resource-catalog.js`, `js/resource-panel.js`, `js/resource-source.js`, `js/wallpaper-import.js` | Source directory, browsing, attribution, and bounded wallpaper imports. |
| `js/i18n.js` and phrase files | Six-language interface text and display preferences. |
| `js/room-theme.js`, `css/` | Page palettes, shared styles, collection ornaments, and responsive layouts. |
| `scripts/`, `Start-Quilvori.cmd` | Syntax validation and portable desktop launch helpers. |
| `electron/` | Desktop startup, preserved user profile, IPC bridge, and remote downloads. |
| `img/`, `fonts/` | Interface assets, credited previews, and bundled font files/licenses. |
| `test/` | Node-based behavior checks and a separate optional browser harness. |

The interface uses plain HTML, CSS, and JavaScript. Most browser modules attach an API to `globalThis`; some also expose CommonJS exports for tests. Follow the surrounding module style. When adding a module, keep script order consistent across the HTML entry points that need it. A small UI change should not require introducing a framework or build pipeline.

## Validate a change

Run the combined checks from the repository root:

```bash
npm run validate
```

The individual commands are:

```bash
npm run check
npm test
```

The syntax check parses the project's JavaScript. Behavior tests use fixtures and mock interfaces; they do not require a paid AI endpoint or real account credentials. CI runs the checks with Node.js 22 and 24 on Ubuntu and Windows. Keep test paths and temporary files portable across those environments.

For a UI change, also check the affected workflow in the web app and, when desktop behavior is involved, in Electron. Useful cases include an empty library, existing data, long names, missing images, a narrow window, keyboard navigation, a second interface language, and a saved custom theme. Recheck the relevant save, import, preview, or undo behavior. `test/browser.mjs` is a separate browser helper with its own environment assumptions; it is not part of the default `npm test` command.

For behavior changes, add a focused regression test when it protects a real failure mode. Prefer input/output and data-preservation assertions to tests that reproduce implementation details. Report what you actually verified; automated checks do not establish a particular provider's model quality or an untested live service's availability.

## Preserve authored data and compatibility

Treat library data as user work, including empty fields and settings that are not visible in the current editor.

- Opening a page, changing a palette, or switching the interface language must not rewrite content or migrate a saved preference as a side effect of rendering.
- Keep stable object and entry IDs. Preserve fields outside the requested scope, original text during organization, and world-book activation/injection settings.
- Import should be additive or explicitly confirmed. Duplicate imports must preserve local edits; updated source content should not silently replace an edited version.
- Show proposed AI changes before applying them. Clarifications, invalid output, canceled requests, stale previews, and incomplete streams must not become successful writes.
- Undo must not discard later manual edits or break references created after the original operation.
- Keep unknown compatible extension data during format round trips. Existing keys such as `realmweave_category` and `quilvori_source` are compatibility fields, not text to rename during branding work.

The desktop profile remains in `%APPDATA%\nijan` on Windows so existing libraries survive the display-name change. Storage keys such as `tavern-atelier.library.v1`, `nijan-ui`, and `nijan-model` also carry existing data. Do not rename or remove them without a deliberate, tested migration. Do not automatically write exported material into a user's SillyTavern directories.

## Interface languages and appearance

Fresh profiles start in English; supported language preferences already saved by the user stay selected. The interface supports Chinese, English, Japanese, Russian, Korean, and Thai.

Phrase catalogs use Chinese source strings as keys even though the default interface language is English. Use the existing translation API (`TAUI.t` / `TAI18n.t`) and add all five non-Chinese translations to the appropriate phrase file. Preserve placeholder names and formats. Do not translate stored titles, author names, card text, world-book bodies, or other authored values; keep the relevant `data-no-translate` boundaries when changing markup.

Page palettes are resolved in `js/room-theme.js`. Prefer shared semantic variables over scattered hardcoded colors, retain readable states for custom themes, and keep success/warning/error meanings clear. Decorations should not intercept clicks, obscure text, or remove keyboard focus indicators. Respect reduced-motion preferences.

## Contribute a public-source resource

The resource directory is separate from the local user library. It describes original sources; it must not load someone's private library, import a work automatically, or promise access to a restricted Discord channel.

Before adding a record to `js/resource-catalog.js`, gather:

- A stable catalog ID, resource type, title, description, and useful tags.
- The original creator's name and canonical HTTPS post URL; add a public author profile when available.
- The actual preview artwork, its creator credit, and permission to include that preview. Do not substitute generated artwork and label it as the creator's original.
- An honest usage status and the relevant conditions. For `redistributable`, include the evidence URL and respect attribution and other conditions.
- Related catalog IDs and, only where sharing is permitted, downloadable file records. Expected original attachment filenames can help users select the correct source file.

The current statuses are `unknown`, `personal`, and `redistributable`. Public visibility is not a redistribution license. Entries marked `unknown` or `personal` must not bundle downloadable works; they can direct users to the original post and open the manual attachment-import workflow. The permission to include a preview image is separate from the permission to redistribute a character card, world book, or full-size image. If preview rights are unclear, use a source-only record or obtain permission rather than committing a copy.

Keep canonical source URLs free of authentication material, temporary signatures, fragments, and unnecessary tracking parameters. Use `TAResourceSource.clean` / `sourceUrl` for attribution and the existing importer for downloads. Do not add Discord user tokens, bypass channel access, or make the app post comments automatically. The support-author message invites users to visit the original post and leave their own appreciation.

Retain source information when a resource is imported, edited, or exported. Character-card and world-book attribution uses the `quilvori_source` extension; imported backgrounds keep a cleaned source record. This metadata is separate from an author's editable `creator_notes` or the story itself.

The [MIT license](LICENSE) covers this project's code. It does not relicense third-party artwork, resource files, or fonts. Sarasa's license is in [fonts/OFL-Sarasa.txt](fonts/OFL-Sarasa.txt). Existing third-party preview credits and their explicit non-MIT status are documented in [img/resources/ATTRIBUTION.md](img/resources/ATTRIBUTION.md); that file notes that no general external redistribution license was found in the reviewed posts.

## Issues, commits, and pull requests

Use **English commit messages and pull-request titles/descriptions**. Explain the concrete problem, the resulting behavior, and the checks performed. Keep unrelated changes separate. For visible changes, include screenshots made with disposable sample data, and label that data as a sample.

An issue is easier to reproduce with the app version or commit, operating system, web-versus-desktop entry point, steps, expected result, and actual result. Use a minimal synthetic card, book, or mock response when needed. Remove secrets and private material from logs, URLs, screenshots, and reproduction files.

Before committing, inspect both the changed files and the staged diff:

```bash
git status --short
git diff
git diff --cached
```

Do not commit API keys, account tokens, signed attachment links, browser/Electron profiles, private cards, world books, chats, local libraries, or backups. `.gitignore` covers common locations, but file location alone is not a privacy check. Keep local test output in ignored scratch locations instead of adding it to a pull request.

For documentation changes, update [README.md](README.md) as the canonical English source, keep the language navigation correct, and update the relevant translated editions when behavior changes. `README.en.md` is a compatibility pointer, not a second English document to maintain. Keep setup instructions and relative links consistent with the actual repository.
