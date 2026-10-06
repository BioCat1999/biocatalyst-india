import type { Metadata } from "next";
import { AdminIssueList } from "@/components/AdminIssueList";

export const metadata: Metadata = {
  title: "Admin — Issue reports — Biocatalyst India",
  description: "Operator review queue for user-submitted event correction reports.",
  robots: { index: false, follow: false },
};

/**
 * Minimal admin list view for issue/correction reports (Milestone 8).
 *
 * Reuses the existing admin gating: the admin enters their ADMIN_TOKEN in the
 * browser; every request goes to GET /api/v1/admin/issues with
 * `Authorization: Bearer <token>`, which is validated server-side by
 * isAdminRequest (see src/lib/admin.ts). The token is never embedded in the
 * page and never leaves the admin's browser except as the auth header.
 */
export default function AdminIssuesPage() {
  return (
    <div>
      <div className="page-head">
        <h1>Issue reports</h1>
        <p className="muted">
          User-submitted event correction reports (spec §21 data-correction
          mechanism). Review, then correct the underlying event/source data.
        </p>
      </div>
      <AdminIssueList />
    </div>
  );
}
