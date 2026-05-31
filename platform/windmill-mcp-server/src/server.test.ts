import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, test } from "vitest";
import type { OpenFlow } from "./openflow.js";
import { createServer } from "./server.js";

async function connectClient(): Promise<Client> {
  const server = createServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientTransport);
  return client;
}

test("exposes get_flow", async () => {
  const client = await connectClient();
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name)).toContain("get_flow");
});

test("get_flow returns an OpenFlow with modules", async () => {
  const client = await connectClient();
  const result = await client.callTool({
    name: "get_flow",
    arguments: { path: "f/demo/confluence_email" },
  });
  const { flow } = result.structuredContent as { flow: OpenFlow };
  expect(flow.summary).toBeTruthy();
  expect(flow.value.modules.length).toBeGreaterThan(0);
});
