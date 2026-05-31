export type InputTransform =
  | { type: "static"; value: unknown }
  | { type: "javascript"; expr: string };

export type FlowModuleValue =
  | {
      type: "rawscript";
      language: string;
      content: string;
      input_transforms?: Record<string, InputTransform>;
    }
  | {
      type: "script";
      path: string;
      input_transforms?: Record<string, InputTransform>;
    }
  | { type: "forloopflow"; modules: FlowModule[] }
  | {
      type: "branchone";
      branches: { modules: FlowModule[] }[];
      default: FlowModule[];
    }
  | { type: "branchall"; branches: { modules: FlowModule[] }[] }
  | { type: "identity" };

export interface FlowModule {
  id: string;
  value: FlowModuleValue;
  summary?: string;
}

export interface FlowValue {
  modules: FlowModule[];
}

export interface OpenFlow {
  summary: string;
  description?: string;
  value: FlowValue;
  schema?: Record<string, unknown>;
}

export const SAMPLE_FLOW: OpenFlow = {
  summary: "Confluence page to email",
  description: "Fetch a Confluence page and email its contents.",
  value: {
    modules: [
      {
        id: "a",
        summary: "Get Confluence page",
        value: {
          type: "script",
          path: "hub/confluence/get_page",
          input_transforms: {
            page_id: { type: "javascript", expr: "flow_input.page_id" },
          },
        },
      },
      {
        id: "b",
        summary: "Send email",
        value: {
          type: "script",
          path: "hub/smtp/send_email",
          input_transforms: {
            to: { type: "javascript", expr: "flow_input.recipient" },
            body: { type: "javascript", expr: "results.a.content" },
          },
        },
      },
    ],
  },
};
