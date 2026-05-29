# Claude Pulse

A one-page tracker for Anthropic & Claude launches — what's new, what's coming,
and how Claude compares to other frontier models. Anthropic-inspired UI.

> **Open source & for education.** This is a free, community-maintained project
> built to help anyone stay up to date with Claude and the wider AI model
> landscape. No commercial intent — just a shared place to learn and track
> progress. Contributions are very welcome.

## Run locally

The page fetches `data/updates.json`, so open it through a local server (not `file://`):

```bash
cd "relaunch-to-update"
python3 -m http.server 8000
# then open http://localhost:8000
```

Or with Node: `npx serve .`

## Keeping it live (accurate, not static)

All content lives in `data/updates.json`. Two ways to keep it fresh:

1. **Auto (recommended)** — `.github/workflows/refresh.yml` runs daily, executes
   `scripts/fetch-updates.mjs` (pulls Anthropic's public news page, merges new
   posts into the timeline, bumps `lastUpdated`), and commits the change. Free
   on GitHub Pages.
2. **On demand** — run it yourself:
   ```bash
   node scripts/fetch-updates.mjs
   ```

The refresher is best-effort and never destroys existing curated data — if the
fetch fails it just keeps what's there.

## Editing data by hand

Open `data/updates.json`:
- `latest` — the hero (current flagship model)
- `timeline` — the "What's New" feed
- `upcoming` — announced / speculative launches
- `models` — rows for the comparison table + benchmark charts

## Deploy

Push to GitHub and enable Pages (source: root). Static — no backend needed.

## Contributing

Anyone is welcome to contribute — this project only stays current because people
keep it current. You don't need to be a developer; spotting a new release or
fixing a number is just as valuable as code.

**Ways to help:**
- **Add a launch** — a new model or feature dropped? Add an entry to the
  `timeline` array in `data/updates.json`.
- **Fix the numbers** — benchmark scores and pricing shift fast. Correct any
  stale value and link your source.
- **Improve the UI** — accessibility, mobile layout, dark mode, new charts.
- **Strengthen the refresher** — make `scripts/fetch-updates.mjs` pull from more
  reliable feeds (RSS/Atom/APIs).

**How to contribute:**
1. Fork the repo and create a branch (`git checkout -b add-opus-4-9`).
2. Make your change. For data edits, keep `data/updates.json` valid JSON
   (run `node scripts/fetch-updates.mjs` locally to sanity-check).
3. **Cite your source** in the PR — a link to the official announcement or a
   public leaderboard. Accuracy is the whole point of this project.
4. Open a pull request describing what changed and why.

Please keep contributions factual and sourced. Speculative/upcoming items belong
in the `upcoming` array and must be marked `"status": "speculative"`.

## Code of conduct

Be kind, be accurate, assume good faith. This is a learning project for everyone.

## License & disclaimer

Released under the **MIT License** — free to use, modify, and share.

Benchmark figures are approximate and drawn from public leaderboards (linked in
the footer). This project is **not affiliated with, endorsed by, or sponsored by
Anthropic.** "Claude" and "Anthropic" are trademarks of their respective owner;
they are used here only to describe the subject being tracked.
