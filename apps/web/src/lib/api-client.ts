export type ResultatApi<T> =
  | { ok: true; donnees: T }
  | { ok: false; message: string; erreurs: Record<string, string>; statut: number };

const MESSAGE_RESEAU =
  "Impossible de joindre le serveur. Vérifie ta connexion internet puis réessaie.";

type Methode = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

function poster(chemin: string, corps?: unknown, methode: Methode = "POST"): Promise<Response> {
  // Un FormData (téléversement) part tel quel : le navigateur fixe lui-même le type multipart.
  const formulaire = corps instanceof FormData;
  return fetch(`/api${chemin}`, {
    method: methode,
    headers: formulaire ? undefined : { "Content-Type": "application/json" },
    body: corps === undefined || methode === "GET" ? undefined : formulaire ? corps : JSON.stringify(corps),
    credentials: "same-origin",
  });
}

export async function envoyer<T = unknown>(
  chemin: string,
  corps?: unknown,
  methode: Methode = "POST",
): Promise<ResultatApi<T>> {
  let reponse: Response;
  try {
    reponse = await poster(chemin, corps, methode);
    // Cookie d'accès expiré pendant que la page restait ouverte : on renouvelle la session et on rejoue.
    if (reponse.status === 401 && !chemin.startsWith("/auth/")) {
      const rafraichi = await poster("/auth/rafraichir");
      if (rafraichi.ok) reponse = await poster(chemin, corps, methode);
    }
  } catch {
    return { ok: false, message: MESSAGE_RESEAU, erreurs: {}, statut: 0 };
  }

  const texte = await reponse.text();
  const json: unknown = texte ? JSON.parse(texte) : undefined;
  if (reponse.ok) return { ok: true, donnees: json as T };

  const corpsErreur = (json ?? {}) as { message?: unknown; erreurs?: Record<string, string> };
  const message =
    typeof corpsErreur.message === "string"
      ? corpsErreur.message
      : "Une erreur est survenue. Réessaie dans un instant.";
  return { ok: false, message, erreurs: corpsErreur.erreurs ?? {}, statut: reponse.status };
}

export function lire<T>(chemin: string): Promise<ResultatApi<T>> {
  return envoyer<T>(chemin, undefined, "GET");
}
