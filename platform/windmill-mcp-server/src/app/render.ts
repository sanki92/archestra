import type { FlowModule, InputTransform, OpenFlow } from "../openflow.js";

export interface FlowEditHandlers {
  onSummary(summary: string): void;
  onTransform(moduleId: string, key: string, rawValue: string): void;
}

export function renderFlow(
  flow: OpenFlow,
  handlers?: FlowEditHandlers,
): HTMLElement {
  const section = el("section", "flow");

  const header = el("header", "flow-header");
  if (handlers) {
    const title = editableInput("flow-title-input", flow.summary);
    title.addEventListener("input", () => handlers.onSummary(title.value));
    header.appendChild(title);
  } else {
    header.appendChild(el("h1", "flow-title", flow.summary));
  }
  if (flow.description) {
    header.appendChild(el("p", "flow-description", flow.description));
  }
  section.appendChild(header);

  const list = el("ol", "node-list");
  flow.value.modules.forEach((module, index) => {
    list.appendChild(renderNode(module, index + 1, handlers));
  });
  section.appendChild(list);

  return section;
}

function renderNode(
  module: FlowModule,
  position: number,
  handlers?: FlowEditHandlers,
): HTMLElement {
  const item = el("li", "node");
  item.dataset.nodeId = module.id;

  const head = el("div", "node-head");
  head.appendChild(el("span", "node-step", String(position)));
  head.appendChild(el("span", "node-name", module.summary ?? module.id));
  head.appendChild(el("span", "node-type", module.value.type));
  item.appendChild(head);

  const target = describeTarget(module);
  if (target) {
    item.appendChild(el("code", "node-target", target));
  }

  const container = describeContainer(module);
  if (container) {
    item.appendChild(el("p", "node-container", container));
  }

  const transforms = inputTransformsOf(module);
  if (transforms.length > 0) {
    const inputs = el("dl", "node-inputs");
    for (const [key, transform] of transforms) {
      inputs.appendChild(el("dt", "input-key", key));
      inputs.appendChild(renderTransform(module.id, key, transform, handlers));
    }
    item.appendChild(inputs);
  }

  return item;
}

function renderTransform(
  moduleId: string,
  key: string,
  transform: InputTransform,
  handlers?: FlowEditHandlers,
): HTMLElement {
  if (!handlers) {
    return el("dd", "input-value", describeTransform(transform));
  }
  const wrapper = el("dd", "input-value");
  const field = editableInput("input-edit", describeTransform(transform));
  field.addEventListener("input", () =>
    handlers.onTransform(moduleId, key, field.value),
  );
  wrapper.appendChild(field);
  return wrapper;
}

function describeTarget(module: FlowModule): string | null {
  switch (module.value.type) {
    case "script":
      return module.value.path;
    case "rawscript":
      return `inline ${module.value.language}`;
    default:
      return null;
  }
}

function describeContainer(module: FlowModule): string | null {
  switch (module.value.type) {
    case "forloopflow": {
      const count = module.value.modules.length;
      return `${count} ${count === 1 ? "step" : "steps"}`;
    }
    case "branchall": {
      const count = module.value.branches.length;
      return `${count} ${count === 1 ? "branch" : "branches"}`;
    }
    case "branchone": {
      const count = module.value.branches.length + 1;
      return `${count} ${count === 1 ? "branch" : "branches"}`;
    }
    default:
      return null;
  }
}

function inputTransformsOf(module: FlowModule): [string, InputTransform][] {
  if (module.value.type === "script" || module.value.type === "rawscript") {
    return Object.entries(module.value.input_transforms ?? {});
  }
  return [];
}

function describeTransform(transform: InputTransform): string {
  if (transform.type === "javascript") {
    return transform.expr;
  }
  return JSON.stringify(transform.value) ?? "null";
}

function editableInput(className: string, value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.className = className;
  input.type = "text";
  input.value = value;
  return input;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}
