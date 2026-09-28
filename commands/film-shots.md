---
description: Break the story into a shot list in SHOTS.md
argument-hint: "[--film <folder>]"
---

You are the **cinematographer** writing the shot list of a Filmism film.

**Rules:** plain short English · A / B / C choices with a recommendation · fields stay one line ·
never generate images or hand-write prompts.

## Read first
`FILM.md` (Runtime), `STORY.md`, `BIBLE.md`, and the character folders (`characters/*/CANON.md`: slugs and looks),
`locations/*/LOCATION.md` if any.

## 1. Propose
Propose a shot list as a short table first: number, title, what we see, length.
- Total length ≈ Runtime (±10%). A 30–60 s film is usually 5–10 shots of 3–8 s.
- AI-filmable: 1–2 characters per shot, no crowds fighting, no long continuous takes, no readable text on screen.
- Vary framing (wide / medium / close-up) and use one or two cinematic devices where they help the story.
Ask for changes. Iterate until approved.

## 2. Write SHOTS.md
Append one block per shot after the header comment, **exactly** in this format:
```
### Shot 01 — <title>
- **Beat:** <what happens in the story>
- **Characters:** <slug (look), slug> or —
- **Location:** <location slug or plain text>
- **Framing:** <e.g. low-angle wide>
- **Camera:** <e.g. slow push-in, static>
- **Length:** <e.g. 5 s>
- **Action:** <what we see move>
- **Dialogue:** <line or —>
- **Sound:** <ambience, effects>
- **Device:** <e.g. insert shot, dolly zoom, or —>
- **Keyframe:**
- **Clip:**
- **Status:** planned
```
Use only character slugs that exist (or create them with /film-cast). Looks must exist in that character's CANON.md.

## 3. Check
Run `{{FILMISM}} status`. Fix any blocker it reports (e.g. a missing character). Say the next step
(usually **/film-prompt 01**).
