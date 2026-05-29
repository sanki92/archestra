import { describe, expect } from "vitest";
import {
  createEnvironment,
  deleteEnvironment,
  updateEnvironment,
} from "@/services/environments/environment";
import { test } from "@/test";

const MISSING_ID = "00000000-0000-0000-0000-000000000000";

describe("EnvironmentService", () => {
  test("createEnvironment rejects duplicate names with 409", async ({
    makeOrganization,
  }) => {
    const org = await makeOrganization();
    await createEnvironment({ organizationId: org.id, data: { name: "Prod" } });
    await expect(
      createEnvironment({ organizationId: org.id, data: { name: "Prod" } }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test("updateEnvironment throws 404 for unknown id", async ({
    makeOrganization,
  }) => {
    const org = await makeOrganization();
    await expect(
      updateEnvironment({
        id: MISSING_ID,
        organizationId: org.id,
        data: { namespace: "x" },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test("deleteEnvironment throws 404 for unknown id", async ({
    makeOrganization,
  }) => {
    const org = await makeOrganization();
    await expect(
      deleteEnvironment({ id: MISSING_ID, organizationId: org.id }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
