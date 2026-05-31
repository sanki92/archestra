import type { FlowModule, InputTransform, OpenFlow } from "../openflow.js";

export function renderFlow(flow: OpenFlow): HTMLElement {
  const section = el("section", "flow");

  const header = el("header", "flow-header");
  header.appendChild(el("h1", "flow-title", flow.summary));
  if (flow.description) {
    header.appendChild(el("p", "flow-description", flow.description));
  }
  section.appendChild(header);

  const list = el("ol", "node-list");
  flow.value.modules.forEach((module, index) => {
    list.appendChild(renderNode(module, index + 1));
  });
  section.appendChild(list);

  return section;
}

function renderNode(module: FlowModule, position: number): HTMLElement {
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

  const transforms = inputTransformsOf(module);
  if (transforms.length > 0) {
    const inputs = el("dl", "node-inputs");
    for (const [key, transform] of transforms) {
      inputs.appendChild(el("dt", "input-key", key));
      inputs.appendChild(el("dd", "input-value", describeTransform(transform)));
    }
    item.appendChild(inputs);
  }

  return item;
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
  return JSON.stringify(transform.value);
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}
