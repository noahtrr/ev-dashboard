// Texts of the mails the app sends, in German and English. Plain text plus simple HTML.
import type { Locale } from '../../i18n.ts';
import type { Mail } from './mailer.ts';

export type MailKind = 'reset' | 'verify' | 'changeEmail' | 'invite' | 'test';

type Text = {
	subject: string;
	title: string;
	body: string;
	button?: string;
	note?: string;
};

const texts: Record<
	Locale,
	Record<MailKind, Text> & { hello: string; fallback: string; footer: string }
> = {
	de: {
		hello: 'Hallo {name},',
		fallback: 'Funktioniert der Knopf nicht, kopiere diesen Link in deinen Browser:',
		footer:
			'Gesendet von {host}. Du bekommst diese Mail, weil sie für deine Adresse angefordert wurde.',
		reset: {
			subject: 'Neues Passwort für EV Dashboard',
			title: 'Neues Passwort festlegen',
			body: 'für dein Konto wurde ein neues Passwort angefordert.',
			button: 'Passwort festlegen',
			note: 'Der Link ist eine Stunde gültig. Hast du nichts angefordert, ignoriere diese Mail.'
		},
		verify: {
			subject: 'Bestätige deine E-Mail-Adresse',
			title: 'E-Mail-Adresse bestätigen',
			body: 'bitte bestätige, dass diese Adresse dir gehört.',
			button: 'Adresse bestätigen',
			note: 'Der Link ist 24 Stunden gültig.'
		},
		changeEmail: {
			subject: 'Neue E-Mail-Adresse bestätigen',
			title: 'Neue Adresse bestätigen',
			body: 'du möchtest die Adresse deines Kontos in diese hier ändern.',
			button: 'Änderung bestätigen',
			note: 'Bis zur Bestätigung bleibt die alte Adresse aktiv. Der Link ist 24 Stunden gültig.'
		},
		invite: {
			subject: '{inviter} lädt dich zu EV Dashboard ein',
			title: 'Du bist eingeladen',
			body: '{inviter} hat dich eingeladen, ein Konto auf {host} anzulegen.',
			button: 'Konto erstellen',
			note: 'Die Einladung ist 7 Tage gültig.'
		},
		test: {
			subject: 'Test-Mail von EV Dashboard',
			title: 'Der Mailversand funktioniert',
			body: 'diese Test-Mail kam über den eingestellten Mailserver an.'
		}
	},
	en: {
		hello: 'Hello {name},',
		fallback: 'If the button does not work, copy this link into your browser:',
		footer: 'Sent by {host}. You get this mail because it was requested for your address.',
		reset: {
			subject: 'New password for EV Dashboard',
			title: 'Set a new password',
			body: 'a new password was requested for your account.',
			button: 'Set password',
			note: 'The link is valid for one hour. If you did not request it, ignore this mail.'
		},
		verify: {
			subject: 'Confirm your email address',
			title: 'Confirm your email address',
			body: 'please confirm that this address belongs to you.',
			button: 'Confirm address',
			note: 'The link is valid for 24 hours.'
		},
		changeEmail: {
			subject: 'Confirm your new email address',
			title: 'Confirm your new address',
			body: 'you want to change the address of your account to this one.',
			button: 'Confirm change',
			note: 'Your old address stays active until you confirm. The link is valid for 24 hours.'
		},
		invite: {
			subject: '{inviter} invites you to EV Dashboard',
			title: 'You are invited',
			body: '{inviter} invited you to create an account on {host}.',
			button: 'Create account',
			note: 'The invitation is valid for 7 days.'
		},
		test: {
			subject: 'Test mail from EV Dashboard',
			title: 'Sending mail works',
			body: 'this test mail arrived through the configured mail server.'
		}
	}
};

const escape = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
	);

const fill = (text: string, vars: Record<string, string>) =>
	text.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);

export type MailInput = {
	kind: MailKind;
	locale: Locale;
	to: string;
	/** Greeting name; the greeting is left out without one. */
	name?: string;
	/** Link of the button. */
	url?: string;
	/** Public origin of the instance. */
	appUrl: string;
	inviter?: string;
};

export function renderMail(input: MailInput): Mail {
	const all = texts[input.locale];
	const text = all[input.kind];
	const vars = {
		host: new URL(input.appUrl).host,
		inviter: input.inviter ?? '',
		name: input.name ?? ''
	};
	const subject = fill(text.subject, vars);
	const title = fill(text.title, vars);
	const greeting = input.name ? `${fill(all.hello, vars)} ` : '';
	const body = greeting + fill(text.body, vars);
	// Without a name the sentence starts lower case in the texts above.
	const sentence = greeting ? body : body.charAt(0).toUpperCase() + body.slice(1);
	const note = text.note ? fill(text.note, vars) : '';
	const footer = fill(all.footer, vars);
	const url = input.url;

	const plain = [
		title,
		'',
		sentence,
		...(url && text.button ? ['', `${text.button}: ${url}`] : []),
		...(note ? ['', note] : []),
		'',
		'--',
		footer
	].join('\n');

	const button =
		url && text.button
			? `<p style="margin:24px 0"><a href="${escape(url)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#0369A1;color:#FFFFFF;font-weight:600;text-decoration:none">${escape(text.button)}</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#55626F">${escape(all.fallback)}<br><a href="${escape(url)}" style="color:#0369A1;word-break:break-all">${escape(url)}</a></p>`
			: '';
	const html = `<!doctype html>
<html lang="${input.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:24px;background:#F3F6F9;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0F1720">
<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #DCE3EA;border-radius:16px;padding:32px">
<p style="margin:0 0 16px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#55626F">EV Dashboard</p>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:600">${escape(title)}</h1>
<p style="margin:0;font-size:15px;line-height:1.55">${escape(sentence)}</p>
${button}${note ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#55626F">${escape(note)}</p>` : ''}
</div>
<p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#55626F">${escape(footer)}</p>
</body></html>`;

	return { to: input.to, subject, text: plain, html };
}
