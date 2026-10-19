// Small UI dictionary. German is the reference and the fallback.
const de = {
	common: {
		appName: 'EV Dashboard',
		or: 'oder',
		cancel: 'Abbrechen',
		back: 'Zurück',
		error: 'Etwas ist schiefgelaufen. Bitte versuche es erneut.'
	},
	auth: {
		signInTitle: 'Anmelden',
		signInIntro: 'Melde dich an, um dein Dashboard zu sehen.',
		signUpTitle: 'Konto erstellen',
		signUpIntro: 'Lege ein neues Konto an.',
		setupTitle: 'Ersteinrichtung',
		setupIntro:
			'Noch gibt es kein Konto. Das erste Konto, das du hier anlegst, wird Administrator.',
		name: 'Name',
		email: 'E-Mail',
		password: 'Passwort',
		passwordHint: 'Mindestens 8 Zeichen.',
		signIn: 'Anmelden',
		signUp: 'Konto erstellen',
		createAdmin: 'Administrator anlegen',
		passkey: 'Mit Passkey anmelden',
		continueWith: 'Weiter mit {name}',
		noAccount: 'Noch kein Konto?',
		haveAccount: 'Schon ein Konto?',
		noMethods: 'Keine Anmeldemethode ist aktiviert. Bitte prüfe die Konfiguration.',
		errors: {
			invalidCredentials: 'E-Mail oder Passwort ist falsch.',
			signupDisabled: 'Neue Registrierungen sind auf dieser Instanz deaktiviert.',
			userExists: 'Für diese E-Mail-Adresse gibt es bereits ein Konto.',
			passwordTooShort: 'Das Passwort ist zu kurz.',
			rateLimited: 'Zu viele Versuche. Bitte warte einen Moment.',
			passkey: 'Die Anmeldung mit Passkey hat nicht geklappt.',
			oauth: 'Die Anmeldung beim externen Anbieter ist fehlgeschlagen.'
		}
	},
	home: {
		noVehicleTitle: 'Noch kein Fahrzeug verbunden',
		noVehicleText:
			'Verbinde dein Fahrzeug auf der Kontoseite. Danach siehst du hier Standort und Reichweite.',
		toAccount: 'Zur Kontoseite',
		noData: 'Noch keine Daten. Der erste Abruf läuft direkt nach dem Verbinden.',
		reauth: 'Die Verbindung muss neu autorisiert werden. Die Werte unten sind nicht aktuell.',
		vehicles: 'Fahrzeug',
		location: 'Standort',
		noPosition: 'Das Fahrzeug hat keine Position gemeldet.',
		mapLabel: 'Karte mit der Position des Fahrzeugs',
		positionTime: 'Position {time}',
		range: 'Reichweite',
		soc: 'Ladestand',
		timeToFull: 'voll in {time}',
		updated: 'Aktualisiert {time}',
		stale: 'veraltet',
		details: 'Alle Werte',
		map: {
			'CooperativeGesturesHandler.WindowsHelpText': 'Strg + Scrollen zum Zoomen der Karte',
			'CooperativeGesturesHandler.MacHelpText': '⌘ + Scrollen zum Zoomen der Karte',
			'CooperativeGesturesHandler.MobileHelpText': 'Karte mit zwei Fingern bewegen',
			'AttributionControl.ToggleAttribution': 'Quellenangaben ein- oder ausblenden'
		}
	},
	menu: {
		open: 'Benutzermenü',
		account: 'Konto',
		signOut: 'Abmelden',
		admin: 'Administrator'
	},
	account: {
		title: 'Konto',
		passkeys: 'Passkeys',
		passkeysIntro:
			'Melde dich ohne Passwort mit Fingerabdruck, Gesicht oder Sicherheitsschlüssel an.',
		passkeyName: 'Name (optional)',
		passkeyNamePlaceholder: 'z. B. Handy',
		addPasskey: 'Passkey hinzufügen',
		removePasskey: 'Entfernen',
		noPasskeys: 'Noch keine Passkeys hinterlegt.',
		unnamedPasskey: 'Passkey',
		addedOn: 'Hinzugefügt am {date}',
		passkeyError: 'Der Passkey konnte nicht gespeichert werden.'
	},
	vehicle: {
		title: 'Fahrzeug-API',
		intro:
			'Zugangsdaten deiner eigenen App beim Fahrzeugdaten-Anbieter. Sie werden verschlüsselt gespeichert; das Secret wird nach dem Speichern nie wieder angezeigt.',
		clientId: 'Client ID',
		clientSecret: 'Client Secret',
		save: 'Speichern',
		saved: 'Gespeichert',
		savedOn: 'Gespeichert am {date}',
		replace: 'Ersetzen',
		delete: 'Löschen',
		deleted: 'Zugangsdaten gelöscht.',
		errors: {
			required: 'Bitte beide Felder ausfüllen.',
			tooLong: 'Eine Eingabe ist zu lang.',
			invalid: 'Eine Eingabe enthält ungültige Zeichen.'
		}
	},
	connections: {
		title: 'Fahrzeuge',
		intro:
			'Jede Verbindung ist eine Freigabe beim Anbieter für das dort gewählte Fahrzeug. Für mehrere Fahrzeuge verbindest du mehrmals.',
		redirectUri: 'Redirect-URI',
		redirectHint: 'Trage diese Adresse in deiner App beim Anbieter als Redirect-URI ein.',
		copy: 'Kopieren',
		copied: 'Kopiert',
		connect: 'Fahrzeug verbinden',
		connectHint: 'Speichere zuerst die Zugangsdaten der Fahrzeug-API.',
		none: 'Noch kein Fahrzeug verbunden.',
		unnamed: 'Fahrzeug',
		statusActive: 'Verbunden',
		statusReauth: 'Neu autorisieren',
		reauthHint: 'Der Zugriff ist abgelaufen oder wurde widerrufen. Verbinde das Fahrzeug erneut.',
		lastSuccess: 'Letzter Abruf',
		lastError: 'Letzter Fehler',
		never: 'noch nie',
		fetchNow: 'Jetzt abrufen',
		details: 'Details',
		disconnect: 'Trennen',
		confirmDisconnect:
			'Verbindung trennen? Die Tokens und alle {count} gespeicherten Datenpunkte dieses Fahrzeugs werden gelöscht.',
		confirm: 'Trennen und löschen',
		disconnected: 'Verbindung getrennt und Daten gelöscht.',
		fetched: 'Daten abgerufen.',
		results: {
			connected: 'Fahrzeug verbunden.',
			state: 'Die Anmeldung war ungültig oder abgelaufen. Bitte versuche es erneut.',
			denied: 'Die Freigabe wurde beim Anbieter abgebrochen.',
			missing_credentials: 'Es sind keine Zugangsdaten der Fahrzeug-API gespeichert.',
			exchange:
				'Der Anbieter hat die Anmeldung nicht bestätigt. Prüfe Client ID, Client Secret und Redirect-URI.',
			unknown_provider: 'Unbekannter Anbieter.'
		},
		errors: {
			auth: 'Zugriff abgelehnt',
			rate_limited: 'Zu viele Anfragen beim Anbieter',
			http: 'Fehler beim Anbieter',
			timeout: 'Zeitüberschreitung',
			network: 'Netzwerkfehler',
			invalid_response: 'Unerwartete Antwort',
			missing_credentials: 'Zugangsdaten fehlen',
			internal: 'Interner Fehler',
			not_found: 'Verbindung nicht gefunden',
			reauth: 'Neu autorisieren nötig',
			too_soon: 'Bitte warte eine Minute zwischen zwei Abrufen.',
			busy: 'Ein Abruf läuft bereits.'
		}
	},
	vehicleDetail: {
		back: 'Zurück zum Konto',
		latest: 'Neueste Werte',
		fetchedAt: 'Abgerufen am {date}',
		reportedAt: 'Vom Fahrzeug gemeldet',
		noData: 'Noch keine Daten abgerufen.',
		position: 'Position',
		soc: 'Ladestand',
		range: 'Reichweite',
		plug: 'Ladekabel',
		plugged: 'eingesteckt',
		unplugged: 'nicht eingesteckt',
		charging: 'Ladestatus',
		chargingStates: {
			charging: 'lädt',
			notCharging: 'lädt nicht',
			complete: 'abgeschlossen',
			fault: 'Fehler'
		},
		timeToFull: 'Voll in',
		minutes: 'min',
		ignition: 'Zündung',
		on: 'an',
		off: 'aus',
		locks: 'Türschlösser',
		locked: 'verriegelt',
		unlocked: 'entriegelt',
		doors: 'Türen',
		windows: 'Fenster',
		closed: 'geschlossen',
		open: 'offen',
		positionAt: 'Position ermittelt',
		odometer: 'Kilometerstand',
		outsideTemp: 'Außentemperatur',
		battery12v: '12-V-Batterie',
		alerts: 'Warnmeldungen',
		raw: 'Rohdaten',
		rawIntro:
			'Die unveränderten Antworten des letzten Abrufs je Endpunkt. Sie zeigen, welche Werte dein Fahrzeug liefert.',
		status: 'HTTP-Status {status}',
		truncated: 'gekürzt'
	}
};

