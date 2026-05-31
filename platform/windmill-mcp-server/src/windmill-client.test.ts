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
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal | null;
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
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? init.body : undefined,
      signal: init?.signal,
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

test("getFlow sends a timeout abort signal", async () => {
  const { fetchImpl, calls } = stubFetch(FLOW_RESPONSE);
  await new WindmillClient(config, fetchImpl).getFlow("f/demo/example");
  expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
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

test("getFlow rejects an invalid path before making a request", async () => {
  const { fetchImpl, calls } = stubFetch(FLOW_RESPONSE);
  await expect(
    new WindmillClient(config, fetchImpl).getFlow("../../flows/list"),
  ).rejects.toThrow(/Invalid flow path/);
  expect(calls.length).toBe(0);
});

test("getFlow throws a clear error on a 200 non-JSON response", async () => {
  const { fetchImpl } = stubFetch("<html>login</html>", 200);
  await expect(
    new WindmillClient(config, fetchImpl).getFlow("f/demo/example"),
  ).rejects.toThrow(/non-JSON/);
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

test("listFlows drops entries without a path", async () => {
  const { fetchImpl } = stubFetch([
    { path: "f/a" },
    { summary: "no path" },
    { path: "" },
  ]);
  const flows = await new WindmillClient(config, fetchImpl).listFlows();

  expect(flows).toEqual([{ path: "f/a", summary: undefined }]);
});

test("runFlow posts args to run_wait_result and returns the result", async () => {
  const { fetchImpl, calls } = stubFetch({ ok: true });
  const result = await new WindmillClient(config, fetchImpl).runFlow(
    "f/demo/example",
    { page_id: "123" },
  );

  expect(result).toEqual({ ok: true });
  expect(calls[0]?.url).toBe(
    "https://wm.example.com/api/w/demo/jobs/run_wait_result/f/f/demo/example",
  );
  expect(calls[0]?.method).toBe("POST");
  expect(calls[0]?.body).toBe(JSON.stringify({ page_id: "123" }));
});

test("runFlow returns text when the result is not JSON", async () => {
  const { fetchImpl } = stubFetch("done", 200);
  const result = await new WindmillClient(config, fetchImpl).runFlow(
    "f/demo/x",
  );
  expect(result).toBe("done");
});

test("runFlow rejects an invalid path before making a request", async () => {
  const { fetchImpl, calls } = stubFetch({});
  await expect(
    new WindmillClient(config, fetchImpl).runFlow("f/x?token=evil"),
  ).rejects.toThrow(/Invalid flow path/);
  expect(calls.length).toBe(0);
});

test("createFlow posts the flow body and returns the path", async () => {
  const { fetchImpl, calls } = stubFetch("f/demo/new");
  const path = await new WindmillClient(config, fetchImpl).createFlow(
    "f/demo/new",
    {
      summary: "New flow",
      value: { modules: [{ id: "a", value: { type: "identity" } }] },
    },
  );

  expect(path).toBe("f/demo/new");
  expect(calls[0]?.url).toBe("https://wm.example.com/api/w/demo/flows/create");
  expect(calls[0]?.method).toBe("POST");
  expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({
    path: "f/demo/new",
    summary: "New flow",
  });
});

test("updateFlow posts to flows/update and returns the path", async () => {
  const { fetchImpl, calls } = stubFetch("f/demo/example");
  const path = await new WindmillClient(config, fetchImpl).updateFlow(
    "f/demo/example",
    {
      summary: "Updated",
      value: { modules: [{ id: "a", value: { type: "identity" } }] },
    },
  );

  expect(path).toBe("f/demo/example");
  expect(calls[0]?.url).toBe(
    "https://wm.example.com/api/w/demo/flows/update/f/demo/example",
  );
  expect(calls[0]?.method).toBe("POST");
  expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({
    path: "f/demo/example",
    summary: "Updated",
  });
});

test("updateFlow rejects an invalid path before making a request", async () => {
  const { fetchImpl, calls } = stubFetch("ok");
  await expect(
    new WindmillClient(config, fetchImpl).updateFlow("../escape", {
      summary: "x",
      value: { modules: [] },
    }),
  ).rejects.toThrow(/Invalid flow path/);
  expect(calls.length).toBe(0);
});
