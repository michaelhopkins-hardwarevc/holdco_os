import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

// Smoke test proving the unit-test harness (Vitest) runs and the class-name
// helper behaves. Real domain tests arrive with Phase 1 features.
describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });

  it("lets later Tailwind classes win a conflict", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
