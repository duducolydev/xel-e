import { BadRequestException, PipeTransform } from "@nestjs/common";
import type { ZodError, ZodType } from "zod";

export function formaterErreursZod(error: ZodError): Record<string, string> {
  const erreurs: Record<string, string> = {};
  for (const issue of error.issues) {
    const champ = issue.path.join(".") || "_";
    erreurs[champ] ??= issue.message;
  }
  return erreurs;
}

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: "Certains champs sont invalides.",
        erreurs: formaterErreursZod(result.error),
      });
    }
    return result.data;
  }
}
