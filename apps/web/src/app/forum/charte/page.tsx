import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnteteConnecte } from "@/components/entete-connecte";
import { utilisateurCourant } from "@/lib/api-serveur";

export const metadata: Metadata = { title: "Charte du forum — Xel-E" };

const REGLES = [
  {
    titre: "On s'entraide, on ne se moque pas",
    texte:
      "Pose tes questions sur les cours de Maths, PC et SVT et aide les autres à comprendre. Aucune question n'est bête : les moqueries, insultes et menaces sont interdites.",
  },
  {
    titre: "On reste anonyme",
    texte:
      "Tu participes sous un pseudonyme. Ne donne jamais ton nom, ton adresse, ton école, ton numéro de téléphone ni tes réseaux sociaux, et ne demande pas ceux des autres.",
  },
  {
    titre: "Pas de liens vers d'autres sites",
    texte:
      "Les élèves ne peuvent pas publier de liens vers d'autres sites. Les professeurs peuvent partager des ressources fiables. Les liens vers les leçons de Xel-E sont toujours permis.",
  },
  {
    titre: "Des fichiers utiles et sûrs",
    texte:
      "Tu peux joindre jusqu'à 3 images ou PDF (5 Mo maximum chacun), par exemple la photo d'un exercice. Chaque fichier est vérifié par un antivirus. Aucune photo de personne.",
  },
  {
    titre: "Pas de triche",
    texte:
      "Le forum sert à comprendre, pas à faire faire ses devoirs ni à échanger les réponses des quiz ou des examens blancs.",
  },
];

export default async function PageCharte() {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?suite=/forum/charte");

  return (
    <>
      <EnteteConnecte utilisateur={utilisateur} />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <Link href="/forum" className="text-sm font-medium text-brand-dark underline underline-offset-4">
          ← Forum
        </Link>
        <h1 className="text-2xl font-bold text-brand-dark">Charte du forum</h1>
        <ol className="space-y-4">
          {REGLES.map((regle, index) => (
            <li key={regle.titre} className="rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900">
                {index + 1}. {regle.titre}
              </h2>
              <p className="mt-1 text-gray-700">{regle.texte}</p>
            </li>
          ))}
        </ol>
        <section aria-labelledby="titre-signaler" className="rounded-xl border border-brand-light bg-brand-wash p-5">
          <h2 id="titre-signaler" className="font-semibold text-brand-dark">
            Un message te gêne ?
          </h2>
          <p className="mt-1 text-gray-700">
            Clique sur « Signaler » sous le message. Après trois signalements, il est masqué jusqu&apos;à ce que l&apos;équipe
            Xel-E le vérifie. Les messages qui ne respectent pas la charte sont supprimés. Si quelque chose te fait peur ou te
            met mal à l&apos;aise, parles-en aussi à un adulte de confiance.
          </p>
        </section>
      </main>
    </>
  );
}
