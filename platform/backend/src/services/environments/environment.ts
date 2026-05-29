import { EnvironmentModel } from "@/models";
import {
  ApiError,
  type CreateEnvironment,
  type Environment,
  type EnvironmentWithAssignedCount,
  type UpdateEnvironment,
} from "@/types";

// === Public API ===

export async function listEnvironments(
  organizationId: string,
): Promise<EnvironmentWithAssignedCount[]> {
  return EnvironmentModel.listForOrganization(organizationId);
}

export async function createEnvironment(params: {
  organizationId: string;
  data: CreateEnvironment;
}): Promise<Environment> {
  const { organizationId, data } = params;
  const existing = await EnvironmentModel.listForOrganization(organizationId);
  if (existing.some((e) => e.name === data.name)) {
    throw new ApiError(409, "An environment with this name already exists.");
  }
  return EnvironmentModel.create({
    organizationId,
    name: data.name,
    description: data.description ?? null,
    namespace: data.namespace ?? null,
  });
}

export async function updateEnvironment(params: {
  id: string;
  organizationId: string;
  data: UpdateEnvironment;
}): Promise<Environment> {
  const { id, organizationId, data } = params;
  const updated = await EnvironmentModel.update({
    id,
    organizationId,
    description: data.description,
    namespace: data.namespace,
  });
  if (!updated) {
    throw new ApiError(404, "Environment not found");
  }
  return updated;
}

export async function deleteEnvironment(params: {
  id: string;
  organizationId: string;
}): Promise<void> {
  const deleted = await EnvironmentModel.delete(
    params.id,
    params.organizationId,
  );
  if (!deleted) {
    throw new ApiError(404, "Environment not found");
  }
}
