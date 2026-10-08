# Architecture

Milemark has two intentionally separate execution modes sharing one frontend.

```mermaid
flowchart LR
    A[React / TypeScript dashboard] --> B[Training engine in browser]
    A --> C[Browser local storage]
    A -->|Same-origin local requests| D[FastAPI on loopback]
    D --> E[Garmin adapter]
    E -->|HTTPS, read-only imports| F[Garmin Connect]
    D --> G[Local SQLite summaries]
    E --> H[Local session-token directory]
```

The hosted static version supports the demo and manual mode. It does not reach the local API, accept Garmin credentials, or sync Garmin data by itself. The local Python service serves the same built frontend and adds a same-origin API.

## Python integration

`garmin.py` isolates the external client contract. The login handler uses an in-memory client for MFA continuation; tokens are persisted only after success. A fresh login through the cached session loads the profile required by sleep requests. Plaintext passwords are discarded after login initiation. No credentials appear in source or browser storage.

Sync imports up to one year / 1,000 most recent activities and 14 days of sleep/HRV. Activity retrieval failure preserves the previous SQLite snapshot. A missing health endpoint produces a warning and null metrics rather than a fabricated score. Race flags come from structured event metadata, not a name heuristic. Summaries omit location and raw account payloads.

The single-user service serializes Garmin operations, limits login retries, rejects remote clients/foreign origins, and requires a browser-request token on mutations. Tokens and the database are ignored by Git. Live Garmin sign-in and sync have been verified with the owner’s account.

## TypeScript domain logic

Unit conversion happens at display/input/export boundaries. Stored distances stay in kilometers, and pace converts by the same exact 1.609344 factor.

The engine handles local-calendar dates at noon to avoid UTC date shifts. Plans use a stable Monday-based calendar with an exact race-day event and no postrace running. Test cases cover Sunday and midweek races.

Current volume is always explicit. Imported activity history can prefill a recent four-complete-week average and a longest recent run, which the runner reviews in goal settings. A goal time never invents physiological data or guarantees an outcome.

The browser maintains a labeled sample mode separately from the personal journal. Imports validate dates, finite numbers, array limits, and units. Exports use a small normalized schema that excludes credentials and GPS points.

## Known limits

- Unofficial Garmin services can change, require MFA, rate-limit, or reject a login. This project does not claim approved Garmin partner status.
- Sync is on demand. No background automation or workout upload is implemented.
- Plans are configurable heuristics. Injury history, terrain, heat, nutrition, and coach judgment are not modeled.
- Hosted manual storage belongs to that browser/origin; it does not synchronize across devices.
- Event presets are a curated list verified October 15, 2026, not a live race-directory feed. Organizer links remain visible and expired dates are filtered.
- Each new account still requires its owner to sign in locally.
