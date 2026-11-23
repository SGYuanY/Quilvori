# Realmweave

[中文](README.md) · English · [日本語](README.ja.md)

![Realmweave](img/mark.svg)

From a single thought, write the people and the world.

Chinese name: 织境. A local workshop for SillyTavern material. It does not replace SillyTavern. Drafts stay in the browser. Exports are files SillyTavern can import, and files SillyTavern exports can be read back. The model key stays in this browser's local storage. It is not committed and it is not written into exported drafts.

## Open

Web:

```bash
python3 -m http.server 8765
```

Open <http://127.0.0.1:8765/>. Desktop:

```bash
npm install
npm start
```

`npm start` opens the same pages in Electron. The page shows the character-card folder and the world-book folder. The desktop app can choose those folders and read JSON already in them. There is no Windows installer in this repo.

You can also open `index.html` directly. The scripts are not ES modules. If the browser blocks storage for a file page, export a full backup before you leave.

No build step is required for the web page.

## Where exports go in SillyTavern

- Character JSON or PNG: SillyTavern `characters`, or import from the character list. Expression images go in that character's `expressions` folder.
- World book JSON: SillyTavern `worlds`, or import from World Info. The world book records only the sticker-pack name, not the images.
- Regex JSON: import in the regex extension.
- Quick reply JSON: import in the Quick Reply extension.
- The chat reader export is this workshop's own reading file. It is not written back into SillyTavern `chats`.

The license is the MIT `LICENSE` at the repo root. The in-app guide covers open, import, write, check, and where each export file goes.
