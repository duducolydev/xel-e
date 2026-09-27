import { randomUUID } from "node:crypto";
import { expect, request, test, type Browser, type Page } from "@playwright/test";

const MOT_DE_PASSE_DEMO = "XeleDemo2026";
const BASE_URL = "http://localhost:3110";

// `next dev` compile chaque route à sa première visite : on les compile avant le scénario
// pour que ses attentes mesurent l'application, pas le compilateur.
test.beforeAll(async () => {
  test.setTimeout(240_000);
  const admin = await request.newContext({ baseURL: BASE_URL });
  const connexion = await admin.post("/api/auth/connexion", { data: { login: "admin.demo@xele.sn", motDePasse: MOT_DE_PASSE_DEMO } });
  expect(connexion.status()).toBe(200);
  for (const chemin of ["/studio", `/studio/lecons/${randomUUID()}`, "/admin/revue", `/admin/revue/${randomUUID()}`, "/cours/3e/maths", "/cours/4e/maths/le-theoreme-de-pythagore"]) {
    await admin.get(chemin, { timeout: 180_000 });
  }
  await admin.dispose();
});

async function connecter(browser: Browser, login: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/connexion");
  await page.getByLabel("Email ou identifiant").fill(login);
  await page.getByLabel("Mot de passe").fill(MOT_DE_PASSE_DEMO);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord$/);
  return page;
}

const CONTENU = `Deux triangles emboîtés, deux droites parallèles.

## Énoncé

Si $(MN) \\parallel (BC)$ alors $\\dfrac{AM}{AB} = \\dfrac{AN}{AC}$.
`;

async function decider(admin: Page, titre: string, decision: (page: Page) => Promise<void>, attendu: RegExp) {
  await admin.goto("/admin/revue");
  await admin.getByRole("link", { name: `Relire « ${titre} »` }).click();
  await expect(admin.getByRole("heading", { level: 1, name: titre })).toBeVisible();
  await decision(admin);
  await expect(admin).toHaveURL(/\/admin\/revue\?decision=/);
  await expect(admin.getByRole("status").filter({ hasText: attendu })).toBeVisible();
}

