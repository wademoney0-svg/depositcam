# DepositCam → Google Play (TWA)

Wrap the live PWA at https://depositcam.com as an Android app. No rewrite required.

## What’s already in this repo

| Asset | Purpose |
|---|---|
| `public/privacy.html` | Required privacy policy URL |
| `public/icon-192.png`, `icon-512.png` | PWA / Play icons |
| `public/icon-maskable-*.png` | Adaptive / maskable icons |
| `public/manifest.webmanifest` | Installable web app metadata |
| `public/.well-known/assetlinks.json` | Digital Asset Links for Trusted Web Activity (fingerprint TBD) |

Privacy policy live URL after deploy:

```text
https://depositcam.com/privacy.html
```

## One-time costs

1. **Google Play Console** — $25 one-time: https://play.google.com/console
2. Domain / hosting — already paid (depositcam.com + GitHub Pages)

## Build the Android package (on a machine with Java)

You need:

- JDK 17+
- Node.js
- Android command-line tools (Bubblewrap can install an SDK for you)

```bash
# From any folder — not necessarily this repo
npm install -g @bubblewrap/cli

# Point Bubblewrap at the live site (HTTPS required)
bubblewrap init --manifest https://depositcam.com/manifest.webmanifest
```

When prompted, use roughly:

```text
Package name:     com.wadefoundry.depositcam
App name:         DepositCam
Launcher name:    DepositCam
Display mode:     standalone
Theme color:      #0f1115
Background:       #0f1115
Start URL:        https://depositcam.com/
```

Then:

```bash
bubblewrap build
```

That produces an `.aab` (Android App Bundle) for Play Console upload.

### After you have a signing key

1. Get the SHA-256 fingerprint of the **upload** (or Play App Signing) certificate:

```bash
keytool -list -v -keystore android.keystore
```

2. Put that fingerprint into `public/.well-known/assetlinks.json` (replace the placeholder).
3. Redeploy the site so Google can verify Digital Asset Links.
4. Verify:

```text
https://depositcam.com/.well-known/assetlinks.json
```

Without a valid fingerprint, the TWA may open Chrome Custom Tabs with a URL bar instead of full-screen.

## Play Console checklist

1. Create app → **App** → free → category **Tools** or **Productivity**
2. Upload the `.aab` from Bubblewrap
3. Store listing:
   - Short description (80 chars)
   - Full description
   - Screenshots: use `shots/1-home.png`, walkthrough, room screens
   - Feature graphic 1024×500 (can export from `og.png` / brand assets)
   - Privacy policy URL: `https://depositcam.com/privacy.html`
4. **Data safety** form (honest answers for this app):
   - Photos / location: processed **on device**, not shared with the developer’s servers
   - Analytics: GoatCounter (usage)
   - Payments: Stripe (handled by third party)
   - No account required
5. Content rating questionnaire
6. Target audience: 18+ recommended (leases / legal context)
7. Submit for review

## App description (copy-paste)

Short:

```text
Timestamped rental photo evidence so you can get your security deposit back.
```

Full:

```text
DepositCam helps renters document a property’s condition room by room.

• Guided walkthrough checklist so nothing gets missed
• Date, time, and GPS burned into each photo when available
• Export a dispute-ready PDF for your landlord or small claims
• Works offline on your phone — no account required
• One-time unlock for unlimited PDF exports on this device

Your walkthroughs and photos stay on your device. We don’t host your pictures.

A Wade Foundry app. https://depositcam.com
```

## Optional later

- [PWA Builder](https://www.pwabuilder.com/) — web UI alternative to Bubblewrap
- Apple App Store — separate $99/year + different packaging
- Custom support email on the privacy page once you have one
