/**
 * Safe {{variable}} template rendering (spec §32).
 * No eval, no arbitrary code — only whitelisted variable substitution.
 */

const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function renderTemplate(
  template: string,
  vars: Record<string, string | number | undefined | null>,
): string {
  return template.replace(VAR_RE, (_, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

/** Returns variable names referenced by a template. */
export function templateVars(template: string): string[] {
  return [...template.matchAll(VAR_RE)].map((m) => m[1]);
}
