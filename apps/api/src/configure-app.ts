import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import type { Env } from "./config/env";

export function configurerApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  // Le front (proxy Next.js) et Traefik sont sur des adresses locales/privées : leur X-Forwarded-For fait foi.
  (app as NestExpressApplication).set("trust proxy", "loopback, linklocal, uniquelocal");
  app.use(cookieParser());
  app.enableCors({ origin: config.get("APP_URL", { infer: true }), credentials: true });
}
