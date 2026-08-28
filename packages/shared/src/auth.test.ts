import { describe, expect, it } from "vitest";
import { emailSchema, passwordSchema } from "./auth";

describe("emailSchema", () => {
  it("accepte une adresse email valide et la normalise en minuscules", () => {
    const result = emailSchema.safeParse("  Eleve@Xele.SN  ");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("eleve@xele.sn");
    }
  });

  it("rejette une chaîne qui n'est pas une adresse email", () => {
    const result = emailSchema.safeParse("pas-un-email");

    expect(result.success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("accepte un mot de passe avec lettres et chiffres, ≥ 8 caractères", () => {
    expect(passwordSchema.safeParse("motdepasse1").success).toBe(true);
  });

  it("rejette un mot de passe trop court", () => {
    expect(passwordSchema.safeParse("abc123").success).toBe(false);
  });

  it("rejette un mot de passe sans chiffre", () => {
    expect(passwordSchema.safeParse("motdepasse").success).toBe(false);
  });

  it("rejette un mot de passe sans lettre", () => {
    expect(passwordSchema.safeParse("12345678").success).toBe(false);
  });
});