export type Messages = typeof de;

const en: Messages = {
	common: {
		appName: 'EV Dashboard',
		or: 'or',
		cancel: 'Cancel',
		back: 'Back',
		error: 'Something went wrong. Please try again.'
	},
	auth: {
		signInTitle: 'Sign in',
		signInIntro: 'Sign in to see your dashboard.',
		signUpTitle: 'Create account',
		signUpIntro: 'Create a new account.',
		setupTitle: 'First-time setup',
		setupIntro:
			'There is no account yet. The first account you create here becomes the administrator.',
		name: 'Name',
		email: 'Email',
		password: 'Password',
		passwordHint: 'At least 8 characters.',
		signIn: 'Sign in',
		signUp: 'Create account',
		createAdmin: 'Create administrator',
		passkey: 'Sign in with a passkey',
		continueWith: 'Continue with {name}',
		noAccount: 'No account yet?',
		haveAccount: 'Already have an account?',
		noMethods: 'No sign-in method is enabled. Please check the configuration.',
		errors: {
			invalidCredentials: 'Email or password is incorrect.',
			signupDisabled: 'New registrations are disabled on this instance.',
			userExists: 'An account with this email address already exists.',
			passwordTooShort: 'The password is too short.',
			rateLimited: 'Too many attempts. Please wait a moment.',
			passkey: 'Signing in with a passkey did not work.',
			oauth: 'Signing in with the external provider failed.'
		}
	},
	home: {
		noVehicleTitle: 'No vehicle connected yet',
		noVehicleText:
			'Connect your vehicle on the account page. Its location and range then show up here.',
		toAccount: 'Go to account',
		noData: 'No data yet. The first fetch runs right after connecting.',
		reauth: 'The connection needs to be authorized again. The values below are not current.',
		vehicles: 'Vehicle',
		location: 'Location',
		noPosition: 'The vehicle has not reported a position.',
		mapLabel: 'Map showing the position of the vehicle',
		positionTime: 'Position {time}',
		range: 'Range',
		soc: 'State of charge',
		timeToFull: 'full in {time}',
		updated: 'Updated {time}',
		stale: 'stale',
		details: 'All values',
		map: {
			'CooperativeGesturesHandler.WindowsHelpText': 'Use Ctrl + scroll to zoom the map',
			'CooperativeGesturesHandler.MacHelpText': 'Use ⌘ + scroll to zoom the map',
			'CooperativeGesturesHandler.MobileHelpText': 'Use two fingers to move the map',
			'AttributionControl.ToggleAttribution': 'Toggle attribution'
		}
	},
	menu: {
		open: 'User menu',
		account: 'Account',
		signOut: 'Sign out',
		admin: 'Administrator'
	},
	account: {
		title: 'Account',
		passkeys: 'Passkeys',
		passkeysIntro: 'Sign in without a password using your fingerprint, face or a security key.',
		passkeyName: 'Name (optional)',
		passkeyNamePlaceholder: 'e.g. phone',
		addPasskey: 'Add passkey',
		removePasskey: 'Remove',
		noPasskeys: 'No passkeys yet.',
		unnamedPasskey: 'Passkey',
		addedOn: 'Added on {date}',
		passkeyError: 'The passkey could not be saved.'
	},
	vehicle: {
		title: 'Vehicle API',
		intro:
			'Credentials of your own app at the vehicle data provider. They are stored encrypted; the secret is never shown again after saving.',
		clientId: 'Client ID',
		clientSecret: 'Client Secret',
		save: 'Save',
		saved: 'Saved',
		savedOn: 'Saved on {date}',
		replace: 'Replace',
		delete: 'Delete',
		deleted: 'Credentials deleted.',
		errors: {
			required: 'Please fill in both fields.',
			tooLong: 'An entry is too long.',
			invalid: 'An entry contains invalid characters.'
		}
	},
	connections: {
		title: 'Vehicles',
		intro:
			'Each connection is one consent at the provider for the vehicle you pick there. Connect again for more vehicles.',
		redirectUri: 'Redirect URI',
		redirectHint: 'Register this address as redirect URI in your app at the provider.',
		copy: 'Copy',
		copied: 'Copied',
		connect: 'Connect vehicle',
		connectHint: 'Save the vehicle API credentials first.',
		none: 'No vehicle connected yet.',
		unnamed: 'Vehicle',
		statusActive: 'Connected',
		statusReauth: 'Needs re-authorization',
		reauthHint: 'Access expired or was revoked. Connect the vehicle again.',
		lastSuccess: 'Last fetch',
		lastError: 'Last error',
		never: 'never',
		fetchNow: 'Fetch now',
		details: 'Details',
		disconnect: 'Disconnect',
		confirmDisconnect:
			'Disconnect? The tokens and all {count} stored data points of this vehicle will be deleted.',
		confirm: 'Disconnect and delete',
		disconnected: 'Disconnected and data deleted.',
		fetched: 'Data fetched.',
		results: {
			connected: 'Vehicle connected.',
			state: 'The sign-in was invalid or expired. Please try again.',
			denied: 'Consent was cancelled at the provider.',
			missing_credentials: 'No vehicle API credentials are saved.',
			exchange:
				'The provider did not confirm the sign-in. Check client ID, client secret and redirect URI.',
			unknown_provider: 'Unknown provider.'
		},
		errors: {
			auth: 'Access denied',
			rate_limited: 'Too many requests at the provider',
			http: 'Provider error',
			timeout: 'Timeout',
			network: 'Network error',
			invalid_response: 'Unexpected response',
			missing_credentials: 'Credentials missing',
			internal: 'Internal error',
			not_found: 'Connection not found',
			reauth: 'Re-authorization needed',
			too_soon: 'Please wait a minute between two fetches.',
			busy: 'A fetch is already running.'
		}
	},
	vehicleDetail: {
		back: 'Back to account',
		latest: 'Latest values',
		fetchedAt: 'Fetched on {date}',
		reportedAt: 'Reported by the vehicle',
		noData: 'No data fetched yet.',
		position: 'Position',
		soc: 'State of charge',
		range: 'Range',
		plug: 'Charging cable',
		plugged: 'plugged in',
		unplugged: 'not plugged in',
		charging: 'Charging status',
		chargingStates: {
			charging: 'charging',
			notCharging: 'not charging',
			complete: 'complete',
			fault: 'fault'
		},
		timeToFull: 'Full in',
		minutes: 'min',
		ignition: 'Ignition',
		on: 'on',
		off: 'off',
		locks: 'Door locks',
		locked: 'locked',
		unlocked: 'unlocked',
		doors: 'Doors',
		windows: 'Windows',
		closed: 'closed',
		open: 'open',
		positionAt: 'Position determined',
		odometer: 'Odometer',
		outsideTemp: 'Outside temperature',
		battery12v: '12 V battery',
		alerts: 'Alerts',
		raw: 'Raw data',
		rawIntro:
			'The unmodified responses of the latest fetch per endpoint. They show which values your vehicle reports.',
		status: 'HTTP status {status}',
		truncated: 'truncated'
	}
};

export type Locale = 'de' | 'en';

export const messages: Record<Locale, Messages> = { de, en };

/** Picks the best supported language from an Accept-Language header. */
export function pickLocale(header: string | null | undefined): Locale {
	const ranked = (header ?? '')
		.split(',')
		.map((part) => {
			const [tag, ...params] = part.trim().toLowerCase().split(';');
			const q = params.find((p) => p.trim().startsWith('q='));
			return { lang: tag.split('-')[0], q: q ? Number(q.trim().slice(2)) : 1 };
		})
		.filter((entry) => entry.lang && entry.q > 0)
		.sort((a, b) => b.q - a.q);
	for (const { lang } of ranked) {
		if (lang === 'de' || lang === 'en') return lang;
	}
	return 'de';
}

/** Replaces `{name}` placeholders. */
/** "5 minutes ago" style text for a past date. */
export function relativeTime(date: Date | string, locale: Locale, now = Date.now()): string {
	const seconds = Math.round((new Date(date).getTime() - now) / 1000);
	const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
	const abs = Math.abs(seconds);
	if (abs < 60) return rtf.format(0, 'second');
	if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
	if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
	return rtf.format(Math.round(seconds / 86400), 'day');
}

export function format(text: string, values: Record<string, string>) {
	return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
