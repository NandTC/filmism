---
description: Where the film is — stage, what's done, what's blocked, what's next
argument-hint: "[--film <folder>]"
---

Run:
```
{{FILMISM}} status $ARGUMENTS
```
It also rewrites `STATE.md`.

Then tell the director, in plain short English:
1. **Stage** (Develop / Pre-production / Shoot).
2. **Done:** the gates with ✅, in one line.
3. **Blockers or warnings**, if any, one line each.
4. **Next:** the recommended command and why — and offer to run it now.

If there are several films, ask which one (A / B / C) and pass `--film <folder>`.
