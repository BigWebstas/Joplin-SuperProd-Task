import joplin from 'api';
import {
	MenuItemLocation,
	SettingItemType,
	ToastType,
	ToolbarButtonLocation,
} from 'api/types';

const SECTION = 'superProductivity';

// Setting keys
const S_API_URL = 'superProductivity.apiUrl';
const S_TOKEN = 'superProductivity.token';
const S_DEFAULT_PROJECT = 'superProductivity.defaultProjectId';
const S_CONFIRM = 'superProductivity.confirmBeforeSending';
const S_INCLUDE_BODY = 'superProductivity.includeBody';
const S_APPEND_LINK = 'superProductivity.appendJoplinLink';
const S_BODY_MAX = 'superProductivity.bodyMaxLength';

interface SpProject {
	id: string;
	title: string;
}

interface SpEnvelope<T> {
	ok: boolean;
	data?: T;
	error?: { code?: string; message?: string; details?: unknown };
}

async function getSettings() {
	const values = await joplin.settings.values([
		S_API_URL,
		S_TOKEN,
		S_DEFAULT_PROJECT,
		S_CONFIRM,
		S_INCLUDE_BODY,
		S_APPEND_LINK,
		S_BODY_MAX,
	]);
	return {
		apiUrl: String(values[S_API_URL] || '').trim().replace(/\/+$/, ''),
		token: String(values[S_TOKEN] || '').trim(),
		defaultProjectId: String(values[S_DEFAULT_PROJECT] || '').trim(),
		confirm: !!values[S_CONFIRM],
		includeBody: !!values[S_INCLUDE_BODY],
		appendLink: !!values[S_APPEND_LINK],
		bodyMax: Number(values[S_BODY_MAX] || 0),
	};
}

/**
 * Calls the Super Productivity local REST API. Runs in the plugin's Node
 * context on desktop, so there is no CORS restriction on the loopback request.
 */
async function spRequest<T>(
	apiUrl: string,
	token: string,
	method: string,
	path: string,
	body?: unknown,
): Promise<SpEnvelope<T>> {
	if (!apiUrl) throw new Error('Super Productivity API URL is not configured (Tools → Options → Super Productivity).');

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10000);

	let res: Response;
	try {
		res = await fetch(`${apiUrl}${path}`, {
			method,
			headers: {
				'Content-Type': 'application/json',
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: controller.signal,
		});
	} catch (err) {
		const msg = (err as Error)?.name === 'AbortError'
			? 'Request timed out.'
			: (err as Error)?.message || String(err);
		throw new Error(
			`Could not reach Super Productivity at ${apiUrl}. Is the desktop app running with ` +
			`"Enable local REST API" turned on (Settings → Misc)? (${msg})`,
		);
	} finally {
		clearTimeout(timeout);
	}

	let payload: SpEnvelope<T> | undefined;
	const text = await res.text();
	try {
		payload = text ? JSON.parse(text) : undefined;
	} catch {
		// Non-JSON response, fall through to generic handling below.
	}

	if (!res.ok) {
		if (res.status === 401) {
			throw new Error(
				'Super Productivity rejected the access token (401). Copy the current token from ' +
				'Settings → Misc → Access Token and paste it into this plugin\'s options.',
			);
		}
		const detail = payload?.error?.message || text || `HTTP ${res.status}`;
		throw new Error(`Super Productivity returned an error: ${detail}`);
	}

	if (!payload) throw new Error('Super Productivity returned an empty or invalid response.');
	if (payload.ok === false) {
		throw new Error(`Super Productivity returned an error: ${payload.error?.message || 'unknown error'}`);
	}
	return payload;
}

