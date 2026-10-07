import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { join } from "node:path";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { ContenusModule } from "./contenus/contenus.module";
import { validateEnv } from "./config/env";
import { ForumModule } from "./forum/forum.controller";
import { HealthModule } from "./health/health.module";
import { MailModule } from "./mail/mail.module";
import { NotificationsModule } from "./notifications/notifications.service";
import { PrismaModule } from "./prisma/prisma.module";
import { ProgressionModule } from "./progression/progression.controller";
import { QuizModule } from "./quiz/quiz.controller";
import { RedisModule } from "./redis/redis.module";
import { StudioModule } from "./studio/studio.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), ".env"), join(process.cwd(), "..", "..", ".env")],
      validate: validateEnv,
    }),
    PrismaModule,
    RedisModule,
    MailModule,
    NotificationsModule,
    HealthModule,
    AuthModule,
    AdminModule,
    ContenusModule,
    QuizModule,
    ProgressionModule,
    StudioModule,
    ForumModule,
  ],
})
export class AppModule {}
