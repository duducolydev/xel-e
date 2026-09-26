import { execSync } from "node:child_process";

export default function globalSetup(): void {
  execSync("pnpm --filter @xel-e/api exec tsx test/preparer-e2e-web.ts", { stdio: "inherit" });
}
