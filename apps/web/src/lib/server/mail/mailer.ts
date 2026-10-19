// Outgoing mail over SMTP. Absent when SMTP_HOST is not set.
import nodemailer from 'nodemailer';

export type MailSettings = {
	host: string;
	port: number;
	/** TLS from the start; otherwise STARTTLS when the server offers it. */
	secure?: boolean;
	user?: string;
	password?: string;
	from: string;
};

export type Mail = { to: string; subject: string; text: string; html: string };

export type Mailer = {
	send(mail: Mail): Promise<void>;
	/** Shown to admins; never includes credentials. */
	info: { host: string; port: number; from: string };
};

export function createMailer(settings: MailSettings): Mailer {
	const transport = nodemailer.createTransport({
		host: settings.host,
		port: settings.port,
		secure: settings.secure ?? settings.port === 465,
		auth: settings.user ? { user: settings.user, pass: settings.password ?? '' } : undefined,
		connectionTimeout: 10_000,
		greetingTimeout: 10_000,
		socketTimeout: 20_000
	});
	return {
		info: { host: settings.host, port: settings.port, from: settings.from },
		async send(mail) {
			await transport.sendMail({ from: settings.from, ...mail });
		}
	};
}
