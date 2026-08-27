// Parsing helpers for Obsidian-style YAML frontmatter and the date / duration
// values it can contain. Kept dependency-free and side-effect-free so it is
// easy to unit test.

export interface Frontmatter {
	/** Top-level key/value pairs. Keys are kept verbatim; look them up case-insensitively. */
	data: Record<string, string | string[]>;
	/** The note body with the leading frontmatter block removed. */
	body: string;
	/** Whether a frontmatter block was found at all. */
	found: boolean;
}

/**
 * Extracts a leading `---` fenced YAML block, Obsidian-style. Only a tiny subset
 * of YAML is understood: top-level `key: value`, flow lists `key: [a, b]`, and
 * block lists (`  - item` lines). Nested maps are ignored.
 */
export function extractFrontmatter(raw: string): Frontmatter {
	const text = (raw || '').replace(/^﻿/, '');
	const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
	if (!match) {
		return { data: {}, body: text, found: false };
	}

	const block = match[1];
	const body = text.slice(match[0].length);
	const data: Record<string, string | string[]> = {};

	const lines = block.split(/\r?\n/);
	let currentListKey: string | null = null;

	for (const line of lines) {
		if (!line.trim() || /^\s*#/.test(line)) continue;

		const listItem = line.match(/^\s*-\s+(.*)$/);
		if (listItem && currentListKey) {
			(data[currentListKey] as string[]).push(cleanScalar(listItem[1]));
			continue;
		}

		const kv = line.match(/^([A-Za-z0-9_.\- ]+?):\s*(.*)$/);
		if (!kv) {
			currentListKey = null;
			continue;
		}

		const key = kv[1].trim();
		const rawValue = kv[2].trim();
		currentListKey = null;

		if (rawValue === '') {
			// Could be the start of a block list on the following lines.
			data[key] = [];
			currentListKey = key;
			continue;
		}

		const flow = rawValue.match(/^\[(.*)\]$/);
		if (flow) {
			data[key] = flow[1]
				.split(',')
				.map((s) => cleanScalar(s))
				.filter((s) => s !== '');
			continue;
		}

		data[key] = cleanScalar(rawValue);
	}

	// Drop keys that opened a block list but never got any items.
	for (const key of Object.keys(data)) {
		const v = data[key];
		if (Array.isArray(v) && v.length === 0) delete data[key];
	}

	return { data, body, found: true };
}

function cleanScalar(value: string): string {
	let s = value.trim();
	if (
		(s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
		(s.startsWith("'") && s.endsWith("'") && s.length >= 2)
	) {
		return s.slice(1, -1);
	}
	// Strip a trailing inline comment (only when preceded by whitespace).
	s = s.replace(/\s+#.*$/, '').trim();
	return s;
}

const DURATION_UNIT_MS: Record<string, number> = {
	w: 7 * 24 * 3600_000,
	d: 24 * 3600_000,
	h: 3600_000,
	m: 60_000,
	s: 1000,
};

/**
 * Parses a duration into milliseconds. Accepts `2h30m`, `1h`, `45m`, `1.5h`,
 * `1:30` (h:mm) and a bare number (interpreted as minutes). Returns null if
 * nothing recognisable is found.
 */
export function parseDuration(input: string | number | undefined): number | null {
	if (input === undefined || input === null) return null;
	if (typeof input === 'number') return input > 0 ? Math.round(input * 60_000) : null;

	const s = String(input).trim().toLowerCase();
	if (!s) return null;

	const clock = s.match(/^(\d+):([0-5]?\d)$/);
	if (clock) return (Number(clock[1]) * 60 + Number(clock[2])) * 60_000;

	if (/^\d+(\.\d+)?$/.test(s)) {
		const mins = parseFloat(s);
		return mins > 0 ? Math.round(mins * 60_000) : null;
	}

	const re = /(\d+(?:\.\d+)?)\s*(w|d|h|m|s)/g;
	let total = 0;
	let matched = false;
	let m: RegExpExecArray | null;
	while ((m = re.exec(s)) !== null) {
		matched = true;
		total += parseFloat(m[1]) * DURATION_UNIT_MS[m[2]];
	}
	return matched && total > 0 ? Math.round(total) : null;
}

export interface ParsedDate {
	/** `YYYY-MM-DD` in local time. */
	day: string;
	/** True when the input carried an explicit time-of-day. */
	hasTime: boolean;
	/** Epoch milliseconds (local-time interpretation). */
	epoch: number;
}

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

function toDay(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Parses a date / datetime. Accepts `YYYY-MM-DD`, `YYYY/MM/DD`, an optional
 * `T` or space separated `HH:MM` / `HH:MM:SS`, and the relative forms `today`,
 * `tomorrow`, `yesterday` and `+Nd` / `+Nw`. All values are interpreted in the
 * local time zone.
 */
export function parseDateTime(input: string | number | undefined): ParsedDate | null {
	if (input === undefined || input === null) return null;
	const s = String(input).trim();
	if (!s) return null;

	const lower = s.toLowerCase();
	const now = new Date();

	if (lower === 'today') {
		const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		return { day: toDay(d), hasTime: false, epoch: d.getTime() };
	}
	if (lower === 'tomorrow') {
		const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
		return { day: toDay(d), hasTime: false, epoch: d.getTime() };
	}
	if (lower === 'yesterday') {
		const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
		return { day: toDay(d), hasTime: false, epoch: d.getTime() };
	}

	const rel = lower.match(/^\+\s*(\d+)\s*(d|w)$/);
	if (rel) {
		const days = Number(rel[1]) * (rel[2] === 'w' ? 7 : 1);
		const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
		return { day: toDay(d), hasTime: false, epoch: d.getTime() };
	}

	const abs = s.match(
		/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
	);
	if (!abs) return null;

	const year = Number(abs[1]);
	const month = Number(abs[2]);
	const day = Number(abs[3]);
	const hasTime = abs[4] !== undefined;
	const hh = hasTime ? Number(abs[4]) : 0;
	const mm = hasTime ? Number(abs[5]) : 0;
	const ss = abs[6] !== undefined ? Number(abs[6]) : 0;

	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	if (hh > 23 || mm > 59 || ss > 59) return null;

	const d = new Date(year, month - 1, day, hh, mm, ss);
	return { day: toDay(d), hasTime, epoch: d.getTime() };
}

export interface ParsedTaskFields {
	dueDay?: string;
	dueWithTime?: number;
	plannedAt?: number;
	timeEstimate?: number;
	timeSpent?: number;
	/** Tag names as written in the frontmatter (leading `#` stripped). */
	tagNames?: string[];
	/** Project name from a `project:` key, if present. */
	projectName?: string;
	/** Human-readable list of what was recognised, for the confirmation dialog. */
	detected: string[];
}

const KEY_ALIASES: Record<keyof Omit<ParsedTaskFields, 'detected'>, string[]> = {
	dueDay: ['due', 'duedate', 'due_date', 'due date', 'deadline'],
	dueWithTime: ['due', 'duedate', 'due_date', 'due date', 'deadline'],
	plannedAt: ['scheduled', 'planned', 'plannedat', 'planned_at', 'plan', 'start', 'do', 'do_date'],
	timeEstimate: ['estimate', 'est', 'timeestimate', 'time_estimate', 'time estimate'],
	timeSpent: ['spent', 'timespent', 'time_spent', 'time spent'],
	tagNames: ['tags', 'tag'],
	projectName: ['project', 'list'],
};

function lookup(data: Record<string, string | string[]>, names: string[]): string | string[] | undefined {
	const lowerMap: Record<string, string | string[]> = {};
	for (const k of Object.keys(data)) lowerMap[k.toLowerCase().trim()] = data[k];
	for (const name of names) {
		if (name in lowerMap) return lowerMap[name];
	}
	return undefined;
}

function asString(v: string | string[] | undefined): string | undefined {
	if (v === undefined) return undefined;
	return Array.isArray(v) ? v.join(' ') : v;
}

/** Maps recognised frontmatter keys onto Super Productivity task fields. */
export function parseTaskFieldsFromFrontmatter(
	data: Record<string, string | string[]>,
): ParsedTaskFields {
	const out: ParsedTaskFields = { detected: [] };

	const dueRaw = asString(lookup(data, KEY_ALIASES.dueDay));
	const due = parseDateTime(dueRaw);
	if (due) {
		if (due.hasTime) {
			out.dueWithTime = due.epoch;
			out.detected.push(`due ${dueRaw}`);
		} else {
			out.dueDay = due.day;
			out.detected.push(`due ${due.day}`);
		}
	}

	const plannedRaw = asString(lookup(data, KEY_ALIASES.plannedAt));
	const planned = parseDateTime(plannedRaw);
	if (planned) {
		out.plannedAt = planned.epoch;
		out.detected.push(`scheduled ${plannedRaw}`);
	}

	const estRaw = asString(lookup(data, KEY_ALIASES.timeEstimate));
	const est = parseDuration(estRaw);
	if (est) {
		out.timeEstimate = est;
		out.detected.push(`estimate ${estRaw}`);
	}

	const spentRaw = asString(lookup(data, KEY_ALIASES.timeSpent));
	const spent = parseDuration(spentRaw);
	if (spent) {
		out.timeSpent = spent;
		out.detected.push(`spent ${spentRaw}`);
	}

	const tagsRaw = lookup(data, KEY_ALIASES.tagNames);
	if (tagsRaw !== undefined) {
		const list = Array.isArray(tagsRaw) ? tagsRaw : String(tagsRaw).split(/[,\s]+/);
		const names = list
			.map((t) => t.replace(/^#/, '').trim())
			.filter((t) => t !== '');
		if (names.length) {
			out.tagNames = names;
			out.detected.push(`tags ${names.join(', ')}`);
		}
	}

	const projectRaw = asString(lookup(data, KEY_ALIASES.projectName));
	if (projectRaw) {
		out.projectName = projectRaw;
		out.detected.push(`project ${projectRaw}`);
	}

	return out;
}
