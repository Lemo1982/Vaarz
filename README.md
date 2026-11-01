# Vaarz — a desktop social studio

Vaarz is a local-first desktop app that keeps your social calendar in one place, writes with your
voice using OpenRouter, and publishes from your own machine on schedule. No hosted dashboard, no
account server, no third-party queue holding your API tokens.

![Vaarz overview](docs/screenshot.png)

## What it does

- **One composer, many networks.** Write once, then select destinations, override copy per account,
  attach media, and see a live preview of every target with its character limit.
- **Real scheduler.** A timer inside the Electron main process wakes exactly when the next post is
  due (and sleeps with no timer at all when the queue is empty), records a receipt for every attempt,
  and retries failed deliveries with exponential backoff.
- **AI that edits, not replaces.** Polish, hooks, hashtags, thread splitting and three-angle variants
  via any OpenRouter model. Tone and voice notes are injected into every prompt. With no API key,
  a deterministic local editor keeps the buttons useful.
- **Calendar + delivery log.** A month grid of everything queued, and a log with the exact API error
  or remote post URL for every destination.
- **Six themes.** Settings → Appearance switches the whole app between Violet, Magenta, Deep sea,
  Aurora, Ember and Sage — palettes taken from a swatch sheet, applied through CSS custom properties
  (`data-theme` on `<html>`), so accents, panels, glows and buttons all move together. The choice is
  stored with the rest of the settings.
- **Local-first storage.** One JSON database plus a media folder, both under the Electron user-data
  directory (`%APPDATA%\vaarz` on Windows). The OpenRouter key is encrypted with the OS keychain (`safeStorage`), and never crosses
  into the renderer.

## Install (Windows, one click)

Double-click **`Vaarz-Setup.exe`** (on your Desktop, or in `release/`). It installs to
`%LOCALAPPDATA%\Programs\vaarz`, adds a **Vaarz** desktop and Start-menu shortcut, and launches the
app. No Node.js or terminal needed afterwards. Rebuild the installer at any time with:

```bash
npm run installer
```

The installer is unsigned, so Windows SmartScreen may show "Windows protected your PC" on first run —
click **More info → Run anyway**. Your data lives in `%APPDATA%\vaarz` and survives reinstalling and
upgrading the app.

## Platforms

| Version | Status | Build |
| --- | --- | --- |
| **Windows** | Shipped — NSIS installer, per-user install, desktop + Start-menu shortcuts, Vaarz icon. | `npm run installer` |
| **macOS** | Configured (`dmg` + `zip`, app category, Vaarz icon) but **must be built on a Mac**: electron-builder refuses to produce macOS apps on Windows. On a Mac, `npm run dist -- --mac`. Unsigned builds show Gatekeeper's "unidentified developer" prompt until you sign and notarize. |
| **Linux** | Configured (AppImage): `npm run dist -- --linux`. |
| **Mobile** | Not producible from this stack — Electron has no iOS/Android target. The renderer is responsive down to phone widths (icon-rail sidebar, stacked grids, single-column forms), so it can be wrapped with Capacitor later; a phone would also need a sync service to reach the desktop's local database, which this local-first app does not have yet. |

The window can shrink to 760px wide, which is where the compact icon-rail layout kicks in.

## Run from source

```bash
npm install
npm run dev        # Vite + Electron with hot reload for the UI
# or
npm run build && npm start
```

Requires Node 20+ (tested on Node 22, Windows 11). First launch seeds two **demo sandbox** accounts and
three posts so the queue, calendar and delivery log are populated immediately.

### Connect OpenRouter

1. Create a key at <https://openrouter.ai/keys>.
2. In the app: **Settings → AI editor**, paste the key, save.
3. Optionally press **Load models** to pick a model; `openrouter/auto` is the default and routes to a
   sane model automatically. Press **Test the editor** to verify.

The key is encrypted with the OS keychain when available and stored in `secrets.json` next to the
database. It is only ever read by the main process and sent to `openrouter.ai`.

### Connect a network

**Connections → Connect account**, pick a platform, and paste credentials you create yourself:

| Network | Credentials | Notes |
| --- | --- | --- |
| Mastodon | instance URL, access token | Full text + media upload (`write:statuses`, `write:media`). |
| X | OAuth 2.0 user token | Text only — media upload needs OAuth 1.0a signing. |
| Threads | user ID, long-lived token | Text only; media needs a public URL. |
| LinkedIn | author URN, access token | Member posts via the versioned Posts API. |
| Facebook Page | page ID, page token | Feed posts. |
| Discord | webhook URL | Text and file attachments. |
| Telegram | bot token, chat ID | Text, or a single photo. |
| Webhook bridge | endpoint URL, optional bearer | POSTs `{ text, media, meta }` JSON — use it for Instagram, TikTok, YouTube, or your own automation. |
| Demo sandbox | — | Simulates delivery locally; include `[fail]` in the text to exercise retries. |

