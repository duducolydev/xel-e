import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Lecon, StatutLecon, VersionLecon } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { PublicationService } from "./publication.service";

type Filtre = Partial<Record<keyof Lecon, unknown>>;

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
    auteurId: "admin-1",
    versionPublieeId: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const versions: VersionLecon[] = [];
  const correspond = (filtre: Filtre) =>
    Object.entries(filtre).every(([cle, valeur]) => lecon[cle as keyof Lecon] === valeur);

  const delegues = {
    lecon: {
      findFirst: async () =>
        lecon.deletedAt
          ? null
          : { ...lecon, versionPubliee: versions.find((v) => v.id === lecon.versionPublieeId) ?? null },
      updateMany: async ({ where, data }: { where: Filtre; data: Partial<Lecon> }) => {
        if (!correspond(where)) return { count: 0 };
        Object.assign(lecon, data);
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
  };
  const prisma = {
    ...delegues,
    $transaction: async <T>(fn: (tx: typeof delegues) => Promise<T>) => fn(delegues),
  } as unknown as PrismaService;
  return { prisma, lecon, versions, delegues };
}

describe("PublicationService", () => {
  let service: PublicationService;
  let lecon: Lecon;
  let versions: VersionLecon[];
  let delegues: ReturnType<typeof creerFausseBase>["delegues"];

  beforeEach(() => {
    const base = creerFausseBase();
    service = new PublicationService(base.prisma);
    lecon = base.lecon;
    versions = base.versions;
    delegues = base.delegues;
  });

  const passerEnRevue = async () => {
    await service.soumettre(lecon.id);
    expect(lecon.statut).toBe<StatutLecon>("EN_REVUE");
  };

  it("refuse de publier un brouillon (seule une leçon EN_REVUE peut passer PUBLIE)", async () => {
    await expect(service.publier(lecon.id, "admin-1")).rejects.toBeInstanceOf(ConflictException);
    expect(versions).toHaveLength(0);
    expect(lecon.statut).toBe("BROUILLON");
  });

  it("publier crée une version figée et la met en ligne", async () => {
    await passerEnRevue();

    const version = await service.publier(lecon.id, "admin-1");

    expect(version).toMatchObject({
      numero: 1,
      titre: "Le théorème de Pythagore",
      contenu: lecon.contenu,
      publieParId: "admin-1",
    });
    expect(version.sections).toEqual([
      expect.objectContaining({ titre: "Énoncé", html: expect.stringContaining('class="katex"') }),
    ]);
    expect(lecon).toMatchObject({ statut: "PUBLIE", version: 1, versionPublieeId: version.id });
  });

  it("modifier une leçon publiée laisse la version en ligne inchangée jusqu'à la prochaine publication", async () => {
    await passerEnRevue();
    const v1 = await service.publier(lecon.id, "admin-1");
    const instantaneV1 = structuredClone(v1);

    await service.modifierLecon(lecon.id, { titre: "Pythagore (révisé)", contenu: "## Énoncé\nNouveau texte." });

    expect(lecon).toMatchObject({ statut: "BROUILLON", versionPublieeId: v1.id });

    await passerEnRevue();
    const v2 = await service.publier(lecon.id, "admin-1");

    expect(v2).toMatchObject({ numero: 2, titre: "Pythagore (révisé)" });
    expect(lecon).toMatchObject({ version: 2, versionPublieeId: v2.id });
    expect(versions[0]).toEqual(instantaneV1);
  });

  it("verrouille une leçon en revue", async () => {
    await passerEnRevue();

    await expect(service.modifierLecon(lecon.id, { titre: "Autre titre" })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("permet de renvoyer une leçon en revue vers le brouillon", async () => {
    await passerEnRevue();

    await service.renvoyerEnBrouillon(lecon.id);

    expect(lecon.statut).toBe("BROUILLON");
  });

  it("refuse de soumettre une leçon vide", async () => {
    lecon.contenu = "   ";

    await expect(service.soumettre(lecon.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("ne crée aucune version si la leçon change pendant la publication (requête concurrente)", async () => {
    await passerEnRevue();
    const lectureOriginale = delegues.lecon.findFirst;
    delegues.lecon.findFirst = async () => {
      const lue = await lectureOriginale();
      lecon.statut = "BROUILLON";
      return lue;
    };

    await expect(service.publier(lecon.id, "admin-1")).rejects.toBeInstanceOf(ConflictException);
    expect(versions).toHaveLength(0);
    expect(lecon.versionPublieeId).toBeNull();
  });
});
