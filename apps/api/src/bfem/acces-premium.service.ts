import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { aUnAbonnementActif, peutAcceder } from "./regles";

export const MESSAGE_PREMIUM =
  "Ce contenu est réservé aux abonnés Premium. Le premier examen blanc de chaque matière et les annales gratuites restent ouverts à tous.";

// Garde premium (préparation de la Phase 10 : paiements). L'administration accède à tout.
@Injectable()
export class AccesPremiumService {
  constructor(private readonly prisma: PrismaService) {}

  async estAbonne(utilisateurId: string, maintenant = new Date()): Promise<boolean> {
    const abonnements = await this.prisma.abonnement.findMany({
      where: { utilisateurId, statut: "ACTIF" },
      select: { statut: true, debutLe: true, expireLe: true },
    });
    return aUnAbonnementActif(abonnements, maintenant);
  }

  async lecteur(utilisateur: { id: string; role: string }): Promise<{ role: string; abonne: boolean }> {
    return { role: utilisateur.role, abonne: utilisateur.role === "ADMIN" ? true : await this.estAbonne(utilisateur.id) };
  }

  exiger(contenu: { premium: boolean }, lecteur: { role: string; abonne: boolean }): void {
    if (!peutAcceder(contenu, lecteur)) throw new ForbiddenException(MESSAGE_PREMIUM);
  }

  // En attendant les paiements, l'administration ouvre un accès Premium à la main (tests, partenaires).
  async accorder(login: string, jours: number, maintenant = new Date()): Promise<{ expireLe: string }> {
    const utilisateur = await this.prisma.user.findFirst({
      where: { OR: [{ email: login }, { identifiant: login }], deletedAt: null },
      select: { id: true },
    });
    if (!utilisateur) throw new NotFoundException("Aucun compte avec cet email ou cet identifiant.");
    const expireLe = new Date(maintenant.getTime() + jours * 86_400_000);
    await this.prisma.abonnement.create({ data: { utilisateurId: utilisateur.id, plan: "PREMIUM_ACCORDE", statut: "ACTIF", expireLe } });
    return { expireLe: expireLe.toISOString() };
  }
}
