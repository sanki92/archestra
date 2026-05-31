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
import { getWindmillConfig } from "./config.js";
import { SAMPLE_FLOW } from "./openflow.js";
import { WindmillClient } from "./windmill-client.js";

const FLOW_EDITOR_URI = "ui://windmill/flow-editor.html";

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "..", "dist")
  : import.meta.dirname;

export function createServer(): McpServer {
  const server = new McpServer({
    name: "windmill",
    version: "0.0.0",
  });

  const config = getWindmillConfig();

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
    async ({ path: flowPath }): Promise<CallToolResult> => {
      if (!config) {
        return {
          content: [
            {
              type: "text",
              text: `Windmill is not configured; showing sample flow "${SAMPLE_FLOW.summary}"`,
            },
          ],
          structuredContent: { path: flowPath, flow: SAMPLE_FLOW },
        };
      }
      try {
        const flow = await new WindmillClient(config).getFlow(flowPath);
        return {
          content: [
            {
              type: "text",
              text: `Flow "${flow.summary}" with ${flow.value.modules.length} steps`,
            },
          ],
          structuredContent: { path: flowPath, flow },
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Could not load flow "${flowPath}": ${errorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "list_flows",
    {
      title: "List flows",
      description: "List Windmill flows in the configured workspace.",
      inputSchema: {},
      outputSchema: {
        flows: z.array(
          z.object({ path: z.string(), summary: z.string().optional() }),
        ),
      },
    },
    async (): Promise<CallToolResult> => {
      if (!config) {
        return {
          content: [{ type: "text", text: "Windmill is not configured." }],
          structuredContent: { flows: [] },
        };
      }
      try {
        const flows = await new WindmillClient(config).listFlows();
        return {
          content: [{ type: "text", text: `${flows.length} flow(s)` }],
          structuredContent: { flows },
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Could not list flows: ${errorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
