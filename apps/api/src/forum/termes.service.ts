import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { TermeInterditDto } from "@xel-e/shared";
import { PrismaService } from "../prisma/prisma.service";
import { normaliser } from "./filtre-contenu";

const DUREE_CACHE_MS = 60_000;

// Liste des termes interdits, gardée en mémoire une minute (relue aussitôt après une modification locale).
@Injectable()
export class TermesService {
  private cache: { termes: string[]; expireLe: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async termes(): Promise<string[]> {
    if (this.cache && this.cache.expireLe > Date.now()) return this.cache.termes;
    const termes = (await this.prisma.termeInterdit.findMany({ select: { terme: true } })).map((t) => t.terme);
    this.cache = { termes, expireLe: Date.now() + DUREE_CACHE_MS };
    return termes;
  }

  async lister(): Promise<TermeInterditDto[]> {
    return this.prisma.termeInterdit.findMany({ orderBy: { terme: "asc" }, select: { id: true, terme: true } });
  }

  async ajouter(terme: string): Promise<TermeInterditDto> {
    const propre = terme.trim().toLowerCase();
    const existants = await this.termes();
    if (existants.some((t) => normaliser(t) === normaliser(propre))) {
      throw new ConflictException("Ce terme est déjà dans la liste.");
    }
    try {
      const cree = await this.prisma.termeInterdit.create({ data: { terme: propre }, select: { id: true, terme: true } });
      this.cache = null;
      return cree;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ce terme est déjà dans la liste.");
      }
      throw error;
    }
  }

  async retirer(id: string): Promise<void> {
    const { count } = await this.prisma.termeInterdit.deleteMany({ where: { id } });
    if (count === 0) throw new NotFoundException("Terme introuvable.");
    this.cache = null;
  }
}
