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
  const flow = (result.structuredContent as { flow?: OpenFlow } | undefined)
    ?.flow;
  if (!flow) {
    return;
  }
  (root as HTMLElement).replaceChildren(renderFlow(flow));
}

const app = new App({ name: "Windmill Flow Editor", version: "0.0.0" });

app.ontoolresult = showResult;
app.onerror = (error) => console.error(error);
app.onhostcontextchanged = applyHostContext;

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) {
    applyHostContext(ctx);
  }
});
