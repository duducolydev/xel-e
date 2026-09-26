import { Controller, Get, INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccessTokenService } from "./access-token.service";
import { COOKIE_ACCES } from "./cookies";
import { CurrentUser, Public, Roles, type UtilisateurAuthentifie } from "./decorators";
import { JwtAuthGuard, RolesGuard } from "./guards";

@Controller("factice")
class ControleurFactice {
  @Public()
  @Get("public")
  public() {
    return { ok: true };
  }

  @Get("connecte")
  connecte(@CurrentUser() utilisateur: UtilisateurAuthentifie) {
    return utilisateur;
  }

  @Roles("ADMIN")
  @Get("admin")
  admin() {
    return { ok: true };
  }

  @Roles("PROFESSEUR", "ADMIN")
  @Get("studio")
  studio() {
    return { ok: true };
  }
}

const jetonsFactices: Record<string, UtilisateurAuthentifie> = {
  "jeton-eleve": { id: "eleve-1", role: "ELEVE" },
  "jeton-prof": { id: "prof-1", role: "PROFESSEUR" },
  "jeton-admin": { id: "admin-1", role: "ADMIN" },
};

const accessTokensFactice = {
  verifier: async (token: string) => jetonsFactices[token] ?? null,
};

describe("guards d'authentification et de rôles (routes factices)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ControleurFactice],
      providers: [
        { provide: AccessTokenService, useValue: accessTokensFactice },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const appeler = (chemin: string, jeton?: string) => {
    const requete = request(app.getHttpServer()).get(chemin);
    return jeton ? requete.set("Cookie", `${COOKIE_ACCES}=${jeton}`) : requete;
  };

  it("laisse passer une route @Public() sans session", async () => {
    await appeler("/factice/public").expect(200);
  });

  it("refuse une route protégée sans session (401)", async () => {
    const reponse = await appeler("/factice/connecte").expect(401);
    expect(reponse.body.message).toMatch(/connecté/);
  });

  it("refuse un jeton invalide ou expiré (401)", async () => {
    await appeler("/factice/connecte", "jeton-bidon").expect(401);
  });

  it("injecte l'utilisateur courant avec @CurrentUser()", async () => {
    const reponse = await appeler("/factice/connecte", "jeton-eleve").expect(200);
    expect(reponse.body).toEqual({ id: "eleve-1", role: "ELEVE" });
  });

  it("refuse un rôle non autorisé (403)", async () => {
    await appeler("/factice/admin", "jeton-eleve").expect(403);
    await appeler("/factice/admin", "jeton-prof").expect(403);
  });

  it("autorise le rôle requis", async () => {
    await appeler("/factice/admin", "jeton-admin").expect(200);
  });

  it("autorise n'importe lequel des rôles listés", async () => {
    await appeler("/factice/studio", "jeton-prof").expect(200);
    await appeler("/factice/studio", "jeton-admin").expect(200);
    await appeler("/factice/studio", "jeton-eleve").expect(403);
  });

  it("vérifie l'authentification avant le rôle (401 plutôt que 403 sans session)", async () => {
    await appeler("/factice/admin").expect(401);
  });
});
