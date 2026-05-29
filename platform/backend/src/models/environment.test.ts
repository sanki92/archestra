import { describe, expect } from "vitest";
import { EnvironmentModel } from "@/models";
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
