import { describe, expect, it } from 'vitest';
import { getHealth } from './health';

describe('getHealth', () => {
	it('reports ok with the given version', () => {
		expect(getHealth('1.2.3', 12.7)).toEqual({ status: 'ok', version: '1.2.3', uptimeSeconds: 12 });
	});
});
