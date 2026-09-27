import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma, type Lecon, type StatutLecon, type VersionLecon } from "@prisma/client";
import type { QuizBrouillon } from "@xel-e/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { Acteur } from "./workflow";
import { PublicationService } from "./publication.service";

type Filtre = Partial<Record<keyof Lecon, unknown>>;

interface QuestionStockee {
  id: string;
  quizId: string;
  type: string;
  enonce: string;
  choix: unknown;
  reponseCorrecte: unknown;
  ordre: number;
}

const ADMIN: Acteur = { id: "admin-1", role: "ADMIN" };
const PROF: Acteur = { id: "prof-1", role: "PROFESSEUR" };
const AUTRE_PROF: Acteur = { id: "prof-2", role: "PROFESSEUR" };

const QUIZ: QuizBrouillon = [
  {
    type: "QCM",
    enonce: "Quel côté est l'hypoténuse ?",
    bareme: 2,
    explication: undefined,
    choix: [
      { id: "a", texte: "Le plus court", correct: false },
      { id: "b", texte: "Le plus long", correct: true },
    ],
  },
  { type: "VRAI_FAUX", enonce: "3, 4, 5 forme un triangle rectangle.", bareme: 1, explication: undefined, reponse: true },
];

function creerFausseBase() {
  const lecon: Lecon = {
    id: "lecon-1",
    chapitreId: "chapitre-1",
    slug: "pythagore",
    titre: "Le théorème de Pythagore",
    contenu: "## Énoncé\nDans un triangle rectangle, $a^2 + b^2 = c^2$.",
    statut: "BROUILLON",
    version: 0,
    ordre: 1,
    auteurId: PROF.id,
    quizBrouillon: null,
    soumisLe: null,
    vues: 0,
    versionPublieeId: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const versions: VersionLecon[] = [];
  const commentaires: { leconId: string; auteurId: string; contenu: string }[] = [];
  const notifications: { utilisateurId: string; type: string; contenu: string }[] = [];
  const quiz = { existe: false, deletedAt: null as Date | null };
  let questions: QuestionStockee[] = [];
  const correspond = (filtre: Filtre) =>
    Object.entries(filtre).every(([cle, valeur]) => lecon[cle as keyof Lecon] === valeur);
  // Prisma.DbNull est un objet sentinelle : la fausse base le traduit en null.
  const normaliser = (data: Partial<Lecon>) =>
    Object.fromEntries(
      Object.entries(data).map(([cle, valeur]) => [cle, (valeur as unknown) === Prisma.DbNull ? null : valeur]),
    );

  const delegues = {
    lecon: {
      findFirst: async () =>
        lecon.deletedAt
          ? null
          : {
              ...lecon,
              versionPubliee: versions.find((v) => v.id === lecon.versionPublieeId) ?? null,
              chapitre: { niveau: { libelle: "4e" }, matiere: { libelle: "Maths" } },
            },
      updateMany: async ({ where, data }: { where: Filtre; data: Partial<Lecon> }) => {
        if (!correspond(where)) return { count: 0 };
        Object.assign(lecon, normaliser(data));
        return { count: 1 };
      },
      update: async ({ data }: { data: Partial<Lecon> }) => Object.assign(lecon, data),
    },
    // Volontairement sans update ni upsert : une version publiée ne peut pas être modifiée.
    versionLecon: {
      create: async ({ data }: { data: Omit<VersionLecon, "id" | "publieLe"> }) => {
        const version = { ...data, id: `v-${versions.length + 1}`, publieLe: new Date() } as VersionLecon;
        versions.push(version);
        return version;
      },
    },
    commentaireRevue: {
      create: async ({ data }: { data: (typeof commentaires)[number] }) => commentaires.push(data),
    },
    notification: {
      createMany: async ({ data }: { data: typeof notifications }) => notifications.push(...data),
    },
    user: {
      findMany: async ({ where }: { where: { id?: { not: string } } }) =>
        [{ id: ADMIN.id }, { id: "admin-2" }].filter((admin) => admin.id !== where.id?.not),
    },
    quiz: {
      updateMany: async () => {
        quiz.deletedAt = new Date();
        return { count: 1 };
      },
      upsert: async () => {
        quiz.existe = true;
        quiz.deletedAt = null;
        return { id: "quiz-1", questions: questions.map((q) => ({ id: q.id })) };
      },
    },
    question: {
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        questions = questions.filter((q) => !where.id.in.includes(q.id));
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<QuestionStockee> }) => {
        Object.assign(questions.find((q) => q.id === where.id)!, data);
      },
      createMany: async ({ data }: { data: Omit<QuestionStockee, "id">[] }) => {
        questions.push(...data.map((q) => ({ ...q, id: randomUUID() })));
      },
    },
  };
  const prisma = {
    ...delegues,
    $transaction: async <T>(fn: (tx: typeof delegues) => Promise<T>) => fn(delegues),
  } as unknown as PrismaService;
  return { prisma, lecon, versions, delegues, commentaires, notifications, quiz, questions: () => questions };
}

