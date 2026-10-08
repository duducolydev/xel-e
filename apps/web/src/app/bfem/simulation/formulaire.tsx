"use client";

import type { SimulationBfem } from "@xel-e/shared";
import { useState, type FormEvent } from "react";
import { Alerte } from "@/components/ui";
import { envoyer } from "@/lib/api-client";

const nombre = (valeur: number) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

export function FormulaireSimulation({ initiale }: { initiale: SimulationBfem }) {
  const [simulation, setSimulation] = useState(initiale);
  const [saisies, setSaisies] = useState<Record<string, string>>(() =>
    Object.fromEntries(initiale.lignes.filter((l) => l.source !== "examen").map((l) => [l.code, l.note === null ? "" : String(l.note).replace(".", ",")])),
  );
  const [message, setMessage] = useState<{ ton: "erreur" | "succes"; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function calculer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const notes: Record<string, number | null> = {};
    for (const [code, texte] of Object.entries(saisies)) {
      const valeur = texte.trim().replace(",", ".");
      notes[code] = valeur === "" ? null : Number(valeur);
      if (notes[code] !== null && (Number.isNaN(notes[code]) || notes[code]! < 0 || notes[code]! > 20)) {
        setMessage({ ton: "erreur", texte: "Chaque note doit être comprise entre 0 et 20." });
        return;
      }
    }
    setEnCours(true);
    const resultat = await envoyer<SimulationBfem>("/bfem/simulation", { notes }, "PUT");
    setEnCours(false);
    if (resultat.ok) {
      setSimulation(resultat.donnees);
      setMessage(null);
    } else setMessage({ ton: "erreur", texte: resultat.message });
  }

  const provisoire = simulation.lignes.some((l) => l.aVerifier);
  return (
    <form onSubmit={calculer} className="space-y-5" noValidate>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">Épreuve</th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">Coefficient</th>
              <th scope="col" className="px-4 py-2 font-semibold">Note sur 20</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {simulation.lignes.map((ligne) => (
              <tr key={ligne.code}>
                <th scope="row" className="px-4 py-2 font-medium text-gray-900">{ligne.libelle}</th>
                <td className="px-4 py-2 text-right">
                  {nombre(ligne.coefficient)}
                  {ligne.aVerifier ? <span className="ml-1 text-xs text-amber-800" title="Coefficient provisoire, en attente des valeurs officielles">*</span> : null}
                </td>
                <td className="px-4 py-2">
                  {ligne.source === "examen" ? (
                    <span>
                      <strong>{nombre(ligne.note!)}</strong> <span className="text-xs text-gray-500">(dernier examen blanc)</span>
                    </span>
                  ) : (
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Note estimée en ${ligne.libelle}`}
                      value={saisies[ligne.code] ?? ""}
                      onChange={(e) => setSaisies((actuelles) => ({ ...actuelles, [ligne.code]: e.target.value }))}
                      placeholder="—"
                      className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-right"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {provisoire ? <p className="text-xs text-amber-800">* Coefficient provisoire, en attente des valeurs officielles.</p> : null}

      <section aria-label="Moyenne simulée" className="rounded-2xl border border-brand-light bg-brand-wash p-5 text-center">
        {simulation.moyenne === null ? (
          <p className="text-gray-700">Passe un examen blanc ou indique des notes pour obtenir une estimation.</p>
        ) : (
          <>
            <p className="text-4xl font-bold text-brand-dark" data-testid="moyenne-simulee">
              {nombre(simulation.moyenne)} / 20
            </p>
            <p className="mt-1 font-semibold text-gray-900">{simulation.mention}</p>
            {simulation.coefficientsPris < simulation.coefficientsTotal ? (
              <p className="mt-2 text-sm text-gray-600">
                Calculée sur {nombre(simulation.coefficientsPris)} coefficients sur {nombre(simulation.coefficientsTotal)} : complète les
                autres épreuves pour une estimation plus fiable.
              </p>
            ) : null}
          </>
        )}
      </section>

      {message ? <Alerte ton={message.ton}>{message.texte}</Alerte> : null}
      <button type="submit" disabled={enCours} className="rounded-lg bg-brand-dark px-4 py-2.5 font-semibold text-white hover:bg-brand disabled:opacity-60">
        {enCours ? "Calcul…" : "Calculer ma moyenne"}
      </button>
    </form>
  );
}
