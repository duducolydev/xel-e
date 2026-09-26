import { Inject, Injectable } from "@nestjs/common";
import Redis from "ioredis";
import { REDIS_CLIENT } from "../../redis/redis.module";
import { Pinger } from "../pinger";

@Injectable()
export class RedisIndicator implements Pinger {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async ping(): Promise<boolean> {
    try {
      const response = await this.client.ping();
      return response === "PONG";
    } catch {
      return false;
    }
  }
}
