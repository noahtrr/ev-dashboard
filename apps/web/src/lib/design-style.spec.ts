import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN_STYLE, parseDesignStyle } from './design-style.ts';

describe('parseDesignStyle', () => {
	it('accepts the known styles', () => {
		expect(parseDesignStyle('bronze')).toBe('bronze');
		expect(parseDesignStyle('cockpit')).toBe('cockpit');
	});

	it('falls back to the default for anything else', () => {
		expect(parseDesignStyle(undefined)).toBe(DEFAULT_DESIGN_STYLE);
		expect(parseDesignStyle('')).toBe(DEFAULT_DESIGN_STYLE);
		expect(parseDesignStyle('"><script>')).toBe(DEFAULT_DESIGN_STYLE);
	});
});
