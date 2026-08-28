export interface Pinger {
  ping(): Promise<boolean>;
}

export const DATABASE_PINGER = Symbol("DATABASE_PINGER");
export const REDIS_PINGER = Symbol("REDIS_PINGER");
