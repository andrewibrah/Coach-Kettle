import { readFile } from '../utils/files.js';

export interface ExportInfo {
  name: string;
  kind: 'function' | 'component' | 'hook' | 'type' | 'interface' | 'const' | 'class';
  signature?: string;
  line: number;
  isDefault?: boolean;
}

export interface ImportInfo {
  source: string;
  imports: string[];
}

export interface PropInfo {
  name: string;
  type: string;
  optional: boolean;
}

export interface HookReturn {
  [key: string]: string;
}

export interface FileSkeleton {
  file: string;
  type: 'component' | 'hook' | 'utility' | 'types' | 'screen' | 'provider' | 'context';
  exports: ExportInfo[];
  imports: ImportInfo[];
  lineCount: number;
  component?: {
    name: string;
    props: PropInfo[];
    hooks: string[];
    children: string[];
  };
  hook?: {
    name: string;
    returns: HookReturn;
    dependencies: string[];
  };
}

// Detect file type based on content and path
function detectFileType(
  content: string,
  filePath: string
): FileSkeleton['type'] {
  const fileName = filePath.split('/').pop() || '';

  if (filePath.includes('/contexts/') || fileName.includes('Context')) return 'context';
  if (fileName.includes('Provider')) return 'provider';
  if (filePath.includes('/app/') && !fileName.startsWith('_')) return 'screen';
  if (filePath.includes('/hooks/') || fileName.startsWith('use')) return 'hook';
  if (filePath.includes('/types/') || /^(export\s+)?(type|interface)\s+/m.test(content)) {
    if (content.match(/^(export\s+)?(type|interface)\s+/gm)?.length || 0 > 3) return 'types';
  }
  if (/function\s+\w+.*\(.*\).*{?\s*(return\s+[<(]|=>)/m.test(content)) return 'component';

  return 'utility';
}

// Parse imports
function parseImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const namedImports = match[1];
    const defaultImport = match[2];
    const source = match[3];

    const importList: string[] = [];
    if (defaultImport) importList.push(defaultImport);
    if (namedImports) {
      importList.push(
        ...namedImports
          .split(',')
          .map((i) => i.trim().split(' as ')[0].trim())
          .filter(Boolean)
      );
    }

    imports.push({ source, imports: importList });
  }

  return imports;
}

// Parse exports
function parseExports(content: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Export default function/const
    let match = line.match(/^export\s+default\s+function\s+(\w+)/);
    if (match) {
      const name = match[1];
      const kind = name.startsWith('use') ? 'hook' : name[0] === name[0].toUpperCase() ? 'component' : 'function';
      exports.push({ name, kind, line: lineNum, isDefault: true });
      continue;
    }

    // Export function
    match = line.match(/^export\s+(?:async\s+)?function\s+(\w+)\s*(<[^>]*>)?\s*\(([^)]*)\)/);
    if (match) {
      const name = match[1];
      const generics = match[2] || '';
      const params = match[3];
      const kind = name.startsWith('use') ? 'hook' : name[0] === name[0].toUpperCase() ? 'component' : 'function';
      exports.push({ name, kind, signature: `${generics}(${params})`, line: lineNum });
      continue;
    }

    // Export const (arrow function or value)
    match = line.match(/^export\s+const\s+(\w+)\s*(?::\s*([^=]+))?\s*=/);
    if (match) {
      const name = match[1];
      const typeAnnotation = match[2]?.trim();
      let kind: ExportInfo['kind'] = 'const';

      if (name.startsWith('use')) kind = 'hook';
      else if (name[0] === name[0].toUpperCase() && /React|FC|Component/.test(typeAnnotation || '')) kind = 'component';
      else if (name[0] === name[0].toUpperCase() && lines[i + 1]?.includes('=>')) kind = 'component';

      exports.push({ name, kind, signature: typeAnnotation, line: lineNum });
      continue;
    }

    // Export type
    match = line.match(/^export\s+type\s+(\w+)/);
    if (match) {
      exports.push({ name: match[1], kind: 'type', line: lineNum });
      continue;
    }

    // Export interface
    match = line.match(/^export\s+interface\s+(\w+)/);
    if (match) {
      exports.push({ name: match[1], kind: 'interface', line: lineNum });
      continue;
    }

    // Export class
    match = line.match(/^export\s+(?:default\s+)?class\s+(\w+)/);
    if (match) {
      exports.push({ name: match[1], kind: 'class', line: lineNum, isDefault: line.includes('default') });
      continue;
    }

    // Default export at end
    match = line.match(/^export\s+default\s+(\w+)/);
    if (match && !line.includes('function') && !line.includes('class')) {
      const existing = exports.find((e) => e.name === match![1]);
      if (existing) existing.isDefault = true;
      else exports.push({ name: match[1], kind: 'const', line: lineNum, isDefault: true });
    }
  }

  return exports;
}

