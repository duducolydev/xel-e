import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common";
import type { HealthResponse } from "@xel-e/shared";
import { Public } from "../auth/decorators";
import { HealthService } from "./health.service";

@Public()
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthResponse> {
    return this.healthService.check();
  }
}
