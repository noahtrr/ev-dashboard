import { describe, expect, it } from 'vitest';
import { decideSignup } from './policy.ts';

describe('decideSignup', () => {
	it('makes the first account admin, even when sign-up is closed', () => {
		expect(decideSignup(0, false)).toEqual({ allowed: true, role: 'admin' });
		expect(decideSignup(0, true)).toEqual({ allowed: true, role: 'admin' });
	});

	it('refuses further accounts unless sign-up is allowed', () => {
		expect(decideSignup(1, false)).toEqual({ allowed: false });
		expect(decideSignup(5, false)).toEqual({ allowed: false });
	});

	it('creates regular users when sign-up is allowed', () => {
		expect(decideSignup(1, true)).toEqual({ allowed: true, role: 'user' });
	});
});