Instagram, TikTok and YouTube require a platform-approved OAuth app, so they are marked **bridge**
in this build: add a Webhook bridge account pointing at Zapier, Make, n8n, Ayrshare (or your own
service) and Vaarz will forward the copy and media paths.

## How it works

```
electron/main.ts        window, IPC, scheduler tick, media protocol, secrets
electron/preload.ts     typed, context-isolated bridge exposed as window.vaarz
src/core/               engine with no Electron imports (unit-testable)
  store.ts              atomic JSON store, seeding, post CRUD
  planner.ts            platform limits, validation, best-time slots, calendar maths
  scheduler.ts          due-post selection, publishing, attempts, backoff
  connectors.ts         one adapter per platform (REST calls + credential verification)
  ai.ts                 OpenRouter client, prompt builder, offline editor fallback
src/renderer/           React UI (overview, composer, calendar, connections, log, settings)
tests/smoke.ts          19 engine tests, no Electron required
```

Scheduling semantics:

- A post is due when `status === 'scheduled'` and `scheduleAt <= now`. At most 10 posts are drained per tick.
- Each destination is attempted independently; partial success is recorded per account.
- On failure the post is requeued with `backoff * 2^(attempt-1)` minutes until `retryLimit`, then marked
  **failed** and surfaced on the overview and delivery log. Turning off auto-retry fails immediately.
- The scheduler arms a single timer for the next due post; when the queue is empty it keeps no timer at all.
- The queue only advances while Vaarz is running — it is a desktop app, not a daemon.

## Security

- **Renderer is unprivileged.** `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`;
  the renderer only reaches a fixed, typed IPC surface in `electron/preload.ts`.
- **Strict CSP** on the packaged UI: `script-src 'self'` (no inline, no `eval`), `connect-src 'self'`,
  `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, `frame-src 'none'`. The renderer cannot
  reach the network directly — OpenRouter calls are made from the main process.
- **Navigation locked down.** New windows are always denied, top-level navigation is blocked outside
  the app's own file, and `openExternal` only accepts `http(s)` URLs.
- **Secrets at rest.** The OpenRouter key and every connected-account token are encrypted with the OS
  keychain (`safeStorage` / DPAPI on Windows) before hitting disk, in `secrets.json` and `vaarz.json`.
  Tokens are never sent to the renderer — the snapshot replaces each credential with an empty string.
  A value that fails to unseal comes back empty rather than in the clear.
- **Media protocol is fenced.** `vaarz-media:` only resolves real files (symlinks included) inside the
  media folder, and only for image/video extensions the composer accepts — no path traversal, no HTML.
- **One instance.** A second launch focuses the existing window instead of starting a second scheduler
  that would double-publish the queue.
- **Dependencies.** `npm audit` reports 0 vulnerabilities; the shipped app has **zero** production
  dependencies (only build tooling: Electron 45, electron-builder, esbuild, Vite).
- Not a security control, but worth knowing: the app phones home to nothing except the endpoints you
  connect yourself (your Fediverse/Meta/Discord/etc. accounts, and OpenRouter when a key is set).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server + Electron (main-process changes need a restart) |
| `npm run build` | Typecheck, bundle main/preload with esbuild, build the renderer |
| `npm start` | Build, then launch the built app |
| `npm test` | Engine smoke tests (store, scheduler, validation, AI) |
| `npm run typecheck` | `tsc --noEmit` across app, core and tests |
| `npm run icon` | Re-render `build/icon.png` from the Vaarz mark (used for the window and installers) |
| `npm run installer` | Build, then package the Windows NSIS installer into `release/` |
| `npm run dist` | Package installers with electron-builder (NSIS / dmg / AppImage) |

## Limitations and next steps

- X, Threads, LinkedIn and Facebook accept text only in this build; media posting needs additional
  upload APIs (or a bridge).
- The data folder is per-user but not hidden: on a shared machine, treat `%APPDATA%\vaarz` as
  sensitive (tokens there are OS-encrypted, but posts and media are plain files).
- Publishing requires the app to be open. A future "always-on" mode could ship as a tray app or a
  companion worker.
- Analytics ingestion and a media library view (outside the composer) are deliberately not built yet.
- The installer is unsigned, so Windows SmartScreen shows "Windows protected your PC" on first run;
  a code-signing certificate is the remaining launch item.
- `safeStorage`'s synchronous API is deprecated as of Electron 45 (logs a warning under
  `--enable-logging`); move the sealing paths to the async variants when Electron is next bumped.

---

Made by [@Lemo1982](https://github.com/Lemo1982).
