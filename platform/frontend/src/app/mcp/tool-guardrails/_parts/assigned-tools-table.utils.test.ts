import { AGENT_TOOL_PREFIX, type archestraApiTypes } from "@shared";
import { describe, expect, it } from "vitest";
import {
  getVisibleCatalogSources,
  resolveToolSource,
} from "./assigned-tools-table.utils";

type InternalMcpCatalogItem =
  archestraApiTypes.GetInternalMcpCatalogResponses["200"][number];

function makeCatalogItem(
  overrides: Partial<InternalMcpCatalogItem>,
): InternalMcpCatalogItem {
  return {
    id: "catalog-1",
    name: "GitHub",
    description: "GitHub tools",
    icon: null,
    ...overrides,
  } as unknown as InternalMcpCatalogItem;
}

describe("getVisibleCatalogSources", () => {
  it("returns an empty array when there are no catalog items", () => {
    expect(getVisibleCatalogSources()).toEqual([]);
  });

  it("filters out the built-in Archestra MCP catalog entry", () => {
    expect(
      getVisibleCatalogSources([
        makeCatalogItem({
          id: "00000000-0000-4000-8000-000000000001",
          name: "Archestra MCP Server",
          description: "Built-in tools",
        }),
        makeCatalogItem({ id: "catalog-1" }),
      ]),
    ).toEqual([makeCatalogItem({ id: "catalog-1" })]);
  });

  it("deduplicates catalog items by id", () => {
    expect(
      getVisibleCatalogSources([
        makeCatalogItem({ id: "catalog-1" }),
        makeCatalogItem({
          id: "catalog-1",
          description: "Duplicate entry",
          icon: "https://example.com/icon.png",
        }),
      ]),
    ).toHaveLength(1);
  });
});

describe("resolveToolSource", () => {
  it("resolves a tool to its parent catalog item", () => {
    const parent = makeCatalogItem({ id: "context7", name: "context7" });
    expect(
      resolveToolSource({
        catalogId: "context7",
        toolName: "query-docs",
        internalMcpCatalogItems: [parent],
      }),
    ).toEqual({ type: "catalog", catalogItem: parent });
  });

  it("resolves a tool from a child preset catalog item (not LLM Proxy)", () => {
    // Regression: child preset rows must be present in the catalog list so
    // their tools resolve to the catalog source instead of falling back.
    const child = makeCatalogItem({
      id: "context7-sandbox",
      name: "context7-sandbox",
      parentCatalogItemId: "context7",
    });
    expect(
      resolveToolSource({
        catalogId: "context7-sandbox",
        toolName: "query-docs",
        internalMcpCatalogItems: [child],
      }),
    ).toEqual({ type: "catalog", catalogItem: child });
  });

  it("falls back to llm-proxy when the catalog item is missing", () => {
    expect(
      resolveToolSource({
        catalogId: "context7-sandbox",
        toolName: "query-docs",
        internalMcpCatalogItems: [makeCatalogItem({ id: "context7" })],
      }),
    ).toEqual({ type: "llm-proxy" });
  });

  it("classifies tools with no catalogId as llm-proxy", () => {
    expect(
      resolveToolSource({
        catalogId: null,
        toolName: "some-discovered-tool",
        internalMcpCatalogItems: [],
      }),
    ).toEqual({ type: "llm-proxy" });
  });

  it("classifies agent delegation tools as agent", () => {
    expect(
      resolveToolSource({
        catalogId: null,
        toolName: `${AGENT_TOOL_PREFIX}context7_sandbox`,
        internalMcpCatalogItems: [],
      }),
    ).toEqual({ type: "agent" });
  });
});
