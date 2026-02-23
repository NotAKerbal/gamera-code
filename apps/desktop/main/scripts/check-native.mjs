import { spawn } from "node:child_process";
import electronPath from "electron";

const js = `
console.log('electron abi', process.versions.modules);
try {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('select 1');
  db.close();
  require('node-pty');
  console.log('native modules load in Electron runtime');
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
`;

const child = spawn(electronPath, ["-e", js], {
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1"
  },
  stdio: "inherit"
});

child.on("exit", (code) => {
  if (code === 0) {
    process.exit(0);
  }
  process.exit(code ?? 1);
});
