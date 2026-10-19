// Test fixtures. ASSUMED shapes, NOT captured responses: the real response formats of the
// API are not documented in the material this project has. The shapes below follow the type
// definitions of an open-source client and common connected-car conventions, so the
// normalizer is exercised against plausible variants. Replace or extend them with real
// (anonymized) responses once known. All values are made up.

/** Assumed: metrics map with `{ value, updateTime }` wrappers. */
export const telemetryMetrics = {
	updateTime: '2026-10-18T19:42:11.000Z',
	vehicleId: 'veh-0001',
	vin: 'TESTVIN0000000001',
	metrics: {
		position: {
			updateTime: '2026-10-18T19:41:58.000Z',
			value: { location: { lat: 52.520008, lon: 13.404954, alt: 34.2 } }
		},
		xevBatteryStateOfCharge: { updateTime: '2026-10-18T19:42:11.000Z', value: 76.5 },
		xevBatteryRange: { updateTime: '2026-10-18T19:42:11.000Z', value: 312.4 },
		odometer: { updateTime: '2026-10-18T19:42:11.000Z', value: 18234.7 },
		outsideTemperature: { updateTime: '2026-10-18T19:42:11.000Z', value: 11.5 },
		xevPlugChargerStatus: { updateTime: '2026-10-18T19:42:11.000Z', value: 'CONNECTED' },
		xevBatteryChargeDisplayStatus: { updateTime: '2026-10-18T19:42:11.000Z', value: 'IN_PROGRESS' },
		batteryVoltage: { updateTime: '2026-10-18T19:42:11.000Z', value: 12.6 },
		batteryStateOfCharge: { updateTime: '2026-10-18T19:42:11.000Z', value: 88 },
		ignitionStatus: { updateTime: '2026-10-18T19:42:11.000Z', value: 'OFF' }
	}
};

/** Assumed: flat-ish status document with string numbers and explicit units (imperial). */
export const telemetryFlatImperial = {
	status: 'SUCCESS',
	vehicle: {
		lastUpdated: 1792352531,
		vehicleLocation: { latitude: '48.137154', longitude: '11.576124' },
		batteryChargeLevel: { value: '54', distanceToEmpty: { value: '150', unit: 'mi' } },
		odometer: { value: 10000, unit: 'miles' },
		outsideTemperature: { value: 50, unit: 'F' },
		plugStatus: { value: false },
		chargingStatus: { value: 'NotReady' }
	}
};

/** Assumed garage response: one vehicle object. */
export const garageSingle = {
	vin: 'TESTVIN0000000001',
	vehicleId: 'veh-0001',
	modelName: 'Testmodel',
	modelYear: '2024',
	nickName: 'Blue car',
	engineType: 'BEV'
};

/** Assumed garage response: list wrapper without nickname. */
export const garageList = {
	vehicles: [
		{ vehicleId: 'veh-0002', modelName: 'Other', modelYear: 2023 },
		{ vehicleId: 'veh-0003' }
	]
};

/** Assumed alerts response. */
export const alerts = {
	alerts: [
		{ alertId: 'a1', severity: 'LOW', description: 'Tyre pressure low' },
		{ alertId: 'a2', severity: 'MEDIUM', description: 'Service due' }
	]
};

/** Inputs that must never throw and never produce bogus values. */
export const garbage: unknown[] = [
	null,
	undefined,
	0,
	42,
	'',
	'not json',
	true,
	[],
	[null, 1, 'x'],
	{},
	{ metrics: null },
	{ metrics: { position: { value: { location: { lat: 'north', lon: {} } } } } },
	{ metrics: { xevBatteryStateOfCharge: { value: 250 }, xevBatteryRange: { value: -5 } } },
	{ latitude: 0, longitude: 0 },
	{ latitude: 123, longitude: 500 },
	{ odometer: Number.POSITIVE_INFINITY, outsideTemperature: { value: 900 } },
	{ updateTime: 'yesterday', soc: '12abc' },
	{ a: { b: { c: { d: { e: { f: { g: { h: { i: { j: { soc: 50 } } } } } } } } } } }
];

/** A deeply nested object (cycle-free) to check the depth bound. */
export function deepObject(depth: number): unknown {
	let node: Record<string, unknown> = { soc: 10 };
	for (let i = 0; i < depth; i++) node = { child: node };
	return node;
}
