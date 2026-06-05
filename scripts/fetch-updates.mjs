#!/usr/bin/env node
// Refresher for data/updates.json.
// Reads Anthropic's sitemap.xml (reliable static XML), finds new /news/ posts,
// and pulls each post's title + summary from its OpenGraph meta tags.
// Merges new items into the timeline and always bumps meta.lastUpdated.
// Dependency-free (uses Node's global fetch). Run: node scripts/fetch-updates.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(root, "data", "updates.json");
const SITEMAP_URL = "https://www.anthropic.com/sitemap.xml";
const UA = "Mozilla/5.0 (claude-pulse refresher)";
const MAX_NEW_PER_RUN = 8; // safety cap so one run can't flood the timeline

const today = new Date().toISOString().slice(0, 10);

function classify(text) {
  const t = text.toLowerCase();
  if (/(opus|sonnet|haiku|claude \d|new model|introducing claude)/.test(t)) return { type: "model", tags: ["Model"] };
  if (/(api|claude code|agent|tool|workflow|sdk|mcp|feature)/.test(t)) return { type: "feature", tags: ["Feature"] };
  if (/(research|interpretab|safety|alignment|institute)/.test(t)) return { type: "feature", tags: ["Research"] };
  return { type: "feature", tags: ["News"] };
}

const titleFromSlug = (url) =>
  url.split("/news/")[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Decode the handful of HTML entities that show up in OG meta tags.
const decode = (s) =>
  s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
   .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// Pull recent /news/ entries from the sitemap, newest first.
async function fetchSitemapNews() {
  const res = await fetch(SITEMAP_URL, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`sitemap fetch failed: ${res.status}`);
  const xml = await res.text();
  const entries = [];
  const re = /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g;
  let m;
  while ((m = re.exec(xml))) {
    const url = m[1].trim();
    if (!/\/news\/[a-z0-9-]+$/.test(url)) continue; // skip /news/ index + non-posts
    entries.push({ url, lastmod: m[2] ? m[2].slice(0, 10) : today });
  }
  entries.sort((a, b) => (a.lastmod < b.lastmod ? 1 : -1));
  return entries.slice(0, 30); // consider the 30 most recent
}

// Read OpenGraph title/description from a post's static HTML.
async function fetchMeta(url) {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(String(res.status));
    const html = await res.text();
    const grab = (p) => (html.match(new RegExp(`<meta property="${p}" content="([^"]*)"`, "i")) || [])[1];
    const title = decode(grab("og:title") || titleFromSlug(url));
    const summary = decode(grab("og:description") || "New from Anthropic — see the announcement for details.");
    const published = (grab("article:published_time") || "").slice(0, 10);
    return { title, summary, published };
  } catch {
    return { title: titleFromSlug(url), summary: "New from Anthropic — see the announcement for details.", published: "" };
  }
}

// Classify a tweet with the open keyword lexicon. Transparent + auditable.
function classifySentiment(text, lex) {
  const t = " " + text.toLowerCase() + " ";
  const hit = (words) => words.some((w) => t.includes(w.toLowerCase()));
  const pos = hit(lex.positive);
  const neg = hit(lex.negative);
  if (pos && !neg) return "positive";
  if (neg && !pos) return "negative";
  return "neutral";
}

// Pluggable: only goes live if X_BEARER_TOKEN is set. Otherwise keeps curated data.
async function refreshSentiment(data) {
  const token = process.env.X_BEARER_TOKEN;
  const s = data.sentiment;
  if (!s) return;
  if (!token) {
    console.log("Sentiment: no X_BEARER_TOKEN set — keeping illustrative sample.");
    return;
  }
  try {
    const url = `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(s.query)}&max_results=100&tweet.fields=text`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`X API ${res.status}`);
    const json = await res.json();
    const tweets = json.data || [];
    let positive = 0, negative = 0, neutral = 0;
    for (const tw of tweets) {
      const label = classifySentiment(tw.text, s.lexicon);
      if (label === "positive") positive++;
      else if (label === "negative") negative++;
      else neutral++;
    }
    Object.assign(s, {
      mode: "live",
      positive, negative, neutral,
      sampleSize: tweets.length,
      lastFetched: today,
      samples: tweets.slice(0, 4).map((tw) => ({ text: tw.text.slice(0, 160), label: classifySentiment(tw.text, s.lexicon) })),
    });
    console.log(`Sentiment: LIVE — classified ${tweets.length} tweets (${positive}+ / ${negative}- / ${neutral}~).`);
  } catch (err) {
    console.warn(`Sentiment refresh failed (kept existing): ${err.message}`);
  }
}

async function main() {
  const data = JSON.parse(await readFile(DATA, "utf8"));
  const existingUrls = new Set(data.timeline.map((t) => t.url));

  let added = 0;
  try {
    const entries = await fetchSitemapNews();
    const fresh = entries.filter((e) => !existingUrls.has(e.url)).slice(0, MAX_NEW_PER_RUN);
    for (const e of fresh) {
      const meta = await fetchMeta(e.url);
      const { type, tags } = classify(`${meta.title} ${meta.summary}`);
      data.timeline.unshift({
        date: meta.published || e.lastmod || today,
        type,
        title: meta.title,
        summary: meta.summary,
        tags,
        url: e.url,
      });
      existingUrls.add(e.url);
      added++;
    }
    console.log(`Sitemap: scanned ${entries.length} recent posts, added ${added} new timeline item(s).`);
  } catch (err) {
    console.warn(`Refresh warning (kept existing data): ${err.message}`);
  }

  await refreshSentiment(data);

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
