![Realmweave](img/mark.svg)

# Realmweave · 织境

A local desk for writing characters, building worlds, and putting scattered notes back in order. ✍️

[中文](README.md) · **English** · [日本語](README.ja.md) · [Русский](README.ru.md) · [한국어](README.ko.md) · [ไทย](README.th.md)

Realmweave prepares material for SillyTavern. Edit character cards and world books, work with a model you configure, and export the results to SillyTavern. Manual editing, importing, local checks, and backups work independently; AI features require a separate model service.

## What you can do

- Edit descriptions, personality, scenarios, greetings, example dialogue, and role instructions with a live preview.
- Move mixed character notes into appropriate fields while retaining the original wording and existing destination content.
- Name untitled world entries, classify them, and suggest precise primary keywords without rewriting their bodies.
- Ask AI to edit selected fields, entries, or a text selection; compare the result before applying it, with undo support.
- Adopt ideas, discuss choices, and continue revising the current draft instead of starting over.
- Review facts, characterization, and timelines with source quotations and readable addresses.
- Work with prompts, regex, quick replies, relationship graphs, timelines, and HTML memory.

## Quick start

Download the repository, or clone it:

```bash
git clone https://github.com/ShangguanQian/sillytavernworks.git
cd sillytavernworks
```

### Web app

Requires Python 3 and a modern browser. The web app needs no npm dependencies or build step.

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

On Windows, you can use:

```powershell
py -m http.server 8765 --bind 127.0.0.1
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/) and keep the server running. You may use another port if needed, but each port has a separate browser library.

Opening `index.html` directly also works in browsers that allow the required file-page storage and API requests. Use the local HTTP server if those features are restricted. Export a full backup before leaving a session that cannot save.

### Desktop app

Requires Node.js LTS and npm. From the repository root:

```bash
npm install
npm start
```

Electron opens the same interface; a Python server is not required. The desktop app can also read existing cards and books from folders you select. This repository provides a source-based launch; a packaged Windows installer is not included.

## Your first session

1. A fresh library loads the Tingyu House demo. Try editing, checking, and exporting; the unnamed traveler is an intentionally incomplete draft.
2. Import character-card JSON/PNG or world-book JSON from the sidebar, or drop files onto the relevant page.
3. Use **Organize fields** on a character or **Organize entries with AI** on a world book to sort existing material.
4. For rewriting, open **AI creation → Edit existing**, select a precise scope, and describe the change.
5. Review suggestions, apply what you want, export to SillyTavern, and keep a full-library backup.

Loading the demo and clearing the library require confirmation. Loading the demo replaces the current library, so back up your own work first.

## Connect an AI model

Open **Settings → Model connection**:

1. Enter your provider's API base URL, such as `https://api.openai.com/v1`, rather than a complete request endpoint.
2. Enter your API key, choose a protocol, and connect.
3. Select a model from the list returned by the service. Use the short message test to verify connectivity.
4. Optionally select reasoning effort. The default sends no extra reasoning parameter; supported levels depend on the service and model.

Both OpenAI-compatible **Responses** and **Chat Completions** are supported. Automatic mode tries Responses first and switches when the endpoint is unsupported. Choose Chat Completions explicitly for services that only support it. Authentication failures and invalid responses are reported as errors.

Higher reasoning effort usually takes longer. If a level is unsupported, select the model default or a supported level. Availability, output quality, and fees depend on your model provider.

Manual work can stay offline. When you request AI generation, organization, discussion, or review, the selected source text, references, instructions, and relevant conversation are sent to your configured endpoint. The API key stays in local browser or desktop storage and is not included in character exports or full-library backups.

## AI workflows

### Edit existing material

Choose a character or world book, then select its editable fields or entries. A text selection can limit an edit to one passage. Other material is reference context, and suggestions show a before/after comparison.

Omitted fields retain their values. Clearing existing content requires explicit permission. Clarification requests, incomplete output, out-of-scope fields, or source changes made during a request do not silently overwrite your draft. Applied edits can be undone; undo refuses to overwrite subsequent manual changes.

