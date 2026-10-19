// Tolerant extraction of vehicle values from JSON of unknown shape. Nothing here throws:
// unexpected input yields missing fields, never an exception. Implausible values are dropped.
import type {
	AlertSeverity,
	ChargingState,
	DoorState,
	TireState,
	VehicleAlert,
	VehicleData,
	VehicleInfo,
	WindowState
} from './types.ts';

type Rec = Record<string, unknown>;

const MAX_DEPTH = 8;
const MAX_NODES = 20_000;

export function isRecord(value: unknown): value is Rec {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A key found somewhere in the tree, with the object that holds it. */
type Node = { value: unknown; parent: Rec };

/**
 * Indexes every object key (lower-cased) in breadth-first order, so the shallowest
 * occurrence of a key wins. Bounded in depth and size.
 */
export function indexKeys(root: unknown): Map<string, Node[]> {
	const index = new Map<string, Node[]>();
	let queue: unknown[] = [root];
	let seen = 0;
	for (let depth = 0; depth <= MAX_DEPTH && queue.length > 0; depth++) {
		const next: unknown[] = [];
		for (const item of queue) {
			if (++seen > MAX_NODES) return index;
			if (Array.isArray(item)) {
				next.push(...item.slice(0, 100));
			} else if (isRecord(item)) {
				for (const [key, value] of Object.entries(item)) {
					const k = key.toLowerCase();
					let list = index.get(k);
					if (!list) index.set(k, (list = []));
					list.push({ value, parent: item });
					if (typeof value === 'object' && value !== null) next.push(value);
				}
			}
		}
		queue = next;
	}
	return index;
}

function field(obj: Rec, names: string[]): unknown {
	for (const [key, value] of Object.entries(obj)) {
		if (names.includes(key.toLowerCase())) return value;
	}
	return undefined;
}

/** Number from a number or a numeric string. */
export function toNumber(value: unknown): number | undefined {
	if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
	if (typeof value === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(value)) return Number(value);
	return undefined;
}

type Unwrapped = { value: unknown; unit?: string };

/** Unwraps `{ value: x, unit: 'km' }`-style wrappers (a few levels deep). */
function unwrap(value: unknown, unit?: string): Unwrapped {
	let current = value;
	let currentUnit = unit;
	for (let i = 0; i < 3 && isRecord(current); i++) {
		const u = field(current, ['unit', 'uom', 'units', 'unitofmeasure']);
		if (typeof u === 'string') currentUnit = u;
		const inner = field(current, ['value', 'val', 'amount']);
		if (inner === undefined) break;
		current = inner;
	}
	return { value: current, unit: currentUnit };
}

function siblingUnit(node: Node): string | undefined {
	const u = field(node.parent, ['unit', 'uom', 'units']);
	return typeof u === 'string' ? u : undefined;
}

function distanceKm(value: number, unit?: string): number {
	const u = unit?.trim().toLowerCase();
	if (u && ['mi', 'mile', 'miles'].includes(u)) return value * 1.609344;
	if (u && ['m', 'meter', 'meters', 'metre', 'metres'].includes(u)) return value / 1000;
	return value;
}

function temperatureC(value: number, unit?: string): number {
	const u = unit?.trim().toLowerCase();
	if (u && ['f', '°f', 'fahrenheit'].includes(u)) return ((value - 32) * 5) / 9;
	return value;
}

const round = (value: number, digits: number) => {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
};

type Finder<T> = (node: Node) => T | undefined;

function first<T>(index: Map<string, Node[]>, keys: string[], pick: Finder<T>): T | undefined {
	for (const key of keys) {
		for (const node of index.get(key) ?? []) {
			try {
				const result = pick(node);
				if (result !== undefined) return result;
			} catch {
				// Defensive: a weird value must never break normalization.
			}
		}
	}
	return undefined;
}

function numberIn(min: number, max: number, convert?: (n: number, unit?: string) => number) {
	return (node: Node) => {
		const { value, unit } = unwrap(node.value, siblingUnit(node));
		const n = toNumber(value);
		if (n === undefined) return undefined;
		const converted = convert ? convert(n, unit) : n;
		return converted >= min && converted <= max ? converted : undefined;
	};
}

function text(node: Node): string | undefined {
	const { value } = unwrap(node.value);
	if (typeof value === 'string' && value.trim() && value.length <= 100) return value.trim();
	return undefined;
}

const TRUE_WORDS = ['true', 'yes', 'on', 'connected', 'plugged', 'pluggedin', 'plugged_in', '1'];
const FALSE_WORDS = [
	'false',
	'no',
	'off',
	'disconnected',
	'unplugged',
	'not_connected',
	'notconnected',
	'0'
];

export function toPlugged(value: unknown): boolean | undefined {
	const { value: v } = unwrap(value);
	if (typeof v === 'boolean') return v;
	if (v === 1 || v === 0) return v === 1;
	if (typeof v !== 'string') return undefined;
	const s = v
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
	if (TRUE_WORDS.includes(s) || TRUE_WORDS.includes(s.replace(/_/g, ''))) return true;
	if (FALSE_WORDS.includes(s) || FALSE_WORDS.includes(s.replace(/_/g, ''))) return false;
	// A charger status of "charging" implies a plugged-in cable.
	if (s === 'charging' || s === 'charging_ac' || s === 'charging_dc') return true;
	return undefined;
}

export function toChargingState(value: unknown): ChargingState | undefined {
	const { value: v } = unwrap(value);
	if (typeof v === 'boolean') return v ? 'charging' : 'notCharging';
	if (typeof v !== 'string') return undefined;
	const s = v
		.trim()
		.toLowerCase()
		.replace(/[\s_-]+/g, ' ');
	if (!s) return undefined;
	if (/fault|error|fail/.test(s)) return 'fault';
	if (/complete|full|finished|done/.test(s)) return 'complete';
	if (/\bnot|stop|idle|pause|disconnect|none|\boff\b|scheduled|waiting|unplug/.test(s))
		return 'notCharging';
	if (/progress|charging|active/.test(s)) return 'charging';
	return undefined;
}

/** ISO string from an ISO/RFC date string or epoch seconds/milliseconds. */
export function toTimestamp(value: unknown): string | undefined {
	const { value: v } = unwrap(value);
	let ms: number | undefined;
	if (typeof v === 'number' && Number.isFinite(v)) ms = v < 1e11 ? v * 1000 : v;
	else if (typeof v === 'string' && v.length <= 64) {
		const n = toNumber(v);
		ms = n !== undefined ? (n < 1e11 ? n * 1000 : n) : Date.parse(v);
	}
	if (ms === undefined || !Number.isFinite(ms)) return undefined;
	// Plausible range: 2000-01-01 to 2100-01-01.
	if (ms < 946_684_800_000 || ms > 4_102_444_800_000) return undefined;
	return new Date(ms).toISOString();
}

function position(index: Map<string, Node[]>): { latitude: number; longitude: number } | undefined {
	const latKeys = ['latitude', 'lat'];
	const lonKeys = ['longitude', 'lon', 'lng', 'long'];
	for (const key of latKeys) {
		for (const node of index.get(key) ?? []) {
			const lat = toNumber(unwrap(node.value).value);
			const lon = toNumber(unwrap(field(node.parent, lonKeys)).value);
			if (lat === undefined || lon === undefined) continue;
			if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
			// 0/0 is what some systems report when there is no fix.
			if (lat === 0 && lon === 0) continue;
			return { latitude: round(lat, 6), longitude: round(lon, 6) };
		}
	}
	return undefined;
}

/** Timestamp of a position object such as `{ updateTime, value: { location } }`. */
function positionTime(index: Map<string, Node[]>): string | undefined {
	return first(index, ['position', 'location', 'vehicleposition', 'gps'], (node) =>
		isRecord(node.value)
			? toTimestamp(field(node.value, ['updatetime', 'timestamp', 'time']))
			: undefined
	);
}

/** Status values of a single wrapper or a list of wrappers (one per door, window, ...). */
function statusValues(node: Node): unknown[] {
	const items = Array.isArray(node.value) ? node.value.slice(0, 20) : [node.value];
	return items.map((item) => unwrap(item).value).filter((v) => v !== undefined && v !== null);
}

/**
 * Combines per-part states: false as soon as one part is in the "bad" state, true only when
 * every part is in the "good" state, otherwise unknown.
 */
function allParts(
	index: Map<string, Node[]>,
	keys: string[],
	classify: (value: unknown) => boolean | undefined
): boolean | undefined {
	return first(index, keys, (node) => {
		const states = statusValues(node).map(classify);
		if (states.length === 0) return undefined;
		if (states.includes(false)) return false;
		return states.every((s) => s === true) ? true : undefined;
	});
}

const words = (value: unknown) =>
	typeof value === 'string'
		? value
				.trim()
				.toLowerCase()
				.replace(/[\s_-]+/g, ' ')
		: undefined;

export function toLocked(value: unknown): boolean | undefined {
	if (typeof value === 'boolean') return value;
	const s = words(value);
	if (!s) return undefined;
	if (/unlock/.test(s)) return false;
	if (/lock|secured/.test(s)) return true;
	return undefined;
}

export function toClosed(value: unknown): boolean | undefined {
	if (typeof value === 'boolean') return value;
	const s = words(value);
	if (!s) return undefined;
	if (/open|ajar|vent/.test(s)) return false;
	if (/closed|shut/.test(s)) return true;
	return undefined;
}

/** Window state: a status string or an opening range such as `{ doubleRange: { upperBound } }`. */
export function toWindowClosed(value: unknown): boolean | undefined {
	if (isRecord(value)) {
		const range = field(value, ['doublerange', 'range', 'position']);
		const holder = isRecord(range) ? range : value;
		const upper = toNumber(field(holder, ['upperbound', 'max', 'percent', 'value']));
		if (upper === undefined) return undefined;
		return upper <= 0;
	}
	return toClosed(value);
}

export function toIgnitionOn(value: unknown): boolean | undefined {
	const { value: v } = unwrap(value);
	if (typeof v === 'boolean') return v;
	const s = words(v);
	if (!s) return undefined;
	if (s === 'off' || s === 'stop' || s === 'stopped') return false;
	if (s === 'on' || s === 'run' || s === 'running' || s === 'start') return true;
	return undefined;
}

/** `FRONT_LEFT`, `front-left` or `frontLeft` → `frontLeft`. */
export function partName(value: unknown): string | undefined {
	if (typeof value !== 'string' || !value.trim() || value.length > 40) return undefined;
	const words = value
		.trim()
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
	if (words.length === 0) return undefined;
	return words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('');
}

const PART_KEYS = [
	'vehicledoor',
	'vehiclewindow',
	'vehiclewheel',
	'door',
	'window',
	'wheel',
	'tire',
	'tyre'
];

type PartItem = { part: string; value: unknown; unit?: string; item: Rec; at?: string };

/** The items of the first per-part list among `keys` (a list of `{ value, vehicleDoor }`). */
function partItems(index: Map<string, Node[]>, keys: string[]): PartItem[] | undefined {
	return first(index, keys, (node) => {
		if (!Array.isArray(node.value)) return undefined;
		const items = node.value
			.slice(0, 20)
			.filter(isRecord)
			.flatMap((item, i) => {
				const { value, unit } = unwrap(item);
				if (value === undefined || value === null) return [];
				const part = partName(field(item, PART_KEYS)) ?? `part${i + 1}`;
				const at = toTimestamp(field(item, ['updatetime', 'timestamp', 'time']));
				return [{ part, value, unit, item, ...(at && { at }) }];
			});
		return items.length > 0 ? items : undefined;
	});
}

/** Tyre pressure in kPa; without a unit, small values are read as bar and medium ones as psi. */
export function pressureKPa(value: number, unit?: string): number | undefined {
	const u = unit?.trim().toLowerCase();
	let kPa: number;
	if (u === 'psi') kPa = value * 6.894757;
	else if (u === 'bar') kPa = value * 100;
	else if (u === 'kpa' || u) kPa = value;
	else if (value <= 10) kPa = value * 100;
	else if (value <= 80) kPa = value * 6.894757;
	else kPa = value;
	return kPa >= 50 && kPa <= 600 ? round(kPa, 1) : undefined;
}

/** True for a "too low" tyre status, false for a normal one. */
export function toTireLow(value: unknown): boolean | undefined {
	if (typeof value === 'boolean') return value;
	const s = words(value);
	if (!s) return undefined;
	if (/low|under|flat|deflat|warn|alert|fault/.test(s)) return true;
	if (/normal|ok|good|fine/.test(s)) return false;
	return undefined;
}

function doorStates(index: Map<string, Node[]>): DoorState[] | undefined {
	const closed = partItems(index, KEYS.doors);
	const locked = partItems(index, KEYS.doorLocks);
	if (!closed && !locked) return undefined;
	const byPart = new Map<string, DoorState>();
	const entry = (part: string) => {
		let door = byPart.get(part);
		if (!door) byPart.set(part, (door = { part }));
		return door;
	};
	for (const { part, value, at } of closed ?? []) {
		const state = toClosed(value);
		if (state === undefined) continue;
		const door = entry(part);
		door.closed = state;
		if (at && (!door.at || at > door.at)) door.at = at;
	}
	for (const { part, value, at } of locked ?? []) {
		const state = toLocked(value);
		if (state === undefined) continue;
		const door = entry(part);
		door.locked = state;
		if (at && (!door.at || at > door.at)) door.at = at;
	}
	return byPart.size > 0 ? [...byPart.values()] : undefined;
}

function windowStates(index: Map<string, Node[]>): WindowState[] | undefined {
	const list = (partItems(index, KEYS.windows) ?? []).flatMap(({ part, value, at }) => {
		const closed = toWindowClosed(value);
		return closed === undefined ? [] : [{ part, closed, ...(at && { at }) }];
	});
	return list.length > 0 ? list : undefined;
}

function tireStates(index: Map<string, Node[]>): TireState[] | undefined {
	const pressures = partItems(index, KEYS.tirePressure) ?? [];
	const statuses = new Map(
		(partItems(index, KEYS.tireStatus) ?? []).map((s) => [s.part, toTireLow(s.value)])
	);
	const tires = pressures.flatMap(({ part, value, unit, item, at }): TireState[] => {
		const n = toNumber(value);
		const kPa = n === undefined ? undefined : pressureKPa(n, unit);
		if (kPa === undefined) return [];
		const placard = toNumber(
			field(
				item,
				part.startsWith('rear') ? ['wheelplacardrear', 'placard'] : ['wheelplacardfront', 'placard']
			)
		);
		const targetKPa = placard === undefined ? undefined : pressureKPa(placard, unit);
		let low =
			statuses.get(part) ?? toTireLow(field(item, ['status', 'tirepressurestatus', 'state']));
		// Without a reported status, 20 % below the recommendation counts as low.
		if (low === undefined && targetKPa !== undefined) low = kPa < targetKPa * 0.8;
		return [
			{
				part,
				kPa,
				...(targetKPa !== undefined && { targetKPa }),
				...(low !== undefined && { low }),
				...(at && { at })
			}
		];
	});
	if (tires.length > 0) return tires;
	// Some vehicles only report a status per wheel.
	const onlyStatus = [...statuses].flatMap(([part, low]) =>
		low === undefined ? [] : [{ part, low }]
	);
	return onlyStatus.length > 0 ? onlyStatus : undefined;
}

// Candidate keys, most specific first. All lower case.
const KEYS = {
	soc: [
		'xevbatterystateofcharge',
		'xevbatteryactualstateofcharge',
		'hvbatterystateofcharge',
		'batterychargelevel',
		'stateofcharge',
		'soc',
		'chargelevel',
		'batterylevel'
	],
	range: [
		'xevbatteryrange',
		'batteryrange',
		'electricrange',
		'evrange',
		'distancetoempty',
		'rangekm',
		'range'
	],
	plug: [
		'xevplugchargerstatus',
		'plugstatus',
		'chargerplugstatus',
		'pluggedin',
		'isplugged',
		'plugged',
		'plugconnected'
	],
	charging: [
		'xevbatterychargedisplaystatus',
		'chargingstatus',
		'chargestatus',
		'chargingstate',
		'chargestate',
		'xevplugchargerstatus'
	],
	odometer: ['odometer', 'mileage', 'odo', 'totaldistance'],
	outsideTemp: [
		'outsidetemperature',
		'ambienttemperature',
		'exteriortemperature',
		'outsidetemp',
		'ambienttemp'
	],
	// `batteryStateOfCharge` / `batteryVoltage` next to an `xev…` (high-voltage) key
	// usually describe the 12 V battery; generic `soc` keys above are taken as high voltage.
	battery12vVoltage: [
		'battery12vvoltage',
		'lvbatteryvoltage',
		'auxbatteryvoltage',
		'batteryvoltage'
	],
	battery12vPct: [
		'battery12vstateofcharge',
		'lvbatterystateofcharge',
		'auxbatterystateofcharge',
		'batterystateofcharge'
	],
	timeToFullCharge: [
		'xevbatterytimetofullcharge',
		'timetofullcharge',
		'chargetimeremaining',
		'remainingchargetime'
	],
	ignition: ['ignitionstatus', 'ignitionstate', 'ignition'],
	doorLocks: ['doorlockstatus', 'doorlocks', 'lockstatus', 'locked'],
	doors: ['doorstatus', 'doorsstatus', 'doors'],
	windows: ['windowstatus', 'windowsstatus', 'windows'],
	hood: ['hoodstatus', 'hood', 'bonnetstatus'],
	tirePressure: ['tirepressure', 'tyrepressure', 'tirepressures', 'tyrepressures'],
	tireStatus: ['tirepressurestatus', 'tyrepressurestatus', 'tirestatus'],
	reportedAt: ['updatetime', 'updatedtime', 'lastupdated', 'lastupdatetime', 'timestamp', 'time']
};

/** Normalizes a telemetry-like response. Never throws. */
export function normalizeTelemetry(body: unknown): VehicleData {
	const data: VehicleData = {};
	if (!isRecord(body) && !Array.isArray(body)) return data;
	try {
		const index = indexKeys(body);
		const pos = position(index);
		if (pos) {
			Object.assign(data, pos);
			const positionAt = positionTime(index);
			if (positionAt) data.positionAt = positionAt;
		}

		const soc = first(index, KEYS.soc, numberIn(0, 100));
		if (soc !== undefined) data.stateOfChargePct = round(soc, 1);
		const range = first(index, KEYS.range, numberIn(0, 2000, distanceKm));
		if (range !== undefined) data.rangeKm = round(range, 1);
		const odometer = first(index, KEYS.odometer, numberIn(0, 2_000_000, distanceKm));
		if (odometer !== undefined) data.odometerKm = round(odometer, 1);
		const temp = first(index, KEYS.outsideTemp, numberIn(-60, 70, temperatureC));
		if (temp !== undefined) data.outsideTempC = round(temp, 1);
		const volt = first(index, KEYS.battery12vVoltage, numberIn(5, 20));
		if (volt !== undefined) data.battery12vVoltage = round(volt, 2);
		const pct12 = first(index, KEYS.battery12vPct, numberIn(0, 100));
		if (pct12 !== undefined) data.battery12vPct = round(pct12, 1);

		const plugged = first(index, KEYS.plug, (node) => toPlugged(node.value));
		if (plugged !== undefined) data.pluggedIn = plugged;
		const chargingRaw = first(index, KEYS.charging, text);
		if (chargingRaw !== undefined) {
			data.chargingStatusRaw = chargingRaw;
			const state = toChargingState(chargingRaw);
			if (state) data.chargingState = state;
		} else {
			const bool = first(index, KEYS.charging, (node) => toChargingState(node.value));
			if (bool) data.chargingState = bool;
		}

		const toFull = first(index, KEYS.timeToFullCharge, numberIn(0, 7 * 24 * 60));
		if (toFull !== undefined) data.timeToFullChargeMin = Math.round(toFull);

		const ignition = first(index, KEYS.ignition, (node) => toIgnitionOn(node.value));
		if (ignition !== undefined) data.ignitionOn = ignition;
		const locked = allParts(index, KEYS.doorLocks, toLocked);
		if (locked !== undefined) data.doorsLocked = locked;
		const doorsClosed = allParts(index, KEYS.doors, toClosed);
		if (doorsClosed !== undefined) data.doorsClosed = doorsClosed;
		const windowsClosed = allParts(index, KEYS.windows, toWindowClosed);
		if (windowsClosed !== undefined) data.windowsClosed = windowsClosed;
		const doors = doorStates(index);
		if (doors) data.doors = doors;
		const windows = windowStates(index);
		if (windows) data.windows = windows;
		const hood = first(index, KEYS.hood, (node) =>
			Array.isArray(node.value) ? undefined : toClosed(unwrap(node.value).value)
		);
		if (hood !== undefined) data.hoodClosed = hood;
		const tires = tireStates(index);
		if (tires) data.tires = tires;

		const reportedAt = first(index, KEYS.reportedAt, (node) => toTimestamp(node.value));
		if (reportedAt) data.reportedAt = reportedAt;
	} catch {
		// Keep whatever was extracted so far.
	}
	return data;
}

/**
 * The alert list of an alerts response: per-vehicle `ActiveAlerts` lists (observed), a list,
 * or a wrapper with one.
 */
function alertList(body: unknown, depth = 0): unknown[] | undefined {
	if (depth === 0) {
		const active = (indexKeys(body).get('activealerts') ?? []).filter((n) =>
			Array.isArray(n.value)
		);
		if (active.length > 0) return active.flatMap((n) => n.value as unknown[]);
	}
	if (Array.isArray(body)) return body;
	if (!isRecord(body) || depth > 2) return undefined;
	for (const key of ['alerts', 'vehiclealerts', 'items', 'data', 'results']) {
		const value = field(body, [key]);
		if (Array.isArray(value)) return value;
		if (isRecord(value)) {
			const nested = alertList(value, depth + 1);
			if (nested) return nested;
		}
	}
	return undefined;
}

/** Number of alerts in an alerts response, if it looks like a list. */
export function countAlerts(body: unknown): number | undefined {
	return alertList(body)?.length;
}

/** `TIRE_PRESSURE_LOW` → `Tire pressure low`; readable text stays as it is. */
function readable(text: string): string {
	if (/[a-z]/.test(text) && /\s/.test(text)) return text;
	const spaced = text.replace(/[_-]+/g, ' ').trim().toLowerCase();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function toSeverity(value: unknown): AlertSeverity {
	const s = words(typeof value === 'number' ? String(value) : value) ?? '';
	if (/critical|high|red|urgent|severe|danger|stop/.test(s)) return 'critical';
	if (/medium|warn|amber|yellow|moderate/.test(s)) return 'warning';
	return 'info';
}

const ALERT_TEXT_KEYS = [
	'description',
	'title',
	'alertdescription',
	'message',
	'text',
	'name',
	'alerttype',
	'type',
	'code'
];

/** Active alerts of an alerts response; inactive or cleared ones are left out. Never throws. */
export function normalizeAlerts(body: unknown): VehicleAlert[] | undefined {
	try {
		const list = alertList(body);
		if (!list) return undefined;
		return list
			.slice(0, 50)
			.filter(isRecord)
			.flatMap((item): VehicleAlert[] => {
				const active = field(item, ['active', 'isactive']);
				if (active === false) return [];
				const status = words(unwrap(field(item, ['status', 'state'])).value);
				if (status && /inactive|clear|resolv|clos/.test(status)) return [];
				let title: string | undefined;
				for (const key of ALERT_TEXT_KEYS) {
					const { value } = unwrap(field(item, [key]));
					if (typeof value === 'string' && value.trim() && value.length <= 200) {
						title = readable(value.trim());
						break;
					}
				}
				if (!title) return [];
				const at = toTimestamp(
					field(item, ['updatetime', 'timestamp', 'createdat', 'activetime', 'date', 'time'])
				);
				const severity = toSeverity(
					unwrap(field(item, ['severity', 'priority', 'urgency', 'level'])).value
				);
				return [{ title, severity, ...(at && { at }) }];
			})
			.slice(0, 20);
	} catch {
		return undefined;
	}
}

function vehicleFrom(obj: Rec): VehicleInfo | undefined {
	const str = (names: string[]) => {
		const v = field(obj, names);
		if (typeof v === 'number' && Number.isFinite(v)) return String(v);
		return typeof v === 'string' && v.trim() && v.length <= 100 ? v.trim() : undefined;
	};
	const id = str(['vin', 'vehicleid', 'vehicle_id', 'id']);
	const nickname = str(['nickname', 'nick_name', 'displayname', 'name']);
	const model = [
		str(['modelyear', 'model_year', 'year']),
		str(['modelname', 'model_name', 'model'])
	]
		.filter(Boolean)
		.join(' ');
	const name = nickname ?? (model || undefined);
	if (!id && !name) return undefined;
	return { ...(id && { id }), ...(name && { name }) };
}

/** Vehicles in a garage-like response: a list, a wrapper with a list, or one object. */
export function normalizeVehicles(body: unknown): VehicleInfo[] {
	try {
		let list: unknown[] | undefined;
		if (Array.isArray(body)) list = body;
		else if (isRecord(body)) {
			for (const key of ['vehicles', 'garage', 'data', 'items', 'results']) {
				const value = field(body, [key]);
				if (Array.isArray(value)) {
					list = value;
					break;
				}
				if (isRecord(value) && vehicleFrom(value)) {
					list = [value];
					break;
				}
			}
			list ??= [body];
		}
		return (list ?? [])
			.slice(0, 20)
			.map((item) => (isRecord(item) ? vehicleFrom(item) : undefined))
			.filter((v): v is VehicleInfo => v !== undefined);
	} catch {
		return [];
	}
}

/** Display label for a connection. */
export function vehicleLabel(vehicles: VehicleInfo[]): string | undefined {
	const v = vehicles[0];
	if (!v) return undefined;
	if (v.name) return v.name.slice(0, 80);
	return v.id ? `…${v.id.slice(-6)}` : undefined;
}
