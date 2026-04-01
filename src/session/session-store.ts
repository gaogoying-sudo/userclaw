import path from 'node:path';
import { ensureDataLayerDir, resolveDataRoot } from '../shared/data-paths.js';
import { loadHistoryEntries, listSessionRecords, loadSessionRecord } from './session-loader.js';
import type { HistoryEntry, SessionRecord } from './session-types.js';
import { writeArtifact, writeHistoryEntries, writeSessionRecord } from './session-writer.js';

export interface SessionStoreOptions {
  dataRoot?: string;
}

export class SessionStore {
  private readonly dataRoot: string;
  private readonly sessionDir: string;
  private readonly historyDir: string;
  private readonly artifactDir: string;

  constructor(options: SessionStoreOptions = {}) {
    this.dataRoot = resolveDataRoot(options.dataRoot);
    this.sessionDir = ensureDataLayerDir('sessions', this.dataRoot);
    this.historyDir = ensureDataLayerDir('history', this.dataRoot);
    this.artifactDir = ensureDataLayerDir('artifacts', this.dataRoot);
  }

  saveSessionRecord(record: SessionRecord): string {
    return writeSessionRecord(this.sessionDir, record);
  }

  loadSessionRecord(sessionId: string): SessionRecord | undefined {
    return loadSessionRecord(this.sessionDir, sessionId);
  }

  listSessionRecords(limit = 20): SessionRecord[] {
    return listSessionRecords(this.sessionDir, limit);
  }

  appendHistoryEntry(submitSessionId: string, entry: HistoryEntry): string {
    const entries = loadHistoryEntries(this.historyDir, submitSessionId);
    entries.push(entry);
    return writeHistoryEntries(this.historyDir, submitSessionId, entries);
  }

  loadHistoryEntries(submitSessionId: string): HistoryEntry[] {
    return loadHistoryEntries(this.historyDir, submitSessionId);
  }

  saveArtifact(content: string, hint = 'artifact'): string {
    const { fileName } = writeArtifact(this.artifactDir, content, hint);
    return path.join('artifacts', fileName).replace(/\\/g, '/');
  }

  getDataRoot(): string {
    return this.dataRoot;
  }

  getSessionDir(): string {
    return this.sessionDir;
  }

  getHistoryDir(): string {
    return this.historyDir;
  }

  getArtifactDir(): string {
    return this.artifactDir;
  }
}

