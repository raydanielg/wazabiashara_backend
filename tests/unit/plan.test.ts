import { describe, expect, it } from "vitest";
import {
  assertWithinLimit,
  isModuleEnabled,
  isSubscriptionUsable,
  getLimit,
  type BusinessPlan,
} from "../../lib/plan";

const plan = (limits: [string, number | null][], modules: string[]): BusinessPlan => ({
  subscription: null,
  package: null,
  limits: new Map(limits),
  modules: new Set(modules),
});

describe("limits engine", () => {
  it("null limit = unlimited", () => {
    expect(() => assertWithinLimit(plan([["max_products", null]], []), "max_products", 999999)).not.toThrow();
  });
  it("missing limit = unlimited", () => {
    expect(getLimit(plan([], []), "max_products")).toBeNull();
    expect(() => assertWithinLimit(plan([], []), "max_products", 999)).not.toThrow();
  });
  it("blocks at the limit", () => {
    expect(() => assertWithinLimit(plan([["max_products", 100]], []), "max_products", 100)).toThrowError(
      expect.objectContaining({ code: "PLAN_LIMIT_REACHED" }),
    );
    expect(() => assertWithinLimit(plan([["max_products", 100]], []), "max_products", 99)).not.toThrow();
  });
});

describe("subscription usability", () => {
  it.each(["trialing", "active", "past_due"])("%s is usable", (s) => {
    expect(isSubscriptionUsable(s)).toBe(true);
  });
  it.each(["expired", "cancelled", "suspended", null, undefined])("%s is not usable", (s) => {
    expect(isSubscriptionUsable(s)).toBe(false);
  });
});

describe("modules", () => {
  it("checks effective module set", () => {
    expect(isModuleEnabled(plan([], ["sales", "products"]), "sales")).toBe(true);
    expect(isModuleEnabled(plan([], ["sales"]), "pos")).toBe(false);
  });
});
