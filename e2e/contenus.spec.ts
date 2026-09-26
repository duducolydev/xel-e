import { readFile } from "node:fs/promises";
import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";

const MOT_DE_PASSE_DEMO = "XeleDemo2026";
const BASE_URL = "http://localhost:3110";

const CONTENU = `Les êtres vivants échangent des gaz avec leur milieu.

## Inspiration

L'air entre dans les poumons : il est riche en dioxygène ($O_2$).

## Expiration

L'air rejeté est plus riche en dioxyde de carbone ($CO_2$).

## Bilan

$$\\text{glucose} + O_2 \\rightarrow CO_2 + H_2O + \\text{énergie}$$
`;

async function adminConnecte(): Promise<APIRequestContext> {
  const admin = await request.newContext({ baseURL: BASE_URL });
  const reponse = await admin.post("/api/auth/connexion", {
    data: { login: "admin.demo@xele.sn", motDePasse: MOT_DE_PASSE_DEMO },
  });
  expect(reponse.status()).toBe(200);
  return admin;
}

async function creerLecon(admin: APIRequestContext, titre: string, publier: boolean): Promise<string> {
  const chapitre = await admin.post("/api/admin/chapitres", {
    data: { niveau: "3e", matiere: "SVT", titre: `La respiration ${Date.now()}` },
  });
  expect(chapitre.status()).toBe(201);
  const lecon = await admin.post("/api/admin/lecons", {
    data: { chapitreId: (await chapitre.json()).id, titre, contenu: CONTENU },
  });
  expect(lecon.status()).toBe(201);
  const { id, slug } = (await lecon.json()) as { id: string; slug: string };
  if (publier) {
    expect((await admin.post(`/api/admin/lecons/${id}/soumettre`)).status()).toBe(200);
    expect((await admin.post(`/api/admin/lecons/${id}/publier`)).status()).toBe(200);
  }
  return slug;
}

async function seConnecterEleve(page: Page): Promise<void> {
  await page.goto("/connexion");
  await page.getByLabel("Email ou identifiant").fill("eleve.demo@xele.sn");
  await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE_DEMO);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord$/);
}

test("un admin publie une leçon → elle apparaît dans la navigation élève → l'élève l'ouvre et la pagine", async ({
  page,
}) => {
  const titre = `Les échanges gazeux ${Date.now()}`;
  const admin = await adminConnecte();
  await creerLecon(admin, titre, true);
  await admin.dispose();

  await seConnecterEleve(page);
  await page.getByRole("link", { name: "Voir les cours" }).click();
  await expect(page).toHaveURL(/\/cours\/3e$/);
  await page.getByRole("link", { name: /Sciences de la Vie et de la Terre/ }).click();
  await page.getByRole("link", { name: titre }).click();

  await expect(page.getByRole("heading", { level: 1, name: titre })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Fil d'Ariane" })).toContainText("Sciences de la Vie et de la Terre");
  await expect(page.getByRole("heading", { level: 2, name: "Introduction" })).toBeVisible();

  await page.getByRole("link", { name: "Section suivante →" }).click();
  await expect(page).toHaveURL(/\?section=2$/);
  await expect(page.getByRole("heading", { level: 2, name: "Inspiration" })).toBeVisible();
  await expect(page.locator(".contenu-lecon .katex").first()).toBeVisible();

  await page.getByRole("link", { name: "Section suivante →" }).click();
  await expect(page).toHaveURL(/\?section=3$/);
  await page.getByRole("link", { name: "Section suivante →" }).click();
  await expect(page).toHaveURL(/\?section=4$/);
  await expect(page.getByRole("heading", { level: 2, name: "Bilan" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Section suivante →" })).toHaveCount(0);

  await page.getByRole("link", { name: "← Section précédente" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Expiration" })).toBeVisible();
});

test("le téléchargement du PDF d'une leçon publiée renvoie un fichier valide", async ({ page }) => {
  await page.goto("/cours/4e/maths/le-theoreme-de-pythagore");

  const [telechargement] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Télécharger le PDF" }).click(),
  ]);

  expect(telechargement.suggestedFilename()).toBe("le-theoreme-de-pythagore-v1.pdf");
  const contenu = await readFile((await telechargement.path()) ?? "");
  expect(contenu.length).toBeGreaterThan(1000);
  expect(contenu.subarray(0, 5).toString()).toBe("%PDF-");
});

test("une leçon en brouillon renvoie 404 à un élève", async ({ page }) => {
  const admin = await adminConnecte();
  const slug = await creerLecon(admin, `Brouillon secret ${Date.now()}`, false);
  await admin.dispose();

  await seConnecterEleve(page);
  const reponse = await page.goto(`/cours/3e/svt/${slug}`);

  expect(reponse?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  const api = await page.request.get(`/api/lecons/${slug}`);
  expect(api.status()).toBe(404);
});

test("une leçon publiée expose ses métadonnées de référencement et figure dans le sitemap", async ({ page }) => {
  await page.goto("/cours/4e/maths/le-theoreme-de-pythagore");

  await expect(page).toHaveTitle(/Le théorème de Pythagore/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /triangle rectangle/);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${BASE_URL}/cours/4e/maths/le-theoreme-de-pythagore`,
  );

  const sitemap = await page.request.get("/sitemap.xml");
  expect(await sitemap.text()).toContain("/cours/4e/maths/le-theoreme-de-pythagore");
});
