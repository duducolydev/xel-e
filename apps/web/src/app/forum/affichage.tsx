import type { AuteurPublic, EtatForum, MessagePublic } from "@xel-e/shared";
import type { ReactNode } from "react";
import { Alerte } from "@/components/ui";
import { BoutonSignaler } from "./interactions";

export function dateHeure(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" });
}

export function Auteur({ auteur }: { auteur: AuteurPublic }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-semibold text-gray-900">{auteur.pseudonyme}</span>
      {auteur.badge === "PROFESSEUR" ? (
        <span className="rounded-full bg-brand-dark px-2 py-0.5 text-xs font-semibold text-white">Professeur</span>
      ) : null}
      {auteur.badge === "EQUIPE" ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Équipe Xel-E</span>
      ) : null}
    </span>
  );
}

// Texte brut (aucun HTML interprété) ; seuls les liens http(s) deviennent cliquables. Le filtre
// garantit qu'un élève n'a pu poster que des liens vers Xel-E.
function TexteAvecLiens({ texte }: { texte: string }) {
  const morceaux: ReactNode[] = [];
  let dernier = 0;
  for (const lien of texte.matchAll(/https?:\/\/[^\s<>"]+/g)) {
    morceaux.push(texte.slice(dernier, lien.index));
    morceaux.push(
      <a key={lien.index} href={lien[0]} rel="nofollow noopener noreferrer ugc" target="_blank" className="text-brand-dark underline">
        {lien[0]}
      </a>,
    );
    dernier = (lien.index ?? 0) + lien[0].length;
  }
  morceaux.push(texte.slice(dernier));
  return <p className="whitespace-pre-wrap break-words text-gray-900">{morceaux}</p>;
}

export function MessageForum({ message }: { message: MessagePublic }) {
  return (
    <article className={`space-y-2 rounded-xl border p-4 ${message.etat === "visible" ? "border-gray-200" : "border-dashed border-gray-300 bg-gray-50"}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Auteur auteur={message.auteur} />
        <time dateTime={message.createdAt} className="text-gray-500">
          {dateHeure(message.createdAt)}
        </time>
      </header>
      {message.etat === "supprime" ? (
        <p className="text-sm italic text-gray-600">Message supprimé par la modération.</p>
      ) : null}
      {message.etat === "masque" && message.contenu === null ? (
        <p className="text-sm italic text-gray-600">Message masqué après plusieurs signalements, en attente de vérification par la modération.</p>
      ) : null}
      {message.etat === "masque" && message.contenu !== null ? (
        <p className="text-sm font-medium text-amber-900">
          Ton message est masqué aux autres après plusieurs signalements : la modération va le vérifier.
        </p>
      ) : null}
      {message.contenu !== null ? <TexteAvecLiens texte={message.contenu} /> : null}
      {message.piecesJointes.length > 0 ? (
        <ul className="flex flex-wrap gap-3">
          {message.piecesJointes.map((piece) =>
            piece.type.startsWith("image/") ? (
              <li key={piece.id}>
                <a href={`/api/forum/pieces-jointes/${piece.id}`} target="_blank" rel="noopener">
                  <img src={`/api/forum/pieces-jointes/${piece.id}`} alt={piece.nom} className="max-h-48 rounded-lg border border-gray-200" />
                </a>
              </li>
            ) : (
              <li key={piece.id}>
                <a href={`/api/forum/pieces-jointes/${piece.id}`} download className="text-sm font-medium text-brand-dark underline">
                  📄 {piece.nom}
                </a>
              </li>
            ),
          )}
        </ul>
      ) : null}
      {message.etat === "visible" && !message.estMoi ? (
        <footer className="text-right">
          <BoutonSignaler messageId={message.id} dejaSignale={message.signaleParMoi} />
        </footer>
      ) : null}
    </article>
  );
}

export function ForumFerme({ etat }: { etat: EtatForum }) {
  return (
    <Alerte ton="info">
      <span data-testid="forum-ferme">Le forum ne t&apos;est pas encore ouvert. {etat.raison}</span>
    </Alerte>
  );
}
