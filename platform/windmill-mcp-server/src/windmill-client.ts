import type { WindmillConfig } from "./config.js";
import type { FlowModule, OpenFlow } from "./openflow.js";

export interface FlowListing {
  path: string;
  summary?: string;
}

export class WindmillClient {
  private readonly config: WindmillConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: WindmillConfig, fetchImpl: typeof fetch = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async getFlow(flowPath: string): Promise<OpenFlow> {
    validateFlowPath(flowPath);
    const raw = await this.request(`flows/get/${flowPath}`);
    return toOpenFlow(raw);
  }

  async listFlows(): Promise<FlowListing[]> {
    const raw = await this.request("flows/list");
    if (!Array.isArray(raw)) {
      throw new Error(
        "Unexpected Windmill response: flows/list did not return a list",
      );
    }
    return raw
      .map((item) => item as { path?: unknown; summary?: unknown })
      .filter((flow) => typeof flow.path === "string" && flow.path.length > 0)
      .map((flow) => ({
        path: flow.path as string,
        summary: typeof flow.summary === "string" ? flow.summary : undefined,
      }));
  }

  private async request(apiPath: string): Promise<unknown> {
    const url = `${this.config.baseUrl}/api/w/${this.config.workspace}/${apiPath}`;
    const response = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Windmill request failed (${response.status}): ${body}`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error(`Windmill returned a non-JSON response from ${apiPath}`);
    }
  }
}

function validateFlowPath(flowPath: string): void {
  if (!/^[A-Za-z0-9_/-]+$/.test(flowPath) || flowPath.includes("..")) {
    throw new Error(`Invalid flow path: ${flowPath}`);
  }
}

function toOpenFlow(raw: unknown): OpenFlow {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Unexpected Windmill response: flow is not an object");
  }
  const flow = raw as {
    summary?: unknown;
    description?: unknown;
    value?: { modules?: unknown };
    schema?: unknown;
  };
  if (!flow.value || !Array.isArray(flow.value.modules)) {
    throw new Error("Unexpected Windmill response: flow.value.modules missing");
  }
  return {
    summary: typeof flow.summary === "string" ? flow.summary : "",
    description:
      typeof flow.description === "string" ? flow.description : undefined,
    value: { modules: flow.value.modules as FlowModule[] },
    schema:
      typeof flow.schema === "object" && flow.schema !== null
        ? (flow.schema as Record<string, unknown>)
        : undefined,
  };
}
