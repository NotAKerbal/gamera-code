import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = join(__dirname, "..");
const repoRoot = join(workspaceRoot, "..", "..", "..");

const isWindows = process.platform === "win32";

if (isWindows) {
  const builderExe = join(repoRoot, "node_modules", "app-builder-bin", "win", "x64", "app-builder.exe");
  if (!existsSync(builderExe)) {
    console.error("Missing electron-builder binary:");
    console.error(`  ${builderExe}`);
    console.error("");
    console.error("Fix:");
    console.error("  1) Remove node_modules and reinstall dependencies");
    console.error("     - PowerShell: rmdir /s /q node_modules");
    console.error("     - PowerShell: del package-lock.json");
    console.error("     - PowerShell: npm install");
    console.error("  2) Retry: npm run package");
    process.exit(1);
  }
}
