import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";

export interface ObjetStocke {
  corps: Buffer;
  type: string;
}

@Injectable()
export class StockageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StockageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<Env, true>) {
    this.bucket = config.get("S3_BUCKET", { infer: true });
    this.client = new S3Client({
      endpoint: config.get("S3_ENDPOINT", { infer: true }),
      region: config.get("S3_REGION", { infer: true }),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get("S3_ACCESS_KEY", { infer: true }),
        secretAccessKey: config.get("S3_SECRET_KEY", { infer: true }),
      },
    });
  }

  // Le bucket est créé au démarrage s'il manque (MinIO en dev/CI) ; une indisponibilité ne bloque pas l'API.
  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (error) {
        this.logger.warn(`Stockage S3 indisponible au démarrage : ${(error as Error).message}`);
      }
    }
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  async lire(cle: string): Promise<ObjetStocke | null> {
    try {
      const reponse = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: cle }));
      if (!reponse.Body) return null;
      return {
        corps: Buffer.from(await reponse.Body.transformToByteArray()),
        type: reponse.ContentType ?? "application/octet-stream",
      };
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }

  async ecrire(cle: string, corps: Buffer, type: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: cle, Body: corps, ContentType: type }),
    );
  }
}
