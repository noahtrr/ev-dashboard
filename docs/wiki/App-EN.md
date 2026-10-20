# App

## Installing

The dashboard can be added to the home screen like an app. It then opens without the browser bar.

- **Android, and Chrome or Edge on the desktop:** the home page shows **Install as an app**. **Not now** hides the hint on this device for good; the app can still be installed from the browser menu.
- **iPhone and iPad:** Safari has no button for it. The hint on the home page explains the way: **Share** → **Add to Home Screen**.

This needs HTTPS, which the image sets up with Caddy anyway.

## Offline

Without a connection the app shows the pages loaded last, with **Offline** at the top. Pages that were never opened lead to the home page. The pages are only kept in the device's browser and are deleted on sign-out.
