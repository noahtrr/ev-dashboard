# App

## Installing

The dashboard can be added to the home screen like an app. It then opens without the browser bar.

- **Android, and Chrome or Edge on the desktop:** the home page shows **Install as an app**. **Not now** hides the hint on this device for good; the app can still be installed from the browser menu.
- **iPhone and iPad:** Safari has no button for it. The hint on the home page explains the way: **Share** → **Add to Home Screen**.

This needs HTTPS, which the image sets up with Caddy anyway.

## Offline

Without a connection the app shows the pages loaded last, with **Offline** at the top. Pages that were never opened lead to the home page. The pages are only kept in the device's browser and are deleted on sign-out.

## Notifications

Under **Account → Notifications**, **Turn on for this device** enables push messages for the browser or the installed app. They arrive even while the app is closed. Each device is turned on separately; the list shows all devices of the account, and other devices can be removed there. **Send a test message** checks delivery.

The choice applies to all vehicles of the account:

| Event | When |
| --- | --- |
| Charging ended | The charging session is over, with state of charge and range. |
| Charging interrupted | The session ends with the cable still plugged in, or with a fault. |
| Low charge | Once, when the state of charge drops below the threshold (10, 20, 30 or 40 %). |
| Vehicle warning | A new warning from the condition page. |
| Left unlocked | The vehicle has been parked unlocked for 10 minutes. Off by default. |
| Connection lost | The vehicle has to be reconnected in the account. |

New values arrive with every fetch (`POLL_INTERVAL_SECONDS`), so a message is delayed accordingly. Signing out unregisters the device, so the next person using it gets no messages for this account.

- **iPhone and iPad:** push messages only work in the installed app (iOS 16.4 or later), not in Safari.
- **Blocked:** if notifications were denied for the site, allow them again in the browser settings.

Messages go through the push service of each browser (Google, Mozilla, Apple, Microsoft); the server accepts no other addresses. The content is end-to-end encrypted. The server identifies itself to these services with its own key, generated on first start in `/data/push-key`. Back it up with the data directory; if it is lost, every device has to turn notifications on again.
