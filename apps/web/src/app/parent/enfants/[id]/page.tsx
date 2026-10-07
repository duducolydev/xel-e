import type { ActiviteJourDto, TableauEnfant } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";
import { ActionsEnfant } from "./actions";

export const metadata: Metadata = { title: "Suivi de mon enfant — Xel-E" };

function duree(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const reste = minutes % 60;
  return `${Math.floor(minutes / 60)} h${reste ? ` ${String(reste).padStart(2, "0")}` : ""}`;
}

const jourCourt = (jour: string) =>
  new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" });
const jourLong = (jour: string) =>
  new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "medium", timeZone: "Africa/Dakar" });

// Une seule série (minutes par jour) : barres fines de la couleur de la marque, sans légende (le titre
// la nomme), valeur au survol et tableau équivalent pour les lecteurs d'écran.
function GraphiqueActivite({ activite }: { activite: ActiviteJourDto[] }) {
  const maximum = Math.max(30, ...activite.map((a) => a.minutes));
  return (
    <figure>
      <div className="flex h-40 items-end gap-2 border-b border-gray-300 px-1" aria-hidden="true">
        {activite.map((a) => (
          <div key={a.jour} className="group relative flex h-full flex-1 items-end justify-center">
            <div
              className="w-full max-w-10 rounded-t bg-brand transition group-hover:bg-brand-dark"
              style={{ height: `${a.minutes === 0 ? 0 : Math.max(4, (a.minutes / maximum) * 100)}%` }}
            />
            <span className="pointer-events-none absolute -top-7 hidden whitespace-nowrap rounded bg-gray-900 px-2 py-0.5 text-xs text-white group-hover:block">
              {duree(a.minutes)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2 px-1 text-center text-xs text-gray-600" aria-hidden="true">
        {activite.map((a) => (
          <span key={a.jour} className="flex-1">
            {jourCourt(a.jour)}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Temps d&apos;activité des 7 derniers jours</caption>
        <tbody>
          {activite.map((a) => (
            <tr key={a.jour}>
              <th scope="row">{jourLong(a.jour)}</th>
              <td>{duree(a.minutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export default async function PageSuiviEnfant({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const suite = `/connexion?suite=/parent/enfants/${id}`;
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect(suite);

  const reponse = await appelerApi(`/parents/enfants/${encodeURIComponent(id)}`);
  if (reponse.status === 401) redirect(suite);
  if (reponse.status === 403 || reponse.status === 400) redirect("/parent");
  if (!reponse.ok) throw new Error(`Réponse inattendue de l'API : ${reponse.status}`);
  const tableau = (await reponse.json()) as TableauEnfant;
  const prenom = tableau.enfant.nomComplet.split(" ")[0];
  const stats = [
    { libelle: "Temps cette semaine", valeur: duree(tableau.minutesSemaine) },
    { libelle: "Leçons terminées", valeur: `${tableau.leconsTerminees.total} (dont ${tableau.leconsTerminees.semaine} cette semaine)` },
    { libelle: "Série en cours", valeur: `${tableau.serie.actuelle} jour${tableau.serie.actuelle > 1 ? "s" : ""} (record ${tableau.serie.record})` },
    { libelle: "XP cette semaine", valeur: `${tableau.xpSemaine} XP` },
  ];

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <Link href="/parent" className="text-sm font-medium text-brand-dark underline underline-offset-4">
          ← Espace parent
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">{tableau.enfant.nomComplet}</h1>
          <p className="text-sm text-gray-600">{tableau.enfant.niveau ? `Classe de ${tableau.enfant.niveau}` : "Classe non renseignée"}</p>
        </div>

        <section aria-label="Chiffres clés" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.libelle} className="rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-600">{stat.libelle}</p>
              <p className="mt-1 font-bold text-brand-dark" data-testid={`stat-${stat.libelle}`}>
                {stat.valeur}
              </p>
            </div>
          ))}
        </section>

        <section aria-labelledby="titre-activite" className="rounded-xl border border-gray-200 p-5">
          <h2 id="titre-activite" className="mb-8 font-semibold text-gray-900">
            Temps d&apos;activité des 7 derniers jours
          </h2>
          <GraphiqueActivite activite={tableau.activite} />
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <section aria-labelledby="titre-lecons" className="rounded-xl border border-gray-200 p-5">
            <h2 id="titre-lecons" className="font-semibold text-gray-900">
              Dernières leçons terminées
            </h2>
            {tableau.leconsTerminees.dernieres.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">{prenom} n&apos;a pas encore terminé de leçon.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {tableau.leconsTerminees.dernieres.map((lecon) => (
                  <li key={`${lecon.titre}-${lecon.le}`} className="flex justify-between gap-3">
                    <span>{lecon.titre}</span>
                    <span className="shrink-0 text-gray-500">{date(lecon.le)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="titre-scores" className="rounded-xl border border-gray-200 p-5">
            <h2 id="titre-scores" className="font-semibold text-gray-900">
              Scores récents aux quiz
            </h2>
            {tableau.scoresRecents.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">{prenom} n&apos;a pas encore passé de quiz.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {tableau.scoresRecents.map((score) => (
                  <li key={`${score.titre}-${score.le}`} className="flex justify-between gap-3">
                    <span>{score.titre}</span>
                    <span className="shrink-0 font-semibold text-gray-900">{Math.round(score.score)} %</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <ActionsEnfant enfantId={tableau.enfant.id} prenom={prenom ?? ""} accordParental={tableau.accordParental} />
      </main>
    </>
  );
}
