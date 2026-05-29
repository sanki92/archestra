import { describe, expect } from "vitest";
import { EnvironmentModel, InternalMcpCatalogModel } from "@/models";
import { test } from "@/test";

describe("EnvironmentModel", () => {
  test("create derives a slug and persists fields", async ({
    makeOrganization,
  }) => {
    const org = await makeOrganization();
    const env = await EnvironmentModel.create({
      organizationId: org.id,
      name: "Production EU",
      namespace: "prod-eu",
    });

    expect(env.name).toBe("Production EU");
    expect(env.slug).toBe("production-eu");
    expect(env.namespace).toBe("prod-eu");
  });

  test("create de-duplicates slugs within an org", async ({
    makeOrganization,
  }) => {
    const org = await makeOrganization();
    const a = await EnvironmentModel.create({
      organizationId: org.id,
      name: "Staging",
    });
    const b = await EnvironmentModel.create({
      organizationId: org.id,
      name: "staging",
    });
    expect(a.slug).toBe("staging");
    expect(b.slug).toBe("staging-2");
  });

  test("listForOrganization returns assignedCatalogCount", async ({
    makeOrganization,
  }) => {
    const org = await makeOrganization();
    const env = await EnvironmentModel.create({
      organizationId: org.id,
      name: "Sandbox",
    });
    const list = await EnvironmentModel.listForOrganization(org.id);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(env.id);
    expect(list[0].assignedCatalogCount).toBe(0);
  });

  test("listForOrganization counts assigned catalog items per environment", async ({
    makeOrganization,
    makeUser,
  }) => {
    const org = await makeOrganization();
    const user = await makeUser();
    const envA = await EnvironmentModel.create({
      organizationId: org.id,
      name: "Env A",
    });
    const envB = await EnvironmentModel.create({
      organizationId: org.id,
      name: "Env B",
    });

    const createItem = (name: string, environmentId: string | null) =>
      InternalMcpCatalogModel.create(
        {
          name,
          serverType: "remote",
          serverUrl: "https://api.example.com/mcp/",
          scope: "org",
          environmentId,
        },
        { organizationId: org.id, authorId: user.id },
      );

    await createItem("a-1", envA.id);
    await createItem("a-2", envA.id);
    await createItem("b-1", envB.id);
    await createItem("no-env", null);

    const list = await EnvironmentModel.listForOrganization(org.id);
    const byId = new Map(list.map((e) => [e.id, e]));
    expect(byId.get(envA.id)?.assignedCatalogCount).toBe(2);
    expect(byId.get(envB.id)?.assignedCatalogCount).toBe(1);
  });

  test("update changes namespace but not name/slug", async ({
    makeOrganization,
  }) => {
    const org = await makeOrganization();
    const env = await EnvironmentModel.create({
      organizationId: org.id,
      name: "Staging",
    });
    const updated = await EnvironmentModel.update({
      id: env.id,
      organizationId: org.id,
      namespace: "stg",
    });
    expect(updated?.namespace).toBe("stg");
    expect(updated?.name).toBe("Staging");
    expect(updated?.slug).toBe("staging");
  });

  test("delete removes the row", async ({ makeOrganization }) => {
    const org = await makeOrganization();
    const env = await EnvironmentModel.create({
      organizationId: org.id,
      name: "Temp",
    });
    expect(await EnvironmentModel.delete(env.id, org.id)).toBe(true);
    expect(
      await EnvironmentModel.findByIdForOrganization(env.id, org.id),
    ).toBeNull();
  });
});
