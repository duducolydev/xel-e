import { randomUUID } from "node:crypto";
import { expect, request, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

const BASE_URL = "http://localhost:3110";
const MAILHOG_URL = process.env.MAILHOG_API_URL ?? "http://127.0.0.1:8025";
const MOT_DE_PASSE_DEMO = "XeleDemo2026";

async function connecterPage(browser: Browser, login: string, motDePasse: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/connexion");
  await page.getByLabel("Email ou identifiant").fill(login);
  await page.getByLabel("Mot de passe").fill(motDePasse);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord$/);
  return page;
}

async function connecterApi(login: string, motDePasse: string): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: BASE_URL });
  expect((await api.post("/api/auth/connexion", { data: { login, motDePasse } })).status()).toBe(200);
  return api;
}

interface MessageMailhog {
  Content: { Headers: Record<string, string[]>; Body: string };
}

async function mailsPour(destinataire: string): Promise<MessageMailhog[]> {
  const reponse = await fetch(`${MAILHOG_URL}/api/v2/search?kind=to&query=${encodeURIComponent(destinataire)}`);
  return ((await reponse.json()) as { items: MessageMailhog[] }).items;
}

// `next dev` compile chaque route à sa première visite : on les compile avant les scénarios.
test.beforeAll(async () => {
  test.setTimeout(240_000);
  const parent = await connecterApi("parent.demo@xele.sn", MOT_DE_PASSE_DEMO);
  for (const chemin of ["/parent", `/parent/enfants/${randomUUID()}`, "/inscription", "/tableau-de-bord"]) {
    await parent.get(chemin, { timeout: 180_000 });
  }
  await parent.dispose();
});

test("un parent s'inscrit, saisit le code de son enfant et voit son tableau de bord, puis reçoit le résumé hebdo", async ({ browser }) => {
  test.setTimeout(240_000);
  const email = `parent.${Date.now()}@example.sn`;

  // 1. L'élève génère un code depuis son tableau de bord.
  const eleve = await connecterPage(browser, "eleve.demo@xele.sn", MOT_DE_PASSE_DEMO);
  await eleve.getByRole("button", { name: "Générer un code pour mon parent" }).click();
  const code = (await eleve.getByTestId("code-liaison").textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  // 2. Le parent crée son compte.
  const parent = await (await browser.newContext()).newPage();
  await parent.goto("/inscription");
  await parent.getByText("Parent", { exact: true }).click();
  await parent.getByLabel("Nom complet").fill("Mame Diop");
  await parent.getByLabel("Adresse email", { exact: true }).fill(email);
  await parent.getByLabel("Mot de passe").fill("motdepasse1");
  await parent.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(parent.getByText("Ton compte a bien été créé.")).toBeVisible();
  await parent.goto("/connexion");
  await parent.getByLabel("Email ou identifiant").fill(email);
  await parent.getByLabel("Mot de passe").fill("motdepasse1");
  await parent.getByRole("button", { name: "Se connecter" }).click();
  await expect(parent).toHaveURL(/\/tableau-de-bord$/);

  // 3. Il saisit le code et ouvre le tableau de bord de l'enfant.
  await parent.getByRole("link", { name: "Espace parent", exact: true }).click();
  await expect(parent.getByText("Aucun enfant lié pour l'instant.")).toBeVisible();
  await parent.getByLabel("Code donné par votre enfant").fill(code.toLowerCase());
  await parent.getByRole("button", { name: "Lier cet enfant" }).click();
  await expect(parent.getByText("Fatou Élève Démo est maintenant lié(e) à votre compte.")).toBeVisible();
  await parent.getByRole("link", { name: /Fatou Élève Démo/ }).click();
  await expect(parent.getByRole("heading", { level: 1, name: "Fatou Élève Démo" })).toBeVisible();
  await expect(parent.getByRole("heading", { name: "Temps d'activité des 7 derniers jours" })).toBeVisible();
  await expect(parent.getByTestId("stat-Leçons terminées")).toBeVisible();
  await expect(parent.getByRole("heading", { name: "Scores récents aux quiz" })).toBeVisible();

  // 4. Le code ne sert qu'une fois : l'élève voit qu'un parent le suit.
  await eleve.reload();
  await expect(eleve.getByText(/1 parent suit ta progression/)).toBeVisible();

  // 5. Déclenchement manuel du résumé hebdomadaire ⇒ notification in-app et email dans mailhog.
  const admin = await connecterApi("admin.demo@xele.sn", MOT_DE_PASSE_DEMO);
  expect((await admin.post("/api/admin/resumes/declencher", { data: { type: "HEBDOMADAIRE" } })).status()).toBe(202);
  await expect(async () => {
    await parent.goto("/parent");
    await expect(parent.getByRole("region", { name: /Notifications/ })).toContainText(/Xel-E, semaine du .* — Fatou :/, { timeout: 1000 });
  }).toPass({ timeout: 30_000 });

  await expect(async () => {
    const mails = await mailsPour(email);
    expect(mails.some((m) => m.Content.Body.includes("Bonjour Mame Diop,"))).toBe(true);
  }).toPass({ timeout: 30_000 });
});

test("un parent ne peut pas voir les données d'un enfant qui n'est pas lié à lui", async ({ browser }) => {
  const parent = await connecterPage(browser, "parent.demo@xele.sn", MOT_DE_PASSE_DEMO);
  const autreEnfant = randomUUID();

  const api = await parent.request.get(`/api/parents/enfants/${autreEnfant}`);
  expect(api.status()).toBe(403);

  await parent.goto(`/parent/enfants/${autreEnfant}`);
  await expect(parent).toHaveURL(/\/parent$/);
  await expect(parent.getByRole("heading", { level: 1, name: "Espace parent" })).toBeVisible();
});
