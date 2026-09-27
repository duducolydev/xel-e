import type { TableauDeBordProgression } from "@xel-e/shared";
import Link from "next/link";
import { PanneauNotifications } from "@/components/notifications";
import { BarreProgression } from "@/components/progression";

function date(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "medium", timeZone: "Africa/Dakar" });
}

function pluriel(nombre: number, mot: string): string {
  return `${nombre} ${mot}${nombre > 1 ? "s" : ""}`;
}

export function ProgressionEleve({ tableau }: { tableau: TableauDeBordProgression }) {
  const obtenus = tableau.badges.filter((b) => b.obtenuLe);
  const stats = [
    { libelle: "XP au total", valeur: `${tableau.xpTotal} XP` },
    { libelle: "XP cette semaine", valeur: `${tableau.xpSemaine} XP` },
    { libelle: "Série en cours", valeur: pluriel(tableau.serie.actuelle, "jour") },
    { libelle: "Meilleure série", valeur: pluriel(tableau.serie.record, "jour") },
  ];

  return (
    <div className="space-y-6">
      <section aria-label="Mes statistiques" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.libelle} className="rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-600">{stat.libelle}</p>
            <p className="mt-1 text-xl font-bold text-brand-dark" data-testid={`stat-${stat.libelle}`}>
              {stat.valeur}
            </p>
          </div>
        ))}
      </section>

      <PanneauNotifications notifications={tableau.notifications} nonLues={tableau.notificationsNonLues} />

      {tableau.matieres.length > 0 ? (
        <section aria-labelledby="titre-progression" className="space-y-3">
          <h2 id="titre-progression" className="text-lg font-semibold text-gray-900">
            Ma progression en {tableau.niveau}
          </h2>
          {tableau.matieres.map((matiere) => (
            <details key={matiere.slug} className="rounded-xl border border-gray-200 p-4">
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-gray-900">{matiere.nom}</span>
                  <span className="text-sm font-semibold text-brand-dark" data-testid={`progression-${matiere.slug}`}>
                    {matiere.pourcentage} %
                  </span>
                </div>
                <div className="mt-2">
                  <BarreProgression valeur={matiere.pourcentage} libelle={`Progression en ${matiere.nom}`} />
                </div>
              </summary>
              <ul className="mt-4 space-y-3">
                {matiere.chapitres.map((chapitre) => (
                  <li key={chapitre.titre}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-800">
                        {chapitre.titre}
                        {chapitre.complet ? <span className="ml-2 text-green-700">✓ bouclé</span> : null}
                      </span>
                      <span className="text-gray-600">
                        {chapitre.leconsTerminees}/{chapitre.leconsTotal} leçons · {chapitre.pourcentage} %
                      </span>
                    </div>
                    <div className="mt-1">
                      <BarreProgression valeur={chapitre.pourcentage} libelle={`Progression : ${chapitre.titre}`} />
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                href={`/cours/${tableau.niveau}/${matiere.slug}`}
                className="mt-3 inline-block text-sm font-semibold text-brand-dark underline"
              >
                Continuer en {matiere.nom}
              </Link>
            </details>
          ))}
        </section>
      ) : null}

      <section aria-labelledby="titre-badges">
        <h2 id="titre-badges" className="text-lg font-semibold text-gray-900">
          Mes badges ({obtenus.length}/{tableau.badges.length})
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tableau.badges.map((badge) => (
            <li
              key={badge.code}
              className={`rounded-xl border p-3 ${badge.obtenuLe ? "border-brand bg-brand-wash" : "border-dashed border-gray-300 text-gray-500"}`}
            >
              <p className={`font-semibold ${badge.obtenuLe ? "text-brand-dark" : ""}`}>{badge.libelle}</p>
              <p className="text-xs">{badge.description}</p>
              <p className="mt-1 text-xs">{badge.obtenuLe ? `Obtenu le ${date(badge.obtenuLe)}` : "À débloquer"}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="titre-activites">
        <h2 id="titre-activites" className="text-lg font-semibold text-gray-900">
          Dernières activités
        </h2>
        {tableau.activites.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">Termine une leçon ou fais un quiz pour commencer.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-200 rounded-xl border border-gray-200">
            {tableau.activites.map((activite, index) => (
              <li key={`${activite.type}-${activite.slug}-${index}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-gray-800">
                  {activite.type === "lecon" ? "Leçon terminée" : "Quiz"} : {activite.titre}
                </span>
                <span className="shrink-0 text-gray-600">
                  {activite.score !== null ? `${activite.score.toLocaleString("fr-FR")} % · ` : ""}
                  {date(activite.le)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
