// Reads a trip the owner enters by hand from the submitted form. Dates and times are the
// owner's wall clock; the browser sends its time zone along.
import { isTimeZone, parseDay, zonedTime } from '../export/time.ts';
import { isPurpose, NOTE_MAX_LENGTH, type ManualTrip } from './logbook.ts';

export const ADDRESS_MAX_LENGTH = 200;
/** Longest distance one trip may have. */
export const MANUAL_MAX_KM = 5000;
const ODOMETER_MAX_KM = 10_000_000;
/** Kilometres the distance may differ from the odometer readings (they are whole km). */
const ODOMETER_TOLERANCE_KM = 1;

export type ManualTripError =
	| 'date'
	| 'time'
	| 'future'
	| 'distance'
	| 'odometer'
	| 'mismatch'
	| 'purpose'
	| 'address'
	| 'note';

/** The form values as entered, so the page can show them again after an error. */
export type ManualTripForm = {
	date: string;
	startTime: string;
	endTime: string;
	distanceKm: string;
	startOdometerKm: string;
	endOdometerKm: string;
	startAddress: string;
	endAddress: string;
	purpose: string;
	note: string;
};

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

export function manualTripForm(form: FormData): ManualTripForm {
	return {
		date: field(form, 'date'),
		startTime: field(form, 'startTime'),
		endTime: field(form, 'endTime'),
		distanceKm: field(form, 'distanceKm'),
		startOdometerKm: field(form, 'startOdometerKm'),
		endOdometerKm: field(form, 'endOdometerKm'),
		startAddress: field(form, 'startAddress'),
		endAddress: field(form, 'endAddress'),
		purpose: field(form, 'purpose'),
		note: field(form, 'note')
	};
}

function parseTime(value: string): { hour: number; minute: number } | null {
	const match = /^(\d{2}):(\d{2})$/.exec(value);
	if (!match) return null;
	const [hour, minute] = match.slice(1).map(Number);
	return hour < 24 && minute < 60 ? { hour, minute } : null;
}

/** A number as typed, with a comma or point as decimal separator; null when empty. */
function parseNumber(value: string, max: number): number | null | undefined {
	if (value === '') return null;
	if (!/^\d{1,8}([.,]\d{1,2})?$/.test(value)) return undefined;
	const n = Number(value.replace(',', '.'));
	return n <= max ? n : undefined;
}

export function parseManualTrip(
	input: ManualTripForm,
	timeZone: string,
	now: number
): { trip: ManualTrip } | { error: ManualTripError } {
	const zone = isTimeZone(timeZone) ? timeZone : 'UTC';
	const day = parseDay(input.date);
	if (!day) return { error: 'date' };
	const start = parseTime(input.startTime);
	if (!start) return { error: 'time' };
	const end = input.endTime === '' ? start : parseTime(input.endTime);
	if (!end) return { error: 'time' };
	const startAt = zonedTime({ ...day, ...start }, zone);
	let endAt = zonedTime({ ...day, ...end }, zone);
	// An arrival before the departure is on the next day.
	if (endAt < startAt) endAt = new Date(endAt.getTime() + 24 * 3600 * 1000);
	if (endAt.getTime() > now) return { error: 'future' };

	const distance = parseNumber(input.distanceKm, MANUAL_MAX_KM);
	const startOdo = parseNumber(input.startOdometerKm, ODOMETER_MAX_KM);
	const endOdo = parseNumber(input.endOdometerKm, ODOMETER_MAX_KM);
	if (distance === undefined) return { error: 'distance' };
	if (startOdo === undefined || endOdo === undefined) return { error: 'odometer' };
	let distanceKm = distance;
	let endOdometerKm = endOdo;
	if (startOdo !== null && endOdo !== null) {
		if (endOdo <= startOdo || endOdo - startOdo > MANUAL_MAX_KM) return { error: 'odometer' };
		if (distanceKm === null) distanceKm = endOdo - startOdo;
		else if (Math.abs(endOdo - startOdo - distanceKm) > ODOMETER_TOLERANCE_KM) {
			return { error: 'mismatch' };
		}
	} else if (startOdo !== null && distanceKm !== null) {
		endOdometerKm = startOdo + distanceKm;
	}
	if (distanceKm === null || distanceKm <= 0) return { error: 'distance' };

	if (!isPurpose(input.purpose)) return { error: 'purpose' };
	if (
		input.startAddress.length > ADDRESS_MAX_LENGTH ||
		input.endAddress.length > ADDRESS_MAX_LENGTH
	) {
		return { error: 'address' };
	}
	if (input.note.length > NOTE_MAX_LENGTH) return { error: 'note' };
	return {
		trip: {
			startAt,
			endAt,
			distanceKm,
			startOdometerKm: startOdo,
			endOdometerKm,
			startAddress: input.startAddress || null,
			endAddress: input.endAddress || null,
			purpose: input.purpose,
			note: input.note || null
		}
	};
}
