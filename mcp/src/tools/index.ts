import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDocsPath, getCodebasePath } from '../utils/paths.js';
import { readFile, fileExists, listFiles, readJsonFile, getFilesRecursive } from '../utils/files.js';
import { generateSkeleton, formatSkeleton } from '../parsers/typescript.js';
import { basename, extname, join } from 'path';
import { readdirSync, statSync } from 'fs';

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const tools: Tool[] = [
  {
    name: 'guide',
    description: 'Get implementation guide for a task. Returns relevant doc + file skeletons + patterns. START HERE.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'What you want to implement' },
      },
      required: ['task'],
    },
  },
  {
    name: 'skeleton',
    description: 'Get skeleton of a TypeScript/TSX file (exports, imports, structure).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (e.g., "lib/api.ts")' },
      },
      required: ['path'],
    },
  },
  {
    name: 'map',
    description: 'Get directory structure with file types and line counts.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path (e.g., "components/modals")' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search',
    description: 'Search documentation for a query.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query' },
      },
      required: ['q'],
    },
  },
  {
    name: 'area',
    description: 'Deep analysis of an app area.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          enum: ['auth', 'workout', 'parsing', 'storage', 'api', 'components', 'hooks', 'modals', 'onboarding', 'settings', 'pr-tracking', 'templates', 'theming'],
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'related',
    description: 'Find files related to a component/hook/feature.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Component, hook, or feature name' },
      },
      required: ['name'],
    },
  },
];

// ============================================================================
// AREA MAPPINGS
// ============================================================================

const AREAS: Record<string, { docs: string[]; files: string[]; keywords: string[] }> = {
  auth: {
    docs: ['01-auth'],
    files: ['lib/auth.ts', 'lib/authLock.ts', 'components/AuthProvider.tsx'],
    keywords: ['auth', 'login', 'session', 'jwt', 'biometric'],
  },
  workout: {
    docs: ['03-workout-flow'],
    files: ['app/(tabs)/index.tsx', 'hooks/useWorkoutSession.ts', 'components/workout/WorkoutTable.tsx'],
    keywords: ['workout', 'exercise', 'set', 'rep', 'LogRow'],
  },
  parsing: {
    docs: ['04-parsing'],
    files: ['lib/structuredGate.ts'],
    keywords: ['parse', 'regex', 'pattern', 'input', 'gate'],
  },
  storage: {
    docs: ['05-storage'],
    files: ['lib/workoutStorage.ts', 'lib/chatStorage.ts'],
    keywords: ['storage', 'save', 'load', 'AsyncStorage'],
  },
  api: {
    docs: ['06-api'],
    files: ['lib/api.ts', 'lib/supabase.ts'],
    keywords: ['api', 'fetch', 'endpoint', 'supabase'],
  },
  components: {
    docs: ['07-components'],
    files: ['components/ui/Header.tsx', 'components/ui/themed-text.tsx'],
    keywords: ['component', 'ui', 'button', 'text'],
  },
  hooks: {
    docs: ['08-hooks'],
    files: ['hooks/useWorkoutSession.ts', 'hooks/useRowActions.ts', 'hooks/useCoachLogic.ts'],
    keywords: ['hook', 'use'],
  },
  modals: {
    docs: ['09-modals'],
    files: ['components/modals/EditSetModal.tsx', 'components/modals/CoachModal.tsx'],
    keywords: ['modal', 'dialog', 'popup'],
  },
  onboarding: {
    docs: ['10-onboarding'],
    files: ['app/onboarding/index.tsx', 'components/onboarding/QuizContainer.tsx'],
    keywords: ['onboarding', 'quiz', 'setup'],
  },
  settings: {
    docs: ['11-settings'],
    files: ['app/settings/index.tsx', 'app/settings/profile.tsx'],
    keywords: ['settings', 'profile', 'preference'],
  },
  'pr-tracking': {
    docs: ['12-pr-tracking'],
    files: ['lib/prTracking.ts', 'components/celebration/PRCelebration.tsx'],
    keywords: ['pr', 'personal record', 'celebration', 'e1rm'],
  },
  templates: {
    docs: ['13-templates'],
    files: ['lib/profile.ts', 'app/settings/templates.tsx'],
    keywords: ['template', 'routine', 'preset'],
  },
  theming: {
    docs: ['14-theming'],
    files: ['constants/theme.ts', 'hooks/use-theme-color.ts', 'components/ThemeProvider.tsx'],
    keywords: ['theme', 'color', 'dark', 'light'],
  },
};

