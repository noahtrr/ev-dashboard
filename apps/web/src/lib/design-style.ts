// The app's two visual styles. The choice is stored per device in a cookie and applied as
// `data-style` on <html>, so every page renders in it from the first byte.

export const DESIGN_STYLES = ['bronze', 'cockpit'] as const;
export type DesignStyle = (typeof DESIGN_STYLES)[number];

/** Style for devices that have not chosen one. */
export const DEFAULT_DESIGN_STYLE: DesignStyle = 'bronze';

export const DESIGN_STYLE_COOKIE = 'ev-style';

export function parseDesignStyle(value: string | null | undefined): DesignStyle {
	return DESIGN_STYLES.includes(value as DesignStyle)
		? (value as DesignStyle)
		: DEFAULT_DESIGN_STYLE;
}

/** The style the page was rendered in (browser only). */
export function currentDesignStyle(): DesignStyle {
	return parseDesignStyle(document.documentElement.dataset.style);
}
