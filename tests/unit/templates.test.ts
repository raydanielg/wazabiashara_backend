import { describe, expect, it } from "vitest";
import { renderTemplate, templateVars } from "../../lib/templates";

describe("renderTemplate", () => {
  it("substitutes whitelisted variables", () => {
    expect(
      renderTemplate("Hello {{user_name}}, code {{code}}", {
        user_name: "Ezra",
        code: 123456,
      }),
    ).toBe("Hello Ezra, code 123456");
  });

  it("renders missing vars as empty", () => {
    expect(renderTemplate("A {{missing}} B", {})).toBe("A  B");
  });

  it("does not execute arbitrary code — invalid vars render literally", () => {
    expect(renderTemplate("{{constructor.constructor}}", {})).toBe(
      "{{constructor.constructor}}",
    );
  });

  it("extracts variable names", () => {
    expect(templateVars("{{a}} {{ b}} {{a}}")).toEqual(["a", "b", "a"]);
  });
});
