import { expect, test } from "vitest";
import type { WindmillConfig } from "./config.js";
import { WindmillClient } from "./windmill-client.js";

const config: WindmillConfig = {
  baseUrl: "https://wm.example.com",
  workspace: "demo",
  token: "secret-token",
};

interface Call {
  url: string;
  headers: Record<string, string>;
}

function stubFetch(
  body: unknown,
  status = 200,
): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(payload, { status });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const FLOW_RESPONSE = {
  path: "f/demo/example",
  summary: "Example flow",
  description: "Does a thing",
  value: {
    modules: [{ id: "a", value: { type: "identity" } }],
  },
};

test("getFlow maps the Windmill response to an OpenFlow", async () => {
  const { fetchImpl, calls } = stubFetch(FLOW_RESPONSE);
  const flow = await new WindmillClient(config, fetchImpl).getFlow(
    "f/demo/example",
  );

  expect(flow.summary).toBe("Example flow");
  expect(flow.value.modules).toHaveLength(1);
  expect(calls[0]?.url).toBe(
    "https://wm.example.com/api/w/demo/flows/get/f/demo/example",
  );
  expect(calls[0]?.headers.Authorization).toBe("Bearer secret-token");
});

test("getFlow throws on a non-ok response", async () => {
  const { fetchImpl } = stubFetch("not found", 404);
  await expect(
    new WindmillClient(config, fetchImpl).getFlow("f/missing"),
  ).rejects.toThrow(/404/);
});

test("getFlow throws when the flow shape is unexpected", async () => {
  const { fetchImpl } = stubFetch({ summary: "no modules" });
  await expect(
    new WindmillClient(config, fetchImpl).getFlow("f/bad"),
  ).rejects.toThrow(/modules/);
});

test("listFlows maps path and summary", async () => {
  const { fetchImpl } = stubFetch([
    { path: "f/a", summary: "A" },
    { path: "f/b" },
  ]);
  const flows = await new WindmillClient(config, fetchImpl).listFlows();

  expect(flows).toEqual([
    { path: "f/a", summary: "A" },
    { path: "f/b", summary: undefined },
  ]);
});
