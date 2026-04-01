import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { HistoryEntry, SessionRecord } from './session-types.js';

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function writeSessionRecord(sessionDir: string, record: SessionRecord): string {
  mkdirSync(sessionDir, { recursive: true });
  const filePath = path.join(sessionDir, `${record.id}.json`);
  writeJson(filePath, record);
  return filePath;
}

export function writeHistoryEntries(
  historyDir: string,
  submitSessionId: string,
  entries: HistoryEntry[],
): string {
  mkdirSync(historyDir, { recursive: true });
  const filePath = path.join(historyDir, `${submitSessionId}.json`);
  writeJson(filePath, entries);
  return filePath;
}

function sanitizeFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'artifact';
}

export function writeArtifact(
  artifactDir: string,
  content: string,
  hint = 'artifact',
): { filePath: string; fileName: string } {
  mkdirSync(artifactDir, { recursive: true });
  const fileName = `${Date.now()}-${sanitizeFileName(hint)}.txt`;
  const filePath = path.join(artifactDir, fileName);
  writeFileSync(filePath, content, 'utf8');
  return { filePath, fileName };
}

