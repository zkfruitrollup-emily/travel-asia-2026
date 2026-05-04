# Em & Trish · Trip Site

A mobile-first trip site for Emily + Trish · Bangkok & Philippines · May 7–26, 2026.

## What's in here

```
em-trish-trip/
├── index.html        single-page entry
├── styles.css        all styling (mobile-first, Em & Trish palette)
├── app.js            routing, data loading, rendering
├── data/             trip JSON the app reads
│   ├── trip.json
│   ├── timeline.json
│   └── vault.json
├── api/              Vercel serverless functions (Journal backend)
│   ├── _auth.js          shared auth helpers (not deployed as a route)
│   ├── _kv.js            shared Upstash Redis wrapper
│   ├── auth.js           POST/GET/DELETE /api/auth
│   ├── posts.js          GET/POST /api/posts
│   ├── posts/[id]/comments.js   POST /api/posts/:id/comments
│   └── upload.js         POST /api/upload (Vercel Blob client-upload handshake)
├── scripts/
│   └── build_data.py     converts the intake XLSX → the three data JSON files
├── package.json
├── vercel.json
└── README.md
```

## Run locally

The frontend is fully static, but the Journal API routes only run on Vercel
(or with `vercel dev`). For frontend-only development:

```bash
cd em-trish-trip
python3 -m http.server 8080
# open http://localhost:8080
```

For full local dev with the Journal API:

```bash
npm i -g vercel
vercel dev
# open http://localhost:3000
```

## Deploy to Vercel

1. Push this folder to a Git repo (GitHub/GitLab/Bitbucket) and import it on
   Vercel — or use `npx vercel` from the folder for a CLI deploy.
2. The static frontend works immediately. The Journal needs three things added:
   * **Upstash for Redis** — open the project on Vercel → **Storage** tab →
     **Create Database** → Upstash for Redis → connect. Vercel auto-injects
     `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
   * **Vercel Blob** — same Storage tab → **Create Database** → Blob → connect.
     Auto-injects `BLOB_READ_WRITE_TOKEN`.
   * **Passcode env var** — go to **Settings → Environment Variables**, add:
     ```
     JOURNAL_PASSCODE = <your shared passcode, any string>
     JOURNAL_AUTH_SECRET = <random string, optional but recommended>
     ```
     Apply to Production (and Preview if you want).
3. Click **Redeploy** so the new env vars take effect.

After redeploy, the Journal tab will load. Anyone visiting can read posts and
leave comments. Tapping **+ Post** prompts for `JOURNAL_PASSCODE` once per
device — after that, posting is unlocked for 30 days.

## Updating the trip data

When the spreadsheet changes:

```bash
python3 scripts/build_data.py "/path/to/Em & Trish - Trip Intake.xlsx"
git add data/
git commit -m "update trip data"
git push
```

Vercel auto-redeploys.

## What's not yet wired up

- **Activities / Things to do** — intentionally skipped, will add later.
- **Live editing of timeline events** (notes, status, A/B picks) — currently
  read-only from the bundled JSON. Adding KV-backed edits is a small extension
  if you want it.

## Notes on the data

A handful of imperfections from the intake came through unchanged. Examples:
- May 14 has a row labeled "Land MNL" that should probably be "Land MPH".
- "Boarding · PPS" appears twice on May 25.
- Some events have `time` set to free-form labels like `TBD` or `ALL DAY` —
  they render at the bottom of their day section without a time.
- The NH109 `arrive_local` cell in the **Flights** tab is `04:55` (AM) — it
  should be `16:55` (PM). Timeline tab is correct; only the Vault flight card
  shows the AM time.

Fix those in the spreadsheet, then re-run `build_data.py`.

## Design system

Open `color_palette.html` (one folder up in `outputs/`) to see all the named
colors. The app uses CSS variables (`--cerulean-deep`, `--coral`, `--lime`,
etc.) so single-color changes are 1-line edits in `styles.css`.

## Costs

Hobby/Free plan is enough for a personal trip site:
- Vercel: 100 GB-hours of function execution per month (we use ~0).
- Upstash for Redis: 10k commands/day on the free plan (a single trip writes
  maybe ~200 commands total).
- Vercel Blob: 1 GB storage / 10 GB bandwidth on the free plan (≈300 photos
  at the resized 1600px JPEG ~700KB each).