// Parse component props from interface/type
function parseProps(content: string, componentName: string): PropInfo[] {
  const propsPattern = new RegExp(
    `(?:interface|type)\\s+${componentName}Props\\s*=?\\s*{([^}]+)}`,
    's'
  );
  const match = content.match(propsPattern);
  if (!match) return [];

  const propsBlock = match[1];
  const props: PropInfo[] = [];

  const propLines = propsBlock.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
  for (const line of propLines) {
    const propMatch = line.match(/(\w+)(\?)?:\s*(.+?);?\s*$/);
    if (propMatch) {
      props.push({
        name: propMatch[1],
        type: propMatch[3].trim().replace(/;$/, ''),
        optional: !!propMatch[2],
      });
    }
  }

  return props;
}

// Parse hooks used in component
function parseUsedHooks(content: string): string[] {
  const hooks: Set<string> = new Set();
  const hookPattern = /\buse\w+\s*\(/g;

  let match;
  while ((match = hookPattern.exec(content)) !== null) {
    const hookName = match[0].replace(/\s*\($/, '');
    hooks.add(hookName);
  }

  return Array.from(hooks);
}

// Parse hook return type
function parseHookReturn(content: string, hookName: string): HookReturn {
  const returns: HookReturn = {};

  // Look for return statement with object
  const returnPattern = /return\s*{([^}]+)}/s;
  const match = content.match(returnPattern);

  if (match) {
    const returnBlock = match[1];
    const items = returnBlock.split(',').map((i) => i.trim()).filter(Boolean);

    for (const item of items) {
      const parts = item.split(':').map((p) => p.trim());
      const name = parts[0];
      if (name && !name.includes('(')) {
        returns[name] = 'inferred';
      }
    }
  }

  return returns;
}

// Parse child components used
function parseChildComponents(content: string): string[] {
  const children: Set<string> = new Set();
  const componentPattern = /<([A-Z]\w+)/g;

  let match;
  while ((match = componentPattern.exec(content)) !== null) {
    children.add(match[1]);
  }

  return Array.from(children);
}

// Main skeleton generator
export function generateSkeleton(filePath: string): FileSkeleton {
  const content = readFile(filePath);
  const lines = content.split('\n');
  const fileType = detectFileType(content, filePath);

  const skeleton: FileSkeleton = {
    file: filePath,
    type: fileType,
    exports: parseExports(content),
    imports: parseImports(content),
    lineCount: lines.length,
  };

  // Add component-specific info
  if (fileType === 'component' || fileType === 'screen' || fileType === 'provider') {
    const mainExport = skeleton.exports.find((e) => e.isDefault || e.kind === 'component');
    if (mainExport) {
      skeleton.component = {
        name: mainExport.name,
        props: parseProps(content, mainExport.name),
        hooks: parseUsedHooks(content),
        children: parseChildComponents(content),
      };
    }
  }

  // Add hook-specific info
  if (fileType === 'hook') {
    const hookExport = skeleton.exports.find((e) => e.kind === 'hook');
    if (hookExport) {
      skeleton.hook = {
        name: hookExport.name,
        returns: parseHookReturn(content, hookExport.name),
        dependencies: parseUsedHooks(content).filter((h) => h !== hookExport.name),
      };
    }
  }

  return skeleton;
}

// Format skeleton as readable text
export function formatSkeleton(skeleton: FileSkeleton): string {
  const lines: string[] = [];

  lines.push(`# ${skeleton.file}`);
  lines.push(`Type: ${skeleton.type} | Lines: ${skeleton.lineCount}`);
  lines.push('');

  if (skeleton.imports.length > 0) {
    lines.push('## Imports');
    for (const imp of skeleton.imports) {
      lines.push(`- ${imp.source}: ${imp.imports.join(', ')}`);
    }
    lines.push('');
  }

  if (skeleton.exports.length > 0) {
    lines.push('## Exports');
    for (const exp of skeleton.exports) {
      const defaultMark = exp.isDefault ? ' (default)' : '';
      const sig = exp.signature ? `: ${exp.signature}` : '';
      lines.push(`- ${exp.kind} **${exp.name}**${sig}${defaultMark} [line ${exp.line}]`);
    }
    lines.push('');
  }

  if (skeleton.component) {
    lines.push('## Component Details');
    lines.push(`Name: ${skeleton.component.name}`);
    if (skeleton.component.props.length > 0) {
      lines.push('Props:');
      for (const prop of skeleton.component.props) {
        const opt = prop.optional ? '?' : '';
        lines.push(`  - ${prop.name}${opt}: ${prop.type}`);
      }
    }
    if (skeleton.component.hooks.length > 0) {
      lines.push(`Hooks: ${skeleton.component.hooks.join(', ')}`);
    }
    if (skeleton.component.children.length > 0) {
      lines.push(`Children: ${skeleton.component.children.join(', ')}`);
    }
    lines.push('');
  }

  if (skeleton.hook) {
    lines.push('## Hook Details');
    lines.push(`Name: ${skeleton.hook.name}`);
    if (Object.keys(skeleton.hook.returns).length > 0) {
      lines.push('Returns:');
      for (const [key, type] of Object.entries(skeleton.hook.returns)) {
        lines.push(`  - ${key}: ${type}`);
      }
    }
    if (skeleton.hook.dependencies.length > 0) {
      lines.push(`Uses: ${skeleton.hook.dependencies.join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
