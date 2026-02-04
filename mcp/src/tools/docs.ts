import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDocsPath } from '../utils/paths.js';
import { readFile, fileExists, listFiles, readJsonFile } from '../utils/files.js';
import { basename } from 'path';

// Tool definitions
export const docsTools: Tool[] = [
  {
    name: 'list_docs',
    description: 'List all available documentation files with their titles and key files',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_doc',
    description: 'Get the full content of a specific documentation file',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Doc ID (e.g., "04-parsing", "01-auth") or filename',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'search_docs',
    description: 'Search across all documentation for a query. Returns relevant docs with snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "authentication", "how to add input pattern")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 3)',
        },
      },
      required: ['query'],
    },
  },
];

// Meta interface
interface DocMeta {
  id: string;
  title: string;
  file: string;
  keywords: string[];
  keyFiles: string[];
  relatedDocs: string[];
}

interface MetaFile {
  docs: DocMeta[];
  areas: Record<string, string[]>;
}

function loadMeta(): MetaFile | null {
  const metaPath = getDocsPath('_meta.json');
  if (!fileExists(metaPath)) return null;
  return readJsonFile<MetaFile>(metaPath);
}

function extractFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatterStr = match[1];
  const body = match[2];

  // Simple YAML-like parsing
  const frontmatter: Record<string, any> = {};
  const lines = frontmatterStr.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();

      // Handle arrays
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1);
        frontmatter[key] = value.split(',').map((v) => v.trim().replace(/['"]/g, ''));
      } else {
        frontmatter[key] = value.replace(/['"]/g, '');
      }
    }
  }

  return { frontmatter, body };
}

// Tool handlers
export async function handleDocsTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (name) {
    case 'list_docs':
      return listDocs();
    case 'get_doc':
      return getDoc(args.id as string);
    case 'search_docs':
      return searchDocs(args.query as string, (args.limit as number) || 3);
    default:
      throw new Error(`Unknown docs tool: ${name}`);
  }
}

async function listDocs() {
  const meta = loadMeta();

  if (meta) {
    // Use meta file if available
    const listing = meta.docs
      .map((doc) => `- **${doc.id}**: ${doc.title}\n  Key files: ${doc.keyFiles.join(', ')}`)
      .join('\n');

    return {
      content: [{ type: 'text', text: `# Available Documentation\n\n${listing}` }],
    };
  }

  // Fallback: scan directory
  const files = listFiles(getDocsPath(), '.md');
  const docs = files
    .map((file) => {
      const name = basename(file, '.md');
      const content = readFile(file);
      const { frontmatter } = extractFrontmatter(content);
      const title = frontmatter.title || name;
      const keyFiles = frontmatter.keyFiles || [];

      return `- **${name}**: ${title}${keyFiles.length ? `\n  Key files: ${keyFiles.join(', ')}` : ''}`;
    })
    .join('\n');

  return {
    content: [{ type: 'text', text: `# Available Documentation\n\n${docs}` }],
  };
}

async function getDoc(id: string) {
  // Try direct path first
  let docPath = getDocsPath(`${id}.md`);

  if (!fileExists(docPath)) {
    // Try with .md extension already included
    docPath = getDocsPath(id);
  }

  if (!fileExists(docPath)) {
    // Search by ID in meta
    const meta = loadMeta();
    if (meta) {
      const doc = meta.docs.find((d) => d.id === id);
      if (doc) {
        docPath = getDocsPath(doc.file);
      }
    }
  }

  if (!fileExists(docPath)) {
    return {
      content: [{ type: 'text', text: `Document not found: ${id}` }],
    };
  }

  const content = readFile(docPath);
  return {
    content: [{ type: 'text', text: content }],
  };
}

async function searchDocs(query: string, limit: number) {
  const files = listFiles(getDocsPath(), '.md');
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/);

  const results: Array<{ file: string; score: number; snippet: string; title: string }> = [];

  for (const file of files) {
    const content = readFile(file);
    const contentLower = content.toLowerCase();
    const { frontmatter, body } = extractFrontmatter(content);

    // Score based on matches
    let score = 0;
    const name = basename(file, '.md');
    const title = frontmatter.title || name;
    const keywords: string[] = frontmatter.keywords || [];

    // Title/keyword matches worth more
    for (const term of queryTerms) {
      if (title.toLowerCase().includes(term)) score += 10;
      if (keywords.some((k) => k.toLowerCase().includes(term))) score += 8;
      if (name.includes(term)) score += 5;

      // Count content matches
      const regex = new RegExp(term, 'gi');
      const matches = contentLower.match(regex);
      if (matches) score += matches.length;
    }

    if (score > 0) {
      // Find best snippet
      let snippet = '';
      for (const term of queryTerms) {
        const index = contentLower.indexOf(term);
        if (index !== -1) {
          const start = Math.max(0, index - 50);
          const end = Math.min(content.length, index + 100);
          snippet = '...' + content.slice(start, end).replace(/\n/g, ' ') + '...';
          break;
        }
      }

      results.push({ file: name, score, snippet, title });
    }
  }

  // Sort by score and limit
  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, limit);

  if (topResults.length === 0) {
    return {
      content: [{ type: 'text', text: `No documentation found for: ${query}` }],
    };
  }

  const output = topResults
    .map((r, i) => `${i + 1}. **${r.file}** - ${r.title}\n   ${r.snippet}`)
    .join('\n\n');

  return {
    content: [{ type: 'text', text: `# Search Results for "${query}"\n\n${output}` }],
  };
}
