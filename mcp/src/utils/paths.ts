import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Resolve paths from environment or defaults
export const DOCS_PATH = process.env.DOCS_PATH || '/docs';
export const CODEBASE_PATH = process.env.CODEBASE_PATH || '/codebase';

export function getDocsPath(...segments: string[]): string {
  return join(DOCS_PATH, ...segments);
}

export function getCodebasePath(...segments: string[]): string {
  return join(CODEBASE_PATH, ...segments);
}
