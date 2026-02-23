import { createHash } from "node:crypto";
import type { PermissionMode, RiskCheck, RiskLevel } from "@code-app/shared";
import { Repository } from "./repository";

interface EvaluateInput {
  threadId?: string;
  command: string;
  cwd: string;
  approve?: boolean;
}

export const classifyRisk = (command: string): { riskLevel: RiskLevel; reason: string[] } => {
  const normalized = command.trim().toLowerCase();
  const reason: string[] = [];

  const highPatterns = [
    /rm\s+-rf/,
    /git\s+reset\s+--hard/,
    /drop\s+database/,
    /truncate\s+table/,
    /chmod\s+-r/,
    /chown\s+-r/,
    /apt\s+remove/,
    /brew\s+uninstall/
  ];

  const mediumPatterns = [
    /git\s+push\s+--force/,
    /git\s+branch\s+-d/,
    /migrate\s+up/,
    /terraform\s+apply/
  ];

  if (highPatterns.some((pattern) => pattern.test(normalized))) {
    reason.push("Matches high-risk destructive command pattern.");
    return { riskLevel: "high", reason };
  }

  if (mediumPatterns.some((pattern) => pattern.test(normalized))) {
    reason.push("Matches medium-risk mutation pattern.");
    return { riskLevel: "medium", reason };
  }

  if (/(cat|ls|pwd|rg|grep|find|git status|git log)/.test(normalized)) {
    reason.push("Looks read-only.");
  } else {
    reason.push("No explicit high-risk pattern matched.");
  }

  return { riskLevel: "low", reason };
};

const hashCommand = (command: string, cwd: string) =>
  createHash("sha1").update(`${cwd}:${command}`).digest("hex");

export class PermissionEngine {
  private mode: PermissionMode;
  private readonly sessionApprovals = new Map<string, Set<string>>();

  constructor(
    private readonly repository: Repository,
    mode: PermissionMode
  ) {
    this.mode = mode;
  }

  getMode() {
    return this.mode;
  }

  setMode(mode: PermissionMode) {
    this.mode = mode;
  }

  clearThreadApprovals(threadId: string) {
    this.sessionApprovals.delete(threadId);
  }

  evaluate(input: EvaluateInput): RiskCheck {
    const { riskLevel, reason } = classifyRisk(input.command);
    const commandHash = hashCommand(input.command, input.cwd);

    if (input.approve && input.threadId) {
      if (!this.sessionApprovals.has(input.threadId)) {
        this.sessionApprovals.set(input.threadId, new Set());
      }
      this.sessionApprovals.get(input.threadId)?.add(commandHash);
      this.repository.savePermissionDecision({
        threadId: input.threadId,
        commandHash,
        riskLevel,
        approved: true
      });
    }

    const approved = input.threadId ? this.sessionApprovals.get(input.threadId)?.has(commandHash) ?? false : false;

    const requiresPrompt =
      this.mode === "always_ask"
        ? !approved
        : this.mode === "auto_allow"
          ? false
          : riskLevel !== "low" && !approved;

    return {
      command: input.command,
      cwd: input.cwd,
      riskLevel,
      requiresPrompt,
      reason,
      approved
    };
  }
}
