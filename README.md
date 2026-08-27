# Send to Super Productivity

A Joplin plugin that sends the current note to [Super Productivity](https://super-productivity.com/)
as a task, using Super Productivity's **local REST API**.

- Note title → task title
- Note body → task notes (optional, with optional length cap)
- Optional link back to the Joplin note appended to the task notes
- Optional confirmation dialog to edit the title and pick a target project

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
| Default project ID | *(empty)* | Empty = Super Productivity default project / Inbox |
| Show a confirmation dialog before sending | on | Edit the title and choose a project each time |
| Include the note body as task notes | on | |
| Append a link back to the Joplin note | on | Adds a `joplin://` link to the task notes |
| Max note body length | `0` | `0` = no limit |

## Usage

Select a note, then run **Send note to Super Productivity** from:

- the **Note** menu,
- the editor toolbar button, or
- the editor right-click menu.

## Development

```bash
npm install      # also builds via the prepare hook
npm run dist      # build dist/ and publish/<id>.jpl
```

Load it in Joplin via **Tools → Options → Plugins → Advanced → Development plugins**,
pointing at this project folder, then restart Joplin.

## How it works

The plugin calls `POST /tasks` on the Super Productivity local REST API with a JSON body
of `{ title, notes?, projectId? }` and an `Authorization: Bearer <token>` header. On desktop,
Joplin plugin code runs in a Node context, so the loopback request is not subject to CORS.
