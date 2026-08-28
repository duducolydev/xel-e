import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "./health";

describe("healthResponseSchema", () => {
  it("accepts a valid ok payload", () => {
    const result = healthResponseSchema.safeParse({
      status: "ok",
      database: true,
      redis: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unknown status value", () => {
    const result = healthResponseSchema.safeParse({
      status: "unknown",
      database: true,
      redis: true,
    });

    expect(result.success).toBe(false);
  });
});
