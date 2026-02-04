import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDocsPath, getCodebasePath } from '../utils/paths.js';
import { readFile, fileExists, listFiles, readJsonFile, getFilesRecursive } from '../utils/files.js';
import { generateSkeleton, formatSkeleton } from '../parsers/typescript.js';
import { basename } from 'path';

export const analysisTools: Tool[] = [
  {
    name: 'get_implementation_guide',
    description:
      'Get a complete implementation guide for a task. Returns relevant documentation, file skeletons for key files, and patterns to follow. This is the recommended starting point for any task.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Description of what you want to implement (e.g., "add new input pattern for pause reps", "fix auth session timeout")',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'analyze_area',
    description:
      'Deep analysis of a specific area of the app. Returns all relevant docs, file maps, data flow, and common patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        area: {
          type: 'string',
          enum: ['auth', 'workout', 'parsing', 'storage', 'api', 'components', 'hooks', 'modals', 'onboarding', 'settings', 'pr-tracking', 'templates', 'theming'],
          description: 'Area of the app to analyze',
        },
      },
      required: ['area'],
    },
  },
  {
    name: 'find_related_files',
    description:
      'Find all files related to a specific component, hook, or feature. Useful for understanding dependencies.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of component, hook, or feature to find related files for (e.g., "WorkoutTable", "useAuth", "PR tracking")',
        },
      },
      required: ['name'],
    },
  },
];

// Area to doc and file mappings
const areaMappings: Record<string, { docs: string[]; keyFiles: string[]; keywords: string[] }> = {
  auth: {
    docs: ['01-auth'],
    keyFiles: ['lib/auth.ts', 'lib/authLock.ts', 'components/AuthProvider.tsx', 'components/AuthLockProvider.tsx', 'lib/biometrics.ts'],
    keywords: ['auth', 'login', 'session', 'jwt', 'token', 'biometric', 'sign'],
  },
  workout: {
    docs: ['03-workout-flow'],
    keyFiles: ['app/(tabs)/index.tsx', 'hooks/useWorkoutSession.ts', 'hooks/useRowActions.ts', 'components/workout/WorkoutTable.tsx', 'components/workout/WorkoutBottomBar.tsx'],
    keywords: ['workout', 'exercise', 'set', 'rep', 'weight', 'LogRow'],
  },
  parsing: {
    docs: ['04-parsing'],
    keyFiles: ['lib/structuredGate.ts'],
    keywords: ['parse', 'input', 'regex', 'pattern', 'gate', 'NLP'],
  },
  storage: {
    docs: ['05-storage'],
    keyFiles: ['lib/workoutStorage.ts', 'lib/chatStorage.ts'],
    keywords: ['storage', 'AsyncStorage', 'save', 'load', 'persist'],
  },
  api: {
    docs: ['06-api', '15-edge-functions'],
    keyFiles: ['lib/api.ts', 'lib/supabase.ts'],
    keywords: ['api', 'fetch', 'endpoint', 'supabase', 'edge function'],
  },
  components: {
    docs: ['07-components'],
    keyFiles: ['components/ui/Header.tsx', 'components/ui/themed-text.tsx', 'components/ui/themed-view.tsx'],
    keywords: ['component', 'ui', 'button', 'text', 'view'],
  },
  hooks: {
    docs: ['08-hooks'],
    keyFiles: ['hooks/useWorkoutSession.ts', 'hooks/useRowActions.ts', 'hooks/useCoachLogic.ts', 'hooks/useCellEditing.ts'],
    keywords: ['hook', 'use'],
  },
  modals: {
    docs: ['09-modals'],
    keyFiles: ['components/modals/EditSetModal.tsx', 'components/modals/CoachModal.tsx', 'components/modals/MenuModal.tsx'],
    keywords: ['modal', 'dialog', 'popup'],
  },
  onboarding: {
    docs: ['10-onboarding'],
    keyFiles: ['app/onboarding/index.tsx', 'components/onboarding/QuizContainer.tsx'],
    keywords: ['onboarding', 'quiz', 'setup', 'welcome'],
  },
  settings: {
    docs: ['11-settings'],
    keyFiles: ['app/settings/index.tsx', 'app/settings/profile.tsx', 'app/settings/templates.tsx'],
    keywords: ['settings', 'profile', 'preference'],
  },
  'pr-tracking': {
    docs: ['12-pr-tracking'],
    keyFiles: ['lib/prTracking.ts', 'components/celebration/PRCelebration.tsx', 'contexts/PRCelebrationContext.tsx'],
    keywords: ['pr', 'personal record', 'celebration', 'e1rm', 'max'],
  },
  templates: {
    docs: ['13-templates'],
    keyFiles: ['lib/profile.ts', 'app/settings/templates.tsx'],
    keywords: ['template', 'routine', 'preset'],
  },
  theming: {
    docs: ['14-theming'],
    keyFiles: ['constants/theme.ts', 'hooks/use-theme-color.ts', 'components/ThemeProvider.tsx'],
    keywords: ['theme', 'color', 'dark', 'light', 'style'],
  },
};

export async function handleAnalysisTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (name) {
    case 'get_implementation_guide':
      return getImplementationGuide(args.task as string);
    case 'analyze_area':
      return analyzeArea(args.area as string);
    case 'find_related_files':
      return findRelatedFiles(args.name as string);
    default:
      throw new Error(`Unknown analysis tool: ${name}`);
  }
}

