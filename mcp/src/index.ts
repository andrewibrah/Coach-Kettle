#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { tools, handleTool } from './tools/index.js';
import { resources, readResource } from './resources.js';

const server = new Server(
  { name: 'coach-kettle-mcp', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

// Tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (req) => handleTool(req.params.name, req.params.arguments ?? {}));

// Resources
server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources }));
server.setRequestHandler(ReadResourceRequestSchema, async (req) => readResource(req.params.uri));

// Run
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Coach Kettle MCP running');