// ============================================================================
// TOOL HANDLER
// ============================================================================

export async function handleTool(name: string, args: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    switch (name) {
      case 'guide': return guide(args.task as string);
      case 'skeleton': return skeleton(args.path as string);
      case 'map': return map(args.path as string);
      case 'search': return search(args.q as string);
      case 'area': return area(args.name as string);
      case 'related': return related(args.name as string);
      default: return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Unknown error');
  }
}

// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================

function ok(text: string) {
  return { content: [{ type: 'text', text }] };
}

function err(text: string) {
  return { content: [{ type: 'text', text: `Error: ${text}` }], isError: true };
}

function guide(task: string) {
  const taskLower = task.toLowerCase();
  const out: string[] = [`# Guide: ${task}\n`];

  // Find matching areas
  const matches = Object.entries(AREAS)
    .map(([name, data]) => ({
      name,
      score: data.keywords.filter((k) => taskLower.includes(k)).length,
      ...data,
    }))
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  if (matches.length === 0) {
    out.push('No specific area matched. Try `search` tool or check docs/README.md');
    return ok(out.join('\n'));
  }

  for (const match of matches) {
    // Add doc
    for (const docId of match.docs) {
      const path = getDocsPath(`${docId}.md`);
      if (fileExists(path)) {
        out.push(`## Doc: ${docId}\n`);
        out.push(readFile(path));
        out.push('\n---\n');
      }
    }

    // Add skeletons
    out.push(`## Key Files\n`);
    for (const file of match.files.slice(0, 3)) {
      const path = getCodebasePath(file);
      if (fileExists(path)) {
        try {
          const skel = generateSkeleton(path);
          skel.file = file;
          out.push(formatSkeleton(skel));
          out.push('---\n');
        } catch {
          out.push(`- ${file} (parse error)\n`);
        }
      }
    }
  }

  return ok(out.join('\n'));
}

function skeleton(path: string) {
  const full = getCodebasePath(path);
  if (!fileExists(full)) return err(`Not found: ${path}`);

  const ext = extname(full);
  if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    const lines = readFile(full).split('\n').length;
    return ok(`# ${path}\nType: ${ext.slice(1)} | Lines: ${lines}\n\n(Skeleton only supports TS/JS)`);
  }

  const skel = generateSkeleton(full);
  skel.file = path;
  return ok(formatSkeleton(skel));
}

function map(path: string) {
  const full = getCodebasePath(path);
  if (!fileExists(full)) return err(`Not found: ${path}`);

  const tree = buildTree(full, 1, 3);
  const lines = formatTree(tree);
  return ok(`# ${path}/\n\n\`\`\`\n${lines.join('\n')}\n\`\`\``);
}

