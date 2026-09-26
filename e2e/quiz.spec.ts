import { expect, test, type Page } from "@playwright/test";

const MOT_DE_PASSE_DEMO = "XeleDemo2026";
const LECON = "/cours/4e/maths/le-theoreme-de-pythagore";

async function seConnecterEleve(page: Page): Promise<void> {
  await page.goto("/connexion");
  await page.getByLabel("Email ou identifiant").fill("eleve.demo@xele.sn");
  await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE_DEMO);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord$/);
}

async function questionSuivante(page: Page, numero: number): Promise<void> {
  const position = page.waitForResponse((r) => r.url().includes("/position") && r.request().method() === "PUT");
  await page.getByRole("button", { name: "Suivante →" }).click();
  await position;
  await expect(page.getByText(`Question ${numero} sur 5`)).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("parcours élève : ouvre un quiz → répond → soumet → voit score et corrigé → historique", async ({ page }) => {
  await seConnecterEleve(page);
  await page.goto(LECON);
  await page.getByRole("link", { name: "Faire le quiz" }).click();
  await page.getByRole("button", { name: "Commencer le quiz" }).click();

  await page.getByRole("radio", { name: "[BC]" }).check();
  await questionSuivante(page, 2);

  await expect(page.getByText("Plusieurs réponses possibles.")).toBeVisible();
  await page.getByRole("checkbox", { name: "BC² = AB² + AC²" }).check();
  await page.getByRole("checkbox", { name: "AB² = BC² − AC²" }).check();
  await questionSuivante(page, 3);

  // Au clavier : focus sur « Vrai », flèche vers la droite ⇒ « Faux » est sélectionné.
  await page.getByRole("radio", { name: "Vrai" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Faux" })).toBeChecked();
  await questionSuivante(page, 4);

  await page.getByLabel("Ta réponse").fill("10");
  await questionSuivante(page, 5);

  await page.getByLabel("Ta réponse").fill("HYPOTENUSE");
  await page.getByRole("button", { name: "Terminer le quiz" }).click();

  await expect(page).toHaveURL(/\/quiz\/resultats\//);
  await expect(page.getByText("100 %")).toBeVisible();
  await expect(page.getByText("Bravo, quiz réussi !")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Corrigé" })).toBeVisible();
  await expect(page.getByText("BC² = 6² + 8² = 36 + 64 = 100, donc BC = √100 = 10 cm.")).toBeVisible();

  await page.getByRole("link", { name: "Mes quiz" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Le théorème de Pythagore" }).first()).toContainText("100 %");
});

test("interruption : fermer l'onglet en plein quiz puis revenir ⇒ reprise à la même question", async ({
  page,
  context,
}) => {
  await seConnecterEleve(page);
  await page.goto(`${LECON}/quiz`);
  await page.getByRole("button", { name: "Commencer le quiz" }).click();

  await page.getByRole("radio", { name: "[BC]" }).check();
  await questionSuivante(page, 2);
  await page.getByRole("checkbox", { name: "BC² = AB² + AC²" }).check();
  await questionSuivante(page, 3);
  await page.close();

  const retour = await context.newPage();
  await retour.goto(`${LECON}/quiz`);

  await expect(retour.getByText("Tu reprends là où tu t'étais arrêté.")).toBeVisible();
  await expect(retour.getByText("Question 3 sur 5")).toBeVisible();
  await retour.getByRole("button", { name: "← Précédente" }).click();
  await expect(retour.getByRole("checkbox", { name: "BC² = AB² + AC²" })).toBeChecked();
  await retour.getByRole("button", { name: "← Précédente" }).click();
  await expect(retour.getByRole("radio", { name: "[BC]" })).toBeChecked();
});

test("la page du quiz ne contient ni les bonnes réponses ni les explications", async ({ page }) => {
  await seConnecterEleve(page);
  await page.goto(`${LECON}/quiz`);

  const html = await page.content();
  expect(html).not.toContain("√100");
  expect(html).not.toContain("reponseCorrecte");
  expect(html).not.toContain("toujours le plus long");
});
