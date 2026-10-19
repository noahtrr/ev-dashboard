import { error } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { messages } from '#lib/i18n.ts';
import {
	EXPORT_FORMATS,
	exportLogbook,
	type ExportFile,
	type ExportFormat
} from '#lib/server/export/logbook-export.ts';
import { fillTemplate, monthlyValues, TemplateError } from '#lib/server/export/templates.ts';
import { isTimeZone, pad2, parseDay, wallClock, zonedMidnight } from '#lib/server/export/time.ts';
import { isPurpose } from '#lib/server/vehicles/logbook.ts';
import type { RequestHandler } from './$types';

/** Longest period one download covers. */
const MAX_DAYS = 3 * 366;

/** ASCII-only file name for the header, with the full name in `filename*`. */
function disposition(name: string) {
	const ascii = name.replace(/[^\w.-]+/g, '-');
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles, logbook, templates } = getApp();
	const connection = await vehicles.getConnection(locals.user.id, params.id);
	if (!connection) error(404, 'Not found');

	const q = url.searchParams;
	const timeZone = isTimeZone(q.get('tz')) ? q.get('tz')! : 'UTC';
	const first = parseDay(q.get('from'));
	const last = parseDay(q.get('to'));
	if (!first || !last) error(400, messages[locals.locale].logbook.rangeError);
	const from = zonedMidnight(first.year, first.month, first.day, timeZone);
	// The end is the start of the day after the last day.
	const next = new Date(Date.UTC(last.year, last.month - 1, last.day + 1));
	const to = zonedMidnight(
		next.getUTCFullYear(),
		next.getUTCMonth() + 1,
		next.getUTCDate(),
		timeZone
	);
	if (to <= from || to.getTime() - from.getTime() > MAX_DAYS * 86_400_000) {
		error(400, messages[locals.locale].logbook.rangeError);
	}
	const until = new Date(to.getTime() - 1);
	const vehicle = connection.label || messages[locals.locale].connections.unnamed;
	const span = `${first.year}-${pad2(first.month)}-${pad2(first.day)}_${last.year}-${pad2(last.month)}-${pad2(last.day)}`;
	const format = q.get('format') ?? '';

	let file: ExportFile;
	let baseName: string;
	if (format.startsWith('template:')) {
		const template = await templates.get(locals.user.id, format.slice('template:'.length));
		if (!template) error(404, 'Not found');
		// Earlier trips provide the odometer at the start of the period.
		const entries = await logbook.list(locals.user.id, params.id, new Date(0), until, 'asc');
		const today = wallClock(new Date(), timeZone);
		try {
			file = {
				body: fillTemplate(template.data, {
					first,
					last,
					// Months that have not begun yet stay empty for the owner to fill in later.
					months: monthlyValues(entries, first, last, timeZone).filter(
						(m) => m.year * 12 + m.month <= today.year * 12 + today.month
					)
				}),
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				extension: 'xlsx'
			};
		} catch (cause) {
			if (cause instanceof TemplateError) {
				error(400, messages[locals.locale].logbook.templateErrors[cause.code]);
			}
			throw cause;
		}
		baseName = template.name;
	} else {
		if (!(EXPORT_FORMATS as readonly string[]).includes(format)) error(400, 'Bad request');
		const purpose = q.get('purpose');
		const entries = (await logbook.list(locals.user.id, params.id, from, until, 'asc')).filter(
			(e) => !isPurpose(purpose) || e.purpose === purpose
		);
		file = exportLogbook(format as ExportFormat, {
			entries,
			locale: locals.locale,
			timeZone,
			firstDay: { ...first, hour: 0, minute: 0 },
			lastDay: { ...last, hour: 0, minute: 0 },
			vehicle
		});
		baseName = messages[locals.locale].logbook.fileTitle;
	}

	return new Response(new Uint8Array(file.body), {
		headers: {
			'content-type': file.type,
			'content-disposition': disposition(`${baseName} ${span}.${file.extension}`),
			'cache-control': 'private, no-store'
		}
	});
};
