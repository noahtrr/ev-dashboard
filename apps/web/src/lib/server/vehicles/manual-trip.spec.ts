import { describe, expect, it } from 'vitest';
import { parseManualTrip, type ManualTripForm } from './manual-trip.ts';

const NOW = Date.parse('2026-10-22T12:00:00Z');
const form = (values: Partial<ManualTripForm> = {}): ManualTripForm => ({
	date: '2026-03-14',
	startTime: '08:15',
	endTime: '09:00',
	distanceKm: '42,5',
	startOdometerKm: '',
	endOdometerKm: '',
	startAddress: '',
	endAddress: '',
	purpose: 'business',
	note: '',
	...values
});
const parse = (values: Partial<ManualTripForm>) =>
	parseManualTrip(form(values), 'Europe/Berlin', NOW);

describe('parseManualTrip', () => {
	it('reads local times in the given time zone', () => {
		const result = parseManualTrip(form(), 'Europe/Berlin', NOW);
		expect(result).toEqual({
			trip: {
				startAt: new Date('2026-03-14T07:15:00Z'),
				endAt: new Date('2026-03-14T08:00:00Z'),
				distanceKm: 42.5,
				startOdometerKm: null,
				endOdometerKm: null,
				startAddress: null,
				endAddress: null,
				purpose: 'business',
				note: null
			}
		});
	});

	it('takes an arrival before the departure as the next day and allows none', () => {
		const late = parse({ startTime: '23:30', endTime: '00:30' });
		expect('trip' in late && late.trip.endAt.toISOString()).toBe('2026-03-14T23:30:00.000Z');
		const open = parse({ endTime: '' });
		expect('trip' in open && open.trip.endAt).toEqual('trip' in open && open.trip.startAt);
	});

	it('derives the distance or the arrival odometer', () => {
		const both = parse({ distanceKm: '', startOdometerKm: '1000', endOdometerKm: '1042' });
		expect('trip' in both && both.trip.distanceKm).toBe(42);
		const start = parse({ distanceKm: '12', startOdometerKm: '1000' });
		expect('trip' in start && start.trip.endOdometerKm).toBe(1012);
	});

	it('rejects what does not fit', () => {
		expect(parse({ date: '2026-02-30' })).toEqual({ error: 'date' });
		expect(parse({ startTime: '25:00' })).toEqual({ error: 'time' });
		expect(parse({ date: '2026-10-23' })).toEqual({ error: 'future' });
		expect(parse({ distanceKm: '' })).toEqual({ error: 'distance' });
		expect(parse({ distanceKm: '0' })).toEqual({ error: 'distance' });
		expect(parse({ distanceKm: '6000' })).toEqual({ error: 'distance' });
		expect(parse({ distanceKm: '', startOdometerKm: '1000', endOdometerKm: '990' })).toEqual({
			error: 'odometer'
		});
		expect(parse({ distanceKm: '10', startOdometerKm: '1000', endOdometerKm: '1042' })).toEqual({
			error: 'mismatch'
		});
		expect(parse({ purpose: '' })).toEqual({ error: 'purpose' });
		expect(parse({ startAddress: 'x'.repeat(201) })).toEqual({ error: 'address' });
		expect(parse({ note: 'x'.repeat(501) })).toEqual({ error: 'note' });
	});
});
