import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { OpenFlow } from "../openflow.js";
import { applyTransformEdit } from "./flow-edit.js";
import { type FlowEditHandlers, renderFlow } from "./render.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root element");
}
const host = root as HTMLElement;

let currentPath: string | null = null;
let currentFlow: OpenFlow | null = null;

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
  currentPath = data.path ?? null;
  currentFlow = data.flow;

  const handlers: FlowEditHandlers = {
    onSummary: (summary) => {
      if (currentFlow) {
        currentFlow.summary = summary;
      }
    },
    onTransform: (moduleId, key, rawValue) => {
      if (currentFlow) {
        applyTransformEdit(currentFlow, moduleId, key, rawValue);
      }
    },
  };

  const view = document.createElement("div");
  view.appendChild(renderFlow(data.flow, handlers));
  view.appendChild(buildControls());
  host.replaceChildren(view);
}

function buildControls(): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "controls";

  const runButton = actionButton("Run flow", "run-button");
  const saveButton = actionButton("Save changes", "save-button");
  const output = document.createElement("pre");
  output.className = "run-output";

  runButton.addEventListener("click", () =>
    withButton(runButton, output, "Running...", async () => {
      const result = await callTool("run_flow", { path: currentPath });
      return formatRunResult(result);
    }),
  );

  saveButton.addEventListener("click", () =>
    withButton(saveButton, output, "Saving...", async () => {
      await callTool("update_flow", { path: currentPath, flow: currentFlow });
      return "Saved.";
    }),
  );

  bar.appendChild(runButton);
  bar.appendChild(saveButton);
  bar.appendChild(output);
  return bar;
}

async function withButton(
  button: HTMLButtonElement,
  output: HTMLElement,
  pending: string,
  action: () => Promise<string>,
): Promise<void> {
  button.disabled = true;
  output.textContent = pending;
  try {
    output.textContent = await action();
  } catch (error) {
    output.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    button.disabled = false;
  }
}

function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  return app.callServerTool({ name, arguments: args });
}

function actionButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.textContent = label;
  return button;
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
