import { and, asc, eq, sql } from "drizzle-orm";
import db, { schema } from "@/database";

// === Public API ===

interface EnvironmentWithAssignedCount {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  namespace: string | null;
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
        slug: schema.environmentsTable.slug,
        namespace: schema.environmentsTable.namespace,
        sortOrder: schema.environmentsTable.sortOrder,
        createdAt: schema.environmentsTable.createdAt,
        updatedAt: schema.environmentsTable.updatedAt,
        assignedCatalogCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM ${schema.internalMcpCatalogTable}
          WHERE ${schema.internalMcpCatalogTable.environmentId} = ${schema.environmentsTable.id}
        )`,
      })
      .from(schema.environmentsTable)
      .where(eq(schema.environmentsTable.organizationId, organizationId))
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
    namespace?: string | null;
  }): Promise<typeof schema.environmentsTable.$inferSelect> {
    const { organizationId, name, namespace } = params;
    const [row] = await db
      .insert(schema.environmentsTable)
      .values({
        organizationId,
        name,
        slug: await EnvironmentModel.uniqueSlug(organizationId, name),
        namespace: namespace ?? null,
        sortOrder: await EnvironmentModel.nextSortOrder(organizationId),
      })
      .returning();
    return row;
  }

  static async update(params: {
    id: string;
    organizationId: string;
    namespace?: string | null;
  }): Promise<typeof schema.environmentsTable.$inferSelect | null> {
    const { id, organizationId, namespace } = params;
    const patch: Record<string, unknown> = {};
    if (namespace !== undefined) patch.namespace = namespace;

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
