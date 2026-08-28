import { Module } from "@nestjs/common";
import { DatabaseIndicator } from "./indicators/database.indicator";
import { RedisIndicator } from "./indicators/redis.indicator";
import { DATABASE_PINGER, REDIS_PINGER } from "./pinger";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    { provide: DATABASE_PINGER, useClass: DatabaseIndicator },
    { provide: REDIS_PINGER, useClass: RedisIndicator },
  ],
})
export class HealthModule {}
