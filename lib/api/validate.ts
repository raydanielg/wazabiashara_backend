import { z } from "zod";
import { AppError } from "./errors";

export async function body<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw AppError.validation({ body: ["Invalid JSON body"] });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "body";
      (fields[key] ??= []).push(issue.message);
    }
    throw AppError.validation(fields);
  }
  return parsed.data;
}

/** Remove null values (zod `.nullable()` -> treat null as "leave unchanged"). */
export function stripNulls<T extends Record<string, unknown>>(
  obj: T,
): { [K in keyof T]: Exclude<T[K], null> } {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null),
  ) as { [K in keyof T]: Exclude<T[K], null> };
}

export function pagination(searchParams: URLSearchParams) {
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const perPage = Math.min(100, Math.max(1, Number(searchParams.get("per_page")) || 20));
  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}
