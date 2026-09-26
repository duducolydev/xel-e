export type ResultatApi<T> =
  | { ok: true; donnees: T }
  | { ok: false; message: string; erreurs: Record<string, string> };

const MESSAGE_RESEAU =
  "Impossible de joindre le serveur. Vérifie ta connexion internet puis réessaie.";

type Methode = "POST" | "PUT";

function poster(chemin: string, corps?: unknown, methode: Methode = "POST"): Promise<Response> {
  return fetch(`/api${chemin}`, {
    method: methode,
    headers: { "Content-Type": "application/json" },
    body: corps === undefined ? undefined : JSON.stringify(corps),
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
    return { ok: false, message: MESSAGE_RESEAU, erreurs: {} };
  }

  const texte = await reponse.text();
  const json: unknown = texte ? JSON.parse(texte) : undefined;
  if (reponse.ok) return { ok: true, donnees: json as T };

  const corpsErreur = (json ?? {}) as { message?: unknown; erreurs?: Record<string, string> };
  const message =
    typeof corpsErreur.message === "string"
      ? corpsErreur.message
      : "Une erreur est survenue. Réessaie dans un instant.";
  return { ok: false, message, erreurs: corpsErreur.erreurs ?? {} };
}
