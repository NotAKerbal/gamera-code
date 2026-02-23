import type { Dirent } from "node:fs";
import { access, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type {
  GitBranchInfo,
  GitCommandResult,
  GitCommitResult,
  GitDiffResult,
  GitFileStatus,
  GitRepositoryCandidate,
  GitState
} from "@code-app/shared";
import { createCommandRunner } from "../utils/commandRunner";

const DIFF_MAX_CHARS = 120000;
const ORIGIN_PREFIX = "origin/";

const parseAheadBehind = (value: string | undefined): { ahead: number; behind: number } => {
  if (!value) {
    return { ahead: 0, behind: 0 };
  }

  const aheadMatch = value.match(/ahead (\d+)/);
  const behindMatch = value.match(/behind (\d+)/);
  return {
    ahead: aheadMatch ? Number.parseInt(aheadMatch[1] ?? "0", 10) : 0,
    behind: behindMatch ? Number.parseInt(behindMatch[1] ?? "0", 10) : 0
  };
};

const parseStatusBranchLine = (line: string): { branch?: string; upstream?: string; ahead: number; behind: number } => {
  const withoutPrefix = line.replace(/^##\s*/, "");
  const [left, right] = withoutPrefix.split("...", 2);
  const branch = left && left !== "HEAD (no branch)" ? left.trim() : undefined;

  if (!right) {
    return { branch, ahead: 0, behind: 0 };
  }

  const rightMatch = right.match(/^([^\[]+?)(?:\s+\[(.+)\])?$/);
  const upstream = rightMatch?.[1]?.trim();
  const { ahead, behind } = parseAheadBehind(rightMatch?.[2]);
  return {
    branch,
    upstream: upstream || undefined,
    ahead,
    behind
  };
};

const parseStatusFileLine = (line: string): GitFileStatus | null => {
  if (line.length < 4) {
    return null;
  }

  const indexStatus = line[0] ?? " ";
  const workTreeStatus = line[1] ?? " ";
  const rawPath = line.slice(3).trim();
  const path = rawPath.includes(" -> ") ? (rawPath.split(" -> ").pop() ?? rawPath) : rawPath;

  if (!path) {
    return null;
  }

  const untracked = indexStatus === "?" && workTreeStatus === "?";
  return {
    path,
    indexStatus,
    workTreeStatus,
    staged: !untracked && indexStatus !== " ",
    unstaged: !untracked && workTreeStatus !== " ",
    untracked
  };
};

const truncateDiff = (diff: string): { diff: string; truncated: boolean } => {
  if (diff.length <= DIFF_MAX_CHARS) {
    return { diff, truncated: false };
  }
  return {
    diff: `${diff.slice(0, DIFF_MAX_CHARS)}\n\n... diff truncated ...`,
    truncated: true
  };
};

export class GitService {
  private readonly commandRunner = createCommandRunner();

  private toProjectDirName(value: string): string {
    return value
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 96);
  }

  private inferRepoName(url: string): string {
    const trimmed = url.trim().replace(/\/+$/, "");
    const slashBased = trimmed.split("/").pop() ?? trimmed;
    const colonBased = slashBased.split(":").pop() ?? slashBased;
    const withoutGitSuffix = colonBased.replace(/\.git$/i, "");
    const normalized = this.toProjectDirName(withoutGitSuffix);
    return normalized || "project";
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async pickAvailablePath(parentDir: string, baseName: string): Promise<string> {
    let index = 0;
    while (index < 1000) {
      const name = index === 0 ? baseName : `${baseName}-${index + 1}`;
      const candidate = join(parentDir, name);
      if (!(await this.pathExists(candidate))) {
        return candidate;
      }
      index += 1;
    }

    throw new Error("Unable to find an available directory name.");
  }

  private async runGit(cwd: string, args: string[]): Promise<GitCommandResult & { code: number }> {
    const result = await this.commandRunner.run("git", args, cwd);
    return {
      ok: result.code === 0,
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  private async isInsideRepo(cwd: string): Promise<boolean> {
    const result = await this.runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return result.ok && result.stdout.trim() === "true";
  }

  async getState(cwd: string): Promise<GitState> {
    const insideRepo = await this.isInsideRepo(cwd);
    if (!insideRepo) {
      return {
        insideRepo: false,
        ahead: 0,
        behind: 0,
        clean: true,
        stagedCount: 0,
        unstagedCount: 0,
        untrackedCount: 0,
        files: [],
        branches: []
      };
    }

    const [statusResult, localBranchResult, remoteBranchResult] = await Promise.all([
      this.runGit(cwd, ["status", "--porcelain", "-b"]),
      this.runGit(cwd, ["branch", "--format=%(refname:short)|%(upstream:short)|%(HEAD)"]),
      this.runGit(cwd, ["branch", "--remotes", "--format=%(refname:short)"])
    ]);

    let branch: string | undefined;
    let upstream: string | undefined;
    let ahead = 0;
    let behind = 0;
    const files: GitFileStatus[] = [];

    if (statusResult.ok) {
      const lines = statusResult.stdout.split("\n").filter(Boolean);
      lines.forEach((line, index) => {
        if (index === 0 && line.startsWith("##")) {
          const parsed = parseStatusBranchLine(line);
          branch = parsed.branch;
          upstream = parsed.upstream;
          ahead = parsed.ahead;
          behind = parsed.behind;
          return;
        }

        const file = parseStatusFileLine(line);
        if (file) {
          files.push(file);
        }
      });
    }

    const branches: GitBranchInfo[] = [];
    const localMeta = new Map<string, { isCurrent: boolean; upstream?: string }>();
    if (localBranchResult.ok) {
      localBranchResult.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          const [nameRaw, upstreamRaw, headRaw] = line.split("|");
          const name = nameRaw?.trim();
          if (!name) {
            return;
          }
          localMeta.set(name, {
            upstream: upstreamRaw?.trim() || undefined,
            isCurrent: (headRaw?.trim() ?? "") === "*"
          });
        });
    }

    const originOnly = new Set<string>();
    if (remoteBranchResult.ok) {
      remoteBranchResult.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          if (line.endsWith("/HEAD") || !line.startsWith(ORIGIN_PREFIX)) {
            return;
          }
          originOnly.add(line.slice(ORIGIN_PREFIX.length));
        });
    }

    const allNames = Array.from(new Set([...localMeta.keys(), ...originOnly])).sort((a, b) => a.localeCompare(b));
    allNames.forEach((name) => {
      const local = localMeta.get(name);
      branches.push({
        name,
        upstream: local?.upstream,
        isCurrent: local?.isCurrent ?? false,
        isLocal: Boolean(local),
        isOnOrigin: originOnly.has(name) || (local?.upstream?.startsWith(ORIGIN_PREFIX) ?? false)
      });
    });

    const stagedCount = files.filter((file) => file.staged).length;
    const unstagedCount = files.filter((file) => file.unstaged).length;
    const untrackedCount = files.filter((file) => file.untracked).length;

    return {
      insideRepo: true,
      branch,
      upstream,
      ahead,
      behind,
      clean: files.length === 0,
      stagedCount,
      unstagedCount,
      untrackedCount,
      files,
      branches
    };
  }

  async getDiff(cwd: string, path?: string): Promise<GitDiffResult> {
    const insideRepo = await this.isInsideRepo(cwd);
    if (!insideRepo) {
      return {
        ok: false,
        diff: "",
        truncated: false,
        stderr: "Project is not a git repository."
      };
    }

    const args = path ? ["diff", "HEAD", "--", path] : ["diff", "HEAD"];
    const result = await this.runGit(cwd, args);
    if (!result.ok) {
      return {
        ok: false,
        diff: "",
        truncated: false,
        stderr: result.stderr || "Unable to get git diff."
      };
    }

    const trimmed = truncateDiff(result.stdout);
    return {
      ok: true,
      diff: trimmed.diff,
      truncated: trimmed.truncated
    };
  }

  async fetch(cwd: string): Promise<GitCommandResult> {
    const result = await this.runGit(cwd, ["fetch", "--all", "--prune"]);
    return { ok: result.ok, stdout: result.stdout, stderr: result.stderr };
  }

  async pull(cwd: string): Promise<GitCommandResult> {
    const result = await this.runGit(cwd, ["pull", "--rebase", "--autostash"]);
    return { ok: result.ok, stdout: result.stdout, stderr: result.stderr };
  }

  async push(cwd: string): Promise<GitCommandResult> {
    const result = await this.runGit(cwd, ["push"]);
    return { ok: result.ok, stdout: result.stdout, stderr: result.stderr };
  }

  async sync(cwd: string): Promise<GitCommandResult> {
    const fetch = await this.fetch(cwd);
    if (!fetch.ok) {
      return fetch;
    }

    const pull = await this.pull(cwd);
    if (!pull.ok) {
      return pull;
    }

    const push = await this.push(cwd);
    if (!push.ok) {
      return push;
    }

    return {
      ok: true,
      stdout: [fetch.stdout, pull.stdout, push.stdout].filter(Boolean).join("\n"),
      stderr: [fetch.stderr, pull.stderr, push.stderr].filter(Boolean).join("\n")
    };
  }

  async stage(cwd: string, path?: string): Promise<GitCommandResult> {
    const result = path?.trim()
      ? await this.runGit(cwd, ["add", "--", path.trim()])
      : await this.runGit(cwd, ["add", "-A"]);
    return { ok: result.ok, stdout: result.stdout, stderr: result.stderr };
  }

  async unstage(cwd: string, path?: string): Promise<GitCommandResult> {
    const result = path?.trim()
      ? await this.runGit(cwd, ["reset", "HEAD", "--", path.trim()])
      : await this.runGit(cwd, ["reset"]);
    return { ok: result.ok, stdout: result.stdout, stderr: result.stderr };
  }

  private async buildAutoCommitMessage(cwd: string): Promise<string> {
    const names = await this.runGit(cwd, ["diff", "--cached", "--name-only"]);
    if (!names.ok) {
      return "Update project files";
    }

    const files = names.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (files.length === 0) {
      return "Update project files";
    }
    if (files.length === 1) {
      return `Update ${files[0]}`;
    }
    if (files.length <= 3) {
      return `Update ${files.join(", ")}`;
    }
    return `Update ${files.length} files`;
  }

  async commit(cwd: string, message?: string): Promise<GitCommitResult> {
    const status = await this.getState(cwd);
    if (!status.insideRepo) {
      return {
        ok: false,
        stdout: "",
        stderr: "Project is not a git repository.",
        message: "",
        autoGenerated: false,
        autoStaged: false
      };
    }
    let autoStaged = false;
    if (status.stagedCount === 0 && (status.unstagedCount > 0 || status.untrackedCount > 0)) {
      const stageAll = await this.stage(cwd);
      if (!stageAll.ok) {
        return {
          ok: false,
          stdout: stageAll.stdout,
          stderr: stageAll.stderr || "Failed to auto-stage changes.",
          message: "",
          autoGenerated: false,
          autoStaged: false
        };
      }
      autoStaged = true;
    }

    const refreshed = await this.getState(cwd);
    if (refreshed.stagedCount === 0) {
      return {
        ok: false,
        stdout: "",
        stderr: "No staged changes to commit.",
        message: "",
        autoGenerated: false,
        autoStaged
      };
    }

    const trimmed = message?.trim() ?? "";
    const finalMessage = trimmed || (await this.buildAutoCommitMessage(cwd));
    const result = await this.runGit(cwd, ["commit", "-m", finalMessage]);
    return {
      ok: result.ok,
      stdout: result.stdout,
      stderr: result.stderr,
      message: finalMessage,
      autoGenerated: trimmed.length === 0,
      autoStaged
    };
  }

  async checkoutBranch(cwd: string, branch: string): Promise<GitCommandResult> {
    const direct = await this.runGit(cwd, ["checkout", branch]);
    if (direct.ok) {
      return { ok: true, stdout: direct.stdout, stderr: direct.stderr };
    }

    const trackedCandidates = [branch, `${ORIGIN_PREFIX}${branch}`];
    for (const target of trackedCandidates) {
      const tracked = await this.runGit(cwd, ["checkout", "--track", target]);
      if (tracked.ok) {
        return { ok: true, stdout: tracked.stdout, stderr: tracked.stderr };
      }
    }

    return { ok: false, stdout: direct.stdout, stderr: direct.stderr };
  }

  async createBranch(cwd: string, branch: string, checkout = true): Promise<GitCommandResult> {
    const args = checkout ? ["checkout", "-b", branch] : ["branch", branch];
    const result = await this.runGit(cwd, args);
    return { ok: result.ok, stdout: result.stdout, stderr: result.stderr };
  }

  async discoverRepositories(rootDir: string, maxDepth = 4): Promise<GitRepositoryCandidate[]> {
    const results: GitRepositoryCandidate[] = [];
    const queue: Array<{ path: string; depth: number }> = [{ path: rootDir, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      let entries: Dirent[];
      try {
        entries = await readdir(current.path, { withFileTypes: true });
      } catch {
        continue;
      }

      const hasGitDir = entries.some((entry) => entry.isDirectory() && entry.name === ".git");
      if (hasGitDir) {
        const origin = await this.runGit(current.path, ["remote", "get-url", "origin"]);
        results.push({
          name: basename(current.path),
          path: current.path,
          remoteUrl: origin.ok ? origin.stdout.trim() || undefined : undefined
        });
        continue;
      }

      if (current.depth >= maxDepth) {
        continue;
      }

      entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .forEach((entry) => {
          queue.push({ path: join(current.path, entry.name), depth: current.depth + 1 });
        });
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  async cloneRepository(repoUrl: string, parentDir: string, requestedName?: string): Promise<{ path: string } & GitCommandResult> {
    const trimmedUrl = repoUrl.trim();
    if (!trimmedUrl) {
      throw new Error("Repository URL is required.");
    }

    const baseName = this.toProjectDirName(requestedName?.trim() || this.inferRepoName(trimmedUrl));
    if (!baseName) {
      throw new Error("Project name could not be determined from repository URL.");
    }

    const targetPath = await this.pickAvailablePath(parentDir, baseName);
    const result = await this.runGit(parentDir, ["clone", trimmedUrl, targetPath]);
    return {
      path: targetPath,
      ok: result.ok,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }
}
