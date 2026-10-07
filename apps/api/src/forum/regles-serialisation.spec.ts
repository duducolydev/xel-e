import { describe, expect, it } from "vitest";
import { doitMasquer, etatMessage } from "./regles";
import { badgeForum, versAuteurPublic, versMessagePublic, type MessageBrut } from "./serialisation";

const visible = { masque: false, verifieLe: null, deletedAt: null };

describe("règle des 3 signalements", () => {
  it("ne masque pas avant le 3e signalement", () => {
    expect(doitMasquer(visible, 1)).toBe(false);
    expect(doitMasquer(visible, 2)).toBe(false);
  });

  it("masque automatiquement au 3e signalement (et au-delà)", () => {
    expect(doitMasquer(visible, 3)).toBe(true);
    expect(doitMasquer(visible, 5)).toBe(true);
  });

  it("ne masque plus un message innocenté par la modération", () => {
    expect(doitMasquer({ ...visible, verifieLe: new Date() }, 3)).toBe(false);
  });

  it("ne remasque pas un message déjà masqué ou supprimé", () => {
    expect(doitMasquer({ ...visible, masque: true }, 4)).toBe(false);
    expect(doitMasquer({ ...visible, deletedAt: new Date() }, 3)).toBe(false);
  });

  it("déduit l'état affiché", () => {
    expect(etatMessage(visible)).toBe("visible");
    expect(etatMessage({ ...visible, masque: true })).toBe("masque");
    expect(etatMessage({ ...visible, masque: true, deletedAt: new Date() })).toBe("supprime");
  });

  it("un message innocenté réapparaît (visible)", () => {
    expect(etatMessage({ masque: false, verifieLe: new Date(), deletedAt: null })).toBe("visible");
  });
});

// Le message brut contient volontairement des champs personnels : aucun ne doit sortir.
function messageBrut(surcharge: Partial<MessageBrut> = {}): MessageBrut {
  const auteur = {
    pseudonyme: "awa_maths",
    role: "ELEVE" as const,
    email: "awa.ndiaye@example.sn",
    nomComplet: "Awa Ndiaye",
    identifiant: "awa.ndiaye",
    id: "user-awa",
  };
  return {
    id: "message-1",
    contenu: "Comment on applique Thalès ?",
    createdAt: new Date("2026-10-07T10:00:00Z"),
    auteurId: "user-awa",
    auteur,
    masque: false,
    verifieLe: null,
    deletedAt: null,
    piecesJointes: [{ id: "pj-1", nomOriginal: "figure.png", type: "image/png", taille: 1200, cle: "forum/x.png", auteurId: "user-awa" } as never],
    signalements: [],
    ...surcharge,
  };
}

describe("sérialisation publique d'un message", () => {
  it("n'expose aucun champ personnel (email, nom, identifiant, id d'utilisateur, clé de stockage)", () => {
    const json = JSON.stringify(versMessagePublic(messageBrut(), "lecteur"));

    expect(json).not.toMatch(/awa\.ndiaye|Awa Ndiaye|user-awa|example\.sn|forum\/x\.png/);
    expect(Object.keys(versMessagePublic(messageBrut(), "lecteur")).sort()).toEqual(
      ["auteur", "contenu", "createdAt", "estMoi", "etat", "id", "piecesJointes", "signaleParMoi"].sort(),
    );
    expect(versMessagePublic(messageBrut(), "lecteur").auteur).toEqual({ pseudonyme: "awa_maths", badge: null });
  });

  it("cache le texte d'un message masqué aux autres, pas à son auteur", () => {
    const masque = messageBrut({ masque: true });

    expect(versMessagePublic(masque, "lecteur")).toMatchObject({ etat: "masque", contenu: null, piecesJointes: [] });
    expect(versMessagePublic(masque, "user-awa")).toMatchObject({ etat: "masque", contenu: "Comment on applique Thalès ?", estMoi: true });
  });

  it("ne montre plus rien d'un message supprimé, même à son auteur", () => {
    expect(versMessagePublic(messageBrut({ deletedAt: new Date() }), "user-awa")).toMatchObject({ etat: "supprime", contenu: null });
  });

  it("indique si le lecteur a déjà signalé le message", () => {
    expect(versMessagePublic(messageBrut({ signalements: [{ signalantId: "lecteur" }] }), "lecteur").signaleParMoi).toBe(true);
    expect(versMessagePublic(messageBrut(), "lecteur").signaleParMoi).toBe(false);
  });

  it("affiche un badge pour les professeurs et l'équipe", () => {
    expect(badgeForum("PROFESSEUR")).toBe("PROFESSEUR");
    expect(badgeForum("ADMIN")).toBe("EQUIPE");
    expect(badgeForum("ELEVE")).toBeNull();
  });

  it("donne un pseudonyme neutre à un compte qui n'en a pas (jamais son nom)", () => {
    expect(versAuteurPublic({ pseudonyme: null, role: "ELEVE" })).toEqual({ pseudonyme: "membre", badge: null });
  });
});
