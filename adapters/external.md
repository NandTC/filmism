# Adapter — External (manual)

The MVP's working mode. Filmism compiles the prompt; the director generates in any tool
(Midjourney, Higgsfield website, Nano Banana, Photoshop…) and brings the result back.

## Flow

1. `/film-prompt <shot>` (or `/film-cast` for a character sheet) → `filmism compile …`
   - `--format midjourney`: one line with `--ar`, `--oref`/`--ow` (the first character in the shot that has a
     **Midjourney oref** URL in CANON.md — a look can override it), `--sref` (only if BIBLE.md has codes),
     `--no` (negatives) and any extra flags from BIBLE.md **Midjourney params**, added as-is.
     Midjourney takes one `--oref` per prompt; other characters rely on canon text + attached sheets.
   - `--format generic`: plain text for any other tool.
   - The **Attach** list names the reference images to add (style frames, approved character sheets,
     location refs; for video, the START FRAME keyframe). Attach them if the tool accepts references.
2. The director generates and picks the best result.
3. Save it into `<film>/inbox/` → `/film-import` → `filmism import … --as … --status … --source <tool>`.
4. The asset is versioned, logged in `.filmism/state.json` (source, original filename, prompt ID,
   status, notes) and linked in the markdown (SHOTS.md keyframe/clip, CANON.md sheets, BIBLE.md references).

## Notes

- No credits are tracked in external mode.
- Filmism only uses Midjourney flags it is sure of. Anything else goes in **Midjourney params** by the director.