async function getImplementationGuide(task: string) {
  const taskLower = task.toLowerCase();
  const output: string[] = [];

  output.push(`# Implementation Guide: ${task}\n`);

  // Find relevant areas based on keywords
  const relevantAreas: string[] = [];
  for (const [area, mapping] of Object.entries(areaMappings)) {
    const matchScore = mapping.keywords.filter((kw) => taskLower.includes(kw)).length;
    if (matchScore > 0) {
      relevantAreas.push(area);
    }
  }

  if (relevantAreas.length === 0) {
    // Default to searching docs
    output.push('## No specific area matched. Searching documentation...\n');

    const docFiles = listFiles(getDocsPath(), '.md');
    for (const file of docFiles) {
      const content = readFile(file);
      if (content.toLowerCase().includes(taskLower.split(' ')[0])) {
        const name = basename(file, '.md');
        output.push(`Possibly relevant: ${name}`);
      }
    }
  } else {
    // Get docs and skeletons for relevant areas
    const processedDocs = new Set<string>();
    const processedFiles = new Set<string>();

    for (const area of relevantAreas.slice(0, 2)) {
      const mapping = areaMappings[area];

      // Add docs
      for (const docId of mapping.docs) {
        if (processedDocs.has(docId)) continue;
        processedDocs.add(docId);

        const docPath = getDocsPath(`${docId}.md`);
        if (fileExists(docPath)) {
          const content = readFile(docPath);
          output.push(`## Documentation: ${docId}\n`);
          output.push(content);
          output.push('\n---\n');
        }
      }

      // Add skeletons for key files
      output.push(`## Key Files for ${area}\n`);
      for (const filePath of mapping.keyFiles.slice(0, 3)) {
        if (processedFiles.has(filePath)) continue;
        processedFiles.add(filePath);

        const fullPath = getCodebasePath(filePath);
        if (fileExists(fullPath)) {
          try {
            const skeleton = generateSkeleton(fullPath);
            skeleton.file = filePath;
            output.push(formatSkeleton(skeleton));
            output.push('\n---\n');
          } catch {
            output.push(`- ${filePath} (could not parse)\n`);
          }
        }
      }
    }

    // Add implementation hints
    output.push('## Implementation Hints\n');
    output.push('1. Read the documentation above to understand the patterns');
    output.push('2. Look at the exported functions/components in the key files');
    output.push('3. Follow existing code patterns in the codebase');
    output.push('4. Use `@/` imports and `useThemeColor()` for colors');
  }

  return {
    content: [{ type: 'text', text: output.join('\n') }],
  };
}

async function analyzeArea(area: string) {
  const mapping = areaMappings[area];
  if (!mapping) {
    return {
      content: [{ type: 'text', text: `Unknown area: ${area}. Valid areas: ${Object.keys(areaMappings).join(', ')}` }],
    };
  }

  const output: string[] = [];
  output.push(`# Analysis: ${area}\n`);

  // Documentation
  output.push('## Documentation\n');
  for (const docId of mapping.docs) {
    const docPath = getDocsPath(`${docId}.md`);
    if (fileExists(docPath)) {
      const content = readFile(docPath);
      // Get first ~50 lines as summary
      const lines = content.split('\n').slice(0, 50);
      output.push(`### ${docId}\n`);
      output.push(lines.join('\n'));
      output.push('\n...(truncated, use get_doc for full content)\n');
    }
  }

  // File skeletons
  output.push('## Key Files\n');
  for (const filePath of mapping.keyFiles) {
    const fullPath = getCodebasePath(filePath);
    if (fileExists(fullPath)) {
      try {
        const skeleton = generateSkeleton(fullPath);
        skeleton.file = filePath;
        output.push(formatSkeleton(skeleton));
        output.push('---\n');
      } catch {
        output.push(`### ${filePath}\n(Could not parse)\n`);
      }
    }
  }

  // Related keywords
  output.push('## Search Keywords\n');
  output.push(`Use these to find related code: ${mapping.keywords.join(', ')}\n`);

  return {
    content: [{ type: 'text', text: output.join('\n') }],
  };
}

async function findRelatedFiles(name: string) {
  const nameLower = name.toLowerCase();
  const output: string[] = [];
  output.push(`# Files Related to: ${name}\n`);

  const allFiles = getFilesRecursive(getCodebasePath(), ['.ts', '.tsx']);
  const matches: Array<{ path: string; reason: string; lines: number }> = [];

  for (const file of allFiles) {
    const relativePath = file.path.replace(getCodebasePath() + '/', '');

    // Skip node_modules and dist
    if (relativePath.includes('node_modules') || relativePath.includes('dist')) continue;

    // Check filename
    if (file.name.toLowerCase().includes(nameLower)) {
      matches.push({ path: relativePath, reason: 'filename match', lines: file.lines });
      continue;
    }

    // Check file content for imports/references
    try {
      const content = readFile(file.path);
      if (content.toLowerCase().includes(nameLower)) {
        // Determine reason
        let reason = 'contains reference';
        if (content.includes(`import.*${name}`)) reason = 'imports';
        else if (content.includes(`<${name}`)) reason = 'uses component';
        else if (content.includes(`use${name}`)) reason = 'uses hook';

        matches.push({ path: relativePath, reason, lines: file.lines });
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Sort by relevance (filename matches first)
  matches.sort((a, b) => {
    if (a.reason === 'filename match' && b.reason !== 'filename match') return -1;
    if (b.reason === 'filename match' && a.reason !== 'filename match') return 1;
    return 0;
  });

  if (matches.length === 0) {
    output.push('No related files found.');
  } else {
    output.push(`Found ${matches.length} related files:\n`);
    for (const match of matches.slice(0, 20)) {
      output.push(`- **${match.path}** (${match.reason}, ${match.lines} lines)`);
    }
    if (matches.length > 20) {
      output.push(`\n...and ${matches.length - 20} more`);
    }
  }

  return {
    content: [{ type: 'text', text: output.join('\n') }],
  };
}
