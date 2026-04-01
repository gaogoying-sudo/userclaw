/**
 * Minimal ID generation for V1 skeleton.
 *
 * Placeholder: uses crypto.randomUUID (Node 19+).
 * Phase 2 may switch to a more compact format or ULID.
 */

import { randomUUID } from 'node:crypto';

export function generateId(): string {
  return randomUUID();
}
