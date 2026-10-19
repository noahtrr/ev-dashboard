export type Role = 'admin' | 'user';

export type SignupDecision = { allowed: true; role: Role } | { allowed: false };

/**
 * Sign-up policy for a self-hosted personal instance: the first account becomes admin,
 * later accounts (including first-time social or SSO sign-ins) only when allowed.
 */
export function decideSignup(existingUsers: number, allowSignup: boolean): SignupDecision {
	if (existingUsers === 0) return { allowed: true, role: 'admin' };
	if (allowSignup) return { allowed: true, role: 'user' };
	return { allowed: false };
}
