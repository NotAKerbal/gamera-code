import type {
  CodexThreadOptions,
  HarnessCapability,
  HarnessModelCatalogEntry,
  HarnessModelDefinition,
  HarnessDescriptor,
  HarnessDefinedModel,
  HarnessId,
  HarnessModelProviderEntry,
  HarnessModelProviderKey,
  HarnessProviderModelMap,
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

const DEFAULT_GEMINI_OPTIONS: CodexThreadOptions = {
  model: "gemini-2.5-pro"
};

export const HARNESS_DESCRIPTORS: HarnessRegistryEntry[] = [
  {
    id: "codex",
    label: "Codex",
    badge: {
      icon: "openai"
    },
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
        models: [{ value: "gpt-5.4", label: "GPT-5.4" }],
        defaultModel: "gpt-5.4"
      },
      {
        id: "codex",
        harnessId: "codex",
        label: "Codex",
        models: [
          { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
          { value: "gpt-5.2-codex", label: "GPT-5.2 Codex" }
        ],
        defaultModel: "gpt-5.3-codex"
      },
      {
        id: "spark",
        harnessId: "codex",
        label: "Spark",
        models: [{ value: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark" }],
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
    badge: {
      icon: "opencode"
    },
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
        models: [
          { value: "opencode/gpt-5.4-pro", label: "GPT-5.4 Pro" },
          { value: "opencode/gpt-5.4", label: "GPT-5.4" },
          { value: "opencode/gpt-5.2", label: "GPT-5.2" },
          { value: "opencode/gpt-5-nano", label: "GPT-5 Nano" }
        ],
        defaultModel: "opencode/gpt-5.4-pro"
      },
      {
        id: "anthropic",
        harnessId: "opencode",
        label: "Anthropic",
        models: [
          { value: "opencode/claude-opus-4-6", label: "Claude Opus 4.6" },
          { value: "opencode/claude-opus-4-5", label: "Claude Opus 4.5" },
          { value: "opencode/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
          { value: "opencode/claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
          { value: "opencode/claude-haiku-4-5", label: "Claude Haiku 4.5" }
        ],
        defaultModel: "opencode/claude-sonnet-4-6"
      },
      {
        id: "google",
        harnessId: "opencode",
        label: "Google",
        models: [
          { value: "opencode/gemini-3.1-pro", label: "Gemini 3.1 Pro" },
          { value: "opencode/gemini-3-pro", label: "Gemini 3 Pro" },
          { value: "opencode/gemini-3-flash", label: "Gemini 3 Flash" },
          { value: "opencode/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
          { value: "opencode/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
          { value: "opencode/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
          { value: "google-vertex/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
          { value: "google-vertex/gemini-3-pro-preview", label: "Gemini 3 Pro Preview" },
          { value: "google-vertex/gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
          { value: "google-vertex/gemini-2.5-pro", label: "Gemini 2.5 Pro (Vertex)" },
          { value: "google-vertex/gemini-2.5-pro-preview-06-05", label: "Gemini 2.5 Pro Preview 06-05" },
          { value: "google-vertex/gemini-2.5-flash", label: "Gemini 2.5 Flash (Vertex)" },
          { value: "google-vertex/gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash Preview 05-20" },
          {
            value: "google-vertex/gemini-2.5-flash-lite-preview-06-17",
            label: "Gemini 2.5 Flash-Lite Preview 06-17"
          }
        ],
        defaultModel: "opencode/gemini-3.1-pro"
      },
      {
        id: "xai",
        harnessId: "opencode",
        label: "Codex",
        models: [
          { value: "opencode/gpt-5.3-codex", label: "GPT-5.3 Codex" },
          { value: "opencode/gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark" },
          { value: "opencode/gpt-5.2-codex", label: "GPT-5.2 Codex" }
        ],
        defaultModel: "opencode/gpt-5.3-codex"
      },
      {
        id: "deepseek",
        harnessId: "opencode",
        label: "DeepSeek",
        models: [{ value: "google-vertex/deepseek-ai/deepseek-v3.1-maas", label: "DeepSeek V3.1 MaaS" }],
        defaultModel: "google-vertex/deepseek-ai/deepseek-v3.1-maas"
      },
      {
        id: "glm",
        harnessId: "opencode",
        label: "GLM",
        models: [
          { value: "opencode/glm-5", label: "GLM-5" },
          { value: "opencode/glm-4.7", label: "GLM-4.7" },
          { value: "opencode/glm-4.6", label: "GLM-4.6" },
          { value: "google-vertex/zai-org/glm-5-maas", label: "GLM-5 MaaS" },
          { value: "google-vertex/zai-org/glm-4.7-maas", label: "GLM-4.7 MaaS" }
        ],
        defaultModel: "opencode/glm-5"
      },
      {
        id: "kimi",
        harnessId: "opencode",
        label: "Kimi",
        models: [{ value: "opencode/kimi-k2.5", label: "Kimi K2.5" }],
        defaultModel: "opencode/kimi-k2.5"
      },
      {
        id: "vertex_oss",
        harnessId: "opencode",
        label: "Vertex OSS",
        models: [
          { value: "google-vertex/openai/gpt-oss-120b-maas", label: "GPT-OSS 120B MaaS" },
          { value: "google-vertex/openai/gpt-oss-20b-maas", label: "GPT-OSS 20B MaaS" },
          { value: "google-vertex/meta/llama-4-maverick-17b-128e-instruct-maas", label: "Llama 4 Maverick 17B 128E Instruct MaaS" },
          { value: "google-vertex/meta/llama-3.3-70b-instruct-maas", label: "Llama 3.3 70B Instruct MaaS" },
          { value: "google-vertex/qwen/qwen3-235b-a22b-instruct-2507-maas", label: "Qwen3 235B A22B Instruct 2507 MaaS" }
        ],
        defaultModel: "google-vertex/openai/gpt-oss-120b-maas"
      },
      {
        id: "minimax",
        harnessId: "opencode",
        label: "MiniMax",
        models: [
          { value: "opencode/minimax-m2.5", label: "MiniMax M2.5" },
          { value: "opencode/minimax-m2.5-free", label: "MiniMax M2.5 Free" },
          { value: "opencode/minimax-m2.1", label: "MiniMax M2.1" },
          { value: "opencode/big-pickle", label: "Big Pickle" }
        ],
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
  },
  {
    id: "gemini",
    label: "Gemini",
    badge: {
      icon: "gemini"
    },
    capabilities: ["streaming"],
    modelGroups: [
      {
        id: "google",
        harnessId: "gemini",
        label: "Google",
        models: [
          { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
          { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
          { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
          { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
          { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" }
        ],
        defaultModel: "gemini-2.5-pro"
      }
    ],
    setup: {
      requiredKeys: ["node", "npm", "git", "rg", "gemini"],
      blockingKeys: ["gemini"],
      installTargets: ["node", "npm", "git", "rg", "gemini"],
      description:
        "This guided setup can automatically install missing dependencies for this app: Node.js/npm, Git, ripgrep, and the Gemini CLI.",
      verifyLabel: "Verify Gemini CLI"
    }
  }
];

export const ENABLED_HARNESS_IDS = HARNESS_DESCRIPTORS.map((harness) => harness.id);

export const DEFAULT_HARNESS_OPTIONS: Record<HarnessId, CodexThreadOptions | Record<string, never>> = {
  codex: DEFAULT_CODEX_OPTIONS,
  opencode: DEFAULT_OPENCODE_OPTIONS,
  gemini: DEFAULT_GEMINI_OPTIONS
};

const toProviderKey = (harnessId: HarnessId, groupId: string): HarnessModelProviderKey =>
  `${harnessId}:${groupId}` as HarnessModelProviderKey;

const normalizeModelDefinition = (model: HarnessModelDefinition): HarnessDefinedModel =>
  typeof model === "string" ? { value: model } : model;

export const getHarnessModelValue = (model: HarnessModelDefinition): string => normalizeModelDefinition(model).value;

const createModelCatalogEntry = <T extends HarnessId>(
  harnessId: T,
  providerId: HarnessModelProviderKey,
  modelDefinition: HarnessModelDefinition,
  defaultModel?: string
): HarnessModelCatalogEntry<T> => {
  const model = normalizeModelDefinition(modelDefinition);
  return {
    id: `${providerId}:${model.value}`,
    harnessId,
    providerId,
    value: model.value,
    label: model.label ?? model.value,
    isDefault: model.value === defaultModel
  };
};

const buildProviderModelMap = (descriptors: HarnessRegistryEntry[]): HarnessProviderModelMap =>
  descriptors.reduce<HarnessProviderModelMap>((catalog, descriptor) => {
    const providers = descriptor.modelGroups.reduce<Record<HarnessModelProviderKey, HarnessModelProviderEntry>>(
      (groupCatalog, group) => {
        const providerId = toProviderKey(descriptor.id, group.id);
        groupCatalog[providerId] = {
          id: providerId,
          harnessId: descriptor.id,
          groupId: group.id,
          label: group.label,
          defaultModel: group.defaultModel,
          models: group.models.map((model) =>
            createModelCatalogEntry(descriptor.id, providerId, model, group.defaultModel)
          )
        };
        return groupCatalog;
      },
      {}
    );
    catalog[descriptor.id] = providers;
    return catalog;
  }, {});

export const HARNESS_PROVIDER_MODEL_MAP = buildProviderModelMap(HARNESS_DESCRIPTORS);

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

export const getHarnessModelProviders = <T extends HarnessId>(harnessId: T): HarnessModelProviderEntry<T>[] =>
  Object.values(HARNESS_PROVIDER_MODEL_MAP[harnessId] ?? {}) as HarnessModelProviderEntry<T>[];

export const findHarnessModelProvider = <T extends HarnessId>(
  harnessId: T,
  model: string
): HarnessModelProviderEntry<T> | undefined =>
  getHarnessModelProviders(harnessId).find((provider) => provider.models.some((entry) => entry.value === model));

export const findHarnessModelEntry = <T extends HarnessId>(
  harnessId: T,
  model: string
): HarnessModelCatalogEntry<T> | undefined =>
  findHarnessModelProvider(harnessId, model)?.models.find((entry) => entry.value === model);

export const getHarnessModelLabel = <T extends HarnessId>(harnessId: T, model: string): string | undefined =>
  findHarnessModelEntry(harnessId, model)?.label;

export const getDefaultHarnessModel = (harnessId: HarnessId): string | undefined =>
  getHarnessModelProviders(harnessId).find((provider) => provider.defaultModel)?.defaultModel;

export const getHarnessModelSuggestions = (harnessId: HarnessId): string[] => {
  const seen = new Set<string>();
  const models: string[] = [];
  getHarnessModelProviders(harnessId).forEach((provider) => {
    provider.models.forEach((model) => {
      if (seen.has(model.value)) {
        return;
      }
      seen.add(model.value);
      models.push(model.value);
    });
  });
  return models;
};
