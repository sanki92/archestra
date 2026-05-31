import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, expect, test, vi } from "vitest";
import type { OpenFlow } from "./openflow.js";
import { createServer } from "./server.js";

const FLOW_EDITOR_URI = "ui://windmill/flow-editor.html";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function connectClient(): Promise<Client> {
  const server = createServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientTransport);
  return client;
}

function configureWindmill(): void {
  vi.stubEnv("WINDMILL_BASE_URL", "https://wm.example.com");
  vi.stubEnv("WINDMILL_WORKSPACE", "demo");
  vi.stubEnv("WINDMILL_TOKEN", "token");
}

test("exposes get_flow and list_flows", async () => {
  const client = await connectClient();
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  expect(names).toContain("get_flow");
  expect(names).toContain("list_flows");
});

test("get_flow advertises its UI resource", async () => {
  const client = await connectClient();
  const { tools } = await client.listTools();
  const getFlow = tools.find((t) => t.name === "get_flow");
  const meta = getFlow?._meta as { ui?: { resourceUri?: string } } | undefined;
  expect(meta?.ui?.resourceUri).toBe(FLOW_EDITOR_URI);
});

test("get_flow falls back to the sample flow when unconfigured", async () => {
  const client = await connectClient();
  const result = await client.callTool({
    name: "get_flow",
    arguments: { path: "f/demo/confluence_email" },
  });
  const { flow } = result.structuredContent as { flow: OpenFlow };
  expect(flow.summary).toBeTruthy();
  expect(flow.value.modules.length).toBeGreaterThan(0);
});

test("get_flow loads a live flow when Windmill is configured", async () => {
  configureWindmill();
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          summary: "Live flow",
          value: { modules: [{ id: "a", value: { type: "identity" } }] },
        }),
        { status: 200 },
      ),
  );

  const client = await connectClient();
  const result = await client.callTool({
    name: "get_flow",
    arguments: { path: "f/team/live" },
  });
  const { flow } = result.structuredContent as { flow: OpenFlow };
  expect(flow.summary).toBe("Live flow");
});

test("list_flows returns an empty list when unconfigured", async () => {
  const client = await connectClient();
  const result = await client.callTool({
    name: "list_flows",
    arguments: {},
  });
  const { flows } = result.structuredContent as { flows: unknown[] };
  expect(flows).toEqual([]);
});

test("run_flow returns an error when unconfigured", async () => {
  const client = await connectClient();
  const result = await client.callTool({
    name: "run_flow",
    arguments: { path: "f/team/live" },
  });
  expect(result.isError).toBe(true);
});

test("run_flow runs a configured flow and returns the result", async () => {
  configureWindmill();
  vi.stubGlobal(
    "fetch",
    async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
  const client = await connectClient();
  const result = await client.callTool({
    name: "run_flow",
    arguments: { path: "f/team/live", args: {} },
  });
  const { result: runResult } = result.structuredContent as { result: unknown };
  expect(runResult).toEqual({ ok: true });
});

test("create_flow creates a configured flow and returns the path", async () => {
  configureWindmill();
  vi.stubGlobal(
    "fetch",
    async () => new Response('"f/team/new"', { status: 200 }),
  );
  const client = await connectClient();
  const result = await client.callTool({
    name: "create_flow",
    arguments: {
      path: "f/team/new",
      flow: { summary: "New", value: { modules: [] } },
    },
  });
  const { path } = result.structuredContent as { path: string };
  expect(path).toBe("f/team/new");
});

test("update_flow saves a configured flow and returns the path", async () => {
  configureWindmill();
  vi.stubGlobal(
    "fetch",
    async () => new Response('"f/team/live"', { status: 200 }),
  );
  const client = await connectClient();
  const result = await client.callTool({
    name: "update_flow",
    arguments: {
      path: "f/team/live",
      flow: { summary: "Edited", value: { modules: [] } },
    },
  });
  const { path } = result.structuredContent as { path: string };
  expect(path).toBe("f/team/live");
});

test("serves the flow editor UI resource as mcp-app html", async () => {
  const client = await connectClient();
  const result = await client.readResource({ uri: FLOW_EDITOR_URI });
  const content = result.contents[0];
  expect(content?.mimeType).toBe("text/html;profile=mcp-app");
  const text = content && "text" in content ? content.text : "";
  expect(text).toContain("<html");
});
