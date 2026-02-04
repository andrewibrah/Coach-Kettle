import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCodebasePath } from '../utils/paths.js';
import { fileExists, readFile, getFilesRecursive } from '../utils/files.js';
import { generateSkeleton, formatSkeleton } from '../parsers/typescript.js';
import { readdirSync, statSync } from 'fs';
import { join, relative, extname, basename } from 'path';

export const skeletonTools: Tool[] = [
  {
    name: 'get_file_skeleton',
    description:
      'Get a skeleton outline of a TypeScript/TSX file showing exports, imports, and structure without full implementation details. Great for understanding file structure quickly.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to codebase root (e.g., "lib/api.ts", "components/AuthProvider.tsx")',
        },
        includeSource: {
          type: 'boolean',
          description: 'Include the full source code after the skeleton (default: false)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_directory_map',
    description:
      'Get a map of all files in a directory with their types and line counts. Helps understand folder structure.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path relative to codebase root (e.g., "components/modals", "lib")',
        },
        depth: {
          type: 'number',
          description: 'How deep to traverse (default: 2)',
        },
      },
      required: ['path'],
    },
  },
];

export async function handleSkeletonTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (name) {
    case 'get_file_skeleton':
      return getFileSkeleton(args.path as string, args.includeSource as boolean);
    case 'get_directory_map':
      return getDirectoryMap(args.path as string, (args.depth as number) || 2);
    default:
      throw new Error(`Unknown skeleton tool: ${name}`);
  }
}

async function getFileSkeleton(path: string, includeSource?: boolean) {
  const fullPath = getCodebasePath(path);

  if (!fileExists(fullPath)) {
    return {
      content: [{ type: 'text', text: `File not found: ${path}` }],
    };
  }

  const ext = extname(fullPath);
  if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    // For non-JS files, just return basic info
    const content = readFile(fullPath);
    const lines = content.split('\n').length;
    return {
      content: [
        {
          type: 'text',
          text: `# ${path}\nType: ${ext.slice(1)} | Lines: ${lines}\n\n(Skeleton parsing only supports TypeScript/JavaScript files)`,
        },
      ],
    };
  }

  try {
    const skeleton = generateSkeleton(fullPath);
    skeleton.file = path; // Use relative path in output
    let output = formatSkeleton(skeleton);

    if (includeSource) {
      const source = readFile(fullPath);
      output += '\n---\n## Full Source\n```typescript\n' + source + '\n```';
    }

    return {
      content: [{ type: 'text', text: output }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Error parsing ${path}: ${message}` }],
    };
  }
}

interface DirEntry {
  name: string;
  type: 'file' | 'directory';
  fileType?: string;
  lines?: number;
  children?: DirEntry[];
}

function buildDirectoryTree(dirPath: string, currentDepth: number, maxDepth: number): DirEntry[] {
  if (currentDepth > maxDepth) return [];
  if (!fileExists(dirPath)) return [];

  const entries: DirEntry[] = [];

  try {
    const items = readdirSync(dirPath);

    for (const item of items) {
      if (item.startsWith('.') || item === 'node_modules' || item === 'dist') continue;

      const fullPath = join(dirPath, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        const children = buildDirectoryTree(fullPath, currentDepth + 1, maxDepth);
        entries.push({
          name: item,
          type: 'directory',
          children,
        });
      } else if (stat.isFile()) {
        const ext = extname(item);
        if (['.ts', '.tsx', '.js', '.jsx', '.json', '.md'].includes(ext)) {
          const content = readFile(fullPath);
          entries.push({
            name: item,
            type: 'file',
            fileType: ext.slice(1),
            lines: content.split('\n').length,
          });
        }
      }
    }
  } catch (error) {
    // Ignore permission errors
  }

  return entries.sort((a, b) => {
    // Directories first, then files
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function formatTree(entries: DirEntry[], indent: string = ''): string[] {
  const lines: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const prefix = isLast ? '└── ' : '├── ';
    const childIndent = indent + (isLast ? '    ' : '│   ');

    if (entry.type === 'directory') {
      lines.push(`${indent}${prefix}${entry.name}/`);
      if (entry.children && entry.children.length > 0) {
        lines.push(...formatTree(entry.children, childIndent));
      }
    } else {
      const info = entry.lines ? ` (${entry.lines} lines)` : '';
      lines.push(`${indent}${prefix}${entry.name}${info}`);
    }
  }

  return lines;
}

async function getDirectoryMap(path: string, depth: number) {
  const fullPath = getCodebasePath(path);

  if (!fileExists(fullPath)) {
    return {
      content: [{ type: 'text', text: `Directory not found: ${path}` }],
    };
  }

  const tree = buildDirectoryTree(fullPath, 1, depth);
  const formatted = formatTree(tree);

  const output = `# Directory: ${path}\n\n\`\`\`\n${path}/\n${formatted.join('\n')}\n\`\`\``;

  return {
    content: [{ type: 'text', text: output }],
  };
}
