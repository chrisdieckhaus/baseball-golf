// Writes src/data/player-meta.json: years active and primary position for every
// player on a career leaderboard. Player mode (/golf/player) shows these under
// the player's name, and the server can't load the 1.6 MB public/players.json.
//
// Reads public/players.json and src/data/leaderboards.json, so run it after
// scripts/build_data.py (`npm run data` does).
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const players = JSON.parse(readFileSync(new URL("public/players.json", root), "utf8")).players;
const stats = JSON.parse(readFileSync(new URL("src/data/leaderboards.json", root), "utf8")).stats;

const ranked = new Set();
for (const s of Object.values(stats)) for (const e of s.entries) ranked.add(e.id);

const meta = {};
for (const p of players) if (ranked.has(p.id)) meta[p.id] = [p.y, p.p];

writeFileSync(new URL("src/data/player-meta.json", root), JSON.stringify(meta));
console.log(`[player-meta] wrote ${Object.keys(meta).length} of ${ranked.size} ranked players`);
