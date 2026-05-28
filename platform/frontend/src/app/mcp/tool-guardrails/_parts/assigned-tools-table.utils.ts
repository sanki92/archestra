import {
  ARCHESTRA_MCP_CATALOG_ID,
  type archestraApiTypes,
  isAgentTool,
} from "@shared";

type InternalMcpCatalogItem =
  archestraApiTypes.GetInternalMcpCatalogResponses["200"][number];

export function getVisibleCatalogSources(
  internalMcpCatalogItems?: InternalMcpCatalogItem[],
) {
  const uniqueSources = new Map<string, InternalMcpCatalogItem>();

  internalMcpCatalogItems?.forEach((item) => {
    if (item.id === ARCHESTRA_MCP_CATALOG_ID) {
      return;
    }

    uniqueSources.set(item.id, item);
  });

  return Array.from(uniqueSources.values());
}

export type ToolSource =
  | { type: "catalog"; catalogItem: InternalMcpCatalogItem }
  | { type: "agent" }
  | { type: "llm-proxy" };

/**
 * Resolve which source badge a tool belongs to. A tool whose `catalogId`
 * matches a catalog item — including a child preset row — is sourced from that
 * catalog; only tools without a resolvable catalog item and not delegating to
 * an agent fall back to "llm-proxy". The catalog list must therefore include
 * child preset rows, or preset-sourced tools mislabel as "llm-proxy".
 */
export function resolveToolSource(params: {
  catalogId: string | null | undefined;
  toolName: string;
  internalMcpCatalogItems?: InternalMcpCatalogItem[];
}): ToolSource {
  const { catalogId, toolName, internalMcpCatalogItems } = params;

  const catalogItem = catalogId
    ? internalMcpCatalogItems?.find((item) => item.id === catalogId)
    : undefined;

  if (catalogItem) {
    return { type: "catalog", catalogItem };
  }

  if (isAgentTool(toolName)) {
    return { type: "agent" };
  }

  return { type: "llm-proxy" };
}
