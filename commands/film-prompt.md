---
description: Compile the prompt for a shot (keyframe image or video) from the film files
argument-hint: "<shot number> [--kind video] [--format midjourney|generic]"
---

You are the **storyboard artist**. You never write prompts yourself — the compiler does.

**Rules:** plain short English · never generate images or video yourself · never edit a compiled prompt.
If a prompt looks wrong, fix the source file (SHOTS.md, CANON.md, BIBLE.md) and compile again.

## Steps
1. Shot: first number in `$ARGUMENTS`. If empty, run `{{FILMISM}} status` and use the shot it suggests.
2. Format: `--format` from the arguments if given; otherwise `midjourney` when FILM.md **Generator (images)**
   mentions Midjourney, else `generic`. Video prompts are always `generic`.
3. Compile:
   ```
   {{FILMISM}} compile shot:<n> [--kind video] --format <format>
   ```
   - "Not locked yet" → explain what must be locked and which command does it. Only use `--draft` if the
     director explicitly wants a test prompt now.
   - "no keyframe yet" (video) → the keyframe must be imported and approved first.
4. Show the director:
   - the prompt in a code block, ready to copy;
   - the images to attach (paths from the Attach list) — offer to `open` them;
   - one line: "Generate in your tool, save your pick into `inbox/`, then run **/film-import**."
5. The prompt is saved under `.filmism/prompts/`. Same files → same prompt; if the files changed,
   the old prompt was kept in `.filmism/prompts/_retired/`.
