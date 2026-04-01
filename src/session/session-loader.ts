import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { HistoryEntry, SessionRecord } from './session-types.js';

function readJsonFile(filePath: string): unknown {
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as unknown;
}

export function loadSessionRecord(sessionDir: string, sessionId: string): SessionRecord | undefined {
  const filePath = path.join(sessionDir, `${sessionId}.json`);
  if (!existsSync(filePath)) {
    return undefined;
  }

  try {
    const parsed = readJsonFile(filePath);
    if (!parsed || typeof parsed !== 'object') {
      return undefined;
    }
    return parsed as SessionRecord;
  } catch {
    return undefined;
  }
}

export function listSessionRecords(sessionDir: string, limit = 20): SessionRecord[] {
  if (!existsSync(sessionDir)) {
    return [];
  }

  const files = readdirSync(sessionDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit);

  const records: SessionRecord[] = [];
  for (const file of files) {
    const maybeRecord = loadSessionRecord(sessionDir, file.replace(/\.json$/, ''));
    if (maybeRecord) {
      records.push(maybeRecord);
    }
  }
  return records;
}

export function loadHistoryEntries(historyDir: string, submitSessionId: string): HistoryEntry[] {
  const filePath = path.join(historyDir, `${submitSessionId}.json`);
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const parsed = readJsonFile(filePath);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is HistoryEntry => Boolean(entry && typeof entry === 'object'));
  } catch {
    return [];
  }
}

