# Adapter — Higgsfield MCP (planned, not in the MVP)

In the MVP, Higgsfield is used **by hand**: compile with `--format generic`, paste into Higgsfield,
save the result into `inbox/`, `/film-import` it with `--source higgsfield`.

The automatic adapter below is documented for a later version.

## Connection
```
claude mcp add --transport http higgsfield https://mcp.higgsfield.ai/mcp
```
Then in Claude Code: `/mcp` → higgsfield → Authenticate (browser login). Filmism stores no key.

## Planned behaviour
- `balance` → connection check and balance shown with every cost question.
- One Higgsfield project per film (`create_project`); its folder ID saved in `.filmism/state.json`.
- Local references uploaded once (`media_upload` → `media_confirm`) → media ID saved next to the file.
- Locked characters/locations saved as **Elements**; prompts use `<<<element_id>>>` (the `Element ID` field in CANON.md).
- **Cost preflight** with `get_cost: true` on each item (not supported inside batches), sum shown, wait for "yes".
- Batches with `generate_*_batch` (≤ 12) → `jobs_wait` → download into the film folder → import as usual.
- Model IDs and parameters checked with `models_explore` at the start of each stage, never hard-coded.
- Timeouts: never resubmit blindly — the job may exist.

Prices checked on 2026-09-28 (credits, may change): image 0.25 (draft) to 2.75 (high quality);
5-second video 7.5 (Kling 3.0 Turbo) to 35 (Seedance 2.5); Kling 3.0 standard with sound 8.75.
A 30-second film is roughly 85–90 credits.
