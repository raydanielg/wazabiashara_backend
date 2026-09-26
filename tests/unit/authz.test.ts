import { describe, expect, it } from "vitest";
import { hasPermission, requirePermission } from "../../lib/authz";
import { stripNulls } from "../../lib/api/validate";
import type { BusinessContext } from "../../lib/context";

function ctx(isOwner: boolean, perms: string[]): BusinessContext {
  return {
    user: { id: "u1", email: "a@b.c", name: "T", status: "active" },
    sessionToken: "t",
    businessId: "b1",
    membership: { role: { isOwner } } as BusinessContext["membership"],
    permissionKeys: new Set(perms),
  };
}

describe("hasPermission", () => {
  it("owner bypasses all checks", () => {
    expect(hasPermission(ctx(true, []), "sales.delete")).toBe(true);
  });
  it("non-owner needs the permission", () => {
    expect(hasPermission(ctx(false, ["sales.view"]), "sales.view")).toBe(true);
    expect(hasPermission(ctx(false, ["sales.view"]), "sales.delete")).toBe(false);
  });
  it("requirePermission throws FORBIDDEN", () => {
    expect(() => requirePermission(ctx(false, []), "sales.delete")).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });
});

describe("stripNulls", () => {
  it("removes nulls but keeps defined values", () => {
    expect(stripNulls({ a: 1, b: null, c: "x" })).toEqual({ a: 1, c: "x" });
  });
});
