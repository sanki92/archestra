"use client";

import { useHasPermissions } from "@/lib/auth/auth.query";
import { EnvironmentsSection } from "../_parts/environments-section";

export default function EnvironmentsPageClient() {
  const { data: canEdit } = useHasPermissions({
    environment: ["create", "update", "delete"],
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Environments</h2>
        <p className="text-sm text-muted-foreground">
          Deployment environments for catalog items. The Kubernetes namespace is
          stored but not yet applied at deploy time.
        </p>
      </div>

      <EnvironmentsSection canEdit={canEdit ?? false} />
    </div>
  );
}
