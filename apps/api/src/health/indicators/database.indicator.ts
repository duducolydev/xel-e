import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { Pinger } from "../pinger";

@Injectable()
export class DatabaseIndicator implements Pinger {
  constructor(private readonly prisma: PrismaService) {}

  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
