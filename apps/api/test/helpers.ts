import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configurerApp } from "../src/configure-app";

export * from "./infra";

export async function creerApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configurerApp(app);
  await app.init();
  return app;
}

export async function connecter(
  app: INestApplication,
  login: string,
  motDePasse: string,
): Promise<InstanceType<typeof request.agent>> {
  const agent = request.agent(app.getHttpServer());
  await agent.post("/auth/connexion").send({ login, motDePasse }).expect(200);
  return agent;
}

export function cookie(reponse: request.Response, nom: string): string | undefined {
  const brut = reponse.headers["set-cookie"] as unknown as string[] | undefined;
  return brut?.find((ligne) => ligne.startsWith(`${nom}=`));
}
