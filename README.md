# Filmism

**Make films with AI — from a one-line idea to a finished short.**

```
npx github:NandTC/filmism --local
```

> ⚠️ **Early version (v0.1).** Filmism works in **manual mode**: it writes the prompts,
> you generate the images by hand (Midjourney or any tool), and Filmism files the results.
> 8 commands take a film from idea to storyboard. More are coming — see the [Roadmap](#roadmap).

---

## What is it?

Filmism turns [Claude Code](https://claude.com/claude-code) into a small **film studio**.

You type slash commands (`/film-new`, `/film-develop`, …). Filmism walks your film through
a fixed path, asks one question at a time, and saves every decision in plain markdown files.

Filmism is **not** an image or video generator. It is the *method* around generators:

- it keeps your story, look and characters in files,
- it **writes every prompt** for you from those files — the same character and the same look
  in every shot, without retyping anything,
- it files what you generate, keeps every version, and tells you what to do next.

Nothing is forgotten, nothing drifts, and a new session can continue from the files alone.

### Who is it for?

Someone with a story and taste but no crew — a musician, writer, artist, marketer.
You should never have to write an image or video prompt by hand.

---

## Install

You need **[Claude Code](https://claude.com/claude-code)** and **Node.js 20 or newer**.

```
mkdir my-films && cd my-films
npx github:NandTC/filmism --local       # this folder only
# or
npx github:NandTC/filmism --global      # all your projects
```

The first run downloads Filmism from GitHub (a few seconds).

This adds the `/film-*` slash commands to Claude Code (`.claude/commands/`) and a small
runtime (`.claude/filmism/`). Then start Claude Code in that folder and type:

```
/film-new
```

---

## Commands

| Command | What it does |
|---|---|
| `/film-new [name]` | Creates the film folder from a one-line idea. Asks runtime, tone, aspect ratio, and which image tool you use. |
| `/film-develop` | The story interview, one question at a time → `STORY.md`. Say *"give me ideas"* to get options, or *"I don't know yet"* to leave it open. |
| `/film-bible` | The look of the film. Starts from **your** references if you have them; writes the STYLE paragraph → `BIBLE.md`. |
| `/film-cast <name>` | A character: locked description + outfits → `CANON.md`, and the prompt for a character sheet. |
| `/film-shots` | The shot list → `SHOTS.md`: framing, camera, length, action, sound. |
| `/film-prompt <shot>` | The prompt for a shot, built from your files, plus the images to attach. Add `--kind video` for the motion prompt. |
| `/film-import [file]` | Files what you made (from `inbox/` or a path): asks what it is, versions it, links it to the shot or character. |
| `/film-status` | Where the film is, what's done, what's blocked, and the next step. |

### Example

```
/film-new Paper Moon     → idea: "A paper boy folds a moon to light his street"
/film-develop            → genre, time, world, characters, title → story locked
/film-bible              → your look references → STYLE paragraph → look locked
/film-cast Pim           → Pim's description → a character-sheet prompt
                           you make the sheet in Midjourney, save it to inbox/
/film-import             → "Character sheet for Pim?" → approved → Pim locked
/film-shots              → 3 shots written to SHOTS.md
/film-prompt 01          → the prompt + images to attach
                           you generate the shot, save it to inbox/
/film-import             → keyframe for shot 01 → storyboard/shot-01_v1.png
/film-status             → 1/3 keyframes approved · next: /film-prompt 02
```

---

## How the prompts are built

Every prompt is **compiled** from your files. For example:

```text
Low-angle wide. She walks out into the night. She pushes the gate open and steps into the street.
Nina: Twelve-year-old girl, thin, short black bob haircut, pale freckled face, big dark eyes. Wearing: Yellow raincoat over the uniform, red scarf, wet hair.
Setting: school gate at night.
Style: Shot on 35mm Kodak Vision3 500T, cold teal shadows, warm practical lights, soft grain, shallow depth of field.
Avoid: text, captions, watermark, logo, signature; extra fingers, deformed hands; likeness of any real person or celebrity; modern phones; neon.
```

| Line | Comes from |
|---|---|
| framing, beat, action | `SHOTS.md` |
| the character and the outfit for this shot | `characters/<name>/CANON.md` |
| the place | `locations/<name>/LOCATION.md` (optional) |
| the look | the STYLE paragraph in `BIBLE.md` |
| things to avoid | `.filmism/safety.md` + **Avoid** in `BIBLE.md` |

- **Same files → same prompt.** Every prompt is saved in `.filmism/prompts/`. When a file changes,
  the old prompt is kept in `.filmism/prompts/_retired/`.
- **Two formats:** plain text for any tool, or a one-line **Midjourney** prompt with `--ar`, `--no`,
  `--sref` (your style codes) and `--oref` (your character).
- **Reference images travel with the prompt:** approved style frames and character sheets are
  listed under *Attach*, so the look and the face stay consistent.

### Same character in every shot (Midjourney)

After you approve a character sheet, upload it to Midjourney and paste its image URL into
`CANON.md` → **Midjourney oref**. Every Midjourney prompt with that character then ends with
`--oref <url>` automatically. An outfit can have its own sheet.

---

## Your film folder

```
my-film/
├── FILM.md          title, idea, logline, tone, runtime, image tool
├── STORY.md         the story, question by question
├── BIBLE.md         the look: film stock, palette, light, lens, grain + STYLE paragraph
├── SHOTS.md         the shot list
├── STATE.md         where you are and what's next (written by /film-status)
├── characters/      one folder per character: CANON.md + approved sheets
├── locations/       optional: one folder per place
├── style-frames/    approved look references
├── inbox/           drop what you generate here, then run /film-import
├── storyboard/      one keyframe per shot (old versions in _retired/)
├── clips/           videos per shot
└── .filmism/        every compiled prompt, and a log of every imported file
```

Everything is readable by a human. **Nothing is ever deleted** — replaced files move to `_retired/`.

---

## The rules

1. **Canon is law.** Once a character or the look is locked, it goes into every prompt, word for word.
   Changing it later is logged.
2. **Cheap before expensive.** Text → images → video. Each step is approved before the next.
3. **The director's taste wins.** Bring your own references and prompts anytime.
4. **Original work only.** No real people's faces, no copyrighted characters.

---

## Roadmap

- [x] v0.1 — manual mode: story, look, characters, shots, compiled prompts, import, status
- [ ] `/film-next` — "just tell me what to do"
- [ ] `/film-script` — writing in layers, with a script critic
- [ ] `/film-storyboard` — contact sheet of all keyframes
- [ ] Automatic generation through the Higgsfield MCP, with a cost check before every paid step
- [ ] `/film-score`, `/film-cut`, `/film-poster`

---

## CLI

The slash commands call a small CLI. You can also use it directly
(`node .claude/filmism/bin/filmism.js` after a local install):

```
filmism new "<name>" --idea "..."
filmism character <name>                    filmism location <name>
filmism lock story|bible|character:<name>|location:<name>
filmism unlock <same> --reason "..."
filmism compile shot:<n> [--kind image|video] [--format generic|midjourney] [--draft]
filmism compile character:<name>[:look]     character-sheet prompt
filmism inbox
filmism import <file> --as shot:<n>|character:<name>[:look]|location:<name>|style
               [--status draft|approved] [--source midjourney] [--note "..."]
filmism approve <asset id | file | shot:<n>>
filmism status [--json]
```

---

## License

MIT
