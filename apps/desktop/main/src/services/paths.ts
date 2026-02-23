import { mkdirSync } from "node:fs";
import { join } from "node:path";

export interface AppPaths {
  userData: string;
  dbPath: string;
  threadsDir: string;
}

export const createAppPaths = (userData: string): AppPaths => {
  const dbPath = join(userData, "code-app.db");
  const threadsDir = join(userData, "threads");

  mkdirSync(userData, { recursive: true });
  mkdirSync(threadsDir, { recursive: true });

  return { userData, dbPath, threadsDir };
};

export const getThreadDataPath = (threadsDir: string, threadId: string) => {
  const threadDir = join(threadsDir, threadId);
  mkdirSync(threadDir, { recursive: true });

  return {
    threadDir,
    eventsPath: join(threadDir, "events.jsonl"),
    ptyLogPath: join(threadDir, "pty.log")
  };
};
