import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import type { Env } from "./config/env";
import { configurerApp } from "./configure-app";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configurerApp(app);
  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get("API_PORT", { infer: true }));
}

bootstrap();