function search(q: string) {
  const files = listFiles(getDocsPath(), '.md');
  const qLower = q.toLowerCase();
  const terms = qLower.split(/\s+/);

  const results = files
    .map((file) => {
      const content = readFile(file);
      const name = basename(file, '.md');
      let score = 0;

      for (const term of terms) {
        if (name.includes(term)) score += 10;
        const matches = content.toLowerCase().match(new RegExp(term, 'g'));
        if (matches) score += matches.length;
      }

      // Get snippet
      let snippet = '';
      const idx = content.toLowerCase().indexOf(terms[0]);
      if (idx !== -1) {
        snippet = content.slice(Math.max(0, idx - 30), idx + 80).replace(/\n/g, ' ');
      }

      return { name, score, snippet };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (results.length === 0) return ok(`No results for: ${q}`);

  const out = results.map((r, i) => `${i + 1}. **${r.name}** — ...${r.snippet}...`).join('\n\n');
  return ok(`# Search: ${q}\n\n${out}`);
}

function area(name: string) {
  const data = AREAS[name];
  if (!data) return err(`Unknown area. Valid: ${Object.keys(AREAS).join(', ')}`);

  const out: string[] = [`# Area: ${name}\n`];

  // Docs (truncated)
  for (const docId of data.docs) {
    const path = getDocsPath(`${docId}.md`);
    if (fileExists(path)) {
      const content = readFile(path).split('\n').slice(0, 60).join('\n');
      out.push(`## ${docId}\n${content}\n...(use resource docs://${docId} for full)\n`);
    }
  }

  // Skeletons
  out.push('## Files\n');
  for (const file of data.files) {
    const path = getCodebasePath(file);
    if (fileExists(path)) {
      try {
        const skel = generateSkeleton(path);
        skel.file = file;
        out.push(formatSkeleton(skel));
      } catch {
        out.push(`- ${file}\n`);
      }
    }
  }

  return ok(out.join('\n'));
}

function related(name: string) {
  const nameLower = name.toLowerCase();
  const files = getFilesRecursive(getCodebasePath(), ['.ts', '.tsx']);

  const matches = files
    .filter((f) => !f.path.includes('node_modules') && !f.path.includes('/dist/'))
    .map((f) => {
      const rel = f.path.replace(getCodebasePath() + '/', '');
      const content = readFile(f.path);

      if (f.name.toLowerCase().includes(nameLower)) return { path: rel, reason: 'filename', lines: f.lines };
      if (content.includes(name)) return { path: rel, reason: 'reference', lines: f.lines };
      return null;
    })
    .filter(Boolean) as Array<{ path: string; reason: string; lines: number }>;

  if (matches.length === 0) return ok(`No files related to: ${name}`);

  const out = matches
    .slice(0, 15)
    .map((m) => `- **${m.path}** (${m.reason}, ${m.lines} lines)`)
    .join('\n');

  return ok(`# Related to: ${name}\n\n${out}`);
}

// ============================================================================
// HELPERS
// ============================================================================

interface TreeNode {
  name: string;
  type: 'file' | 'dir';
  lines?: number;
  children?: TreeNode[];
}

function buildTree(dir: string, depth: number, max: number): TreeNode[] {
  if (depth > max || !fileExists(dir)) return [];

  return readdirSync(dir)
    .filter((n) => !n.startsWith('.') && n !== 'node_modules' && n !== 'dist')
    .map((name) => {
      const full = join(dir, name);
      const stat = statSync(full);

      if (stat.isDirectory()) {
        return { name, type: 'dir' as const, children: buildTree(full, depth + 1, max) };
      }
      const ext = extname(name);
      if (['.ts', '.tsx', '.js', '.jsx', '.json', '.md'].includes(ext)) {
        return { name, type: 'file' as const, lines: readFile(full).split('\n').length };
      }
      return null;
    })
    .filter(Boolean) as TreeNode[];
}

function formatTree(nodes: TreeNode[], prefix = ''): string[] {
  const lines: string[] = [];
  nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const last = i === nodes.length - 1;
    const marker = last ? '└── ' : '├── ';
    const info = node.type === 'file' && node.lines ? ` (${node.lines})` : '';

    lines.push(`${prefix}${marker}${node.name}${node.type === 'dir' ? '/' : ''}${info}`);

    if (node.children?.length) {
      lines.push(...formatTree(node.children, prefix + (last ? '    ' : '│   ')));
    }
  }
  return lines;
}
