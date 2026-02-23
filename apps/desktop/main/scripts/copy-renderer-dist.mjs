import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = join(__dirname, "..");
const rendererDist = join(workspaceRoot, "..", "renderer", "dist");
const targetDist = join(workspaceRoot, "dist", "renderer");

if (!existsSync(rendererDist)) {
  console.error(`Renderer build output not found: ${rendererDist}`);
  console.error("Run the root build first: npm run build");
  process.exit(1);
}

cpSync(rendererDist, targetDist, { recursive: true, force: true });
