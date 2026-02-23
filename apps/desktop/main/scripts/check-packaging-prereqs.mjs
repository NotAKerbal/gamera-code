import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = join(__dirname, "..");
const repoRoot = join(workspaceRoot, "..", "..", "..");

const isWindows = process.platform === "win32";
const rendererEntry = join(workspaceRoot, "dist", "renderer", "index.html");
const codexBinDir = join(workspaceRoot, "dist", "codex-bin");

if (!existsSync(rendererEntry)) {
  console.error("Missing packaged renderer entry:");
  console.error(`  ${rendererEntry}`);
  console.error("Run the root build first: npm run build");
  process.exit(1);
}

if (!existsSync(codexBinDir)) {
  console.error("Missing packaged Codex binary directory:");
  console.error(`  ${codexBinDir}`);
  console.error("Run the root build first: npm run build");
  process.exit(1);
}

if (isWindows) {
  const builderExe = join(repoRoot, "node_modules", "app-builder-bin", "win", "x64", "app-builder.exe");
  if (!existsSync(builderExe)) {
    console.error("Missing electron-builder binary:");
    console.error(`  ${builderExe}`);
    console.error("");
    console.error("Fix:");
    console.error("  1) Remove node_modules and reinstall dependencies");
    console.error("     - PowerShell: Remove-Item -Recurse -Force node_modules");
    console.error("     - PowerShell: Remove-Item -Force package-lock.json");
    console.error("     - PowerShell: npm install");
    console.error("  2) Retry: npm run package");
    process.exit(1);
  }

  const check = spawnSync(builderExe, ["--version"], {
    encoding: "utf8",
    windowsHide: true
  });
  if (check.error || check.status !== 0) {
    console.error("app-builder is present but cannot be executed:");
    console.error(`  ${builderExe}`);
    if (check.error) {
      console.error(`  error: ${check.error.message}`);
    }
    if (check.stderr?.trim()) {
      console.error(`  stderr: ${check.stderr.trim()}`);
    }
    console.error("");
    console.error("Likely causes:");
    console.error("  - Antivirus/Windows Security quarantined the binary");
    console.error("  - Corrupted install under node_modules");
    console.error("");
    console.error("Fix:");
    console.error("  1) Add your repo folder to Windows Security exclusions (temporary while building).");
    console.error("  2) Reinstall deps:");
    console.error("     - PowerShell: Remove-Item -Recurse -Force node_modules");
    console.error("     - PowerShell: Remove-Item -Force package-lock.json");
    console.error("     - PowerShell: npm install");
    console.error("  3) Verify manually:");
    console.error("     - PowerShell: .\\node_modules\\app-builder-bin\\win\\x64\\app-builder.exe --version");
    console.error("  4) Retry: npm run package:win");
    process.exit(1);
  }
}