### Create and continue a draft

Describe your goal and choose the modules to create. You can first answer necessary questions or request ideas; only adopted ideas become constraints for subsequent generation.

The creation conversation includes current drafts and adopted ideas. Discuss an approach or ask for a revision. Sending new requirements during generation stops the current output while keeping completed drafts. Character and world-book previews also support revising only selected parts.

Results enter a preview before joining the library. Apply a generated character before applying a group, script, or relationship graph that references it.

### Review logic and characterization

Local rules and AI reviews appear separately. Reports explain the conclusion, why it may be a problem, and a possible next step. Quotations include character-field addresses or **world book → entry → field → line** locations.

Open a source quotation and return to the report afterward. Reports preserve their source addresses and are marked outdated when relevant text changes. Optional blank fields are notes, and differences with insufficient evidence should be treated as questions to confirm. Review itself does not rewrite the draft.

Large books can be reviewed in selected batches, with the scope stated in the report. Task records separate status, reasoning returned by the service, and results; missing reasoning is reported explicitly.

## Organize character fields

Click **Organize fields** in the character editor. Add optional preferences and request a preview.

- The organizer considers description, personality, scenario, first greeting, dialogue examples, system prompt, post-history instructions, and creator notes.
- Each suggestion names its source, destination, and reason, with a before/after field comparison.
- Original fragments are moved verbatim and appended to existing destination content. Unselected or uncertain material remains where it was.
- Removing from the source and adding to the destination apply together. Unmatched quotations, overlapping fragments, and changed source text block application.

This workflow organizes existing material; it does not invent missing history. Review the proposed classifications, and leave optional fields blank when appropriate.

## Organize world-book metadata

Use **Organize entries with AI** for the current entry, untitled entries or entries missing trigger words, or the entire current book. **Organize this entry** is also available in the entry editor.

- Categories cover characters, relationships, locations, factions, rules, history, items, plot, and other material. The directory can group entries by content category.
- By default, only untitled/new entries receive names. Renaming an existing title requires a separate option.
- Suggested primary keywords come from the entry body or original title. Applying them appends new words and preserves all existing primary and secondary keys.
- Always-on entries may have no keywords. Changing activation mode requires enabling the separate permission option.
- Switching to keyword activation requires at least one primary key. Body text, enabled state, selective conditions, injection position, depth, and order are not reset by organization.

Every suggestion includes evidence and a reason. Apply selected entries and undo as needed. Categories are exported through the `realmweave_category` extension field in world books and embedded character books; they do not replace SillyTavern activation settings.

## Pages and tools

| Page | Purpose |
| --- | --- |
| Desk | Recently edited drafts, cards, books, and common tools. |
| Character cards | Edit SillyTavern card fields and import/export JSON or card PNG. |
| World books | Edit entries and injection settings, test triggers, group by position or category. |
| AI creation | Scoped edits, new drafts, conversation, review, and application previews. |
| Writing sections | Combine style, viewpoint, relationships, boundaries, and output format. |
| Prompt assembly | Order and enable prompt blocks for comparison with a SillyTavern preset. |
| Group cast | Select characters and set scenarios, talkativeness, and speaking behavior. |
| Chat reader | Read JSONL or message arrays; search, bookmark, and copy. |
| Assets | Manage avatars, expressions, and backgrounds saved with the library. |
| Regex scripts | Edit and export SillyTavern Regex extension data. |
| Quick replies | Edit buttons and messages; export Quick Reply v2. |
| Author notes and timeline | Place notes and story beats by chat floor. |
| Relationship graph | Edit nodes and links and export a world book. |
| Consistency checks | Read local/AI reports and navigate to their sources. |
| Group script | Arrange character lines, narration, and triggers. |
| HTML memory | Create HTML memory for JS-Slash-Runner. |
| Full-library backup | Export the local library; restore by replacing or merging. |
| Guide | Instructions and destinations for exported files. |

