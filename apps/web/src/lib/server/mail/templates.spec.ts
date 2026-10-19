import { describe, expect, it } from 'vitest';
import { renderMail } from './templates.ts';

const base = { to: 'alice@example.com', appUrl: 'https://ev.example.com' };

describe('mail templates', () => {
	it('greets by name and links the button in text and HTML', () => {
		const mail = renderMail({
			...base,
			kind: 'reset',
			locale: 'de',
			name: 'Alice',
			url: 'https://ev.example.com/reset-password?token=abc'
		});
		expect(mail.to).toBe('alice@example.com');
		expect(mail.subject).toBe('Neues Passwort für EV Dashboard');
		expect(mail.text).toContain('Hallo Alice, für dein Konto');
		expect(mail.text).toContain(
			'Passwort festlegen: https://ev.example.com/reset-password?token=abc'
		);
		expect(mail.html).toContain('href="https://ev.example.com/reset-password?token=abc"');
		expect(mail.html).toContain('<html lang="de">');
		expect(mail.text).toContain('Gesendet von ev.example.com.');
	});

	it('capitalises the sentence without a name', () => {
		const mail = renderMail({ ...base, kind: 'verify', locale: 'de', url: 'https://x.test/v' });
		expect(mail.text).toContain('\nBitte bestätige, dass diese Adresse dir gehört.');
		expect(mail.text).not.toContain('Hallo');
	});

	it('writes English mails', () => {
		const mail = renderMail({
			...base,
			kind: 'invite',
			locale: 'en',
			inviter: 'Bob',
			url: 'https://ev.example.com/signup?invite=t'
		});
		expect(mail.subject).toContain('Bob');
		expect(mail.html).toContain('<html lang="en">');
		expect(mail.text).toContain('ev.example.com');
		expect(mail.text).not.toMatch(/\{\w+\}/);
	});

	it('escapes values in HTML', () => {
		const mail = renderMail({
			...base,
			kind: 'invite',
			locale: 'de',
			inviter: '<script>alert("x")</script>',
			url: 'https://ev.example.com/signup?invite=a&b="c"'
		});
		expect(mail.html).not.toContain('<script>');
		expect(mail.html).toContain('&lt;script&gt;');
		expect(mail.html).toContain('invite=a&amp;b=&quot;c&quot;');
		// The plain text part stays unescaped.
		expect(mail.subject).toContain('<script>');
	});

	it('leaves the button out of the test mail', () => {
		const mail = renderMail({ ...base, kind: 'test', locale: 'de', name: 'Alice' });
		expect(mail.html).not.toContain('<a href');
		expect(mail.text).toContain('Hallo Alice, diese Test-Mail');
	});
});
