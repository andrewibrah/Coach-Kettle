import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { docsTools, handleDocsTool } from './tools/docs.js';
import { skeletonTools, handleSkeletonTool } from './tools/skeleton.js';
import { analysisTools, handleAnalysisTool } from './tools/analysis.js';

export function createServer() {
  const server = new Server(
    {
      name: 'coach-kettle-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [...docsTools, ...skeletonTools, ...analysisTools],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // Documentation tools
      if (['list_docs', 'get_doc', 'search_docs'].includes(name)) {
        return await handleDocsTool(name, args);
      }

      // Skeleton tools
      if (['get_file_skeleton', 'get_directory_map'].includes(name)) {
        return await handleSkeletonTool(name, args);
      }

      // Analysis tools
      if (['get_implementation_guide', 'analyze_area', 'find_related_files'].includes(name)) {
        return await handleAnalysisTool(name, args);
      }

      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return {
    run: async () => {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error('Coach Kettle MCP server running on stdio');
    },
  };
}
