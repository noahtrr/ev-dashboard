export type Health = {
	status: 'ok';
	version: string;
	uptimeSeconds: number;
};

export function getHealth(version: string, uptimeSeconds: number): Health {
	return { status: 'ok', version, uptimeSeconds: Math.floor(uptimeSeconds) };
}
