# Verification — October 15, 2026

## Confirmed

- 21 TypeScript tests pass: calendar persistence, training constraints, race dates, taper behavior, trend-based recovery, real-race comparisons, calendar export, and malformed imports.
- 13 Python tests pass: Garmin normalization, missing metrics, read-only sync calls, login/MFA contracts, request-origin/CSRF protections, redacted errors, and preservation of the last successful import.
- TypeScript checks and the production build pass.
- GitHub Actions [run 38858744102](https://github.com/nikhiltrip/milemark/actions/runs/38858744102) passed against commit `1dc4f613c369c184b00dfb0c1f331d5da0fd9c4e`.
- Browser checks confirmed preset marathon autofill, custom race/date saving, week navigation, manual run logging, a low-sleep recovery adjustment, personal/demo separation, journal clearing, and the research page.
- The 390px mobile viewport has no horizontal page overflow. Desktop browser checks reported no console errors.
- Disposable QA run/check-in records were cleared. Screenshots use synthetic demo data or an empty personal journal.
- Garmin session tokens and SQLite data are ignored by Git.

## Live account check and remaining limits

- Live Garmin sign-in and read-only import succeeded with the owner’s account. No account data was added to the repository. Recovery values unavailable from the device remain missing.
- Browser file-import interaction could not be completed by the Chrome automation extension without its file-access permission. Import schema validation is unit tested.
- The exact training algorithm has not undergone a prospective performance trial. Research informs its principles, not a guarantee of fitness improvement or injury prevention.

The app shows these distinctions in its connection screen and Progress & science page.

## Follow-up regressions

- Low-base, long-timeline scenarios now reach the 30–40 mile range; the default four-day SF schedule peaks around 35 miles with a 17.5-mile long run. Short timelines cannot force the same target.
- Sleep stats and HRV range payloads are tested alongside detail fallback, unit-safe activity metrics, VO₂ max selection, timezone validation, and cache-merge behavior.
- User health records remain local; public screenshots use synthetic data.

- Daily steps verified live on October 15, 2026: 26 dated records returned without sync warnings. No private health values or screenshots are committed.
- Daily run totals sum same-day runs and deduplicate activity IDs; regression checks cover multiple runs and future dates.
- Browser checks verified daily chart readouts, step history, sleep/HRV metric switching, and a 390 px mobile layout without horizontal overflow.
- Non-running sport fixtures cover cycling, swimming, walking, hiking, and multisport exclusion. Daily history survives the rolling import window and missing-value updates.
