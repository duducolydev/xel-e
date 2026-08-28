import { Inject, Injectable } from "@nestjs/common";
import type { HealthResponse } from "@xel-e/shared";
import { DATABASE_PINGER, Pinger, REDIS_PINGER } from "./pinger";

@Injectable()
export class HealthService {
  constructor(
    @Inject(DATABASE_PINGER) private readonly database: Pinger,
    @Inject(REDIS_PINGER) private readonly redis: Pinger,
  ) {}

  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([this.database.ping(), this.redis.ping()]);

    return {
      status: database && redis ? "ok" : "degraded",
      database,
      redis,
    };
  }
}
