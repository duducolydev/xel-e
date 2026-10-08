"use client";

import type { AnnaleDto, EpreuveDto, ExamenAdmin, QuizBrouillon } from "@xel-e/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alerte, Champ, Selection } from "@/components/ui";
import { envoyer } from "@/lib/api-client";
import { EditeurQuiz } from "../../studio/editeur-quiz";

const classeBouton = "rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand disabled:opacity-60";
type Message = { ton: "erreur" | "succes"; texte: string } | null;

function LigneEpreuve({ epreuve }: { epreuve: EpreuveDto }) {
  const router = useRouter();
  const [duree, setDuree] = useState(epreuve.dureeMinutes === null ? "" : String(epreuve.dureeMinutes));
  const [coefficient, setCoefficient] = useState(String(epreuve.coefficient).replace(".", ","));
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer() {
    const resultat = await envoyer(
      `/admin/bfem/epreuves/${epreuve.code}`,
      { dureeMinutes: duree.trim() === "" ? null : Number(duree), coefficient: Number(coefficient.replace(",", ".")) },
      "PATCH",
    );
    if (resultat.ok) {
      setErreur(null);
      router.refresh();
    } else setErreur(Object.values(resultat.erreurs)[0] ?? resultat.message);
  }

  return (
    <tr>
      <th scope="row" className="px-3 py-2 font-medium text-gray-900">
        {epreuve.libelle}
        {epreuve.aVerifier ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">à vérifier</span> : null}
        {erreur ? <span className="block text-xs text-red-700">{erreur}</span> : null}
      </th>
      <td className="px-3 py-2">
        <input
          aria-label={`Durée (minutes) — ${epreuve.libelle}`}
          value={duree}
          onChange={(e) => setDuree(e.target.value)}
          inputMode="numeric"
          className="w-20 rounded border border-gray-300 px-2 py-1"
        />
      </td>
      <td className="px-3 py-2">
        <input
          aria-label={`Coefficient — ${epreuve.libelle}`}
          value={coefficient}
          onChange={(e) => setCoefficient(e.target.value)}
          inputMode="decimal"
          className="w-16 rounded border border-gray-300 px-2 py-1"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <button type="button" onClick={enregistrer} className="text-sm font-semibold text-brand-dark underline">
          {epreuve.aVerifier ? "Confirmer" : "Enregistrer"}
        </button>
      </td>
    </tr>
  );
}

export function TableauEpreuves({ epreuves }: { epreuves: EpreuveDto[] }) {
  return (
    <section aria-labelledby="titre-epreuves" className="space-y-3">
      <h2 id="titre-epreuves" className="text-lg font-semibold text-gray-900">
        Épreuves : durées et coefficients officiels
      </h2>
      <p className="text-sm text-gray-600">
        Les valeurs marquées « à vérifier » sont provisoires. Saisis les valeurs officielles du BFEM puis confirme : elles
        servent au minuteur des examens blancs et à la simulation de moyenne.
      </p>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Épreuve</th>
              <th scope="col" className="px-3 py-2 font-semibold">Durée (min)</th>
              <th scope="col" className="px-3 py-2 font-semibold">Coefficient</th>
              <th scope="col" className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {epreuves.map((epreuve) => (
              <LigneEpreuve key={epreuve.code} epreuve={epreuve} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const EXAMEN_VIDE = { titre: "", epreuve: "MATHS", consignes: "", premium: true, publie: false, questions: [] as QuizBrouillon };

export function EditeurExamens({ examens, epreuves }: { examens: ExamenAdmin[]; epreuves: EpreuveDto[] }) {
  const router = useRouter();
  const [edite, setEdite] = useState<{ id: string | null } & typeof EXAMEN_VIDE>({ id: null, ...EXAMEN_VIDE });
  const [ouvert, setOuvert] = useState(false);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<Message>(null);
  const [enCours, setEnCours] = useState(false);

  function ouvrir(examen: ExamenAdmin | null) {
    setEdite(examen ? { ...examen } : { id: null, ...EXAMEN_VIDE });
    setErreurs({});
    setMessage(null);
    setOuvert(true);
  }

  async function enregistrer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setEnCours(true);
    const { id, ...dto } = edite;
    const corps = {
      ...dto,
      questions: dto.questions.map((q) =>
        q.type === "REPONSE_COURTE" ? { ...q, reponsesAcceptees: q.reponsesAcceptees.map((r) => r.trim()).filter(Boolean) } : q,
      ),
    };
    const resultat = id ? await envoyer(`/admin/bfem/examens/${id}`, corps, "PUT") : await envoyer("/admin/bfem/examens", corps);
    setEnCours(false);
    if (!resultat.ok) {
      setErreurs(resultat.erreurs);
      setMessage({ ton: "erreur", texte: resultat.message });
      return;
    }
    setOuvert(false);
    router.refresh();
  }

  return (
    <section aria-labelledby="titre-examens-admin" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titre-examens-admin" className="text-lg font-semibold text-gray-900">
          Examens blancs
        </h2>
        <button type="button" onClick={() => ouvrir(null)} className={classeBouton}>
          Nouvel examen blanc
        </button>
      </div>
      <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200">
        {examens.map((examen) => (
          <li key={examen.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-medium text-gray-900">{examen.titre}</p>
              <p className="text-sm text-gray-600">
                {examen.questions.length} questions · {examen.questions.reduce((t, q) => t + q.bareme, 0)} points · {examen.premium ? "Premium" : "Gratuit"} ·{" "}
                {examen.publie ? "publié" : "brouillon"}
              </p>
            </div>
            <button type="button" onClick={() => ouvrir(examen)} className="text-sm font-semibold text-brand-dark underline">
              Modifier
            </button>
          </li>
        ))}
      </ul>
      {ouvert ? (
        <form onSubmit={enregistrer} className="space-y-4 rounded-xl border border-brand-light p-5" noValidate>
          <h3 className="font-semibold text-gray-900">{edite.id ? "Modifier l'examen blanc" : "Nouvel examen blanc"}</h3>
          <Champ id="titre-examen" label="Titre" value={edite.titre} onChange={(e) => setEdite({ ...edite, titre: e.target.value })} erreur={erreurs.titre} />
          <Selection id="epreuve-examen" label="Épreuve" value={edite.epreuve} onChange={(e) => setEdite({ ...edite, epreuve: e.target.value })}>
            {epreuves.map((epreuve) => (
              <option key={epreuve.code} value={epreuve.code}>
                {epreuve.libelle}
              </option>
            ))}
          </Selection>
          <div>
            <label htmlFor="consignes-examen" className="mb-1 block text-sm font-medium text-gray-800">
              Consignes
            </label>
            <textarea
              id="consignes-examen"
              rows={3}
              value={edite.consignes}
              onChange={(e) => setEdite({ ...edite, consignes: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={edite.premium} onChange={(e) => setEdite({ ...edite, premium: e.target.checked })} className="h-4 w-4 accent-brand-dark" />
              Premium (le premier examen de chaque matière reste gratuit)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={edite.publie} onChange={(e) => setEdite({ ...edite, publie: e.target.checked })} className="h-4 w-4 accent-brand-dark" />
              Publié
            </label>
          </div>
          <p className="text-sm text-gray-600">
            Total : {edite.questions.reduce((t, q) => t + (Number(q.bareme) || 0), 0)} points (20 au BFEM). Indique l&apos;exercice
            dans l&apos;énoncé (« Exercice 1. a) … »).
          </p>
          <EditeurQuiz quiz={edite.questions} onChange={(questions) => setEdite({ ...edite, questions })} erreurs={Object.fromEntries(Object.entries(erreurs).map(([cle, valeur]) => [cle.replace(/^questions/, "quiz"), valeur]))} />
          {message ? <Alerte ton={message.ton}>{message.texte}</Alerte> : null}
          <div className="flex gap-3">
            <button type="submit" disabled={enCours} className={classeBouton}>
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button type="button" onClick={() => setOuvert(false)} className="text-sm font-medium text-gray-700 underline">
              Annuler
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

export function GestionAnnales({ annales, epreuves }: { annales: AnnaleDto[]; epreuves: EpreuveDto[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<Message>(null);
  const [enCours, setEnCours] = useState(false);

  async function ajouter(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const formulaire = evenement.currentTarget;
    const donnees = new FormData(formulaire);
    donnees.set("premium", (formulaire.elements.namedItem("premium") as HTMLInputElement).checked ? "true" : "false");
    if (!(donnees.get("corrige") as File | null)?.size) donnees.delete("corrige");
    setEnCours(true);
    const resultat = await envoyer("/admin/bfem/annales", donnees);
    setEnCours(false);
    if (!resultat.ok) {
      setMessage({ ton: "erreur", texte: Object.values(resultat.erreurs)[0] ?? resultat.message });
      return;
    }
    formulaire.reset();
    setMessage({ ton: "succes", texte: "Annale ajoutée (fichiers analysés par l'antivirus)." });
    router.refresh();
  }

  async function supprimer(id: string) {
    const resultat = await envoyer(`/admin/bfem/annales/${id}`, undefined, "DELETE");
    if (resultat.ok) router.refresh();
    else setMessage({ ton: "erreur", texte: resultat.message });
  }

  return (
    <section aria-labelledby="titre-annales-admin" className="space-y-3">
      <h2 id="titre-annales-admin" className="text-lg font-semibold text-gray-900">
        Annales
      </h2>
      <form onSubmit={ajouter} className="grid gap-3 rounded-xl border border-gray-200 p-4 sm:grid-cols-2" noValidate>
        <Selection id="epreuve" label="Épreuve" defaultValue="MATHS">
          {epreuves.map((epreuve) => (
            <option key={epreuve.code} value={epreuve.code}>
              {epreuve.libelle}
            </option>
          ))}
        </Selection>
        <Champ id="annee" label="Session (année)" inputMode="numeric" defaultValue={String(new Date().getFullYear() - 1)} />
        <Champ id="titre" label="Titre" placeholder="BFEM 2025 — Mathématiques" className="sm:col-span-2" />
        <div>
          <label htmlFor="sujet" className="mb-1 block text-sm font-medium text-gray-800">
            Sujet (PDF, 15 Mo max.)
          </label>
          <input id="sujet" name="sujet" type="file" accept="application/pdf" className="text-sm" />
        </div>
        <div>
          <label htmlFor="corrige" className="mb-1 block text-sm font-medium text-gray-800">
            Corrigé (PDF, facultatif)
          </label>
          <input id="corrige" name="corrige" type="file" accept="application/pdf" className="text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="premium" className="h-4 w-4 accent-brand-dark" />
          Réservée aux abonnés Premium
        </label>
        <div className="sm:text-right">
          <button type="submit" disabled={enCours} className={classeBouton}>
            {enCours ? "Analyse et envoi…" : "Ajouter l'annale"}
          </button>
        </div>
      </form>
      {message ? <Alerte ton={message.ton}>{message.texte}</Alerte> : null}
      <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200">
        {annales.length === 0 ? <li className="px-4 py-3 text-sm text-gray-600">Aucune annale.</li> : null}
        {annales.map((annale) => (
          <li key={annale.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <span>
              {annale.titre} · {annale.epreuve.libelle} · {annale.annee}
              {annale.aUnCorrige ? " · avec corrigé" : ""}
              {annale.premium ? " · Premium" : ""}
            </span>
            <button type="button" onClick={() => supprimer(annale.id)} className="font-medium text-red-700 underline">
              Retirer
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AccorderPremium() {
  const [login, setLogin] = useState("");
  const [jours, setJours] = useState("30");
  const [message, setMessage] = useState<Message>(null);

  async function accorder(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const resultat = await envoyer<{ expireLe: string }>("/admin/abonnements", { login, jours: Number(jours) });
    if (!resultat.ok) {
      setMessage({ ton: "erreur", texte: Object.values(resultat.erreurs)[0] ?? resultat.message });
      return;
    }
    const fin = new Date(resultat.donnees.expireLe).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Africa/Dakar" });
    setMessage({ ton: "succes", texte: `Accès Premium ouvert jusqu'au ${fin}.` });
    setLogin("");
  }

  return (
    <section aria-labelledby="titre-premium" className="space-y-3">
      <h2 id="titre-premium" className="text-lg font-semibold text-gray-900">
        Accorder un accès Premium
      </h2>
      <p className="text-sm text-gray-600">En attendant les paiements (Wave / Orange Money), pour un partenaire ou un test.</p>
      <form onSubmit={accorder} className="flex flex-wrap items-end gap-3" noValidate>
        <Champ id="login-premium" label="Email ou identifiant" value={login} onChange={(e) => setLogin(e.target.value)} />
        <Champ id="jours-premium" label="Durée (jours)" inputMode="numeric" value={jours} onChange={(e) => setJours(e.target.value)} className="w-28" />
        <button type="submit" className={classeBouton}>
          Accorder
        </button>
      </form>
      {message ? <Alerte ton={message.ton}>{message.texte}</Alerte> : null}
    </section>
  );
}