test("circuit complet : le prof rédige, l'admin refuse puis publie, l'élève lit la leçon attribuée", async ({ browser }) => {
  test.setTimeout(240_000);
  const titre = `Le théorème de Thalès ${Date.now()}`;

  // 1. Le professeur crée la leçon et son quiz, vérifie l'aperçu, puis soumet.
  const prof = await connecter(browser, "prof.demo@xele.sn");
  await prof.getByRole("link", { name: "Studio", exact: true }).click();
  await expect(prof.getByRole("heading", { level: 1, name: "Mon studio" })).toBeVisible();
  await prof.getByLabel("Chapitre").selectOption({ label: "3e · Mathématiques · Chapitre 1" });
  await prof.getByLabel("Titre de la leçon").fill(titre);
  await prof.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(prof.getByRole("heading", { level: 1, name: titre })).toBeVisible();
  await expect(prof.getByTestId("statut-lecon")).toHaveText("Brouillon");

  await prof.getByLabel("Contenu (Markdown)").fill(CONTENU);
  await prof.getByRole("button", { name: "QCM", exact: true }).click();
  await prof.getByLabel("Énoncé de la question 1").fill("Quelle hypothèse faut-il vérifier ?");
  await prof.getByLabel("Choix 1 de la question 1", { exact: true }).fill("Deux droites parallèles");
  await prof.getByLabel("Choix 2 de la question 1", { exact: true }).fill("Un angle droit");
  await prof.getByRole("button", { name: "Vrai ou faux" }).click();
  await prof.getByLabel("Énoncé de la question 2").fill("Les rapports de longueurs sont égaux.");

  await prof.getByRole("tab", { name: "Aperçu" }).click();
  await expect(prof.getByRole("heading", { level: 3, name: "Énoncé" })).toBeVisible();
  await expect(prof.locator(".contenu-lecon .katex").first()).toBeVisible();
  await prof.getByRole("tab", { name: "Rédaction" }).click();

  await prof.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await expect(prof.getByText("Brouillon enregistré.")).toBeVisible();
  await prof.getByRole("button", { name: "Soumettre à la revue" }).click();
  await expect(prof.getByTestId("statut-lecon")).toHaveText("En revue");
  await expect(prof.getByLabel("Contenu (Markdown)")).toBeDisabled();

  // 2. L'administration relit (cours + quiz corrigé) et refuse avec un commentaire.
  const admin = await connecter(browser, "admin.demo@xele.sn");
  await decider(
    admin,
    titre,
    async (page) => {
      await expect(page.getByText("Deux droites parallèles (bonne réponse)")).toBeAttached();
      await page.getByRole("button", { name: "Refuser et renvoyer en brouillon" }).click();
      await expect(page.getByText(/10 caractères minimum/)).toBeVisible();
      await page.getByLabel(/Commentaire de refus/).fill("Ajoute un exemple chiffré après l'énoncé.");
      await page.getByRole("button", { name: "Refuser et renvoyer en brouillon" }).click();
    },
    /renvoyée en brouillon/,
  );

  // 3. Le professeur voit le refus, corrige et resoumet.
  await prof.goto("/studio");
  await expect(prof.getByRole("region", { name: /Notifications/ })).toContainText(`« ${titre} » a été renvoyée en brouillon`);
  await expect(prof.getByText("À corriger : Ajoute un exemple chiffré après l'énoncé.")).toBeVisible();
  await prof.getByRole("link", { name: titre }).click();
  await expect(prof.getByRole("region", { name: "Retours de l'administration" })).toContainText("Ajoute un exemple chiffré");
  await prof.getByLabel("Contenu (Markdown)").fill(`${CONTENU}\n## Exemple\n\nAvec $AM = 2$, $AB = 6$ et $AC = 9$, on trouve $AN = 3$.\n`);
  await prof.getByRole("button", { name: "Soumettre à la revue" }).click();
  await expect(prof.getByTestId("statut-lecon")).toHaveText("En revue");

  // 4. L'administration valide : la leçon est publiée.
  await decider(admin, titre, (page) => page.getByRole("button", { name: `Publier « ${titre} »` }).click(), /Leçon publiée/);

  // 5. L'élève trouve la leçon dans le catalogue, avec l'attribution et le quiz.
  const eleve = await connecter(browser, "eleve.demo@xele.sn");
  await eleve.goto("/cours/3e/maths");
  await eleve.getByRole("link", { name: titre }).click();
  await expect(eleve.getByRole("heading", { level: 1, name: titre })).toBeVisible();
  await expect(eleve.getByText("Cours proposé par Pr Moussa Professeur Démo")).toBeVisible();
  await expect(eleve.getByRole("link", { name: "Faire le quiz" })).toBeVisible();

  // 6. Le professeur est prévenu et voit la lecture de l'élève dans ses statistiques.
  await prof.goto("/studio");
  await expect(prof.getByRole("region", { name: /Notifications/ })).toContainText(`« ${titre} » est publiée`);
  const ligne = prof.getByRole("row", { name: new RegExp(titre) });
  await expect(async () => {
    await prof.reload();
    await expect(ligne.getByRole("cell").first()).toHaveText("1", { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
});

test("un élève n'accède pas au studio", async ({ browser }) => {
  const eleve = await connecter(browser, "eleve.demo@xele.sn");
  await expect(eleve.getByRole("link", { name: "Studio", exact: true })).toHaveCount(0);

  await eleve.goto("/studio");

  await expect(eleve).toHaveURL(/\/tableau-de-bord\?acces=refuse$/);
  await expect(eleve.getByRole("alert").filter({ hasText: "Tu n'as pas accès à cette page." })).toBeVisible();
});
