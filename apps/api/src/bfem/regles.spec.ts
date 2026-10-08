import { describe, expect, it } from "vitest";
import {
  aUnAbonnementActif,
  calculerExpiration,
  estExpiree,
  mention,
  noteSur20,
  peutAcceder,
  reponsesRetenues,
  simulerMoyenne,
} from "./regles";

describe("minuteur serveur", () => {
  const debut = new Date("2026-10-08T10:00:00.000Z");
  const limite = calculerExpiration(debut, 120 * 60);

  it("calcule l'instant limite à partir de la durée", () => {
    expect(limite.toISOString()).toBe("2026-10-08T12:00:00.000Z");
  });

  it("la copie expire juste après l'instant limite", () => {
    expect(estExpiree(limite, new Date("2026-10-08T11:59:59.999Z"))).toBe(false);
    expect(estExpiree(limite, limite)).toBe(false);
    expect(estExpiree(limite, new Date("2026-10-08T12:00:00.001Z"))).toBe(true);
  });

  it("soumission après expiration : seules les réponses antérieures à la limite comptent", () => {
    const reponses = {
      q1: { valeur: ["a"], le: "2026-10-08T10:15:00.000Z" },
      q2: { valeur: true, le: "2026-10-08T12:00:00.000Z" }, // pile à la limite : compte
      q3: { valeur: "12", le: "2026-10-08T12:00:00.001Z" }, // une milliseconde trop tard
      q4: { valeur: "7", le: "2026-10-08T12:30:00.000Z" },
    };

    expect(reponsesRetenues(reponses, limite)).toEqual({ q1: ["a"], q2: true });
  });

  it("une copie sans réponse donne une copie blanche", () => {
    expect(reponsesRetenues({}, limite)).toEqual({});
  });
});

describe("simulation de moyenne", () => {
  it("convertit les points en note sur 20, arrondie au centième", () => {
    expect(noteSur20(13.5, 17)).toBe(15.88);
    expect(noteSur20(20, 20)).toBe(20);
    expect(noteSur20(0, 20)).toBe(0);
    expect(noteSur20(5, 0)).toBe(0);
  });

  it("pondère chaque note par le coefficient de son épreuve", () => {
    const resultat = simulerMoyenne([
      { coefficient: 4, note: 12 },
      { coefficient: 2, note: 15 },
      { coefficient: 1, note: 8 },
    ]);

    // (12×4 + 15×2 + 8×1) / 7 = 86 / 7 = 12,2857… → 12,29
    expect(resultat).toEqual({ moyenne: 12.29, coefficientsPris: 7, coefficientsTotal: 7, mention: "Assez bien" });
  });

  it("ignore les épreuves sans note, en le signalant (coefficients pris / total)", () => {
    expect(
      simulerMoyenne([
        { coefficient: 3, note: 10 },
        { coefficient: 2, note: null },
      ]),
    ).toEqual({ moyenne: 10, coefficientsPris: 3, coefficientsTotal: 5, mention: "Passable" });
  });

  it("arrondit le résultat au centième le plus proche", () => {
    expect(simulerMoyenne([{ coefficient: 2, note: 10 }, { coefficient: 1, note: 11 }]).moyenne).toBe(10.33); // 31 / 3
    expect(simulerMoyenne([{ coefficient: 1, note: 10 }, { coefficient: 2, note: 11 }]).moyenne).toBe(10.67); // 32 / 3
  });

  it("aucune note : pas de moyenne", () => {
    expect(simulerMoyenne([{ coefficient: 2, note: null }])).toEqual({ moyenne: null, coefficientsPris: 0, coefficientsTotal: 2, mention: null });
  });

  it("donne une mention indicative aux seuils habituels", () => {
    expect(mention(9.99)).toBe("En dessous de la moyenne");
    expect(mention(10)).toBe("Passable");
    expect(mention(12)).toBe("Assez bien");
    expect(mention(14)).toBe("Bien");
    expect(mention(16)).toBe("Très bien");
  });
});

describe("garde premium", () => {
  const maintenant = new Date("2026-10-08T10:00:00Z");

  it("un abonnement actif non expiré ouvre le contenu premium", () => {
    expect(aUnAbonnementActif([{ statut: "ACTIF", expireLe: new Date("2026-11-08T10:00:00Z") }], maintenant)).toBe(true);
    expect(aUnAbonnementActif([{ statut: "ACTIF", expireLe: null }], maintenant)).toBe(true);
  });

  it("une période achetée d'avance n'ouvre l'accès qu'à son début", () => {
    expect(aUnAbonnementActif([{ statut: "ACTIF", debutLe: new Date("2026-10-20T00:00:00Z"), expireLe: new Date("2026-11-20T00:00:00Z") }], maintenant)).toBe(false);
    expect(aUnAbonnementActif([{ statut: "ACTIF", debutLe: new Date("2026-10-01T00:00:00Z"), expireLe: new Date("2026-11-01T00:00:00Z") }], maintenant)).toBe(true);
  });

  it("abonnement expiré, annulé ou absent : pas d'accès", () => {
    expect(aUnAbonnementActif([{ statut: "ACTIF", expireLe: new Date("2026-10-08T09:59:59Z") }], maintenant)).toBe(false);
    expect(aUnAbonnementActif([{ statut: "EXPIRE", expireLe: null }], maintenant)).toBe(false);
    expect(aUnAbonnementActif([{ statut: "ANNULE", expireLe: new Date("2027-01-01") }], maintenant)).toBe(false);
    expect(aUnAbonnementActif([], maintenant)).toBe(false);
  });

  it("contenu flaggé premium inaccessible sans abonnement actif ; le gratuit reste ouvert", () => {
    expect(peutAcceder({ premium: true }, { role: "ELEVE", abonne: false })).toBe(false);
    expect(peutAcceder({ premium: true }, { role: "ELEVE", abonne: true })).toBe(true);
    expect(peutAcceder({ premium: false }, { role: "ELEVE", abonne: false })).toBe(true);
  });

  it("l'administration accède à tout (relecture des examens)", () => {
    expect(peutAcceder({ premium: true }, { role: "ADMIN", abonne: false })).toBe(true);
  });
});
