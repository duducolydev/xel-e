import type { HistoriqueBfem, PointHistorique } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { nombre } from "@/components/corrige-detaille";
import { EnteteConnecte } from "@/components/entete-connecte";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";

export const metadata: Metadata = { title: "Historique des examens blancs — Xel-E" };

const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Africa/Dakar" });

// Une série par graphique (petits multiples, une épreuve chacun) : axe des notes fixe de 0 à 20 pour
// comparer d'un coup d'œil, ligne de 2 px, marqueurs de 8 px, ligne de la moyenne (10) en pointillés.
function Evolution({ points, libelle }: { points: PointHistorique[]; libelle: string }) {
  const largeur = 320;
  const hauteur = 160;
  const marge = { haut: 12, droite: 12, bas: 24, gauche: 28 };
  const interieurL = largeur - marge.gauche - marge.droite;
  const interieurH = hauteur - marge.haut - marge.bas;
  const x = (i: number) => marge.gauche + (points.length === 1 ? interieurL / 2 : (i / (points.length - 1)) * interieurL);
  const y = (note: number) => marge.haut + interieurH - (note / 20) * interieurH;
  const trace = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.note).toFixed(1)}`).join(" ");

  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${largeur} ${hauteur}`} className="h-auto w-full" role="img" aria-label={`Évolution des notes en ${libelle}`}>
        {[0, 10, 20].map((graduation) => (
          <g key={graduation}>
            <line
              x1={marge.gauche}
              x2={largeur - marge.droite}
              y1={y(graduation)}
              y2={y(graduation)}
              className="stroke-gray-200"
              strokeDasharray={graduation === 10 ? "4 4" : undefined}
              strokeWidth={1}
            />
            <text x={marge.gauche - 6} y={y(graduation) + 4} textAnchor="end" className="fill-gray-500 text-[10px]">
              {graduation}
            </text>
          </g>
        ))}
        <path d={trace} fill="none" className="stroke-brand" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point, i) => (
          <g key={point.copieId} className="group">
            {/* Zone de survol plus large que le marqueur. */}
            <circle cx={x(i)} cy={y(point.note)} r={12} fill="transparent">
              <title>{`${point.examen} — ${nombre(point.note)} / 20, le ${date(point.le)}`}</title>
            </circle>
            <circle cx={x(i)} cy={y(point.note)} r={4} className="fill-brand stroke-white group-hover:fill-brand-dark" strokeWidth={2} />
          </g>
        ))}
        {points.length > 0 ? (
          <text x={x(points.length - 1)} y={y(points.at(-1)!.note) - 10} textAnchor="middle" className="fill-gray-900 text-[11px] font-semibold">
            {nombre(points.at(-1)!.note)}
          </text>
        ) : null}
      </svg>
      <figcaption className="sr-only">Notes sur 20, de la plus ancienne à la plus récente ; la ligne en pointillés marque 10 sur 20.</figcaption>
    </figure>
  );
}

export default async function PageHistoriqueBfem() {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?suite=/bfem/historique");
  const reponse = await appelerApi("/bfem/historique");
  if (reponse.status === 401) redirect("/connexion?suite=/bfem/historique");
  if (reponse.status === 403) redirect("/tableau-de-bord?acces=refuse");
  if (!reponse.ok) throw new Error(`Réponse inattendue de l'API : ${reponse.status}`);
  const historique = (await reponse.json()) as HistoriqueBfem;
  const passees = historique.epreuves.filter((e) => e.points.length > 0);

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <Link href="/bfem" className="text-sm font-medium text-brand-dark underline underline-offset-4">
          ← Préparer le BFEM
        </Link>
        <h1 className="text-2xl font-bold text-brand-dark">Mes examens blancs</h1>
        {passees.length === 0 ? (
          <p className="text-sm text-gray-600">Tu n&apos;as encore passé aucun examen blanc.</p>
        ) : (
          passees.map((epreuve) => (
            <section key={epreuve.code} aria-labelledby={`titre-${epreuve.code}`} className="grid gap-4 rounded-xl border border-gray-200 p-5 sm:grid-cols-[1fr_1fr]">
              <div>
                <h2 id={`titre-${epreuve.code}`} className="mb-2 font-semibold text-gray-900">
                  {epreuve.libelle}
                </h2>
                <Evolution points={epreuve.points} libelle={epreuve.libelle} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-gray-600">
                    <tr>
                      <th scope="col" className="py-1 font-medium">Examen</th>
                      <th scope="col" className="py-1 font-medium">Date</th>
                      <th scope="col" className="py-1 text-right font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[...epreuve.points].reverse().map((point) => (
                      <tr key={point.copieId} data-testid="ligne-historique">
                        <td className="py-1.5">
                          <Link href={`/bfem/copies/${point.copieId}/resultat`} className="text-brand-dark underline-offset-4 hover:underline">
                            {point.examen}
                          </Link>
                          {point.soumissionAuto ? <span className="ml-1 text-xs text-gray-500">(temps écoulé)</span> : null}
                        </td>
                        <td className="py-1.5 text-gray-600">{date(point.le)}</td>
                        <td className="py-1.5 text-right font-semibold text-gray-900">{nombre(point.note)} / 20</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}
      </main>
    </>
  );
}
