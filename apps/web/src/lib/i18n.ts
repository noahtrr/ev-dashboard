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
		label: 'EV Dashboard',
		title: 'Bald verfügbar',
		text: 'Das Grundgerüst läuft. Fahrzeugdaten folgen in den nächsten Schritten.'
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
		label: 'EV Dashboard',
		title: 'Coming soon',
		text: 'The foundation is running. Vehicle data follows in the next steps.'
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
export function format(text: string, values: Record<string, string>) {
	return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
