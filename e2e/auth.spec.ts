import { expect, test, type Page } from "@playwright/test";
import { attendreMail, extraireLien } from "../apps/api/test/infra";
import { TTL_ACCES_E2E_SECONDES } from "../playwright.config";

const MOT_DE_PASSE_DEMO = "XeleDemo2026";

// Next.js ajoute son propre role="alert" (annonceur de route) : on cible l'alerte par son texte.
const alerte = (page: Page, texte: string) => page.getByRole("alert").filter({ hasText: texte });

async function seConnecter(page: Page, login: string, motDePasse: string): Promise<void> {
  await page.goto("/connexion");
  await page.getByLabel("Email ou identifiant").fill(login);
  await page.getByLabel("Mot de passe").fill(motDePasse);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/tableau-de-bord$/);
}

test("parcours complet : inscription élève → email de confirmation → connexion → tableau de bord", async ({
  page,
}) => {
  const email = `awa.${Date.now()}@xele.sn`;

  await page.goto("/inscription");
  await page.getByLabel("Nom complet").fill("Awa Diop");
  await page.getByLabel("Adresse email", { exact: true }).fill(email);
  await page.getByLabel("Classe").selectOption("3e");
  await page.getByLabel("Mois de naissance").selectOption({ label: "janvier" });
  await page.getByLabel("Année de naissance").fill("2010");
  await page.getByLabel("Mot de passe").fill("motdepasse1");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByText("Ton compte a bien été créé.")).toBeVisible();

  const mail = await attendreMail(email, "Confirme ton adresse email");
  await page.goto(extraireLien(mail.corps));
  await page.getByRole("button", { name: "Confirmer mon adresse email" }).click();
  await expect(page.getByText("Ton adresse email est confirmée.")).toBeVisible();

  await seConnecter(page, email, "motdepasse1");
  await expect(page.getByRole("heading", { name: "Bonjour Awa !" })).toBeVisible();
  await expect(page.getByTestId("statut-forum")).toHaveText("Ton accès au forum est ouvert.");
});

test("un élève de moins de 15 ans doit renseigner l'email d'un parent", async ({ page }) => {
  await page.goto("/inscription");
  await expect(page.getByLabel("Email d'un parent")).toHaveCount(0);

  await page.getByLabel("Mois de naissance").selectOption({ label: "mai" });
  await page.getByLabel("Année de naissance").fill("2014");

  await expect(page.getByLabel("Email d'un parent")).toBeVisible();
});

test("les erreurs de saisie s'affichent en français", async ({ page }) => {
  await page.goto("/connexion");
  await page.getByLabel("Email ou identifiant").fill("eleve.demo@xele.sn");
  await page.getByLabel("Mot de passe").fill("pas-le-bon");
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(alerte(page, "Identifiant ou mot de passe incorrect.")).toBeVisible();
});

test("un visiteur non connecté est renvoyé vers la connexion", async ({ page }) => {
  await page.goto("/tableau-de-bord");

  await expect(page).toHaveURL(/\/connexion\?suite=%2Ftableau-de-bord$/);
});

test("un élève ne peut pas accéder à une route admin (403 + redirection front)", async ({ page }) => {
  await seConnecter(page, "eleve.demo@xele.sn", MOT_DE_PASSE_DEMO);

  const api = await page.request.get("/api/admin/professeurs/en-attente");
  expect(api.status()).toBe(403);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/tableau-de-bord\?acces=refuse$/);
  await expect(alerte(page, "Tu n'as pas accès à cette page.")).toBeVisible();
});

test("rotation de token : après expiration de l'accès, la session continue sans re-login", async ({
  page,
  context,
}) => {
  await seConnecter(page, "eleve.demo@xele.sn", MOT_DE_PASSE_DEMO);
  const refreshAvant = (await context.cookies()).find((c) => c.name === "xele_refresh")?.value;

  await expect
    .poll(async () => (await context.cookies()).some((c) => c.name === "xele_access"), {
      timeout: TTL_ACCES_E2E_SECONDES * 1000,
      intervals: [1000],
    })
    .toBe(false);

  await page.reload();

  await expect(page).toHaveURL(/\/tableau-de-bord$/);
  await expect(page.getByRole("heading", { name: "Bonjour Fatou !" })).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.some((c) => c.name === "xele_access")).toBe(true);
  expect(cookies.find((c) => c.name === "xele_refresh")?.value).not.toBe(refreshAvant);
});

test("la déconnexion ferme la session", async ({ page }) => {
  await seConnecter(page, "eleve.demo@xele.sn", MOT_DE_PASSE_DEMO);

  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/connexion$/);

  await page.goto("/tableau-de-bord");
  await expect(page).toHaveURL(/\/connexion\?suite=/);
});
