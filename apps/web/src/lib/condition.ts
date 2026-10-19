// Condition of a vehicle as judged on the server (see server/vehicles/condition.ts), and the
// texts shown for it.
import { format, type Messages } from './i18n.ts';

export type ConditionIssue =
	| { kind: 'unlocked' | 'doorOpen' | 'windowOpen' | 'tireLow'; parts: string[] }
	| { kind: 'hoodOpen' | 'battery12vLow' }
	| { kind: 'alert'; title: string };

export type Condition = {
	/** False when the vehicle reported nothing that could be judged. */
	known: boolean;
	issues: ConditionIssue[];
};

type Texts = Messages['condition'];

/** `['rearLeft', 'frontLeft']` → `hinten links, vorne links`; unknown names count as "other". */
export function partsText(parts: string[], c: Texts): string {
	const names = [...new Set(parts.map((p) => c.parts[p] ?? c.otherPart))];
	return names.join(', ');
}

/** Upper-cases the first letter, for parts at the start of a value. */
export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** One line per condition: "All good", "2 things to check" or "No condition data". */
export function headline(condition: Condition, c: Texts): string {
	if (!condition.known) return c.unknown;
	const n = condition.issues.length;
	if (n === 0) return c.allGood;
	return n === 1 ? c.checkOne : format(c.checkMany, { n: String(n) });
}

/** The issues as a short list, e.g. "door open, tyre pressure low". */
export function issuesText(condition: Condition, c: Texts): string {
	if (condition.issues.length === 0) return condition.known ? c.allGoodText : c.noData;
	return capitalize(
		condition.issues
			.map((issue) => (issue.kind === 'alert' ? issue.title : c.issues[issue.kind]))
			.join(', ')
	);
}
