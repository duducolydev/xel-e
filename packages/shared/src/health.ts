import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  database: z.boolean(),
  redis: z.boolean(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
