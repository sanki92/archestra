import type { OpenFlow } from "../openflow.js";

export function applyTransformEdit(
  flow: OpenFlow,
  moduleId: string,
  key: string,
  rawValue: string,
): void {
  const module = flow.value.modules.find((m) => m.id === moduleId);
  if (!module) {
    return;
  }
  const value = module.value;
  if (value.type !== "script" && value.type !== "rawscript") {
    return;
  }
  const transforms = value.input_transforms ?? {};
  transforms[key] =
    transforms[key]?.type === "static"
      ? { type: "static", value: parseMaybeJson(rawValue) }
      : { type: "javascript", expr: rawValue };
  value.input_transforms = transforms;
}

export function parseMaybeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
