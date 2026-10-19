import { describe, expect, it } from 'vitest';
import {
	countAlerts,
	normalizeTelemetry,
	normalizeVehicles,
	toChargingState,
	toPlugged,
	toTimestamp,
	vehicleLabel
} from './normalize.ts';
import {
	alerts,
	deepObject,
	garageList,
	garageSingle,
	garbage,
	telemetryFlatImperial,
	telemetryMetrics
} from './connect-query/fixtures.ts';

// Fixtures are assumed shapes, not real responses (see fixtures.ts).
describe('normalizeTelemetry', () => {
	it('reads a metrics map with value wrappers', () => {
		expect(normalizeTelemetry(telemetryMetrics)).toEqual({
			latitude: 52.520008,
			longitude: 13.404954,
			stateOfChargePct: 76.5,
			rangeKm: 312.4,
			odometerKm: 18234.7,
			outsideTempC: 11.5,
			pluggedIn: true,
			chargingState: 'charging',
			chargingStatusRaw: 'IN_PROGRESS',
			battery12vVoltage: 12.6,
			battery12vPct: 88,
			reportedAt: '2026-10-18T19:42:11.000Z'
		});
	});

	it('converts string numbers and imperial units to metric', () => {
		const data = normalizeTelemetry(telemetryFlatImperial);
		expect(data).toMatchObject({
			latitude: 48.137154,
			longitude: 11.576124,
			stateOfChargePct: 54,
			rangeKm: 241.4,
			odometerKm: 16093.4,
			outsideTempC: 10,
			pluggedIn: false,
			chargingState: 'notCharging',
			chargingStatusRaw: 'NotReady'
		});
		expect(data.reportedAt).toMatch(/^2026-10-18T/);
	});

	it('never throws and drops implausible values', () => {
		for (const input of garbage) {
			const data = normalizeTelemetry(input);
			expect(typeof data).toBe('object');
			if (data.stateOfChargePct !== undefined) {
				expect(data.stateOfChargePct).toBeGreaterThanOrEqual(0);
				expect(data.stateOfChargePct).toBeLessThanOrEqual(100);
			}
			expect(data.rangeKm === undefined || data.rangeKm >= 0).toBe(true);
			expect(data.latitude === undefined || Math.abs(data.latitude) <= 90).toBe(true);
		}
		expect(normalizeTelemetry({ latitude: 0, longitude: 0 })).toEqual({});
		expect(normalizeTelemetry({ latitude: 123, longitude: 500 })).toEqual({});
		expect(normalizeTelemetry({ metrics: { xevBatteryStateOfCharge: { value: 250 } } })).toEqual(
			{}
		);
		expect(normalizeTelemetry({ updateTime: 'yesterday', soc: '12abc' })).toEqual({});
	});

	it('stops at a bounded depth', () => {
		expect(normalizeTelemetry(deepObject(3))).toEqual({ stateOfChargePct: 10 });
		expect(normalizeTelemetry(deepObject(50))).toEqual({});
	});

	it('survives getters that throw', () => {
		const hostile = {
			get metrics() {
				throw new Error('boom');
			}
		};
		expect(() => normalizeTelemetry(hostile)).not.toThrow();
	});
});

describe('value helpers', () => {
	it('maps plug states', () => {
		expect(toPlugged('CONNECTED')).toBe(true);
		expect(toPlugged({ value: 'DISCONNECTED' })).toBe(false);
		expect(toPlugged('charging')).toBe(true);
		expect(toPlugged(0)).toBe(false);
		expect(toPlugged('maybe')).toBeUndefined();
	});

	it('maps charging states', () => {
		expect(toChargingState('IN_PROGRESS')).toBe('charging');
		expect(toChargingState('NOT_CHARGING')).toBe('notCharging');
		expect(toChargingState('ChargeComplete')).toBe('complete');
		expect(toChargingState('FAULT')).toBe('fault');
		expect(toChargingState(true)).toBe('charging');
		expect(toChargingState('CONNECTED')).toBeUndefined();
		expect(toChargingState(42)).toBeUndefined();
	});

	it('parses timestamps in several forms', () => {
		expect(toTimestamp('2026-10-18T19:42:11Z')).toBe('2026-10-18T19:42:11.000Z');
		expect(toTimestamp(1792352531)).toBe('2026-10-18T19:42:11.000Z');
		expect(toTimestamp(1792352531000)).toBe('2026-10-18T19:42:11.000Z');
		expect(toTimestamp('soon')).toBeUndefined();
		expect(toTimestamp(5)).toBeUndefined();
	});
});

describe('vehicles and alerts', () => {
	it('reads a single garage object', () => {
		const vehicles = normalizeVehicles(garageSingle);
		expect(vehicles).toEqual([{ id: 'TESTVIN0000000001', name: 'Blue car' }]);
		expect(vehicleLabel(vehicles)).toBe('Blue car');
	});

	it('reads a list and builds a label from model and year', () => {
		const vehicles = normalizeVehicles(garageList);
		expect(vehicles).toEqual([{ id: 'veh-0002', name: '2023 Other' }, { id: 'veh-0003' }]);
		expect(vehicleLabel([{ id: 'veh-0003' }])).toBe('…h-0003');
	});

	it('tolerates garbage', () => {
		for (const input of garbage) expect(Array.isArray(normalizeVehicles(input))).toBe(true);
		expect(vehicleLabel([])).toBeUndefined();
	});

	it('counts alerts', () => {
		expect(countAlerts(alerts)).toBe(2);
		expect(countAlerts([])).toBe(0);
		expect(countAlerts({ data: { items: [1, 2, 3] } })).toBe(3);
		expect(countAlerts('x')).toBeUndefined();
		expect(countAlerts({ alerts: 'none' })).toBeUndefined();
	});
});
