# Send to Super Productivity

A Joplin plugin that sends the current note to [Super Productivity](https://super-productivity.com/)
as a task, using Super Productivity's **local REST API**.

- Note title → task title
- Note body → task notes (optional, with optional length cap)
- **Obsidian-style YAML frontmatter → task due date, scheduled time, time estimate, tags and project**
- Optional link back to the Joplin note appended to the task notes
- Optional confirmation dialog to edit the title, pick a target project and review the parsed fields

## Frontmatter parsing

If the note starts with a `---` fenced YAML block (Obsidian properties), these keys
are read and mapped onto the Super Productivity task:

```yaml
---
tags: [work, urgent]      # matched by name to existing SP tags → tagIds
due: 2026-09-01 14:00     # date + time → dueWithTime; date only → dueDay
scheduled: 2026-09-01 09:00   # → plannedAt
estimate: 2h30m           # → timeEstimate (1.5h, 90, 1:30 also work)
spent: 15m                # → timeSpent
project: Home             # matched by name to an existing SP project
---
```

- Accepted key aliases: `due`/`deadline`/`due date`, `scheduled`/`planned`/`start`,
  `estimate`/`est`, `spent`, `tags`/`tag`, `project`/`list`.
- Dates also accept `today`, `tomorrow`, `yesterday`, `+3d`, `+2w`. All times are local.
- Tags and project are matched to **existing** Super Productivity items by name
  (case-insensitive). Unknown names are reported, not created.
- The frontmatter block is stripped from the task notes by default.

Toggle this off, or keep the block in the notes, under **Tools → Options → Super Productivity**.

## Requirements

- Joplin **desktop** 3.7+ (the plugin talks to `127.0.0.1`, so it does not work on mobile)
- Super Productivity **desktop** app running, with the local REST API enabled

## Setting up Super Productivity

1. In Super Productivity: **Settings → Misc → Enable local REST API**.
2. Copy the token shown under **Settings → Misc → Access Token**.
   The API listens on `http://127.0.0.1:3876` by default.

## Setting up the plugin

Open **Joplin → Tools → Options → Super Productivity** and set:

| Setting | Default | Notes |
|---|---|---|
| Local REST API URL | `http://127.0.0.1:3876` | Base URL, no trailing slash |
| Access token | *(empty)* | Paste the token from Super Productivity |
| Default project | *(Default project / Inbox)* | Dropdown populated from Super Productivity's project list; run **Super Productivity: Refresh project list** from the command palette after adding projects or changing the URL / token |
| Show a confirmation dialog before sending | on | Edit the title, choose a project, review parsed fields |
| Include the note body as task notes | on | |
| Append a link back to the Joplin note | on | Adds a `joplin://` link to the task notes |
| Max note body length | `0` | `0` = no limit |
| Parse YAML frontmatter | on | See "Frontmatter parsing" above |
| Remove the frontmatter block from task notes | on | |

## Usage

Run **Send note to Super Productivity** from:

- **right-click on a note** in the note list (select several to send them all at once),
- the **Note** menu,
- the editor toolbar button, or
- the editor right-click menu.

Selecting multiple notes shows a single confirmation and then sends each one using your
default settings and its own frontmatter.

## Development

```bash
npm install      # also builds via the prepare hook
npm run dist      # build dist/ and publish/<id>.jpl
```

Load it in Joplin via **Tools → Options → Plugins → Advanced → Development plugins**,
pointing at this project folder, then restart Joplin.

## How it works

The plugin calls `POST /tasks` on the Super Productivity local REST API with a JSON body of
`{ title, notes?, projectId?, dueDay?, dueWithTime?, plannedAt?, timeEstimate?, timeSpent?, tagIds? }`
and an `Authorization: Bearer <token>` header. Tag/project names are resolved to IDs via
`GET /tags` and `GET /projects`. On desktop, Joplin plugin code runs in a Node context, so the
loopback request is not subject to CORS.