Appearance, language, writing preferences, and models live in Settings. The Chinese interface uses bundled Sarasa fonts. Six interface languages are available; changing the interface does not translate existing authored text.

## Import, export, and SillyTavern

| Material | Format and destination |
| --- | --- |
| Character card | JSON or PNG with `chara`/`ccv3` data. Use SillyTavern's character import; optionally embed a world book on export. |
| World book | World Info JSON, including support for character-book `entries` arrays. Import in World Info. |
| Regex | JSON array, imported through the Regex extension. |
| Quick replies | Quick Reply v2 JSON, imported through that extension. |
| Expressions | Image files in the character's `expressions` folder. A world book records the pack name, not the images. |
| Prompts | Block configuration for reference, not a complete API preset that replaces model or temperature settings. |
| Group cast | A roster for creating a group after importing its characters, not a universal group import file. |
| Chat reader/timeline/script | Workshop reading or planning files; they are not written directly to SillyTavern chat storage. |
| HTML memory | Import as an HTML script in JS-Slash-Runner. |
| Full-library backup | Realmweave library JSON, not a full SillyTavern server backup. |

### Read local folders

In the desktop app, expand **Local folders**, select the card and world-book directories, and read existing files. It reads top-level character JSON/PNG and world-book JSON, including books embedded in imported cards.

Duplicates are skipped. A changed source is imported as another version, preserving local edits. A bad file does not stop the other imports, and failures appear in the details. Large avatars are reduced; newly imported avatars may be omitted if storage is full so text can be saved. Reading folders does not modify source cards or books. Explicit desktop expression exports write to the chosen destination.

## Storage, backups, and updates

Your library lives in the current browser or desktop app's `localStorage`; it is not automatically committed to GitHub. Browser profiles, ports, `localhost` versus `127.0.0.1`, file pages, and Electron can each have separate libraries. Use a consistent entry point and move data with full-library export/restore.

The Windows desktop app retains `%APPDATA%\nijan` for its profile and `folders.json`. This internal directory name preserves compatibility; the displayed project name is Realmweave / 织境.

Backups contain your cards, books, images, and other authored material. Keep them somewhere you control, and export before changing computers, browsers, ports, or code versions. Ignore rules cover common local data folders; still inspect staged files before committing so personal work and keys stay out of source control.

With no unresolved local code changes, update using:

```bash
git pull --ff-only
npm install
```

Restart the desktop app or refresh the web page. Web-only users do not need `npm install`. Save and resolve local code edits before updating.

## Troubleshooting

**The character list is empty.** Check that you opened the same browser, port, or desktop app. Import files in the web app, or read configured folders in Electron. Selecting a folder does not share the library with another browser.

**A PNG will not import.** A normal image is not a card. It must contain valid character data; alternatively, use character JSON exported by SillyTavern.

**Connection or generation fails.** Check the base URL, key, model, and protocol. Choose Chat Completions for services that require it. Browser cross-origin access depends on the provider. If output is truncated or context is too large, reduce the selected scope and work in batches.

**Reasoning effort is rejected.** Use the model default or a supported level; models do not all accept the same parameters.

**Storage is full.** Export a backup before reducing large images. Do not clear browser data unless you have verified that your backup can restore the library.

**Why is there no automatic write-back to SillyTavern?** Realmweave's local library and SillyTavern files are separate. Export your finished material and import it through the corresponding SillyTavern interface.

## Tests and source layout

```bash
npm test
```

Tests use sample data and mock interfaces rather than paid model calls. They cover format round trips, folder deduplication, lossless moves, metadata organization, editable scope, optional blanks, stale previews, apply/undo, evidence, transport protocols, reasoning parameters, and locales.

`js/` contains the interface, library model, and AI workflows; `electron/` supplies the desktop file bridge; `css/` contains styles; `test/` contains automated checks. The web app uses regular scripts without a bundler.

## License

The project uses the English [MIT License](LICENSE): **Copyright (c) 2026 Realmweave contributors**. Bundled Sarasa fonts have a separate [font license](fonts/OFL-Sarasa.txt).
