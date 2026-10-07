import type { Role } from "@prisma/client";
import type { AuteurPublic, BadgeForum, MessagePublic, PieceJointePublique } from "@xel-e/shared";
import { etatMessage, type EtatModeration } from "./regles";

export const PSEUDONYME_PAR_DEFAUT = "membre";

export function badgeForum(role: Role): BadgeForum {
  if (role === "PROFESSEUR") return "PROFESSEUR";
  return role === "ADMIN" ? "EQUIPE" : null;
}

// Liste blanche : seuls le pseudonyme et le rôle sortent, jamais l'email, le nom ou l'identifiant.
export function versAuteurPublic(auteur: { pseudonyme: string | null; role: Role }): AuteurPublic {
  return { pseudonyme: auteur.pseudonyme ?? PSEUDONYME_PAR_DEFAUT, badge: badgeForum(auteur.role) };
}

export function versPieceJointePublique(piece: { id: string; nomOriginal: string; type: string; taille: number }): PieceJointePublique {
  return { id: piece.id, nom: piece.nomOriginal, type: piece.type, taille: piece.taille };
}

export interface MessageBrut extends EtatModeration {
  id: string;
  contenu: string;
  createdAt: Date;
  auteurId: string;
  auteur: { pseudonyme: string | null; role: Role };
  piecesJointes: { id: string; nomOriginal: string; type: string; taille: number }[];
  signalements: { signalantId: string }[];
}

// Un message masqué n'est lisible que par son auteur (qui sait ainsi pourquoi il a disparu) ;
// un message supprimé ne l'est plus par personne ici (la modération le consulte dans sa file).
export function versMessagePublic(message: MessageBrut, lecteurId: string): MessagePublic {
  const etat = etatMessage(message);
  const estMoi = message.auteurId === lecteurId;
  const lisible = etat === "visible" || (etat === "masque" && estMoi);
  return {
    id: message.id,
    etat,
    contenu: lisible ? message.contenu : null,
    auteur: versAuteurPublic(message.auteur),
    createdAt: message.createdAt.toISOString(),
    piecesJointes: lisible ? message.piecesJointes.map(versPieceJointePublique) : [],
    estMoi,
    signaleParMoi: message.signalements.some((s) => s.signalantId === lecteurId),
  };
}
