import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import organizationsTable from "./organization";

/**
 * Org-level list of deployment environments (e.g. "sandbox", "staging",
 * "production"). A catalog item may be assigned to exactly one environment via
 * internal_mcp_catalog.environment_id (nullable). Each environment carries a
 * Kubernetes namespace (stored only; runtime use deferred). The `slug` is stable
 * and immutable after creation — reserved as a permission key for a future
 * assignment-gating iteration (see spec §9).
 */
const environmentsTable = pgTable(
  "environment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Optional human-readable description, shown in the environment selector. */
    description: text("description"),
    slug: text("slug").notNull(),
    /**
     * Target Kubernetes namespace for servers in this environment. Stored only;
     * not yet applied at deployment time. NULL means "unset".
     */
    namespace: text("namespace"),
    /**
     * When true, assigning a catalog item to this environment requires the
     * `environment:admin` permission. Unrestricted environments (and the
     * org-default/null environment) are open to anyone who can create catalog
     * items. Flipped via PATCH /api/organization/environments/:id.
     */
    restricted: boolean("restricted").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("environment_org_name_unique").on(table.organizationId, table.name),
    unique("environment_org_slug_unique").on(table.organizationId, table.slug),
    index("environment_org_idx").on(table.organizationId),
  ],
);

export default environmentsTable;
