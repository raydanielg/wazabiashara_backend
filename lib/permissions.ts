/**
 * Central permission registry. Keys follow `module.action` convention.
 * This is the seed source of truth — permissions live in the DB and are
 * attached to roles, never hard-coded into controllers.
 */
export const PERMISSIONS = [
  "dashboard.view",
  "sales.view", "sales.create", "sales.update", "sales.delete",
  "products.view", "products.create", "products.update", "products.delete",
  "inventory.view", "inventory.adjust",
  "customers.view", "customers.create", "customers.update", "customers.delete",
  "suppliers.view", "suppliers.create", "suppliers.update", "suppliers.delete",
  "expenses.view", "expenses.create", "expenses.update", "expenses.delete",
  "debts.view", "debts.create", "debts.update",
  "reports.view", "reports.export",
  "staff.view", "staff.invite", "staff.update", "staff.remove",
  "roles.manage",
  "settings.view", "settings.update",
  "business.update",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];

/**
 * Default role templates applied when a business is created.
 * These are templates, not the only possible roles — businesses can
 * create custom roles (see roles.manage permission).
 */
export const DEFAULT_ROLES: Record<string, { name: string; isOwner?: boolean; permissions: PermissionKey[] }> = {
  owner: { name: "Owner", isOwner: true, permissions: ALL },
  manager: {
    name: "Manager",
    permissions: ALL.filter(
      (p) => !["staff.remove", "roles.manage", "business.update"].includes(p),
    ),
  },
  cashier: {
    name: "Cashier",
    permissions: [
      "dashboard.view",
      "sales.view", "sales.create", "sales.update",
      "products.view",
      "customers.view", "customers.create",
    ],
  },
  stock_manager: {
    name: "Stock Manager",
    permissions: [
      "dashboard.view",
      "products.view", "products.create", "products.update",
      "inventory.view", "inventory.adjust",
      "suppliers.view", "suppliers.create", "suppliers.update",
    ],
  },
  staff: {
    name: "Staff",
    permissions: ["dashboard.view", "sales.view", "sales.create", "products.view"],
  },
};
