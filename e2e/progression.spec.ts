import { expect, request, test, type Page } from "@playwright/test";

const BASE_URL = "http://localhost:3110";
const LECON = "/cours/3e/svt/3e-svt-chapitre-1-lecon-1";

async function nouvelEleve(page: Page): Promise<void> {
  const identifiant = `eleve.${Date.now()}`;
  const api = await request.newContext({ baseURL: BASE_URL });
  const inscription = await api.post("/api/auth/inscription/eleve", {
    data: {
      nomComplet: "Mariama Ba",
      identifiant,
      niveau: "3e",
      naissanceMois: 1,
      naissanceAnnee: 2010,
      motDePasse: "motdepasse1",
    },
  });
  expect(inscription.status()).toBe(201);
  await api.dispose();

  await page.goto("/connexion");
  await page.getByLabel("Email ou identifiant").fill(identifiant);
  await page.getByLabel("Mot de passe").fill("motdepasse1");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord$/);
}

const stat = (page: Page, libelle: string) => page.getByTestId(`stat-${libelle}`);

test("terminer une leçon + réussir son quiz ⇒ le tableau de bord reflète progression et XP, sans recharger", async ({
  page,
}) => {
  await nouvelEleve(page);
  await expect(stat(page, "XP au total")).toHaveText("0 XP");
  await expect(page.getByTestId("progression-svt")).toHaveText("0 %");

  await page.goto(`${LECON}?section=4`);
  await page.getByRole("button", { name: "J'ai terminé cette leçon" }).click();
  await expect(page.getByText("Leçon terminée : +10 XP")).toBeVisible();

  await page.getByRole("link", { name: "Commencer le quiz" }).click();
  await page.getByRole("button", { name: "Commencer le quiz" }).click();
  await page.getByRole("radio", { name: "5" }).check();
  await page.getByRole("button", { name: "Suivante →" }).click();
  await page.getByRole("radio", { name: "Vrai" }).check();
  await page.getByRole("button", { name: "Suivante →" }).click();
  await page.getByLabel("Ta réponse").fill("4");
  await page.getByRole("button", { name: "Terminer le quiz" }).click();
  await expect(page.getByText("+30 XP")).toBeVisible();

  // Navigation par le lien de l'interface, jamais de page.reload().
  await page.getByRole("link", { name: "Mon espace" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord$/);
  await expect(stat(page, "XP au total")).toHaveText("40 XP");
  await expect(stat(page, "XP cette semaine")).toHaveText("40 XP");
  await expect(stat(page, "Série en cours")).toHaveText("1 jour");
  await expect(page.getByTestId("progression-svt")).not.toHaveText("0 %");
  await expect(page.getByRole("heading", { name: "Mes badges (3/6)" })).toBeVisible();
  await expect(page.getByText("Quiz : Leçon 1")).toBeVisible();
});

test("le badge « Première leçon » apparaît avec sa notification in-app", async ({ page }) => {
  await nouvelEleve(page);

  await page.goto(`${LECON}?section=4`);
  await page.getByRole("button", { name: "J'ai terminé cette leçon" }).click();
  await expect(page.getByText("Nouveau badge : Première leçon")).toBeVisible();

  await page.getByRole("link", { name: "Mon espace" }).click();
  const notifications = page.getByRole("region", { name: /Notifications/ });
  await expect(notifications.getByText("1 nouvelle")).toBeVisible();
  await expect(notifications.getByText(/Nouveau badge : Première leçon/)).toBeVisible();

  await notifications.getByRole("button", { name: "Tout marquer comme lu" }).click();
  await expect(notifications.getByText("1 nouvelle")).toHaveCount(0);
});

test("un élève rejoint le classement sous pseudonyme puis s'en retire", async ({ page }) => {
  await nouvelEleve(page);
  const pseudonyme = `mariama_${Date.now() % 100000}`;

  await page.getByRole("link", { name: "Classement" }).click();
  await page.getByLabel("Choisis ton pseudonyme").fill(pseudonyme);
  await page.getByRole("button", { name: "Participer au classement" }).click();

  await expect(page.getByRole("row", { name: new RegExp(`${pseudonyme} \\(toi\\)`) })).toBeVisible();
  await expect(page.getByText("Mariama Ba")).toHaveCount(0);

  await page.getByRole("button", { name: "Me retirer du classement" }).click();
  await expect(page.getByRole("row", { name: new RegExp(pseudonyme) })).toHaveCount(0);
});
