import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { OpenFlow } from "../openflow.js";
import { renderFlow } from "./render.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root element");
}
const host = root as HTMLElement;

const app = new App({ name: "Windmill Flow Editor", version: "0.0.0" });

app.ontoolresult = showResult;
app.onerror = (error) => console.error(error);
app.onhostcontextchanged = applyHostContext;

app
  .connect()
  .then(() => {
    const ctx = app.getHostContext();
    if (ctx) {
      applyHostContext(ctx);
    }
  })
  .catch((error) => {
    console.error(error);
    host.textContent = "Could not connect to Archestra.";
  });

function applyHostContext(ctx: McpUiHostContext): void {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
  }
  if (ctx.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }
  if (ctx.styles?.css?.fonts) {
    applyHostFonts(ctx.styles.css.fonts);
  }
}

function showResult(result: CallToolResult): void {
  const data = result.structuredContent as
    | { path?: string; flow?: OpenFlow }
    | undefined;
  if (!data?.flow) {
    return;
  }
  const view = document.createElement("div");
  view.appendChild(renderFlow(data.flow));
  if (data.path) {
    view.appendChild(buildRunControls(data.path));
  }
  host.replaceChildren(view);
}

function buildRunControls(flowPath: string): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "controls";

  const button = document.createElement("button");
  button.className = "run-button";
  button.type = "button";
  button.textContent = "Run flow";

  const output = document.createElement("pre");
  output.className = "run-output";

  button.addEventListener("click", async () => {
    button.disabled = true;
    output.textContent = "Running...";
    try {
      const result = await app.callServerTool({
        name: "run_flow",
        arguments: { path: flowPath },
      });
      output.textContent = formatRunResult(result);
    } catch (error) {
      output.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      button.disabled = false;
    }
  });

  bar.appendChild(button);
  bar.appendChild(output);
  return bar;
}

function formatRunResult(result: CallToolResult): string {
  const structured = result.structuredContent as
    | { result?: unknown }
    | undefined;
  if (structured && "result" in structured) {
    return JSON.stringify(structured.result, null, 2);
  }
  const blocks = (result.content ?? []) as { type: string; text?: string }[];
  const text = blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
  return text || "Done";
}
