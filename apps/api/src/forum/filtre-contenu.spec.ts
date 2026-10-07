import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { estLienInterne, filtrerMessage, liensTrouves, normaliser, termesTrouves } from "./filtre-contenu";
import { TERMES_INITIAUX } from "./termes-initiaux";

const OPTIONS_ELEVE = { termes: TERMES_INITIAUX, liensAutorises: false, domaineSite: "xele.sn" };

describe("termes interdits", () => {
  it.each([
    ["mot seul", "T'es qu'un connard"],
    ["majuscules", "CONNARD"],
    ["accents omis", "espece de batard"],
    ["accents ajoutés", "espèce de bâtard"],
    ["chiffres à la place des lettres", "c0nn4rd"],
    ["lettres répétées", "connnnaaaard"],
    ["ponctuation collée", "salope!!!"],
    ["expression de plusieurs mots", "Nique ta mère"],
    ["expression avec ponctuation entre les mots", "nique, ta... mere"],
  ])("bloque : %s", (_cas, texte) => {
    expect(termesTrouves(texte, TERMES_INITIAUX)).not.toEqual([]);
  });

  // Faux positifs évités par la recherche en mots entiers ou par le choix de la liste (voir moderation.md).
  it.each([
    ["« pute » dans « dispute »", "On s'est disputés sur la dispute de la question 3"],
    ["« pd » dans un mot plus long", "Le pdf du cours est en ligne"],
    ["« tg » dans « tgv »", "Le TGV roule à 300 km/h, calcule sa vitesse en m/s"],
    ["« sexe » en SVT (absent de la liste)", "La reproduction sexuée et le sexe des fleurs"],
    ["« chatte » l'animal (absent de la liste)", "La chatte allaite ses petits : c'est un mammifère"],
    ["« con » dans « conte » ou « contrôle »", "Le contrôle porte sur le conte"],
    ["« crève » (un rhume)", "J'ai attrapé une crève, je rattraperai le cours"],
    ["chiffres d'un calcul", "3 + 4 = 7 et 10 / 2 = 5"],
  ])("laisse passer : %s", (_cas, texte) => {
    expect(termesTrouves(texte, TERMES_INITIAUX)).toEqual([]);
  });

  it("indique quels termes ont été trouvés", () => {
    expect(termesTrouves("connard et salope", TERMES_INITIAUX).sort()).toEqual(["connard", "salope"]);
  });

  it("ignore un terme vide de la liste", () => {
    expect(termesTrouves("bonjour", ["", "  "])).toEqual([]);
  });

  it("normalise accents, casse, chiffres et répétitions", () => {
    expect(normaliser("ÉLÈVE")).toBe("eleve");
    expect(normaliser("c0nnn4rd")).toBe("conard");
  });
});

describe("liens", () => {
  it.each([
    ["http", "regarde http://exemple.com/page"],
    ["https", "https://site-douteux.xyz"],
    ["www sans schéma", "va sur www.exemple.org"],
    ["domaine nu", "rejoins-moi sur discord.gg/abc"],
    ["raccourcisseur", "bit.ly/3xYz"],
    ["domaine sénégalais", "infos sur monsite.sn"],
  ])("détecte : %s", (_cas, texte) => {
    expect(liensTrouves(texte)).toHaveLength(1);
  });

  it.each([
    ["nombre décimal", "pi vaut environ 3.14"],
    ["nom de fichier", "j'ai joint photo.jpg et cours.pdf"],
    ["renvoi de figure", "voir fig.2 et ex.3"],
    ["initiale", "M.Diop a corrigé"],
    ["fin de phrase collée", "C'est faux.La bonne réponse est 12."],
  ])("ne confond pas avec un lien : %s", (_cas, texte) => {
    expect(liensTrouves(texte)).toEqual([]);
  });

  it("reconnaît les liens vers le site lui-même", () => {
    expect(estLienInterne("https://xele.sn/cours/4e/maths/pythagore", "xele.sn")).toBe(true);
    expect(estLienInterne("www.xele.sn", "xele.sn")).toBe(true);
    expect(estLienInterne("http://localhost:3010/cours", "localhost:3010")).toBe(true);
    expect(estLienInterne("https://xele.sn.pirate.com", "xele.sn")).toBe(false);
  });
});

describe("verdict du filtre", () => {
  it("accepte un message correct", () => {
    expect(filtrerMessage("Comment on calcule l'hypoténuse ?", OPTIONS_ELEVE)).toEqual({ accepte: true, raisons: [] });
  });

  it("refuse un terme interdit avec une explication en français", () => {
    const verdict = filtrerMessage("t'es un connard", OPTIONS_ELEVE);
    expect(verdict.accepte).toBe(false);
    expect(verdict.raisons[0]).toMatch(/terme interdit/);
  });

  it("bloque les liens externes des élèves mais pas les liens vers Xel-E", () => {
    expect(filtrerMessage("va voir www.exemple.com", OPTIONS_ELEVE).raisons[0]).toMatch(/liens vers d'autres sites/);
    expect(filtrerMessage("relis https://xele.sn/cours/4e/maths", OPTIONS_ELEVE).accepte).toBe(true);
  });

  it("autorise les liens externes des professeurs, sans lever le filtre des termes", () => {
    const prof = { ...OPTIONS_ELEVE, liensAutorises: true };
    expect(filtrerMessage("Ressource utile : https://fr.wikipedia.org/wiki/Thalès", prof).accepte).toBe(true);
    expect(filtrerMessage("connard https://exemple.com", prof).raisons).toHaveLength(1);
  });

  it("cumule les raisons", () => {
    expect(filtrerMessage("connard www.exemple.com", OPTIONS_ELEVE).raisons).toHaveLength(2);
  });
});

describe("liste de départ", () => {
  it("chaque terme initial est inséré par la migration « forum » (production sans seed)", () => {
    const dossier = join(__dirname, "..", "..", "prisma", "migrations");
    const migration = readdirSync(dossier).find((nom) => nom.endsWith("_forum"));
    const sql = readFileSync(join(dossier, migration!, "migration.sql"), "utf8");
    for (const terme of TERMES_INITIAUX) expect(sql).toContain(`'${terme.replace(/'/g, "''")}'`);
  });

  it("ne contient pas de doublon une fois normalisée", () => {
    const normalises = TERMES_INITIAUX.map(normaliser);
    expect(new Set(normalises).size).toBe(normalises.length);
  });
});
