// Keeps the app shell available offline and the last loaded pages readable without a
// connection. Pages and their data are fetched from the network first; the cache only answers
// when the network fails. The page cache holds personal data and is cleared on sign-out.
import { self } from '$app/service-worker';
import { assets, immutable } from '$app/manifest';
import { version } from '$app/env';

const SHELL = `shell-${version}`;
/** Shared with the sign-out code in the app, which deletes it. */
const PAGES = 'pages';

/** Never stored: sign-in, provider callbacks and everything that changes data. */
const PRIVATE = ['/api/auth/', '/api/providers/', '/api/preferences/'];

/** Pages only shown without a session. */
const SIGNED_OUT = ['/login', '/setup', '/signup'];

const shellUrls = [...immutable, ...assets].map(
	(f) => new URL(f.path, self.registration.scope).href
);

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(SHELL)
			.then((cache) => cache.addAll(shellUrls))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((k) => k !== SHELL && k !== PAGES).map((k) => caches.delete(k)))
			)
			.then(() => self.clients.claim())
	);
});

/** Cache key without SvelteKit's per-request bookkeeping parameters. */
function pageKey(url: URL): string {
	const key = new URL(url);
	key.searchParams.delete('x-sveltekit-invalidated');
	key.searchParams.delete('x-sveltekit-trailing-slash');
	return key.href;
}

async function networkFirst(request: Request, url: URL): Promise<Response> {
	const key = pageKey(url);
	try {
		const response = await fetch(request);
		// Only complete, successful answers; redirects (e.g. to the login) are not kept.
		if (response.ok && response.type === 'basic') {
			const copy = response.clone();
			caches.open(PAGES).then((cache) => cache.put(key, copy));
		}
		return response;
	} catch (error) {
		const cached = await caches.match(key, { cacheName: PAGES });
		if (cached) return cached;
		// An uncached page while offline: the home page is better than the browser's error.
		if (request.mode === 'navigate') {
			const home = await caches.match(new URL('/', self.registration.scope).href, {
				cacheName: PAGES
			});
			if (home) return home;
		}
		throw error;
	}
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (PRIVATE.some((prefix) => url.pathname.startsWith(prefix))) return;

	if (shellUrls.includes(url.href)) {
		event.respondWith(caches.match(url.href).then((hit) => hit ?? fetch(request)));
		return;
	}
	// Reaching the sign-in page means no one is signed in here any more: drop their pages.
	if (request.mode === 'navigate' && SIGNED_OUT.includes(url.pathname)) {
		event.waitUntil(caches.delete(PAGES));
		return;
	}
	if (request.mode === 'navigate' || url.pathname.endsWith('/__data.json')) {
		event.respondWith(networkFirst(request, url));
	}
});

type PushMessage = { title: string; body: string; url: string; tag: string };

self.addEventListener('push', (event) => {
	let message: PushMessage;
	try {
		message = event.data?.json() as PushMessage;
	} catch {
		return;
	}
	if (!message?.title) return;
	event.waitUntil(
		self.registration.showNotification(message.title, {
			body: message.body,
			tag: message.tag,
			icon: '/icons/icon-192.png',
			badge: '/icons/icon-192.png',
			data: { url: message.url }
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const path = (event.notification.data as { url?: string } | null)?.url ?? '/';
	// Only paths of this app; a message can never send the user elsewhere.
	const target = new URL(
		path.startsWith('/') && !path.startsWith('//') ? path : '/',
		self.location.origin
	);
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
			const open = windows.find((w) => new URL(w.url).origin === target.origin);
			if (open) {
				await open.focus();
				return open.navigate(target.href);
			}
			return self.clients.openWindow(target.href);
		})
	);
});
