import { Global, Inject, Injectable, Logger, Module, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { Env } from "../config/env";

export const REDIS_CLIENT = Symbol("REDIS_CLIENT");

@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const logger = new Logger("Redis");
        const client = new Redis(config.get("REDIS_URL", { infer: true }), {
          connectTimeout: 2000,
          maxRetriesPerRequest: 1,
        });
        client.on("error", (error) => logger.warn(error.message));
        return client;
      },
    },
    RedisLifecycle,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
