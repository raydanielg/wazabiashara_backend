import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PERMISSIONS } from "../lib/permissions";
import { ADMIN_PERMISSIONS, ADMIN_ROLES } from "../lib/admin";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const BUSINESS_TYPES = [
  "Retail Shop",
  "Supermarket",
  "Restaurant",
  "Salon",
  "Barbershop",
  "Pharmacy",
  "Hardware",
  "Electronics",
  "Clothing",
  "Wholesale",
  "Service Business",
  "Other",
];

const CORE_MODULES = [
  "dashboard",
  "sales",
  "products",
  "inventory",
  "customers",
  "suppliers",
  "expenses",
  "debts",
  "reports",
  "employees",
  "notifications",
  "settings",
];

const OPTIONAL_MODULES = [
  "pos",
  "purchases",
  "barcode",
  "advanced_reports",
  "multi_branch",
  "loyalty",
  "invoices",
  "accounting",
  "api_access",
  "sms",
  "email_automation",
];

const ALL_OPTIONAL = [...OPTIONAL_MODULES];

interface PackageSeed {
  name: string;
  slug: string;
  price: number;
  billingPeriod: "monthly" | "yearly" | "lifetime";
  trialDays: number;
  graceDays: number;
  isDefault?: boolean;
  sortOrder: number;
  limits: Record<string, number | null>;
  modules: string[];
}

const PACKAGES: PackageSeed[] = [
  {
    name: "Free",
    slug: "free",
    price: 0,
    billingPeriod: "monthly",
    trialDays: 0,
    graceDays: 0,
    isDefault: true,
    sortOrder: 0,
    limits: {
      max_businesses: 1,
      max_users: 1,
      max_products: 100,
      max_customers: 50,
      max_suppliers: 20,
      max_sms: 0,
    },
    modules: [],
  },
  {
    name: "Starter",
    slug: "starter",
    price: 15000,
    billingPeriod: "monthly",
    trialDays: 14,
    graceDays: 3,
    sortOrder: 1,
    limits: {
      max_businesses: 1,
      max_users: 5,
      max_products: 1000,
      max_customers: 500,
      max_suppliers: 100,
      max_sms: 50,
    },
    modules: ["invoices", "advanced_reports"],
  },
  {
    name: "Business",
    slug: "business",
    price: 40000,
    billingPeriod: "monthly",
    trialDays: 14,
    graceDays: 5,
    sortOrder: 2,
    limits: {
      max_businesses: 3,
      max_users: 15,
      max_products: 10000,
      max_customers: null,
      max_suppliers: null,
      max_sms: 500,
    },
    modules: ["invoices", "advanced_reports", "pos", "purchases", "sms", "email_automation"],
  },
  {
    name: "Professional",
    slug: "professional",
    price: 90000,
    billingPeriod: "monthly",
    trialDays: 14,
    graceDays: 7,
    sortOrder: 3,
    limits: {
      max_businesses: 10,
      max_users: null,
      max_products: null,
      max_customers: null,
      max_suppliers: null,
      max_sms: null,
    },
    modules: ALL_OPTIONAL,
  },
];

const FEATURE_FLAGS = [
  "new_dashboard",
  "advanced_reports",
  "multi_branch",
  "barcode",
  "sms_automation",
];

