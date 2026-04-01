import { mkdirSync } from 'node:fs';
import path from 'node:path';

export type DataLayer = 'knowledge' | 'skills' | 'rules' | 'permissions';

const DEFAULT_DATA_ROOT = 'userclaw-data';

export function resolveDataRoot(dataRoot?: string): string {
  return path.resolve(dataRoot ?? path.join(process.cwd(), DEFAULT_DATA_ROOT));
}

export function ensureDataLayerDir(layer: DataLayer, dataRoot?: string): string {
  const root = resolveDataRoot(dataRoot);
  const layerDir = path.join(root, layer);
  mkdirSync(layerDir, { recursive: true });
  return layerDir;
}

export function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

export function toAbsolutePath(projectRoot: string, targetPath: string): string {
  const absolute = path.isAbsolute(targetPath)
    ? targetPath
    : path.join(projectRoot, targetPath);
  return path.normalize(absolute);
}

export function isPathInside(baseDir: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(baseDir), path.resolve(targetPath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function toProjectRelativePath(projectRoot: string, absolutePath: string): string {
  const relative = path.relative(path.resolve(projectRoot), path.resolve(absolutePath));
  return normalizeSlashes(relative);
}
