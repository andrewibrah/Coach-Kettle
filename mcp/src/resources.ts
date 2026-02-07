import { Resource } from '@modelcontextprotocol/sdk/types.js';
import { getDocsPath } from './utils/paths.js';
import { readFile, fileExists, listFiles } from './utils/files.js';
import { basename } from 'path';

// Build resources list from docs directory
export function getResources(): Resource[] {
  const docFiles = listFiles(getDocsPath(), '.md');

  return docFiles.map((file) => {
    const name = basename(file, '.md');
    return {
      uri: `docs://${name}`,
      name: name,
      description: `Documentation: ${name}`,
      mimeType: 'text/markdown',
    };
  });
}

export const resources = getResources();

export async function readResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  const match = uri.match(/^docs:\/\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }

  const docId = match[1];
  const docPath = getDocsPath(`${docId}.md`);

  if (!fileExists(docPath)) {
    throw new Error(`Document not found: ${docId}`);
  }

  const content = readFile(docPath);

  return {
    contents: [
      {
        uri,
        mimeType: 'text/markdown',
        text: content,
      },
    ],
  };
}