describe("PublicationService — circuit de validation", () => {
  let service: PublicationService;
  let base: ReturnType<typeof creerFausseBase>;
  let lecon: Lecon;

  beforeEach(() => {
    base = creerFausseBase();
    service = new PublicationService(base.prisma, new NotificationsService(base.prisma));
    lecon = base.lecon;
  });

  const passerEnRevue = async (acteur: Acteur = PROF) => {
    await service.soumettre(lecon.id, acteur);
    expect(lecon.statut).toBe<StatutLecon>("EN_REVUE");
  };

  it("refuse de publier un brouillon (seule une leçon EN_REVUE peut passer PUBLIE)", async () => {
    await expect(service.publier(lecon.id, ADMIN)).rejects.toBeInstanceOf(ConflictException);
    expect(base.versions).toHaveLength(0);
    expect(lecon.statut).toBe("BROUILLON");
  });

  it("un professeur ne peut pas publier directement, même sa leçon en revue", async () => {
    await passerEnRevue();

    await expect(service.publier(lecon.id, PROF)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.rejeter(lecon.id, "Pas le droit de refuser.", PROF)).rejects.toBeInstanceOf(ForbiddenException);
    expect(base.versions).toHaveLength(0);
    expect(lecon.statut).toBe("EN_REVUE");
  });

  it("un professeur ne peut pas toucher à la leçon d'un autre (404)", async () => {
    await expect(service.modifierLecon(lecon.id, { titre: "Piratage" }, AUTRE_PROF)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.soumettre(lecon.id, AUTRE_PROF)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.lecon(lecon.id, AUTRE_PROF)).rejects.toBeInstanceOf(NotFoundException);
    expect(lecon.titre).toBe("Le théorème de Pythagore");
  });

  it("soumettre date la soumission et prévient les administrateurs", async () => {
    await passerEnRevue();

    expect(lecon.soumisLe).toBeInstanceOf(Date);
    expect(base.notifications.map((n) => n.utilisateurId).sort()).toEqual(["admin-1", "admin-2"]);
    expect(base.notifications[0]?.contenu).toContain("Nouvelle leçon à relire");
  });

  it("verrouille une leçon en revue, y compris pour son auteur", async () => {
    await passerEnRevue();

    await expect(service.modifierLecon(lecon.id, { titre: "Autre titre" }, PROF)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.modifierLecon(lecon.id, { titre: "Autre titre" }, ADMIN)).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuser renvoie en brouillon, garde le commentaire et prévient l'auteur", async () => {
    await passerEnRevue();
    base.notifications.length = 0;

    await service.rejeter(lecon.id, "Ajoute un exemple chiffré.", ADMIN);

    expect(lecon).toMatchObject({ statut: "BROUILLON", soumisLe: null });
    expect(base.commentaires).toEqual([{ leconId: lecon.id, auteurId: ADMIN.id, contenu: "Ajoute un exemple chiffré." }]);
    expect(base.notifications).toEqual([
      expect.objectContaining({ utilisateurId: PROF.id, type: "REVUE", contenu: expect.stringContaining("Ajoute un exemple chiffré.") }),
    ]);
  });

  it("publier crée une version figée, la met en ligne et prévient l'auteur", async () => {
    await passerEnRevue();

    const version = await service.publier(lecon.id, ADMIN);

    expect(version).toMatchObject({ numero: 1, titre: "Le théorème de Pythagore", contenu: lecon.contenu, publieParId: ADMIN.id });
    expect(version.sections).toEqual([
      expect.objectContaining({ titre: "Énoncé", html: expect.stringContaining('class="katex"') }),
    ]);
    expect(lecon).toMatchObject({ statut: "PUBLIE", version: 1, versionPublieeId: version.id, soumisLe: null });
    expect(base.notifications.at(-1)).toMatchObject({ utilisateurId: PROF.id, contenu: expect.stringContaining("est publiée") });
  });

  it("l'administration n'est pas notifiée de ses propres actions sur ses leçons", async () => {
    lecon.auteurId = ADMIN.id;
    await passerEnRevue(ADMIN);
    await service.publier(lecon.id, ADMIN);

    expect(base.notifications.map((n) => n.utilisateurId)).toEqual(["admin-2"]);
  });

  it("modifier une leçon publiée laisse la version en ligne inchangée jusqu'à la prochaine publication", async () => {
    await passerEnRevue();
    const v1 = await service.publier(lecon.id, ADMIN);
    const instantaneV1 = structuredClone(v1);

    await service.modifierLecon(lecon.id, { titre: "Pythagore (révisé)", contenu: "## Énoncé\nNouveau texte." }, PROF);

    expect(lecon).toMatchObject({ statut: "BROUILLON", versionPublieeId: v1.id });

    await passerEnRevue();
    const v2 = await service.publier(lecon.id, ADMIN);

    expect(v2).toMatchObject({ numero: 2, titre: "Pythagore (révisé)" });
    expect(lecon).toMatchObject({ version: 2, versionPublieeId: v2.id });
    expect(base.versions[0]).toEqual(instantaneV1);
  });

  it("prévient l'auteur quand l'administration rouvre sa leçon publiée", async () => {
    await passerEnRevue();
    await service.publier(lecon.id, ADMIN);
    base.notifications.length = 0;

    await service.modifierLecon(lecon.id, { contenu: "## Énoncé\nCorrection d'une coquille." }, ADMIN);

    expect(base.notifications).toEqual([expect.objectContaining({ utilisateurId: PROF.id, contenu: expect.stringContaining("modifiée") })]);
  });

  it("le quiz brouillon n'est appliqué au quiz en ligne qu'à la publication", async () => {
    await service.modifierLecon(lecon.id, { quiz: QUIZ }, PROF);
    expect(base.quiz.existe).toBe(false);
    await passerEnRevue();

    await service.publier(lecon.id, ADMIN);

    expect(lecon.quizBrouillon).toBeNull();
    expect(base.questions()).toEqual([
      expect.objectContaining({ type: "QCM", ordre: 1, choix: [{ id: "a", texte: "Le plus court" }, { id: "b", texte: "Le plus long" }], reponseCorrecte: ["b"] }),
      expect.objectContaining({ type: "VRAI_FAUX", ordre: 2, reponseCorrecte: true }),
    ]);
  });

  it("met à jour les questions existantes en gardant leur identifiant et supprime les retirées", async () => {
    await service.modifierLecon(lecon.id, { quiz: QUIZ }, PROF);
    await passerEnRevue();
    await service.publier(lecon.id, ADMIN);
    const [qcm] = base.questions();

    await service.modifierLecon(lecon.id, { quiz: [{ ...QUIZ[0]!, id: qcm!.id, enonce: "Quel côté est le plus long ?" }] }, PROF);
    await passerEnRevue();
    await service.publier(lecon.id, ADMIN);

    expect(base.questions()).toEqual([expect.objectContaining({ id: qcm!.id, enonce: "Quel côté est le plus long ?" })]);
  });

  it("un quiz vidé est retiré du site à la publication", async () => {
    await service.modifierLecon(lecon.id, { quiz: [] }, PROF);
    await passerEnRevue();

    await service.publier(lecon.id, ADMIN);

    expect(base.quiz.deletedAt).toBeInstanceOf(Date);
  });

  it("refuse de soumettre une leçon vide ou dont le quiz est incomplet", async () => {
    lecon.contenu = "   ";
    await expect(service.soumettre(lecon.id, PROF)).rejects.toBeInstanceOf(BadRequestException);

    lecon.contenu = "## Énoncé\nTexte.";
    lecon.quizBrouillon = [{ type: "QCM", enonce: "?", bareme: 1, choix: [] }];
    await expect(service.soumettre(lecon.id, PROF)).rejects.toThrow(/quiz de cette leçon est incomplet/);
  });

  it("refuse de publier un quiz devenu invalide", async () => {
    await passerEnRevue();
    lecon.quizBrouillon = [{ type: "VRAI_FAUX", enonce: "Sans réponse", bareme: 1 }];

    await expect(service.publier(lecon.id, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    expect(base.versions).toHaveLength(0);
  });

  it("ne crée aucune version si la leçon change pendant la publication (requête concurrente)", async () => {
    await passerEnRevue();
    const lectureOriginale = base.delegues.lecon.findFirst;
    base.delegues.lecon.findFirst = async () => {
      const lue = await lectureOriginale();
      lecon.statut = "BROUILLON";
      return lue;
    };

    await expect(service.publier(lecon.id, ADMIN)).rejects.toBeInstanceOf(ConflictException);
    expect(base.versions).toHaveLength(0);
    expect(lecon.versionPublieeId).toBeNull();
  });

  it("un professeur ne supprime que ses brouillons jamais publiés", async () => {
    await passerEnRevue();
    await expect(service.supprimerBrouillon(lecon.id, PROF)).rejects.toBeInstanceOf(ConflictException);
    await service.publier(lecon.id, ADMIN);
    await service.modifierLecon(lecon.id, { titre: "Nouvelle version" }, PROF);
    await expect(service.supprimerBrouillon(lecon.id, PROF)).rejects.toBeInstanceOf(ConflictException);
    expect(lecon.deletedAt).toBeNull();
  });

  it("supprime un brouillon jamais publié de son auteur", async () => {
    await expect(service.supprimerBrouillon(lecon.id, AUTRE_PROF)).rejects.toBeInstanceOf(NotFoundException);

    await service.supprimerBrouillon(lecon.id, PROF);

    expect(lecon.deletedAt).toBeInstanceOf(Date);
  });
});
