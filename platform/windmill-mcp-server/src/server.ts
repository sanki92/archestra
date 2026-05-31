import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { SAMPLE_FLOW } from "./openflow.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "windmill",
    version: "0.0.0",
  });

  server.registerTool(
    "get_flow",
    {
      title: "Get flow",
      description: "Load a Windmill flow by its workspace path.",
      inputSchema: {
        path: z.string().describe("Flow path, e.g. f/folder/my_flow"),
      },
      outputSchema: { path: z.string(), flow: z.unknown() },
    },
    ({ path }): CallToolResult => {
      const flow = SAMPLE_FLOW;
      return {
        content: [
          {
            type: "text",
            text: `Flow "${flow.summary}" with ${flow.value.modules.length} steps`,
          },
        ],
        structuredContent: { path, flow },
      };
    },
  );

  return server;
}
