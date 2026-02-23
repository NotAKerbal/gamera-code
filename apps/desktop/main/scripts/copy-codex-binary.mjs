import { cpSync, existsSync, mkdirSync } from "node:fs";
import path, { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = join(__dirname, "..");
const requireFromWorkspace = createRequire(join(workspaceRoot, "package.json"));

const resolveTarget = () => {
  const binaryName = process.platform === "win32" ? "codex.exe" : "codex";

  if (process.platform === "darwin" && process.arch === "arm64") {
    return { triple: "aarch64-apple-darwin", packageName: "@openai/codex-darwin-arm64", binaryName };
  }
  if (process.platform === "darwin" && process.arch === "x64") {
    return { triple: "x86_64-apple-darwin", packageName: "@openai/codex-darwin-x64", binaryName };
  }
  if (process.platform === "linux" && process.arch === "arm64") {
    return { triple: "aarch64-unknown-linux-musl", packageName: "@openai/codex-linux-arm64", binaryName };
  }
  if (process.platform === "linux" && process.arch === "x64") {
    return { triple: "x86_64-unknown-linux-musl", packageName: "@openai/codex-linux-x64", binaryName };
  }
  if (process.platform === "win32" && process.arch === "arm64") {
    return { triple: "aarch64-pc-windows-msvc", packageName: "@openai/codex-win32-arm64", binaryName };
  }
  if (process.platform === "win32" && process.arch === "x64") {
    return { triple: "x86_64-pc-windows-msvc", packageName: "@openai/codex-win32-x64", binaryName };
  }
  return null;
};

const target = resolveTarget();
if (!target) {
  console.warn(`Skipping Codex binary copy for unsupported target ${process.platform}/${process.arch}.`);
  process.exit(0);
}

const codexPackageJsonPath = requireFromWorkspace.resolve("@openai/codex/package.json");
const codexRoot = path.dirname(codexPackageJsonPath);
let platformPackageJsonPath;
try {
  platformPackageJsonPath = requireFromWorkspace.resolve(`${target.packageName}/package.json`, { paths: [codexRoot] });
} catch {
  platformPackageJsonPath = requireFromWorkspace.resolve(`${target.packageName}/package.json`);
}

const sourceBinary = join(path.dirname(platformPackageJsonPath), "vendor", target.triple, "codex", target.binaryName);

if (!existsSync(sourceBinary)) {
  console.error(`Codex binary not found: ${sourceBinary}`);
  process.exit(1);
}

const outputDir = join(workspaceRoot, "dist", "codex-bin", target.triple);
mkdirSync(outputDir, { recursive: true });
cpSync(sourceBinary, join(outputDir, target.binaryName), { force: true });
