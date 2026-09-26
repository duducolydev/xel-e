import { PrismaClient, Role } from "@prisma/client";
import { hasherMotDePasse } from "../src/auth/password";
import type { PrismaService } from "../src/prisma/prisma.service";
import { ProgressionService } from "../src/progression/progression.service";
import { QuizService } from "../src/quiz/quiz.service";
import { MOT_DE_PASSE_DEMO } from "./seed";

const JOUR_MS = 24 * 60 * 60 * 1000;

// Réponses justes des questions génériques de démo (voir questionsGeneriques).
const BONNES_REPONSES_GENERIQUES: Record<string, string[] | boolean | string> = {
  QCM: ["b"],
  VRAI_FAUX: true,
  REPONSE_COURTE: "4",
};

const CAMARADES = [
  { email: "awa.classement@xele.sn", nomComplet: "Awa Démo", pseudonyme: "baobab_42", lecons: 2 },
  { email: "ibou.classement@xele.sn", nomComplet: "Ibou Démo", pseudonyme: "lion_teranga", lecons: 1 },
];

// Progression de démonstration (développement uniquement), produite par les vrais services pour
// respecter exactement les règles d'XP, de badges et de série. Sans effet si déjà présente.
export async function seedProgressionDemo(prisma: PrismaClient, maintenant = new Date()): Promise<void> {
  const service = prisma as unknown as PrismaService;
  const progression = new ProgressionService(service);
  const quiz = new QuizService(service, progression);
  await progression.synchroniserBadges();

  const eleve = await prisma.user.findUniqueOrThrow({ where: { email: "eleve.demo@xele.sn" } });
  if ((await prisma.progression.count({ where: { utilisateurId: eleve.id } })) > 0) return;

  const slugs = ["3e-maths-chapitre-1-lecon-1", "3e-maths-chapitre-1-lecon-2", "3e-maths-chapitre-1-lecon-3"];
  for (const [index, slug] of slugs.entries()) {
    const jour = new Date(maintenant.getTime() - (slugs.length - 1 - index) * JOUR_MS);
    await progression.terminerLecon(slug, eleve.id, jour);
  }

  const premiere = slugs[0] as string;
  const tentative = await quiz.demarrer(premiere, eleve.id);
  const { questions } = await quiz.quizPublic(premiere);
  for (const question of questions) {
    const reponse = BONNES_REPONSES_GENERIQUES[question.type];
    if (reponse !== undefined) await quiz.enregistrerReponse(tentative.id, question.id, reponse, eleve.id);
  }
  await quiz.soumettre(tentative.id, eleve.id);

  await prisma.user.update({ where: { id: eleve.id }, data: { classementActif: true } });

  const niveau = await prisma.niveau.findUniqueOrThrow({ where: { libelle: "3e" } });
  const hash = await hasherMotDePasse(MOT_DE_PASSE_DEMO);
  for (const camarade of CAMARADES) {
    const user = await prisma.user.upsert({
      where: { email: camarade.email },
      update: {},
      create: {
        email: camarade.email,
        nomComplet: camarade.nomComplet,
        pseudonyme: camarade.pseudonyme,
        role: Role.ELEVE,
        motDePasseHash: hash,
        emailConfirmeLe: maintenant,
        niveauId: niveau.id,
        naissanceMois: 1,
        naissanceAnnee: 2010,
        classementActif: true,
      },
    });
    for (const slug of slugs.slice(0, camarade.lecons)) await progression.terminerLecon(slug, user.id, maintenant);
  }
}
