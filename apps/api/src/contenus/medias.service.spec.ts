import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { detecterFormat, MediasService, TAILLE_MAX_MEDIA } from "./medias.service";
import type { StockageService } from "./stockage.service";

const PNG = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("donnees")]);
const JPEG = Buffer.concat([Buffer.from("ffd8ffe0", "hex"), Buffer.from("donnees")]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');

function creerService() {
  const stockage = { ecrire: vi.fn().mockResolvedValue(undefined), lire: vi.fn().mockResolvedValue(null) };
  return { service: new MediasService(stockage as unknown as StockageService), stockage };
}

describe("détection du format d'image", () => {
  it("reconnaît PNG et JPEG par leurs premiers octets", () => {
    expect(detecterFormat(PNG)?.type).toBe("image/png");
    expect(detecterFormat(JPEG)?.type).toBe("image/jpeg");
  });

  it("refuse le SVG et le texte, même renommés", () => {
    expect(detecterFormat(SVG)).toBeUndefined();
    expect(detecterFormat(Buffer.from("<html>"))).toBeUndefined();
  });
});

describe("MediasService", () => {
  it("nomme le fichier d'après son contenu et renvoie l'URL servie par le front", async () => {
    const { service, stockage } = creerService();

    const { fichier, url } = await service.enregistrer(PNG);

    expect(fichier).toMatch(/^[a-f0-9]{64}\.png$/);
    expect(url).toBe(`/api/medias/${fichier}`);
    expect(stockage.ecrire).toHaveBeenCalledWith(`medias/${fichier}`, PNG, "image/png");
  });

  it("donne le même nom au même contenu (pas de doublon)", async () => {
    const { service } = creerService();

    expect((await service.enregistrer(PNG)).fichier).toBe((await service.enregistrer(PNG)).fichier);
  });

  it("refuse un SVG", async () => {
    await expect(creerService().service.enregistrer(SVG)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse une image de plus de 2 Mo", async () => {
    const gros = Buffer.concat([PNG, Buffer.alloc(TAILLE_MAX_MEDIA)]);
    await expect(creerService().service.enregistrer(gros)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse un nom de fichier qui pourrait sortir du dossier des médias", async () => {
    const { service, stockage } = creerService();

    await expect(service.lire("../pdf/lecons/x.pdf")).rejects.toBeInstanceOf(NotFoundException);
    expect(stockage.lire).not.toHaveBeenCalled();
  });
});
