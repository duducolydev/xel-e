import { randomUUID } from "node:crypto";
import { expect, request, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

const BASE_URL = "http://localhost:3110";
const MOT_DE_PASSE_DEMO = "XeleDemo2026";

interface Compte {
  login: string;
  motDePasse: string;
}

// Élève inscrit par identifiant (pas d'email à confirmer) ; né en 2010, donc sans accord parental requis.
async function nouvelEleve(naissanceAnnee = 2010): Promise<Compte> {
  const identifiant = `forum.${Date.now()}.${Math.floor(Math.random() * 1000)}`;
  const api = await request.newContext({ baseURL: BASE_URL });
  const reponse = await api.post("/api/auth/inscription/eleve", {
    data: {
      nomComplet: "Élève Forum",
      identifiant,
      niveau: "3e",
      naissanceMois: 1,
      naissanceAnnee,
      motDePasse: "motdepasse1",
      contactParentEmail: naissanceAnnee > 2011 ? "parent.forum@example.sn" : undefined,
    },
  });
  expect(reponse.status()).toBe(201);
  await api.dispose();
  return { login: identifiant, motDePasse: "motdepasse1" };
}

async function connecterApi(compte: Compte): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: BASE_URL });
  expect((await api.post("/api/auth/connexion", { data: compte })).status()).toBe(200);
  return api;
}

async function connecterPage(browser: Browser, compte: Compte): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/connexion");
  await page.getByLabel("Email ou identifiant").fill(compte.login);
  await page.getByLabel("Mot de passe").fill(compte.motDePasse);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord$/);
  return page;
}

const FATOU = { login: "eleve.demo@xele.sn", motDePasse: MOT_DE_PASSE_DEMO };
const ADMIN = { login: "admin.demo@xele.sn", motDePasse: MOT_DE_PASSE_DEMO };

// `next dev` compile chaque route à sa première visite : on les compile avant les scénarios.
test.beforeAll(async () => {
  test.setTimeout(240_000);
  const admin = await connecterApi(ADMIN);
  for (const chemin of ["/forum", "/forum/3e/maths", `/forum/sujets/${randomUUID()}`, "/admin/moderation"]) {
    await admin.get(chemin, { timeout: 180_000 });
  }
  await admin.dispose();
});

test("sujet → réponse → 3 signalements ⇒ réponse masquée → l'admin la rétablit", async ({ browser }) => {
  test.setTimeout(240_000);
  const titre = `Thalès, exercice 3 (${Date.now()})`;

  // 1. Fatou pose une question dans le forum de sa classe.
  const fatou = await connecterPage(browser, FATOU);
  await fatou.getByRole("link", { name: "Forum", exact: true }).click();
  await expect(fatou.getByRole("heading", { level: 1, name: "Forum d'entraide" })).toBeVisible();
  await expect(fatou.getByText("Tu participes sous le pseudonyme fatou_demo.")).toBeVisible();
  await fatou.getByRole("link", { name: "Mathématiques 3e" }).click();
  await fatou.getByLabel("Titre de ta question").fill(titre);
  await fatou.getByLabel("Ton message").fill("Je ne trouve pas AN, quelqu'un peut m'aider ?");
  await fatou.getByRole("button", { name: "Publier ma question" }).click();
  await expect(fatou.getByRole("heading", { level: 1, name: titre })).toBeVisible();
  const urlSujet = fatou.url();

  // 2. Un autre élève choisit son pseudonyme, voit le filtre en action, puis répond.
  const moussa = await connecterPage(browser, await nouvelEleve());
  await moussa.goto("/forum");
  await moussa.getByRole("textbox", { name: "Pseudonyme" }).fill(`moussa${Date.now() % 100000}`);
  await moussa.getByRole("button", { name: "Valider" }).click();
  await expect(moussa.getByText(/Tu participes sous le pseudonyme/)).toBeVisible();
  await moussa.goto(urlSujet);
  await moussa.getByLabel("Ta réponse").fill("Va voir www.exemple.com");
  await moussa.getByRole("button", { name: "Répondre" }).click();
  await expect(moussa.getByRole("alert").filter({ hasText: "Les liens vers d'autres sites ne sont pas autorisés" })).toBeVisible();
  await moussa.getByLabel("Ta réponse").fill("Utilise le rapport AM/AB = AN/AC.");
  await moussa.getByRole("button", { name: "Répondre" }).click();
  await expect(moussa.getByText("Utilise le rapport AM/AB = AN/AC.")).toBeVisible();

  // 3. Fatou signale la réponse en un clic ; deux autres comptes la signalent aussi.
  await fatou.reload();
  const reponse = fatou.getByRole("article").filter({ hasText: "Utilise le rapport AM/AB = AN/AC." });
  await reponse.getByRole("button", { name: "Signaler" }).click();
  await reponse.getByRole("button", { name: "Confirmer le signalement" }).click();
  await expect(reponse.getByText("Signalé, merci.")).toBeVisible();

  const sujet = await (await connecterApi(FATOU)).get(`/api/forum/sujets/${urlSujet.split("/").at(-1)}`);
  const reponseId = ((await sujet.json()) as { messages: { id: string; contenu: string | null }[] }).messages.find(
    (m) => m.contenu === "Utilise le rapport AM/AB = AN/AC.",
  )!.id;
  for (let i = 0; i < 2; i += 1) {
    const temoin = await connecterApi(await nouvelEleve());
    expect((await temoin.post(`/api/forum/messages/${reponseId}/signaler`, { data: {} })).status()).toBe(200);
    await temoin.dispose();
  }

  // 4. La réponse est masquée pour Fatou ; son auteur voit qu'elle est en attente de vérification.
  await fatou.reload();
  await expect(fatou.getByText("Message masqué après plusieurs signalements, en attente de vérification par la modération.")).toBeVisible();
  await expect(fatou.getByText("Utilise le rapport AM/AB = AN/AC.")).toHaveCount(0);
  await moussa.reload();
  await expect(moussa.getByText(/Ton message est masqué aux autres/)).toBeVisible();

  // 5. L'administration l'innocente : elle réapparaît.
  const admin = await connecterPage(browser, ADMIN);
  await admin.goto("/admin/moderation");
  const element = admin.getByTestId("element-moderation").filter({ hasText: "Utilise le rapport AM/AB = AN/AC." });
  await expect(element.getByText("Masqué", { exact: true })).toBeVisible();
  await expect(element.getByText("3 signalements")).toBeVisible();
  await element.getByRole("button", { name: "Innocenter et rétablir" }).click();
  await expect(admin.getByText("Aucun message en attente de modération.")).toBeVisible();

  await fatou.reload();
  await expect(fatou.getByText("Utilise le rapport AM/AB = AN/AC.")).toBeVisible();
});

test("un élève de moins de 15 ans sans accord parental ne voit pas le forum", async ({ browser }) => {
  const jeune = await connecterPage(browser, await nouvelEleve(2014));

  await jeune.goto("/forum");

  await expect(jeune.getByTestId("forum-ferme")).toContainText("Le forum s'ouvrira dès que ton parent aura donné son accord.");
  await expect(jeune.getByRole("link", { name: "Mathématiques 3e" })).toHaveCount(0);
  await jeune.goto("/forum/3e/maths");
  await expect(jeune.getByTestId("forum-ferme")).toBeVisible();
  await expect(jeune.getByLabel("Titre de ta question")).toHaveCount(0);
});
