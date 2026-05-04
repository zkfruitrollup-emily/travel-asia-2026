# Em & Trish · Trip Site

A mobile-first trip site for Emily + Trish · Bangkok & Philippines · May 7–26, 2026.

## What's in here

```
em-trish-trip/
├── index.html        single-page entry
├── styles.css        all styling (mobile-first, Em & Trish palette)
├── app.js            routing, data loading, rendering
├── data/             JSON data the app reads
│   ├── trip.json
│   ├── timeline.json
│   └── vault.json
├── scripts/
│   └── build_data.py converts the intake XLSX → the three JSON files
├── vercel.json       static-site config
└── README.md
```

## Run locally

You need any static file server (the `fetch()` calls won't work via `file://`).

```bash
cd em-trish-trip
python3 -m http.server 8080
# open http://localhost:8080
```

Or with Node:

```bash
npx serve em-trish-trip -l 8080
```

## Deploy to Vercel

1. Push this folder to a Git repo (GitHub / GitLab / Bitbucket).
2. On vercel.com, click **New Project**, import the repo.
3. Framework preset: **Other** (it's a static site, no build step).
4. Output directory: `.` (the repo root).
5. Deploy. Done.

You'll get a `*.vercel.app` URL. To use a custom domain, add it in the project's Settings → Domains.

## Updating the trip data

When the spreadsheet changes:

```bash
python3 scripts/build_data.py "/path/to/Em & Trish - Trip Intake.xlsx"
git add data/
git commit -m "update trip data"
git push
```

Vercel will auto-redeploy in ~30 seconds.

## What's not yet wired up (V1 scope)

- **Activities / Things to do** — intentionally skipped for V1; we'll add later.
- **Journal** — placeholder screen only; posting flow not built yet.
- **JSONbin** — for V1 the data is bundled with the site (read-only). When you want both Em & Trish to edit on the fly, we'll swap the `fetch()` calls in `app.js` to JSONbin endpoints.
- **Send location to Trish** — removed from sync card per your design.

## Design system

Open `color_palette.html` (one folder up) to see all the named colors. The app uses CSS variables (`--cerulean-deep`, `--coral`, `--lime`, etc.) so single-color changes are 1-line edits in `styles.css`.

## Notes on the data

A handful of imperfections from the intake came through unchanged — the app shows them as-is. Examples:
- May 14 has a row labeled "Land MNL" that should probably be "Land MPH" (Boracay).
- "Boarding · PPS" appears twice on May 25.
- Some events have `time` set to free-form labels like `TBD` or `ALL DAY` — they render at the bottom of their day section without a time.

Fix those in the spreadsheet whenever, then re-run `build_data.py`.
