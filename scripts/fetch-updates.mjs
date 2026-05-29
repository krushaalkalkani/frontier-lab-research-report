#!/usr/bin/env node
// Best-effort refresher for data/updates.json.
// Pulls Anthropic's public news page, extracts recent post titles + links,
// and merges any new items into the timeline. Always bumps meta.lastUpdated.
// Dependency-free (uses Node's global fetch). Run: node scripts/fetch-updates.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(root, "data", "updates.json");
const NEWS_URL = "https://www.anthropic.com/news";

const today = new Date().toISOString().slice(0, 10);

function classify(title) {
  const t = title.toLowerCase();
  if (/(opus|sonnet|haiku|claude \d)/.test(t)) return { type: "model", tags: ["Model"] };
  if (/(api|code|agent|tool|workflow)/.test(t)) return { type: "feature", tags: ["Feature"] };
  return { type: "feature", tags: ["News"] };
}

async function fetchNews() {
  const res = await fetch(NEWS_URL, {
    headers: { "user-agent": "Mozilla/5.0 (claude-pulse refresher)" },
  });
  if (!res.ok) throw new Error(`news fetch failed: ${res.status}`);
  const html = await res.text();

  // Grab anchors that point at /news/<slug> and have visible text.
  const items = new Map();
  const re = /href="(\/news\/[a-z0-9-]+)"[^>]*>([^<]{6,120})</gi;
  let m;
  while ((m = re.exec(html))) {
    const url = "https://www.anthropic.com" + m[1];
    const title = m[2].replace(/\s+/g, " ").trim();
    if (title && !items.has(url)) items.set(url, title);
  }
  return [...items.entries()].slice(0, 12).map(([url, title]) => ({ url, title }));
}

async function main() {
  const data = JSON.parse(await readFile(DATA, "utf8"));
  const existingUrls = new Set(data.timeline.map((t) => t.url));

  let added = 0;
  try {
    const news = await fetchNews();
    for (const n of news) {
      if (existingUrls.has(n.url)) continue;
      const { type, tags } = classify(n.title);
      data.timeline.unshift({
        date: today,
        type,
        title: n.title,
        summary: "New from Anthropic — see the announcement for details.",
        tags,
        url: n.url,
      });
      existingUrls.add(n.url);
      added++;
    }
    console.log(`Fetched ${news.length} news links, added ${added} new timeline item(s).`);
  } catch (err) {
    console.warn(`Refresh warning (kept existing data): ${err.message}`);
  }

  // Keep newest 20, sorted by date desc.
  data.timeline.sort((a, b) => (a.date < b.date ? 1 : -1));
  data.timeline = data.timeline.slice(0, 20);
  data.meta.lastUpdated = today;

  await writeFile(DATA, JSON.stringify(data, null, 2) + "\n");
  console.log(`Wrote ${DATA} (lastUpdated=${today}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
