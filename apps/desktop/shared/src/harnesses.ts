import type {
  CodexThreadOptions,
  HarnessCapability,
  HarnessDescriptor,
  HarnessId,
  InstallDependencyKey,
  InstallDetail,
  Thread
} from "./types";

type HarnessSetupDescriptor = {
  requiredKeys: InstallDetail["key"][];
  blockingKeys: InstallDetail["key"][];
  installTargets: InstallDependencyKey[];
  description: string;
  verifyLabel?: string;
};

export type HarnessRegistryEntry<T extends HarnessId = HarnessId> = HarnessDescriptor<T> & {
  setup: HarnessSetupDescriptor;
};

const DEFAULT_CODEX_OPTIONS: CodexThreadOptions = {
  model: "gpt-5.4",
  collaborationMode: "plan",
  sandboxMode: "workspace-write",
  modelReasoningEffort: "medium",
  webSearchMode: "cached",
  networkAccessEnabled: true,
  approvalPolicy: "on-request"
};

const DEFAULT_OPENCODE_OPTIONS: CodexThreadOptions = {
  model: "opencode/gpt-5.4-pro",
  collaborationMode: "coding",
  sandboxMode: "workspace-write",
  modelReasoningEffort: "medium",
  webSearchMode: "cached",
  networkAccessEnabled: true,
  approvalPolicy: "on-request"
};

export const HARNESS_DESCRIPTORS: HarnessRegistryEntry[] = [
  {
    id: "codex",
    label: "Codex",
    capabilities: [
      "streaming",
      "attachments",
      "reasoning_effort",
      "sandbox",
      "web_search",
      "approval_policy",
      "collaboration_mode",
      "thread_compact",
      "thread_fork",
      "review",
      "steer",
      "subthreads",
      "user_input"
    ],
    modelGroups: [
      {
        id: "flagship",
        harnessId: "codex",
        label: "Flagship",
        models: ["gpt-5.4"],
        defaultModel: "gpt-5.4"
      },
      {
        id: "codex",
        harnessId: "codex",
        label: "Codex",
        models: ["gpt-5.3-codex", "gpt-5.2-codex"],
        defaultModel: "gpt-5.3-codex"
      },
      {
        id: "spark",
        harnessId: "codex",
        label: "Spark",
        models: ["gpt-5.3-codex-spark"],
        defaultModel: "gpt-5.3-codex-spark"
      }
    ],
    setup: {
      requiredKeys: ["node", "npm", "git", "rg", "codex"],
      blockingKeys: ["codex"],
      installTargets: ["node", "npm", "git", "rg", "codex"],
      description:
        "This guided setup can automatically install missing dependencies for this app: Node.js/npm, Git, and ripgrep. Codex app server is bundled with the app.",
      verifyLabel: "Verify Codex app server"
    }
  },
  {
    id: "opencode",
    label: "OpenCode",
    capabilities: [
      "streaming",
      "attachments",
      "reasoning_effort",
      "sandbox",
      "web_search",
      "approval_policy",
      "collaboration_mode"
    ],
    modelGroups: [
      {
        id: "openai",
        harnessId: "opencode",
        label: "OpenAI",
        models: ["opencode/gpt-5.4-pro", "opencode/gpt-5.4", "opencode/gpt-5.2", "opencode/gpt-5-nano"],
        defaultModel: "opencode/gpt-5.4-pro"
      },
      {
        id: "anthropic",
        harnessId: "opencode",
        label: "Anthropic",
        models: ["opencode/claude-opus-4-6", "opencode/claude-opus-4-5", "opencode/claude-sonnet-4-6", "opencode/claude-sonnet-4-5", "opencode/claude-haiku-4-5"],
        defaultModel: "opencode/claude-sonnet-4-6"
      },
      {
        id: "google",
        harnessId: "opencode",
        label: "Google",
        models: [
          "opencode/gemini-3.1-pro",
          "opencode/gemini-3-pro",
          "opencode/gemini-3-flash",
          "google-vertex/gemini-3.1-pro-preview",
          "google-vertex/gemini-3-pro-preview",
          "google-vertex/gemini-3-flash-preview"
        ],
        defaultModel: "opencode/gemini-3.1-pro"
      },
      {
        id: "xai",
        harnessId: "opencode",
        label: "Codex",
        models: ["opencode/gpt-5.3-codex", "opencode/gpt-5.3-codex-spark", "opencode/gpt-5.2-codex"],
        defaultModel: "opencode/gpt-5.3-codex"
      },
      {
        id: "deepseek",
        harnessId: "opencode",
        label: "DeepSeek",
        models: ["google-vertex/deepseek-ai/deepseek-v3.1-maas"],
        defaultModel: "google-vertex/deepseek-ai/deepseek-v3.1-maas"
      },
      {
        id: "glm",
        harnessId: "opencode",
        label: "GLM",
        models: ["opencode/glm-5", "opencode/glm-4.7", "opencode/glm-4.6", "google-vertex/zai-org/glm-5-maas", "google-vertex/zai-org/glm-4.7-maas"],
        defaultModel: "opencode/glm-5"
      },
      {
        id: "kimi",
        harnessId: "opencode",
        label: "Kimi",
        models: ["opencode/kimi-k2.5"],
        defaultModel: "opencode/kimi-k2.5"
      },
      {
        id: "vertex_oss",
        harnessId: "opencode",
        label: "Vertex OSS",
        models: [
          "google-vertex/openai/gpt-oss-120b-maas",
          "google-vertex/openai/gpt-oss-20b-maas",
          "google-vertex/meta/llama-4-maverick-17b-128e-instruct-maas",
          "google-vertex/meta/llama-3.3-70b-instruct-maas",
          "google-vertex/qwen/qwen3-235b-a22b-instruct-2507-maas"
        ],
        defaultModel: "google-vertex/openai/gpt-oss-120b-maas"
      },
      {
        id: "minimax",
        harnessId: "opencode",
        label: "MiniMax",
        models: ["opencode/minimax-m2.5", "opencode/minimax-m2.5-free", "opencode/minimax-m2.1", "opencode/big-pickle"],
        defaultModel: "opencode/minimax-m2.5"
      }
    ],
    setup: {
      requiredKeys: ["node", "npm", "git", "rg", "opencode"],
      blockingKeys: ["opencode"],
      installTargets: ["node", "npm", "git", "rg", "opencode"],
      description:
        "This guided setup can automatically install missing dependencies for this app: Node.js/npm, Git, ripgrep, and the OpenCode CLI.",
      verifyLabel: "Verify OpenCode CLI"
    }
  }
];

