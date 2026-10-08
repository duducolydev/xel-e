import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { expect, request, test, type Page } from "@playwright/test";

const BASE_URL = "http://localhost:3110";
const MOT_DE_PASSE_DEMO = "XeleDemo2026";

// Client Prisma de l'API, pour simuler l'écoulement du temps (expiration) directement en base.
function prismaDeTest() {
  const env = { ...parseEnv(readFileSync(join(process.cwd(), ".env"), "utf8")), ...process.env };
  const { PrismaClient } = createRequire(join(process.cwd(), "apps/api/package.json"))("@prisma/client") as typeof import("@prisma/client");
  return new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
}

async function nouvelEleve(page: Page): Promise<string> {
  const identifiant = `premium.${Date.now()}`;
  const api = await request.newContext({ baseURL: BASE_URL });
  const inscription = await api.post("/api/auth/inscription/eleve", {
    data: { nomComplet: "Aminata Fall", identifiant, niveau: "3e", naissanceMois: 3, naissanceAnnee: 2010, motDePasse: "motdepasse1" },
  });
  expect(inscription.status()).toBe(201);
  await api.dispose();
  await page.goto("/connexion");
  await page.getByLabel("Email ou identifiant").fill(identifiant);
  await page.getByLabel("Mot de passe").fill("motdepasse1");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord$/);
  return identifiant;
}

// `next dev` compile chaque route à sa première visite : on les compile avant le scénario.
test.beforeAll(async () => {
  test.setTimeout(240_000);
  const admin = await request.newContext({ baseURL: BASE_URL });
  expect((await admin.post("/api/auth/connexion", { data: { login: "admin.demo@xele.sn", motDePasse: MOT_DE_PASSE_DEMO } })).status()).toBe(200);
  for (const chemin of ["/abonnement", "/abonnement/retour?paiement=x", "/paiement/simulateur?ref=x", "/bfem", "/bfem/examens/bfem-maths-examen-blanc-2"]) {
    await admin.get(chemin, { timeout: 180_000 });
  }
  await admin.dispose();
});

test("élève choisit Premium → paiement simulé → webhook → l'examen premium s'ouvre ; à l'expiration il se reverrouille avec un message clair", async ({ page }) => {
  test.setTimeout(240_000);
  const identifiant = await nouvelEleve(page);

  // 1. L'examen premium est verrouillé ; l'élève passe à Premium depuis l'espace BFEM.
  await page.goto("/bfem");
  const premium = page.getByRole("listitem").filter({ hasText: "Examen blanc BFEM n°2" });
  await expect(premium.getByText("Réservé aux abonnés Premium.")).toBeVisible();
  await premium.getByRole("link", { name: "Passer à Premium" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mon abonnement" })).toBeVisible();
  await expect(page.getByTestId("etat-abonnement")).toContainText("Gratuit");

  // 2. Checkout simulé (remplace la page Wave / Orange Money), puis webhook de confirmation.
  await page.getByRole("button", { name: "Payer 1 500 FCFA avec Paiement simulé (test)" }).click();
  await expect(page.getByRole("heading", { name: "Simulateur de paiement" })).toBeVisible();
  await expect(page.getByText("1 500 FCFA")).toBeVisible();
  await page.getByRole("button", { name: "Simuler un paiement réussi" }).click();
  await expect(page.getByText(/Paiement confirmé : l'accès Premium de Aminata Fall est activé jusqu'au/)).toBeVisible({ timeout: 30_000 });

  // 3. L'examen premium devient accessible immédiatement.
  await page.getByRole("link", { name: "Aller aux examens blancs" }).click();
  await page.getByRole("listitem").filter({ hasText: "Examen blanc BFEM n°2" }).getByRole("link", { name: "Voir l'examen" }).click();
  await expect(page.getByRole("button", { name: "Commencer l'examen" })).toBeVisible();

  // Le reçu est disponible dans « Mon abonnement ».
  await page.goto("/abonnement");
  await expect(page.getByTestId("etat-abonnement")).toContainText("Premium");
  await expect(page.getByRole("link", { name: /^Reçu XE-\d{4}-\d{6}$/ })).toBeVisible();

  // 4. Expiration simulée : la période se termine, le cycle horaire passe.
  const prisma = prismaDeTest();
  try {
    const eleve = await prisma.user.findUniqueOrThrow({ where: { identifiant } });
    await prisma.abonnement.updateMany({
      where: { utilisateurId: eleve.id },
      data: { debutLe: new Date(Date.now() - 31 * 86_400_000), expireLe: new Date(Date.now() - 60_000) },
    });
  } finally {
    await prisma.$disconnect();
  }
  const admin = await request.newContext({ baseURL: BASE_URL });
  await admin.post("/api/auth/connexion", { data: { login: "admin.demo@xele.sn", motDePasse: MOT_DE_PASSE_DEMO } });
  expect((await admin.post("/api/admin/abonnements/cycle")).status()).toBe(200);
  await admin.dispose();

  // 5. Le contenu premium est de nouveau verrouillé, avec un message clair (pas d'erreur brute).
  await page.goto("/bfem");
  await expect(page.getByTestId("premium-expire")).toContainText(/Ton accès Premium a pris fin le .*tes résultats et ton historique restent disponibles/);
  await expect(page.getByRole("listitem").filter({ hasText: "Examen blanc BFEM n°2" }).getByText("Réservé aux abonnés Premium.")).toBeVisible();
  await page.goto("/bfem/examens/bfem-maths-examen-blanc-2");
  await expect(page.getByText("Cet examen blanc est réservé aux abonnés Premium.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Commencer l'examen" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Voir les offres Premium" })).toBeVisible();
});
