import { describe, expect, it } from "vitest";
import { roleSchema, statutLeconSchema, typeQuestionSchema } from "./enums";

describe("roleSchema", () => {
  it.each(["ELEVE", "PROFESSEUR", "PARENT", "ADMIN"])("accepte le rôle %s", (role) => {
    expect(roleSchema.safeParse(role).success).toBe(true);
  });

  it("rejette un rôle inconnu", () => {
    expect(roleSchema.safeParse("SUPER_ADMIN").success).toBe(false);
  });
});

describe("statutLeconSchema", () => {
  it.each(["BROUILLON", "EN_REVUE", "PUBLIE"])("accepte le statut %s", (statut) => {
    expect(statutLeconSchema.safeParse(statut).success).toBe(true);
  });

  it("rejette un statut inconnu", () => {
    expect(statutLeconSchema.safeParse("ARCHIVE").success).toBe(false);
  });
});

describe("typeQuestionSchema", () => {
  it.each(["QCM", "VRAI_FAUX", "REPONSE_COURTE"])("accepte le type %s", (type) => {
    expect(typeQuestionSchema.safeParse(type).success).toBe(true);
  });

  it("rejette un type inconnu", () => {
    expect(typeQuestionSchema.safeParse("DISSERTATION").success).toBe(false);
  });
});
