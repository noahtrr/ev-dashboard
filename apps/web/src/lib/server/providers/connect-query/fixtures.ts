// Test fixtures. ASSUMED shapes, NOT captured responses: the real response formats of the
// API are not documented in the material this project has. The shapes below follow the type
// definitions of an open-source client and common connected-car conventions, so the
// normalizer is exercised against plausible variants. Replace or extend them with real
// (anonymized) responses once known. All values are made up, except where a fixture says
// it follows an observed response.

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

/**
 * Observed: shape of a real telemetry response (captured 2026-10-19, battery electric
 * vehicle). Identifiers, correlation IDs and the position are replaced; the other values and
 * all keys are kept as observed.
 */
export const telemetryObserved = {
	updateTime: '2026-10-18T16:41:14.779Z',
	vehicleId: '00000000-0000-4000-8000-000000000002',
	vin: 'TESTVIN0000000002',
	metrics: {
		doorLockStatus: [
			{
				determinationMethod: 'ACTUAL',
				oemCorrelationId: '00000000-0000-4000-8000-000000000001',
				updateTime: '2026-10-15T16:33:53.024Z',
				value: 'LOCKED',
				vehicleDoor: 'INNER_TAILGATE'
			},
			{
				determinationMethod: 'ACTUAL',
				oemCorrelationId: '00000000-0000-4000-8000-000000000002',
				updateTime: '2026-10-15T16:33:53.024Z',
				value: 'LOCKED',
				vehicleDoor: 'FRONT_LEFT'
			},
			{
				determinationMethod: 'ACTUAL',
				oemCorrelationId: '00000000-0000-4000-8000-000000000003',
				updateTime: '2026-10-15T16:33:53.024Z',
				value: 'LOCKED',
				vehicleDoor: 'FRONT_RIGHT'
			},
			{
				determinationMethod: 'ACTUAL',
				oemCorrelationId: '00000000-0000-4000-8000-000000000004',
				updateTime: '2026-10-15T16:33:53.024Z',
				value: 'LOCKED',
				vehicleDoor: 'REAR_LEFT'
			},
			{
				determinationMethod: 'ACTUAL',
				oemCorrelationId: '00000000-0000-4000-8000-000000000005',
				updateTime: '2026-10-15T16:33:53.024Z',
				value: 'LOCKED',
				vehicleDoor: 'REAR_RIGHT'
			}
		],
		doorStatus: [
			{
				oemCorrelationId: '00000000-0000-4000-8000-000000000006',
				updateTime: '2026-10-15T16:33:53.024Z',
				value: 'CLOSED',
				vehicleDoor: 'INNER_TAILGATE'
			},
			{
				oemCorrelationId: '00000000-0000-4000-8000-000000000007',
				updateTime: '2026-10-15T16:33:53.024Z',
				value: 'CLOSED',
				vehicleDoor: 'FRONT_LEFT'
			},
			{
				oemCorrelationId: '00000000-0000-4000-8000-000000000008',
				updateTime: '2026-10-15T16:33:53.024Z',
				value: 'CLOSED',
				vehicleDoor: 'FRONT_RIGHT'
			},
			{
				oemCorrelationId: '00000000-0000-4000-8000-000000000009',
				updateTime: '2026-10-15T16:33:53.024Z',
				value: 'CLOSED',
				vehicleDoor: 'REAR_LEFT'
			},
			{
				oemCorrelationId: '00000000-0000-4000-8000-000000000010',
				updateTime: '2026-10-15T16:33:53.024Z',
				value: 'CLOSED',
				vehicleDoor: 'REAR_RIGHT'
			}
		],
		hoodStatus: {
			oemCorrelationId: '00000000-0000-4000-8000-000000000011',
			updateTime: '2026-10-09T12:16:26.679Z',
			value: 'CLOSED'
		},
		ignitionStatus: {
			oemCorrelationId: '00000000-0000-4000-8000-000000000012',
			updateTime: '2026-10-13T08:19:13.35Z',
			value: 'OFF'
		},
		odometer: {
			oemCorrelationId: '00000000-0000-4000-8000-000000000013',
			updateTime: '2026-10-13T08:19:13.352Z',
			value: 11599
		},
		position: {
			gpsModuleTimestamp: '2026-10-13T08:19:14.918573Z',
			oemCorrelationId: '00000000-0000-4000-8000-000000000014',
			updateTime: '2026-10-13T08:19:13Z',
			value: {
				gdop: 0,
				gpsCoordinateMethod: 'INFERRED',
				gpsDimension: 'DIM_3D',
				hdop: 0,
				location: {
					alt: 0,
					lat: 52.520008,
					lon: 13.404954
				},
				pdop: 0,
				vdop: 0
			}
		},
		remoteStartCountdownTimer: {
			oemCorrelationId: '00000000-0000-4000-8000-000000000015',
			updateTime: '2026-10-16T05:45:03Z',
			value: 0
		},
		windowStatus: [
			{
				oemCorrelationId: '00000000-0000-4000-8000-000000000016',
				updateTime: '2026-10-13T07:36:55.221Z',
				value: {
					doubleRange: {
						lowerBound: 0,
						upperBound: 0
					}
				},
				vehicleWindow: 'FRONT_LEFT'
			},
			{
				oemCorrelationId: '00000000-0000-4000-8000-000000000017',
				updateTime: '2026-10-13T07:36:55.221Z',
				value: {
					doubleRange: {
						lowerBound: 0,
						upperBound: 0
					}
				},
				vehicleWindow: 'FRONT_RIGHT'
			},
			{
				oemCorrelationId: '00000000-0000-4000-8000-000000000018',
				updateTime: '2026-10-13T07:36:55.221Z',
				value: {
					doubleRange: {
						lowerBound: 0,
						upperBound: 0
					}
				},
				vehicleWindow: 'REAR_LEFT'
			},
			{
				oemCorrelationId: '00000000-0000-4000-8000-000000000019',
				updateTime: '2026-10-13T07:36:55.221Z',
				value: {
					doubleRange: {
						lowerBound: 0,
						upperBound: 0
					}
				},
				vehicleWindow: 'REAR_RIGHT'
			}
		],
		xevBatteryChargeDisplayStatus: {
			oemCorrelationId: '00000000-0000-4000-8000-000000000020',
			updateTime: '2026-10-13T08:19:16Z',
			value: 'NOT_PLUGGED_IN',
			xevChargerPowerType: 'UNKNOWN'
		},
		xevBatteryChargerEnergyOutput: {
			oemCorrelationId: '00000000-0000-4000-8000-000000000021',
			updateTime: '2026-10-12T21:08:57Z',
			value: 3.5
		},
		xevBatteryRange: {
			oemCorrelationId: '00000000-0000-4000-8000-000000000022',
			updateTime: '2026-10-18T16:41:09.185Z',
			value: 234
		},
		xevBatteryStateOfCharge: {
			oemCorrelationId: '00000000-0000-4000-8000-000000000023',
			updateTime: '2026-10-18T16:41:14.779Z',
			value: 56
		},
		xevBatteryTimeToFullCharge: {
			oemCorrelationId: '00000000-0000-4000-8000-000000000024',
			updateTime: '2026-10-12T21:08:57Z',
			value: 25
		},
		xevChargeStationPowerType: {
			oemCorrelationId: '00000000-0000-4000-8000-000000000025',
			updateTime: '2026-10-13T08:19:16Z',
			value: 'UNKNOWN'
		},
		xevPlugChargerStatus: {
			oemCorrelationId: '00000000-0000-4000-8000-000000000026',
			updateTime: '2026-10-13T07:17:23Z',
			value: 'DISCONNECTED'
		}
	}
};
