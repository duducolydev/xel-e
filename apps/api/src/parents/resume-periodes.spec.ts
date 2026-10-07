import { describe, expect, it } from "vitest";
import { periodeDuResume } from "./periodes";
import { composerResume, duree, estInactif, prenom, type ActiviteEnfant } from "./resume";

const LIENS = { tableauDeBord: "https://xele.sn/parent", desinscription: "https://xele.sn/desinscription?token=abc" };

const fatou: ActiviteEnfant = {
  nomComplet: "Fatou Diop",
  minutes: 135,
  joursActifs: 4,
  leconsTerminees: ["Le théorème de Pythagore", "La réciproque"],
  quiz: [
    { titre: "Le théorème de Pythagore", score: 90 },
    { titre: "La réciproque", score: 65 },
  ],
  serie: 3,
};
const inactif: ActiviteEnfant = { nomComplet: "Ali Diop", minutes: 0, joursActifs: 0, leconsTerminees: [], quiz: [], serie: 0 };

const semaine = { type: "HEBDOMADAIRE" as const, libelle: "semaine du 5 au 11 octobre" };

describe("composition du résumé", () => {
  it("détaille temps, leçons, quiz et série selon l'activité de la semaine", () => {
    const resume = composerResume({ parent: "Awa Diop", periode: semaine, enfants: [fatou], liens: LIENS });

    expect(resume.sujet).toBe("Semaine du 5 au 11 octobre : le résumé Xel-E");
    expect(resume.texte).toContain("Bonjour Awa Diop,");
    expect(resume.texte).toContain("Fatou a travaillé 2 h 15, sur 4 jours.");
    expect(resume.texte).toContain("Leçons terminées (2) : Le théorème de Pythagore, La réciproque.");
    expect(resume.texte).toContain("Quiz (2, moyenne 78 %) : Le théorème de Pythagore (90 %), La réciproque (65 %).");
    expect(resume.texte).toContain("Série en cours : 3 jours d'affilée, bravo !");
    expect(resume.texte).toContain(LIENS.tableauDeBord);
    expect(resume.texte).toContain(`Ne plus recevoir ce résumé : ${LIENS.desinscription}`);
  });

  it("semaine vide ⇒ message d'encouragement, sans chiffres à zéro", () => {
    const resume = composerResume({ parent: "Awa Diop", periode: semaine, enfants: [inactif], liens: LIENS });

    expect(resume.texte).toContain("Ali n'a pas travaillé sur Xel-E cette semaine. Un petit encouragement peut l'aider");
    expect(resume.texte).toContain("Vous pourrez suivre sa reprise, jour par jour, depuis votre espace parent :");
    expect(resume.texte).not.toMatch(/0 min|Aucune leçon|Aucun quiz/);
    expect(resume.texteCourt).toBe("Xel-E, semaine du 5 au 11 octobre — Ali : pas d'activité.");
  });

  it("plusieurs enfants : un paragraphe chacun, dans l'ordre", () => {
    const resume = composerResume({ parent: "Awa Diop", periode: semaine, enfants: [fatou, inactif], liens: LIENS });

    expect(resume.texte.indexOf("Fatou a travaillé")).toBeLessThan(resume.texte.indexOf("Ali n'a pas travaillé"));
    expect(resume.texte).toContain("Le détail (scores, leçons, temps par jour)");
    expect(resume.texteCourt).toBe(
      "Xel-E, semaine du 5 au 11 octobre — Fatou : 2 h 15, 2 leçons, 2 quiz (moy. 78 %) ; Ali : pas d'activité.",
    );
  });

  it("signale l'absence de leçon ou de quiz quand l'enfant s'est quand même connecté", () => {
    const resume = composerResume({
      parent: "Awa",
      periode: semaine,
      enfants: [{ ...inactif, minutes: 12, joursActifs: 1 }],
      liens: LIENS,
    });

    expect(resume.texte).toContain("Ali a travaillé 12 min, sur 1 jour.\nAucune leçon terminée.\nAucun quiz passé.");
  });

  it("abrège les longues listes et ne parle de série qu'à partir de 2 jours", () => {
    const lecons = ["L1", "L2", "L3", "L4", "L5", "L6", "L7"];
    const resume = composerResume({ parent: "Awa", periode: semaine, enfants: [{ ...fatou, leconsTerminees: lecons, serie: 1 }], liens: LIENS });

    expect(resume.texte).toContain("Leçons terminées (7) : L1, L2, L3, L4, L5 et 2 autres.");
    expect(resume.texte).not.toContain("Série en cours");
  });

  it("parle du mois pour le résumé mensuel", () => {
    const resume = composerResume({
      parent: "Awa",
      periode: { type: "MENSUELLE", libelle: "mois de septembre 2026" },
      enfants: [inactif],
      liens: LIENS,
    });

    expect(resume.sujet).toBe("Mois de septembre 2026 : le résumé Xel-E");
    expect(resume.texte).toContain("n'a pas travaillé sur Xel-E ce mois");
  });

  it("le texte court tient dans un SMS pour deux enfants", () => {
    expect(composerResume({ parent: "Awa", periode: semaine, enfants: [fatou, inactif], liens: LIENS }).texteCourt.length).toBeLessThan(160);
  });

  it("formate les durées et les prénoms", () => {
    expect(duree(0)).toBe("0 min");
    expect(duree(45)).toBe("45 min");
    expect(duree(60)).toBe("1 h");
    expect(duree(125)).toBe("2 h 05");
    expect(prenom("  Mame Diarra Bousso ")).toBe("Mame");
    expect(estInactif(inactif)).toBe(true);
    expect(estInactif({ ...inactif, quiz: [{ titre: "x", score: 0 }] })).toBe(false);
  });
});

describe("période couverte par le résumé", () => {
  it("hebdomadaire (dimanche 18 h) : du lundi au dimanche de la semaine en cours", () => {
    const dimanche = new Date("2026-10-11T18:00:00Z");
    const periode = periodeDuResume("HEBDOMADAIRE", dimanche);

    expect(periode).toMatchObject({
      cle: "2026-S41",
      premierJour: "2026-10-05",
      dernierJour: "2026-10-11",
      libelle: "semaine du 5 au 11 octobre",
    });
    expect(periode.debut.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(periode.fin).toBe(dimanche);
  });

  it("numérote les semaines à cheval sur deux années selon la norme ISO", () => {
    expect(periodeDuResume("HEBDOMADAIRE", new Date("2027-01-03T18:00:00Z")).cle).toBe("2026-S53");
    expect(periodeDuResume("HEBDOMADAIRE", new Date("2026-01-04T18:00:00Z")).cle).toBe("2026-S01");
    expect(periodeDuResume("HEBDOMADAIRE", new Date("2026-03-01T18:00:00Z")).libelle).toBe("semaine du 23 février au 1er mars");
  });

  it("mensuel (le 1er à 18 h) : tout le mois précédent", () => {
    const periode = periodeDuResume("MENSUELLE", new Date("2026-10-01T18:00:00Z"));

    expect(periode).toMatchObject({ cle: "2026-09", premierJour: "2026-09-01", dernierJour: "2026-09-30", libelle: "mois de septembre 2026" });
    expect(periode.debut.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(periode.fin.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("le résumé de janvier porte sur décembre de l'année précédente", () => {
    expect(periodeDuResume("MENSUELLE", new Date("2027-01-01T18:00:00Z"))).toMatchObject({
      cle: "2026-12",
      dernierJour: "2026-12-31",
      libelle: "mois de décembre 2026",
    });
  });
});
