import { and, asc, count, eq, sql } from "drizzle-orm";
import db, { schema } from "@/database";

// === Public API ===

interface EnvironmentWithAssignedCount {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  slug: string;
  namespace: string | null;
  restricted: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  assignedCatalogCount: number;
}

class EnvironmentModel {
  static async listForOrganization(
    organizationId: string,
  ): Promise<EnvironmentWithAssignedCount[]> {
    return db
      .select({
        id: schema.environmentsTable.id,
        organizationId: schema.environmentsTable.organizationId,
        name: schema.environmentsTable.name,
        description: schema.environmentsTable.description,
        slug: schema.environmentsTable.slug,
        namespace: schema.environmentsTable.namespace,
        restricted: schema.environmentsTable.restricted,
        sortOrder: schema.environmentsTable.sortOrder,
        createdAt: schema.environmentsTable.createdAt,
        updatedAt: schema.environmentsTable.updatedAt,
        assignedCatalogCount: count(schema.internalMcpCatalogTable.id),
      })
      .from(schema.environmentsTable)
      .leftJoin(
        schema.internalMcpCatalogTable,
        eq(
          schema.internalMcpCatalogTable.environmentId,
          schema.environmentsTable.id,
        ),
      )
      .where(eq(schema.environmentsTable.organizationId, organizationId))
      .groupBy(schema.environmentsTable.id)
      .orderBy(
        asc(schema.environmentsTable.sortOrder),
        asc(schema.environmentsTable.createdAt),
      );
  }

  static async findByIdForOrganization(
    id: string,
    organizationId: string,
  ): Promise<typeof schema.environmentsTable.$inferSelect | null> {
    const [row] = await db
      .select()
      .from(schema.environmentsTable)
      .where(
        and(
          eq(schema.environmentsTable.id, id),
          eq(schema.environmentsTable.organizationId, organizationId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  static async create(params: {
    organizationId: string;
    name: string;
    description?: string | null;
    namespace?: string | null;
    restricted?: boolean;
  }): Promise<typeof schema.environmentsTable.$inferSelect> {
    const { organizationId, name, description, namespace, restricted } = params;
    const [row] = await db
      .insert(schema.environmentsTable)
      .values({
        organizationId,
        name,
        description: description ?? null,
        slug: await EnvironmentModel.uniqueSlug(organizationId, name),
        namespace: namespace ?? null,
        restricted: restricted ?? false,
        sortOrder: await EnvironmentModel.nextSortOrder(organizationId),
      })
      .returning();
    return row;
  }

  static async update(params: {
    id: string;
    organizationId: string;
    description?: string | null;
    namespace?: string | null;
    restricted?: boolean;
  }): Promise<typeof schema.environmentsTable.$inferSelect | null> {
    const { id, organizationId, description, namespace, restricted } = params;
    const patch: Record<string, unknown> = {};
    if (description !== undefined) patch.description = description;
    if (namespace !== undefined) patch.namespace = namespace;
    if (restricted !== undefined) patch.restricted = restricted;

    const [row] = await db
      .update(schema.environmentsTable)
      .set(patch)
      .where(
        and(
          eq(schema.environmentsTable.id, id),
          eq(schema.environmentsTable.organizationId, organizationId),
        ),
      )
      .returning();
    return row ?? null;
  }

  static async delete(id: string, organizationId: string): Promise<boolean> {
    // Catalog items reference us with ON DELETE SET NULL, so they survive and
    // simply fall back to the virtual "Default" environment.
    const deleted = await db
      .delete(schema.environmentsTable)
      .where(
        and(
          eq(schema.environmentsTable.id, id),
          eq(schema.environmentsTable.organizationId, organizationId),
        ),
      )
      .returning({ id: schema.environmentsTable.id });
    return deleted.length > 0;
  }

  // === Internal helpers ===

  private static slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private static async uniqueSlug(
    organizationId: string,
    name: string,
  ): Promise<string> {
    const base = EnvironmentModel.slugify(name) || "environment";
    const existing = await db
      .select({ slug: schema.environmentsTable.slug })
      .from(schema.environmentsTable)
      .where(eq(schema.environmentsTable.organizationId, organizationId));
    const taken = new Set(existing.map((r) => r.slug));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  private static async nextSortOrder(organizationId: string): Promise<number> {
    const [row] = await db
      .select({
        max: sql<number | null>`MAX(${schema.environmentsTable.sortOrder})`,
      })
      .from(schema.environmentsTable)
      .where(eq(schema.environmentsTable.organizationId, organizationId));
    return (row?.max ?? -1) + 1;
  }
}

export default EnvironmentModel;
