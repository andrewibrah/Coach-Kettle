import { readFile } from '../utils/files.js';

export interface ExportInfo {
  name: string;
  kind: 'function' | 'component' | 'hook' | 'type' | 'interface' | 'const' | 'class';
  signature?: string;
  line: number;
  default?: boolean;
}

export interface FileSkeleton {
  file: string;
  type: 'component' | 'hook' | 'utility' | 'types' | 'screen' | 'provider' | 'context';
  exports: ExportInfo[];
  imports: string[];
  lines: number;
  props?: string[];
  hooks?: string[];
  returns?: string[];
}

export function generateSkeleton(path: string): FileSkeleton {
  const content = readFile(path);
  const lines = content.split('\n');

  return {
    file: path,
    type: detectType(content, path),
    exports: parseExports(lines),
    imports: parseImports(content),
    lines: lines.length,
    props: parseProps(content),
    hooks: parseHooks(content),
    returns: parseReturns(content),
  };
}

function detectType(content: string, path: string): FileSkeleton['type'] {
  const name = path.split('/').pop() || '';
  if (path.includes('/contexts/') || name.includes('Context')) return 'context';
  if (name.includes('Provider')) return 'provider';
  if (path.includes('/app/') && !name.startsWith('_')) return 'screen';
  if (path.includes('/hooks/') || name.startsWith('use')) return 'hook';
  if (path.includes('/types/')) return 'types';
  if (/export\s+(default\s+)?function\s+\w+.*\(/.test(content) && content.includes('return') && content.includes('<')) return 'component';
  return 'utility';
}

function parseExports(lines: string[]): ExportInfo[] {
  const exports: ExportInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ln = i + 1;

    // export default function Name
    let m = line.match(/^export\s+default\s+function\s+(\w+)/);
    if (m) {
      exports.push({ name: m[1], kind: inferKind(m[1]), line: ln, default: true });
      continue;
    }

    // export function Name
    m = line.match(/^export\s+(?:async\s+)?function\s+(\w+)/);
    if (m) {
      exports.push({ name: m[1], kind: inferKind(m[1]), line: ln });
      continue;
    }

    // export const Name
    m = line.match(/^export\s+const\s+(\w+)/);
    if (m) {
      exports.push({ name: m[1], kind: inferKind(m[1]), line: ln });
      continue;
    }

    // export type/interface
    m = line.match(/^export\s+(type|interface)\s+(\w+)/);
    if (m) {
      exports.push({ name: m[2], kind: m[1] as 'type' | 'interface', line: ln });
      continue;
    }

    // export class
    m = line.match(/^export\s+(default\s+)?class\s+(\w+)/);
    if (m) {
      exports.push({ name: m[2], kind: 'class', line: ln, default: !!m[1] });
      continue;
    }

    // export default Name (at end of file)
    m = line.match(/^export\s+default\s+(\w+)\s*;?\s*$/);
    if (m) {
      const existing = exports.find((e) => e.name === m![1]);
      if (existing) existing.default = true;
      else exports.push({ name: m[1], kind: 'const', line: ln, default: true });
    }
  }

  return exports;
}

function parseImports(content: string): string[] {
  const imports: string[] = [];
  const re = /from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(content))) {
    if (!imports.includes(m[1])) imports.push(m[1]);
  }
  return imports;
}

function parseProps(content: string): string[] {
  const props: string[] = [];
  const m = content.match(/(?:interface|type)\s+\w*Props\w*\s*=?\s*\{([^}]+)\}/s);
  if (m) {
    const block = m[1];
    const re = /(\w+)\??:/g;
    let pm;
    while ((pm = re.exec(block))) {
      props.push(pm[1]);
    }
  }
  return props;
}

function parseHooks(content: string): string[] {
  const hooks = new Set<string>();
  const re = /\buse\w+\s*\(/g;
  let m;
  while ((m = re.exec(content))) {
    hooks.add(m[0].replace(/\s*\($/, ''));
  }
  return Array.from(hooks);
}

function parseReturns(content: string): string[] {
  const returns: string[] = [];
  const m = content.match(/return\s*\{([^}]+)\}/);
  if (m) {
    const items = m[1].split(',').map((s) => s.trim().split(':')[0].trim()).filter(Boolean);
    returns.push(...items);
  }
  return returns;
}

function inferKind(name: string): ExportInfo['kind'] {
  if (name.startsWith('use')) return 'hook';
  if (name[0] === name[0].toUpperCase()) return 'component';
  return 'function';
}

export function formatSkeleton(s: FileSkeleton): string {
  const out: string[] = [];

  out.push(`### ${s.file}`);
  out.push(`**${s.type}** | ${s.lines} lines\n`);

  if (s.imports.length) {
    out.push(`Imports: ${s.imports.slice(0, 8).join(', ')}${s.imports.length > 8 ? '...' : ''}`);
  }

  if (s.exports.length) {
    out.push('\nExports:');
    for (const e of s.exports) {
      const def = e.default ? ' *(default)*' : '';
      out.push(`- \`${e.name}\` ${e.kind}${def} [L${e.line}]`);
    }
  }

  if (s.props?.length) out.push(`\nProps: ${s.props.join(', ')}`);
  if (s.hooks?.length) out.push(`Hooks: ${s.hooks.join(', ')}`);
  if (s.returns?.length) out.push(`Returns: { ${s.returns.join(', ')} }`);

  return out.join('\n') + '\n';
}