export const ENABLED_HARNESS_IDS = HARNESS_DESCRIPTORS.map((harness) => harness.id);

export const DEFAULT_HARNESS_OPTIONS: Record<HarnessId, CodexThreadOptions | Record<string, never>> = {
  codex: DEFAULT_CODEX_OPTIONS,
  opencode: DEFAULT_OPENCODE_OPTIONS
};

export const getHarnessDescriptor = (harnessId: HarnessId) =>
  HARNESS_DESCRIPTORS.find((harness) => harness.id === harnessId);

export const getThreadHarnessId = (thread: Pick<Thread, "harnessId" | "provider"> | null | undefined): HarnessId => {
  if (!thread) {
    return "codex";
  }
  return thread.harnessId ?? thread.provider ?? "codex";
};

export const getHarnessDefaultOptions = (harnessId: HarnessId): CodexThreadOptions => {
  const options = DEFAULT_HARNESS_OPTIONS[harnessId];
  if (!options || Array.isArray(options)) {
    return DEFAULT_CODEX_OPTIONS;
  }
  return options as CodexThreadOptions;
};

export const harnessSupportsCapability = (harnessId: HarnessId, capability: HarnessCapability): boolean =>
  Boolean(getHarnessDescriptor(harnessId)?.capabilities.includes(capability as never));

export const getHarnessModelSuggestions = (harnessId: HarnessId): string[] => {
  const descriptor = getHarnessDescriptor(harnessId);
  if (!descriptor) {
    return [];
  }
  const seen = new Set<string>();
  const models: string[] = [];
  descriptor.modelGroups.forEach((group) => {
    group.models.forEach((model) => {
      if (!seen.has(model)) {
        seen.add(model);
        models.push(model);
      }
    });
  });
  return models;
};
