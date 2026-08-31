# Send to Super Productivity

A Joplin **desktop** plugin that sends the current note to
[Super Productivity](https://super-productivity.com/) as a task, over Super
Productivity's local REST API.

- Note title → task title, note body → task notes (optional)
- Obsidian-style YAML frontmatter → due date, scheduled time, estimate, tags, project
- Optional confirmation dialog, link back to the note, "add to Today", and
  delete-note-after-send

Desktop only — the plugin talks to `127.0.0.1`, so it can't run on mobile.

## Setup

1. In Super Productivity: **Settings → Misc → Enable local REST API**, then copy
   the **Access Token**. The API listens on `http://127.0.0.1:3876`.
2. In Joplin: **Tools → Options → Super Productivity**, paste the token, pick a
   default project.

## Usage

Run **Send note to Super Productivity** from a note's right-click menu, the Note
menu, or the editor toolbar. Select several notes to send them all at once.

## Frontmatter

If the note starts with a `---` YAML block, these keys map onto the task:

```yaml
---
tags: [work, urgent]       # matched by name to existing SP tags
due: 2026-09-01 14:00      # date + time, or date only
scheduled: 2026-09-01 09:00
estimate: 2h30m            # also 1.5h, 90, 1:30
spent: 15m
project: Home              # matched by name to an existing SP project
---
```

- Key aliases: `due`/`deadline`, `scheduled`/`planned`/`start`, `estimate`/`est`,
  `tags`/`tag`, `project`/`list`.
- Dates also accept `today`, `tomorrow`, `+3d`, `+2w`. Times are local.
- Tags and project must already exist in Super Productivity (matched
  case-insensitively). Unknown names are reported, not created.
- The frontmatter block is stripped from the task notes by default.

## Settings

**Tools → Options → Super Productivity:**

| Setting | Default |
|---|---|
| Local REST API URL | `http://127.0.0.1:3876` |
| Access token | *(empty — paste from Super Productivity)* |
| Default project | *Inbox* — refresh the list from the command palette after adding projects |
| Confirmation dialog before sending | on |
| Include note body as task notes | on |
| Append a link back to the Joplin note | on |
| Max note body length (`0` = no limit) | `0` |
| Parse YAML frontmatter | on |
| Strip the frontmatter block from task notes | on |
| Delete the Joplin note after a successful send | off |
| Add the new task to Today | off |

## Development

```bash
npm install      # also builds via the prepare hook
npm run dist      # build dist/ and publish/<id>.jpl
```

Load it via **Tools → Options → Plugins → Advanced → Development plugins**,
pointing at this folder, then restart Joplin.

## How it works

`POST /tasks` with `{ title, notes?, projectId?, dueDay?, dueWithTime?,
plannedAt?, timeEstimate?, timeSpent?, tagIds? }` and a bearer token. Tag and
project names resolve to IDs via `GET /tags` and `GET /projects`. On desktop the
plugin runs in Node, so the loopback call is not subject to CORS.