async function fetchProjects(apiUrl: string, token: string): Promise<SpProject[]> {
	try {
		const r = await spRequest<SpProject[]>(apiUrl, token, 'GET', '/projects');
		return Array.isArray(r.data) ? r.data : [];
	} catch (err) {
		console.warn('[send-to-super-productivity] Could not load projects:', err);
		return [];
	}
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function buildNotes(
	body: string,
	opts: { includeBody: boolean; appendLink: boolean; bodyMax: number; noteId: string },
): string {
	const parts: string[] = [];
	if (opts.includeBody && body.trim()) {
		let b = body.trim();
		if (opts.bodyMax > 0 && b.length > opts.bodyMax) {
			b = `${b.slice(0, opts.bodyMax).trimEnd()}…`;
		}
		parts.push(b);
	}
	if (opts.appendLink) {
		parts.push(`[Open in Joplin](joplin://x-callback-url/openNote?id=${opts.noteId})`);
	}
	return parts.join('\n\n');
}

async function sendNoteToSuperProductivity() {
	const dialogs = joplin.views.dialogs;
	const note = await joplin.workspace.selectedNote();
	if (!note) {
		await dialogs.showToast({ message: 'No note is selected.', type: ToastType.Error });
		return;
	}

	const settings = await getSettings();
	if (!settings.apiUrl) {
		await dialogs.showMessageBox('Please set the Super Productivity API URL in Tools → Options → Super Productivity.');
		return;
	}

	let title: string = note.title || 'Untitled note';
	let projectId: string = settings.defaultProjectId;
	let includeBody: boolean = settings.includeBody;

	if (settings.confirm) {
		const projects = await fetchProjects(settings.apiUrl, settings.token);
		const options = [
			`<option value="">(Default project / Inbox)</option>`,
			...projects.map(
				(p) =>
					`<option value="${escapeHtml(p.id)}"${p.id === projectId ? ' selected' : ''}>${escapeHtml(p.title)}</option>`,
			),
		].join('');

		const handle = await dialogs.create(`sp-send-dialog-${Date.now()}`);
		await dialogs.setHtml(
			handle,
			`
			<form name="main" style="min-width:360px;max-width:520px;">
				<h3 style="margin-top:0;">Send to Super Productivity</h3>
				<label style="display:block;margin-bottom:4px;font-weight:bold;">Task title</label>
				<input type="text" name="title" value="${escapeHtml(title)}" style="width:100%;box-sizing:border-box;margin-bottom:12px;" />
				<label style="display:block;margin-bottom:4px;font-weight:bold;">Project</label>
				<select name="projectId" style="width:100%;box-sizing:border-box;margin-bottom:12px;">${options}</select>
				<label style="display:block;">
					<input type="checkbox" name="includeBody" value="1"${includeBody ? ' checked' : ''} />
					Include note content as task notes
				</label>
			</form>
			`,
		);
		await dialogs.setButtons(handle, [
			{ id: 'cancel', title: 'Cancel' },
			{ id: 'ok', title: 'Send' },
		]);
		const result = await dialogs.open(handle);
		if (result.id !== 'ok') return;

		const form = result.formData?.main || {};
		title = (form.title || '').trim() || title;
		projectId = (form.projectId || '').trim();
		includeBody = !!form.includeBody;
	}

	const notes = buildNotes(note.body || '', {
		includeBody,
		appendLink: settings.appendLink,
		bodyMax: settings.bodyMax,
		noteId: note.id,
	});

	const taskBody: Record<string, unknown> = { title };
	if (notes) taskBody.notes = notes;
	if (projectId) taskBody.projectId = projectId;

	try {
		await spRequest(settings.apiUrl, settings.token, 'POST', '/tasks', taskBody);
		await dialogs.showToast({
			message: `Sent to Super Productivity: "${title}"`,
			type: ToastType.Success,
		});
	} catch (err) {
		await dialogs.showMessageBox(`Failed to send note to Super Productivity.\n\n${(err as Error).message}`);
	}
}

joplin.plugins.register({
	onStart: async function () {
		await joplin.settings.registerSection(SECTION, {
			label: 'Super Productivity',
			iconName: 'fas fa-check-double',
			description: 'Send Joplin notes to Super Productivity as tasks via its local REST API.',
		});

		await joplin.settings.registerSettings({
			[S_API_URL]: {
				value: 'http://127.0.0.1:3876',
				type: SettingItemType.String,
				section: SECTION,
				public: true,
				label: 'Local REST API URL',
				description: 'Base URL of the Super Productivity desktop REST API. Default: http://127.0.0.1:3876',
			},
			[S_TOKEN]: {
				value: '',
				type: SettingItemType.String,
				section: SECTION,
				public: true,
				secure: true,
				label: 'Access token',
				description: 'From Super Productivity: Settings → Misc → Access Token.',
			},
			[S_DEFAULT_PROJECT]: {
				value: '',
				type: SettingItemType.String,
				section: SECTION,
				public: true,
				label: 'Default project ID (optional)',
				description: 'Leave empty to use the Super Productivity default project / Inbox.',
			},
			[S_CONFIRM]: {
				value: true,
				type: SettingItemType.Bool,
				section: SECTION,
				public: true,
				label: 'Show a confirmation dialog before sending',
				description: 'Lets you edit the task title and pick a project each time.',
			},
			[S_INCLUDE_BODY]: {
				value: true,
				type: SettingItemType.Bool,
				section: SECTION,
				public: true,
				label: 'Include the note body as task notes',
			},
			[S_APPEND_LINK]: {
				value: true,
				type: SettingItemType.Bool,
				section: SECTION,
				public: true,
				label: 'Append a link back to the Joplin note',
			},
			[S_BODY_MAX]: {
				value: 0,
				type: SettingItemType.Int,
				section: SECTION,
				public: true,
				minimum: 0,
				maximum: 100000,
				label: 'Max note body length (0 = no limit)',
			},
		});

		await joplin.commands.register({
			name: 'superProductivity.sendNote',
			label: 'Send note to Super Productivity',
			iconName: 'fas fa-check-double',
			enabledCondition: 'oneNoteSelected',
			execute: sendNoteToSuperProductivity,
		});

		await joplin.views.menuItems.create(
			'superProductivity.sendNote.noteMenu',
			'superProductivity.sendNote',
			MenuItemLocation.Note,
		);
		await joplin.views.menuItems.create(
			'superProductivity.sendNote.editorContext',
			'superProductivity.sendNote',
			MenuItemLocation.EditorContextMenu,
		);
		await joplin.views.toolbarButtons.create(
			'superProductivity.sendNote.toolbar',
			'superProductivity.sendNote',
			ToolbarButtonLocation.EditorToolbar,
		);
	},
});
