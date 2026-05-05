import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { archestraApiSdk } from "@shared";
import { testMcpServerCommand } from "@shared/test-mcp-server";
import { getE2eRequestUrl, UI_BASE_URL } from "../consts";
import { goToPage } from "../fixtures";

export async function addCustomSelfHostedCatalogItem({
  page,
  cookieHeaders,
  catalogItemName,
  envVars,
  scope,
}: {
  page: Page;
  cookieHeaders: string;
  catalogItemName: string;
  envVars?: {
    key: string;
    promptOnInstallation: boolean;
    isSecret?: boolean;
    vaultSecret?: {
      name: string;
      key: string;
      value: string;
      teamName: string;
    };
  };
  scope?: "personal" | "team" | "org";
}) {
  await goToPage(page, "/mcp/registry");
  await page.waitForLoadState("domcontentloaded");
  const addButton = page.getByRole("button", { name: "Add MCP Server" });
  await addButton.waitFor({ state: "visible", timeout: 30_000 });
  await addButton.click();

  const createDialog = page.getByRole("dialog", {
    name: /Add MCP Server to the Private Registry/i,
  });
  await expect(createDialog).toBeVisible({ timeout: 30_000 });

  await createDialog.getByRole("button", { name: "Self-hosted" }).click();
  await createDialog
    .getByRole("textbox", { name: "Name *" })
    .fill(catalogItemName);
  await createDialog.getByRole("textbox", { name: "Command" }).fill("sh");
  const singleLineCommand = testMcpServerCommand.replace(/\n/g, " ");
  await createDialog
    .getByRole("textbox", { name: "Arguments (one per line)" })
    .fill(`-c\n${singleLineCommand}`);
  if (envVars) {
    if (envVars.vaultSecret) {
      throw new Error(
        "vaultSecret env var setup is not yet supported in the refactored Add field dialog",
      );
    }
    await createDialog.getByRole("button", { name: "Add field" }).click();
    const fieldDialog = page.getByRole("dialog", { name: /Add field/i });
    await expect(fieldDialog).toBeVisible({ timeout: 15_000 });
    await fieldDialog.getByLabel("Key").fill(envVars.key);
    if (envVars.isSecret) {
      await fieldDialog.getByLabel("Type").click();
      await page.getByRole("option", { name: "secret" }).click();
    }
    if (!envVars.promptOnInstallation) {
      await fieldDialog
        .getByRole("radio", { name: /Static/i })
        .click({ force: true });
    }
    await fieldDialog.getByRole("button", { name: "Add field" }).click();
    await expect(fieldDialog).not.toBeVisible({ timeout: 15_000 });
  }
  if (scope && scope !== "personal") {
    await createDialog
      .getByRole("button", { name: /Only you can access this MCP server/i })
      .click();
    const scopeLabel = scope === "org" ? "Organization" : "Teams";
    await createDialog
      .getByRole("button", { name: new RegExp(scopeLabel, "i") })
      .click();
  }
  await createDialog.getByRole("button", { name: "Add Server" }).click();
  await page.waitForLoadState("domcontentloaded");

  let newCatalogItem: { id: string; name: string } | null = null;
  await expect
    .poll(
      async () => {
        const catalogItems = await archestraApiSdk.getInternalMcpCatalog({
          headers: { Cookie: cookieHeaders },
        });

        if (catalogItems.error) {
          throw new Error(
            `Failed to get catalog items: ${JSON.stringify(catalogItems.error)}`,
          );
        }
        if (!catalogItems.data || catalogItems.data.length === 0) {
          return false;
        }

        newCatalogItem =
          catalogItems.data.find((item) => item.name === catalogItemName) ??
          null;
        return newCatalogItem !== null;
      },
      {
        timeout: 30_000,
        intervals: [250, 500, 1000],
      },
    )
    .toBe(true);

  if (!newCatalogItem) {
    throw new Error(`Failed to find catalog item "${catalogItemName}"`);
  }

  const createdCatalogItem = newCatalogItem as { id: string; name: string };

  if (await createDialog.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape").catch(() => undefined);
  }

  return {
    id: createdCatalogItem.id,
    name: createdCatalogItem.name,
  };
}

export async function findCatalogItem(
  request: APIRequestContext,
  name: string,
): Promise<{ id: string; name: string } | undefined> {
  const response = await request.get(
    getE2eRequestUrl("/api/internal_mcp_catalog"),
    {
      headers: { Origin: UI_BASE_URL },
    },
  );

  if (!response.ok()) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch internal MCP catalog: ${response.status()} ${errorText}`,
    );
  }

  const catalog = await response.json();

  if (!Array.isArray(catalog)) {
    throw new Error(
      `Expected catalog to be an array, got: ${JSON.stringify(catalog)}`,
    );
  }

  return catalog.find((item: { name: string }) => item.name === name);
}

export async function findInstalledServer(
  request: APIRequestContext,
  catalogId: string,
  teamId?: string,
): Promise<{ id: string; catalogId: string; teamId?: string } | undefined> {
  const response = await request.get(getE2eRequestUrl("/api/mcp_server"), {
    headers: { Origin: UI_BASE_URL },
  });
  const serversData = await response.json();
  const servers = serversData.data || serversData;
  return servers.find((server: { catalogId: string; teamId?: string }) => {
    if (server.catalogId !== catalogId) return false;
    if (teamId !== undefined && server.teamId !== teamId) return false;
    return true;
  });
}

export async function waitForServerInstallation(
  request: APIRequestContext,
  serverId: string,
  maxAttempts = 60,
): Promise<{
  localInstallationStatus: string;
  localInstallationError?: string;
}> {
  for (let index = 0; index < maxAttempts; index += 1) {
    const response = await request.get(
      getE2eRequestUrl(`/api/mcp_server/${serverId}`),
      {
        headers: { Origin: UI_BASE_URL },
      },
    );
    const server = await response.json();

    if (server.localInstallationStatus === "success") {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return server;
    }
    if (server.localInstallationStatus === "error") {
      throw new Error(
        `MCP server installation failed: ${server.localInstallationError}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    `MCP server installation timed out after ${maxAttempts * 2} seconds`,
  );
}