const PAYMENT_METHODS = [
  "Cash",
  "Mobile Money",
  "Bank",
  "Card",
  "Credit",
  "Other",
];

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function label(key: string) {
  return key
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

async function main() {
  for (const key of PERMISSIONS) {
    const [group, action] = key.split(".");
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, group, description: `${action} ${group}` },
    });
  }
  console.log(`Seeded ${PERMISSIONS.length} permissions`);

  for (const name of BUSINESS_TYPES) {
    const slug = slugify(name);
    await prisma.businessType.upsert({
      where: { slug },
      update: {},
      create: { name, slug },
    });
  }
  console.log(`Seeded ${BUSINESS_TYPES.length} business types`);

  const moduleIdByKey = new Map<string, string>();
  for (const key of CORE_MODULES) {
    const m = await prisma.module.upsert({
      where: { key },
      update: { isCore: true },
      create: { key, name: label(key), isCore: true },
    });
    moduleIdByKey.set(key, m.id);
  }
  for (const key of OPTIONAL_MODULES) {
    const m = await prisma.module.upsert({
      where: { key },
      update: {},
      create: { key, name: label(key), isCore: false },
    });
    moduleIdByKey.set(key, m.id);
  }
  console.log(`Seeded ${CORE_MODULES.length + OPTIONAL_MODULES.length} modules`);

  for (const p of PACKAGES) {
    const pkg = await prisma.package.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        price: p.price,
        billingPeriod: p.billingPeriod,
        trialDays: p.trialDays,
        graceDays: p.graceDays,
        isDefault: p.isDefault ?? false,
        sortOrder: p.sortOrder,
      },
      create: {
        name: p.name,
        slug: p.slug,
        price: p.price,
        billingPeriod: p.billingPeriod,
        trialDays: p.trialDays,
        graceDays: p.graceDays,
        isDefault: p.isDefault ?? false,
        sortOrder: p.sortOrder,
      },
    });
    for (const [key, value] of Object.entries(p.limits)) {
      await prisma.packageLimit.upsert({
        where: { packageId_key: { packageId: pkg.id, key } },
        update: { value },
        create: { packageId: pkg.id, key, value },
      });
    }
    await prisma.packageModule.deleteMany({ where: { packageId: pkg.id } });
    const links = p.modules
      .map((k) => moduleIdByKey.get(k))
      .filter((id): id is string => !!id)
      .map((moduleId) => ({ packageId: pkg.id, moduleId }));
    if (links.length) await prisma.packageModule.createMany({ data: links });
  }
  console.log(`Seeded ${PACKAGES.length} packages`);

  for (const key of FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key },
      update: {},
      create: { key, name: label(key), enabled: false },
    });
  }
  console.log(`Seeded ${FEATURE_FLAGS.length} feature flags`);

  for (const [i, name] of PAYMENT_METHODS.entries()) {
    const key = slugify(name);
    await prisma.paymentMethod.upsert({
      where: { key },
      update: {},
      create: { key, name, sortOrder: i },
    });
  }
  console.log(`Seeded ${PAYMENT_METHODS.length} payment methods`);

  // ---------- Admin RBAC ----------
  const adminPermId = new Map<string, string>();
  for (const key of ADMIN_PERMISSIONS) {
    const [group, action] = [key.split(".")[0], key.split(".").slice(1).join(".")];
    const p = await prisma.adminPermission.upsert({
      where: { key },
      update: {},
      create: { key, group, description: action },
    });
    adminPermId.set(key, p.id);
  }
  for (const [key, role] of Object.entries(ADMIN_ROLES)) {
    const r = await prisma.adminRole.upsert({
      where: { key },
      update: { name: role.name },
      create: { key, name: role.name },
    });
    await prisma.adminRolePermission.deleteMany({ where: { roleId: r.id } });
    await prisma.adminRolePermission.createMany({
      data: role.permissions
        .map((p) => adminPermId.get(p))
        .filter((id): id is string => !!id)
        .map((permissionId) => ({ roleId: r.id, permissionId })),
    });
  }
  console.log(`Seeded ${ADMIN_PERMISSIONS.length} admin permissions, ${Object.keys(ADMIN_ROLES).length} admin roles`);

  // Dev admin user — override via ADMIN_EMAIL / ADMIN_PASSWORD env vars.
  // NEVER seeded in production (guard below).
  if (process.env.NODE_ENV !== "production") {
    const email = process.env.ADMIN_EMAIL ?? "admin@wazabiashara.local";
    const password = process.env.ADMIN_PASSWORD ?? "admin123456";
    const role = await prisma.adminRole.findUniqueOrThrow({ where: { key: "super_admin" } });
    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (!existing) {
      await prisma.adminUser.create({
        data: { email, name: "Super Admin", passwordHash: await bcrypt.hash(password, 10), roleId: role.id },
      });
      console.log(`Seeded dev admin: ${email}`);
    }
  }

  // ---------- Notification templates ----------
  const TEMPLATES: { key: string; channel: "sms" | "email" | "in_app"; subject?: string; body: string }[] = [
    { key: "password_reset", channel: "sms", body: "Your Wazabiashara reset code is {{code}}. Expires in 5 minutes." },
    { key: "password_reset", channel: "email", subject: "Password reset code", body: "Hello {{user_name}}, your reset code is {{code}}. It expires in 5 minutes." },
    { key: "stock.low", channel: "sms", body: "Low stock: {{product_name}} has {{stock}} left at {{business_name}}." },
    { key: "stock.low", channel: "email", subject: "Low stock alert — {{product_name}}", body: "{{product_name}} is at {{stock}} units (threshold {{threshold}}) in {{business_name}}." },
    { key: "subscription.expiring", channel: "email", subject: "Subscription expiring — {{business_name}}", body: "Your {{subscription_name}} subscription for {{business_name}} expires on {{expiry_date}}." },
    { key: "subscription.expiring", channel: "sms", body: "{{business_name}} subscription expires {{expiry_date}}." },
    { key: "debt.due", channel: "sms", body: "Debt due: {{amount}} for {{party}} at {{business_name}} (due {{due_date}})." },
    { key: "welcome", channel: "email", subject: "Welcome to Wazabiashara", body: "Karibu {{user_name}}! Your account is ready." },
  ];
  for (const t of TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { key_channel: { key: t.key, channel: t.channel } },
      update: { body: t.body, subject: t.subject },
      create: t,
    });
  }
  console.log(`Seeded ${TEMPLATES.length} notification templates`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
