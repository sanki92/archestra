import fs from "node:fs/promises";
import path from "node:path";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { SAMPLE_FLOW } from "./openflow.js";

const FLOW_EDITOR_URI = "ui://windmill/flow-editor.html";

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "..", "dist")
  : import.meta.dirname;

export function createServer(): McpServer {
  const server = new McpServer({
    name: "windmill",
    version: "0.0.0",
  });

  registerAppTool(
    server,
    "get_flow",
    {
      title: "Get flow",
      description:
        "Load a Windmill flow by its workspace path and show it as an editable node graph.",
      inputSchema: {
        path: z.string().describe("Flow path, e.g. f/folder/my_flow"),
      },
      outputSchema: { path: z.string(), flow: z.unknown() },
      _meta: { ui: { resourceUri: FLOW_EDITOR_URI } },
    },
    ({ path: flowPath }): CallToolResult => {
      const flow = SAMPLE_FLOW;
      return {
        content: [
          {
            type: "text",
            text: `Flow "${flow.summary}" with ${flow.value.modules.length} steps`,
          },
        ],
        structuredContent: { path: flowPath, flow },
      };
    },
  );

  registerAppResource(
    server,
    "Windmill flow editor",
    FLOW_EDITOR_URI,
    { description: "Interactive node graph for a Windmill flow" },
    async () => ({
      contents: [
        {
          uri: FLOW_EDITOR_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await readFlowEditorHtml(),
        },
      ],
    }),
  );

  return server;
}

async function readFlowEditorHtml(): Promise<string> {
  try {
    return await fs.readFile(path.join(DIST_DIR, "flow-editor.html"), "utf-8");
  } catch (error) {
    if (
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new Error("Flow editor UI bundle not found. Run: npm run build:ui");
    }
    throw error;
  }
}
