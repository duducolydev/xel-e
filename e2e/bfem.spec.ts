import { randomUUID } from "node:crypto";
import { expect, request, test, type Browser, type Page } from "@playwright/test";

const BASE_URL = "http://localhost:3110";
const MOT_DE_PASSE_DEMO = "XeleDemo2026";

async function connecter(browser: Browser, login: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/connexion");
  await page.getByLabel("Email ou identifiant").fill(login);
  await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE_DEMO);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord$/);
  return page;
}

// `next dev` compile chaque route à sa première visite : on les compile avant le scénario.
test.beforeAll(async () => {
  test.setTimeout(240_000);
  const admin = await request.newContext({ baseURL: BASE_URL });
  expect((await admin.post("/api/auth/connexion", { data: { login: "admin.demo@xele.sn", motDePasse: MOT_DE_PASSE_DEMO } })).status()).toBe(200);
  for (const chemin of [
    "/bfem",
    "/bfem/examens/bfem-maths-examen-blanc-1",
    `/bfem/copies/${randomUUID()}`,
    `/bfem/copies/${randomUUID()}/resultat`,
    "/bfem/historique",
  ]) {
    await admin.get(chemin, { timeout: 180_000 });
  }
  await admin.dispose();
});

test("examen blanc chronométré : minuteur, soumission automatique à la fin du temps, résultats et historique", async ({ browser }) => {
  test.setTimeout(240_000);
  const fatou = await connecter(browser, "eleve.demo@xele.sn");

  // 1. Fatou (3e) lance le premier examen blanc : le minuteur s'affiche.
  await fatou.getByRole("link", { name: "BFEM", exact: true }).click();
  await expect(fatou.getByRole("heading", { level: 1, name: "Préparer le BFEM" })).toBeVisible();
  const premier = fatou.getByRole("listitem").filter({ hasText: "Examen blanc BFEM n°1 — Mathématiques" });
  await premier.getByRole("link", { name: "Voir l'examen" }).click();
  await fatou.getByRole("button", { name: "Commencer l'examen" }).click();
  await expect(fatou).toHaveURL(/\/bfem\/copies\/[0-9a-f-]+$/);
  const minuteur = fatou.getByRole("timer", { name: "Temps restant" });
  await expect(minuteur).toBeVisible();
  await expect(minuteur).toHaveText(/^00:(0\d|1[0-5])$/);

  // 2. Elle répond à une question (enregistrée au fil de l'eau) puis laisse filer le temps.
  const champ = fatou.getByLabel(/Réponse à : Exercice 1\. a\)/);
  await champ.fill("1/2");
  await champ.blur();
  await expect(fatou.getByText("Enregistré").first()).toBeVisible();

  // 3. À expiration : soumission automatique et écran de résultats.
  await expect(fatou).toHaveURL(/\/bfem\/copies\/[0-9a-f-]+\/resultat$/, { timeout: 30_000 });
  await expect(fatou.getByText("Temps écoulé : ta copie a été rendue automatiquement")).toBeVisible();
  await expect(fatou.getByTestId("note-examen")).toHaveText("1 / 20");
  await expect(fatou.getByRole("heading", { name: "Corrigé" })).toBeVisible();

  // 4. Accès Premium accordé par l'admin : Fatou passe le second examen et rend sa copie elle-même.
  const admin = await connecter(browser, "admin.demo@xele.sn");
  await admin.goto("/admin/bfem");
  await admin.getByLabel("Email ou identifiant").fill("eleve.demo@xele.sn");
  await admin.getByRole("button", { name: "Accorder" }).click();
  await expect(admin.getByText(/Accès Premium ouvert jusqu'au/)).toBeVisible();

  await fatou.goto("/bfem");
  const second = fatou.getByRole("listitem").filter({ hasText: "Examen blanc BFEM n°2 — Mathématiques" });
  await second.getByRole("link", { name: "Voir l'examen" }).click();
  await fatou.getByRole("button", { name: "Commencer l'examen" }).click();
  await fatou.getByRole("radio", { name: "x² − 4", exact: true }).check();
  await expect(fatou.getByText("Enregistré").first()).toBeVisible();
  await fatou.getByRole("button", { name: "Rendre ma copie" }).click();
  await fatou.getByRole("button", { name: "Oui, rendre ma copie" }).click();
  await expect(fatou).toHaveURL(/\/resultat$/);
  await expect(fatou.getByTestId("note-examen")).toHaveText("4 / 20");

  // 5. L'historique montre les deux examens passés avec leurs scores.
  await fatou.getByRole("link", { name: "Mon historique" }).click();
  const lignes = fatou.getByTestId("ligne-historique");
  await expect(lignes).toHaveCount(2);
  await expect(lignes.nth(0)).toContainText("Examen blanc BFEM n°2 — Mathématiques");
  await expect(lignes.nth(0)).toContainText("4 / 20");
  await expect(lignes.nth(1)).toContainText("Examen blanc BFEM n°1 — Mathématiques");
  await expect(lignes.nth(1)).toContainText("(temps écoulé)");
  await expect(lignes.nth(1)).toContainText("1 / 20");
  await expect(fatou.getByRole("img", { name: "Évolution des notes en Mathématiques" })).toBeVisible();
});

test("sans abonnement, l'examen premium est verrouillé", async ({ browser }) => {
  const api = await request.newContext({ baseURL: BASE_URL });
  const identifiant = `bfem.${Date.now()}`;
  expect(
    (
      await api.post("/api/auth/inscription/eleve", {
        data: { nomComplet: "Ibou Ndiaye", identifiant, niveau: "3e", naissanceMois: 2, naissanceAnnee: 2010, motDePasse: "motdepasse1" },
      })
    ).status(),
  ).toBe(201);
  const page = await (await browser.newContext()).newPage();
  await page.goto("/connexion");
  await page.getByLabel("Email ou identifiant").fill(identifiant);
  await page.getByLabel("Mot de passe").fill("motdepasse1");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord$/);

  await page.goto("/bfem");

  const premium = page.getByRole("listitem").filter({ hasText: "Examen blanc BFEM n°2" });
  await expect(premium.getByText("Réservé aux abonnés Premium.")).toBeVisible();
  await expect(premium.getByRole("link", { name: "Voir l'examen" })).toHaveCount(0);
  await expect(premium.getByRole("link", { name: "Passer à Premium" })).toBeVisible();
});
