#!/usr/bin/env node
// Standalone CLI for Antigravity Google Search grounding.
// Usage: node bin/gsearch.mjs "query" [maxResults]
import { searchAntigravity } from "../lib/index.js";

const query = process.argv[2];
if (!query || !query.trim()) {
  console.error('Usage: gsearch "<query>" [maxResults]');
  process.exit(1);
}

const maxResults = Number(process.argv[3] ?? 5);
const out = await searchAntigravity(query, { maxResults });
console.log(JSON.stringify(out, null, 2));
