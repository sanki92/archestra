import { expect, test } from "vitest";
import type { OpenFlow } from "../openflow.js";
import { applyTransformEdit, parseMaybeJson } from "./flow-edit.js";

function sampleFlow(): OpenFlow {
  return {
    summary: "s",
    value: {
      modules: [
        {
          id: "a",
          value: {
            type: "script",
            path: "p",
            input_transforms: {
              expr: { type: "javascript", expr: "old" },
              num: { type: "static", value: 1 },
            },
          },
        },
      ],
    },
  };
}

test("edits a javascript transform expression", () => {
  const flow = sampleFlow();
  applyTransformEdit(flow, "a", "expr", "flow_input.z");
  const value = flow.value.modules[0]?.value;
  expect(value?.type).toBe("script");
  if (value?.type === "script") {
    expect(value.input_transforms?.expr).toEqual({
      type: "javascript",
      expr: "flow_input.z",
    });
  }
});

test("edits a static transform and parses JSON", () => {
  const flow = sampleFlow();
  applyTransformEdit(flow, "a", "num", "42");
  const value = flow.value.modules[0]?.value;
  if (value?.type === "script") {
    expect(value.input_transforms?.num).toEqual({ type: "static", value: 42 });
  }
});

test("static transform keeps raw string when value is not JSON", () => {
  const flow = sampleFlow();
  applyTransformEdit(flow, "a", "num", "hello");
  const value = flow.value.modules[0]?.value;
  if (value?.type === "script") {
    expect(value.input_transforms?.num).toEqual({
      type: "static",
      value: "hello",
    });
  }
});

test("ignores edits for an unknown module", () => {
  const flow = sampleFlow();
  expect(() => applyTransformEdit(flow, "missing", "expr", "x")).not.toThrow();
});

test("parseMaybeJson falls back to the raw string", () => {
  expect(parseMaybeJson("12")).toBe(12);
  expect(parseMaybeJson("not json")).toBe("not json");
});
