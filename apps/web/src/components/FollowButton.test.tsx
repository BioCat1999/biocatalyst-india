/**
 * FollowButton compact-variant render test.
 *
 * Server-rendered (effects don't run), so the hook stays in its loading
 * state — this pins the compact skeleton's class and accessible label.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FollowButton } from "./FollowButton";

describe("FollowButton compact", () => {
  it("renders a compact loading skeleton", () => {
    const html = renderToStaticMarkup(
      <FollowButton compact entityType="company" entityId="co-x" label="Acme Ltd" />,
    );
    expect(html).toContain("btn-compact");
    expect(html).toContain("Loading follow state");
  });

  it("renders a full-size skeleton without the compact class by default", () => {
    const html = renderToStaticMarkup(
      <FollowButton entityType="company" entityId="co-x" label="Acme Ltd" />,
    );
    expect(html).not.toContain("btn-compact");
  });
});
