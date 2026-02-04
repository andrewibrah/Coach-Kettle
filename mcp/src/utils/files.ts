import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';

export function readFile(path: string): string {
  return readFileSync(path, 'utf-8');
}

export function readJsonFile<T>(path: string): T {
  return JSON.parse(readFile(path)) as T;
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function listFiles(dir: string, extension?: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((file) => {
      const fullPath = join(dir, file);
      const isFile = statSync(fullPath).isFile();
      if (!isFile) return false;
      if (extension) return extname(file) === extension;
      return true;
    })
    .map((file) => join(dir, file));
}

export function listDirectories(dir: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((file) => statSync(join(dir, file)).isDirectory())
    .map((file) => join(dir, file));
}

export function getFileStats(path: string): { lines: number; size: number } | null {
  if (!existsSync(path)) return null;

  const content = readFile(path);
  return {
    lines: content.split('\n').length,
    size: statSync(path).size,
  };
}

export interface FileInfo {
  name: string;
  path: string;
  extension: string;
  lines: number;
}

export function getFilesRecursive(dir: string, extensions: string[] = []): FileInfo[] {
  const results: FileInfo[] = [];

  function walk(currentDir: string) {
    if (!existsSync(currentDir)) return;

    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        if (!entry.startsWith('.') && entry !== 'node_modules' && entry !== 'dist') {
          walk(fullPath);
        }
      } else if (stat.isFile()) {
        const ext = extname(entry);
        if (extensions.length === 0 || extensions.includes(ext)) {
          const content = readFile(fullPath);
          results.push({
            name: entry,
            path: fullPath,
            extension: ext,
            lines: content.split('\n').length,
          });
        }
      }
    }
  }

  walk(dir);
  return results;
}
