/**
 * Persist last RequestTrail runs under data/traces.json.
 * Server-only.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TrailResult } from "./trail";

export type TracesFile = {
  savedAt: string;
  traces: TrailResult[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "traces.json");
const MAX_TRACES = 20;

export async function readTraces(): Promise<TracesFile> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as TracesFile;
    return {
      savedAt: parsed.savedAt ?? "",
      traces: Array.isArray(parsed.traces) ? parsed.traces : [],
    };
  } catch {
    return { savedAt: "", traces: [] };
  }
}

export async function appendTrace(trail: TrailResult): Promise<TracesFile> {
  const current = await readTraces();
  const next: TracesFile = {
    savedAt: new Date().toISOString(),
    traces: [trail, ...current.traces].slice(0, MAX_TRACES),
  };
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}
