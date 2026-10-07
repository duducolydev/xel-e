import type { EnfantLie, NotificationEleve, PreferencesParent } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { PanneauNotifications } from "@/components/notifications";
import { appelerApi, utilisateurCourant } from "@/lib/api-serveur";
import { FormulaireLiaison, FormulairePreferences } from "./formulaires";

export const metadata: Metadata = { title: "Espace parent — Xel-E" };

interface EspaceParent {
  enfants: EnfantLie[];
  notifications: NotificationEleve[];
  notificationsNonLues: number;
  preferences: PreferencesParent;
}

export default async function PageEspaceParent() {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?suite=/parent");

  const reponse = await appelerApi("/parents");
  if (reponse.status === 401) redirect("/connexion?suite=/parent");
  if (reponse.status === 403) redirect("/tableau-de-bord?acces=refuse");
  if (!reponse.ok) throw new Error(`Réponse inattendue de l'API : ${reponse.status}`);
  const espace = (await reponse.json()) as EspaceParent;

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Espace parent</h1>
          <p className="mt-1 text-sm text-gray-600">Suivez le travail de vos enfants sur Xel-E et choisissez comment recevoir leur résumé.</p>
        </div>

        <PanneauNotifications notifications={espace.notifications} nonLues={espace.notificationsNonLues} />

        <section aria-labelledby="titre-enfants" className="space-y-3">
          <h2 id="titre-enfants" className="text-lg font-semibold text-gray-900">
            Mes enfants
          </h2>
          {espace.enfants.length === 0 ? (
            <p className="text-sm text-gray-600">
              Aucun enfant lié pour l&apos;instant. Demandez à votre enfant de générer un code depuis son tableau de bord.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {espace.enfants.map((enfant) => (
                <li key={enfant.id}>
                  <Link
                    href={`/parent/enfants/${enfant.id}`}
                    className="block rounded-xl border border-gray-200 p-4 hover:border-brand hover:bg-brand-wash"
                  >
                    <span className="font-semibold text-brand-dark">{enfant.nomComplet}</span>
                    <span className="mt-1 block text-sm text-gray-600">{enfant.niveau ? `Classe de ${enfant.niveau}` : "Classe non renseignée"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <FormulaireLiaison />
        </section>

        <FormulairePreferences initiales={espace.preferences} />
      </main>
    </>
  );
}
