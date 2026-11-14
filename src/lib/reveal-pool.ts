// The Sports Revealer pool and clues (the answers). Server-only in practice:
// import it only from server code (reveal-data.ts, API routes, scripts). It
// doesn't import "server-only" so that scripts/backfill-rounds.mts can use it.
// Built by scripts/build_reveal_data.py.
import raw from "@/data/reveal.json";
import type { RevealData } from "./reveal";

export const revealData = raw as unknown as RevealData;
