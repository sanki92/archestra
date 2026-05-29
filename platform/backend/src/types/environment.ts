import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { schema } from "@/database";

// === Public schemas & types ===

export const SelectEnvironmentSchema = createSelectSchema(
  schema.environmentsTable,
);

/**
 * Listing response shape — row columns plus the number of catalog items
 * currently assigned to this environment, for delete-confirmation UI.
 */
export const EnvironmentWithAssignedCountSchema =
  SelectEnvironmentSchema.extend({
    assignedCatalogCount: z.number().int().nonnegative(),
  });

export const CreateEnvironmentSchema = z.object({
  name: z.string().trim().min(1).max(50),
  namespace: z.string().trim().max(253).nullable().optional(),
});

/**
 * `name` and `slug` are immutable after creation (slug is a reserved permission
 * key). Only the namespace can change. Send `null` to clear it.
 */
export const UpdateEnvironmentSchema = z.object({
  namespace: z.string().trim().max(253).nullable().optional(),
});

export type Environment = z.infer<typeof SelectEnvironmentSchema>;
export type EnvironmentWithAssignedCount = z.infer<
  typeof EnvironmentWithAssignedCountSchema
>;
export type CreateEnvironment = z.infer<typeof CreateEnvironmentSchema>;
export type UpdateEnvironment = z.infer<typeof UpdateEnvironmentSchema>;
