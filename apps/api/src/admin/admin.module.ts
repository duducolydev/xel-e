import { Module } from "@nestjs/common";
import { AdminController, AdminService } from "./admin.controller";

@Module({
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
