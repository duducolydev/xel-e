import { describe, expect, it, vi } from "vitest";
import { Pinger } from "./pinger";
import { HealthService } from "./health.service";

function makePinger(result: boolean): Pinger {
  return { ping: vi.fn().mockResolvedValue(result) };
}

describe("HealthService", () => {
  it("renvoie ok quand la BD et Redis répondent", async () => {
    const service = new HealthService(makePinger(true), makePinger(true));

    await expect(service.check()).resolves.toEqual({
      status: "ok",
      database: true,
      redis: true,
    });
  });

  it("renvoie degraded quand la BD ne répond pas", async () => {
    const service = new HealthService(makePinger(false), makePinger(true));

    await expect(service.check()).resolves.toEqual({
      status: "degraded",
      database: false,
      redis: true,
    });
  });

  it("renvoie degraded quand Redis ne répond pas", async () => {
    const service = new HealthService(makePinger(true), makePinger(false));

    await expect(service.check()).resolves.toEqual({
      status: "degraded",
      database: true,
      redis: false,
    });
  });

  it("renvoie degraded quand aucun des deux ne répond", async () => {
    const service = new HealthService(makePinger(false), makePinger(false));

    await expect(service.check()).resolves.toEqual({
      status: "degraded",
      database: false,
      redis: false,
    });
  });
});
