import type { CodexThreadOptions, HarnessId, HarnessModelGroup } from "@code-app/shared";
import { getModelTooltip } from "../../shared/src/modelTooltips";
import { formatModelDisplayName, getModelValue, getSupportedHarnessModelLabel, SUPPORTED_HARNESSES } from "./appCore";

type VisibleHarnessDescriptor = (typeof SUPPORTED_HARNESSES)[number];

type ProviderMeta = {
  id: string;
  label: string;
  order: number;
};

const PROVIDER_META = {
  openai: { id: "openai", label: "OpenAI", order: 0 },
  anthropic: { id: "anthropic", label: "Anthropic", order: 1 },
  google: { id: "google", label: "Google", order: 2 },
  deepseek: { id: "deepseek", label: "DeepSeek", order: 3 },
  zai: { id: "zai", label: "Z.ai", order: 4 },
  moonshot: { id: "moonshot", label: "Moonshot", order: 5 },
  meta: { id: "meta", label: "Meta", order: 6 },
  qwen: { id: "qwen", label: "Qwen.AI", order: 7 },
  minimax: { id: "minimax", label: "MiniMax", order: 8 },
  openModels: { id: "open-models", label: "Open Models", order: 9 }
} as const;

export type ComposerMergedModelSupport = {
  harnessId: HarnessId;
  harnessLabel: string;
  badge: VisibleHarnessDescriptor["badge"];
  model: string;
  provider: ProviderMeta;
  selected: boolean;
  disabled: boolean;
  tooltip: string;
};

export type ComposerMergedModelRow = {
  id: string;
  displayName: string;
  tooltip: string;
  selected: boolean;
  preferredHarness: ComposerMergedModelSupport;
  harnesses: ComposerMergedModelSupport[];
  provider: ProviderMeta;
};

export type ComposerMergedModelGroup = {
  id: string;
  label: string;
  rows: ComposerMergedModelRow[];
};

const PROVIDER_GROUP_META: Partial<Record<HarnessModelGroup["id"], ProviderMeta>> = {
  flagship: PROVIDER_META.openai,
  codex: PROVIDER_META.openai,
  spark: PROVIDER_META.openai,
  openai: PROVIDER_META.openai,
  anthropic: PROVIDER_META.anthropic,
  google: PROVIDER_META.google,
  deepseek: PROVIDER_META.deepseek,
  glm: PROVIDER_META.zai,
  kimi: PROVIDER_META.moonshot,
  vertex_oss: PROVIDER_META.openModels,
  minimax: PROVIDER_META.minimax,
  xai: PROVIDER_META.openai
};

const getProviderMeta = (group: HarnessModelGroup, model: string): ProviderMeta => {
  if (group.id === "vertex_oss") {
    if (model.includes("/openai/") || model.includes("/gpt-oss-")) {
      return PROVIDER_META.openai;
    }
    if (model.includes("/meta/") || model.includes("/llama-")) {
      return PROVIDER_META.meta;
    }
    if (model.includes("/qwen/") || model.includes("/qwen")) {
      return PROVIDER_META.qwen;
    }
  }

  return PROVIDER_GROUP_META[group.id] ?? {
    id: group.id,
    label: group.label,
    order: Number.MAX_SAFE_INTEGER
  };
};

const HARNESS_ORDER = new Map(SUPPORTED_HARNESSES.map((harness, index) => [harness.id, index] as const));

const getDisplayName = (harnessId: HarnessId, model: string): string =>
  getSupportedHarnessModelLabel(harnessId, model) ?? formatModelDisplayName(model);

export const buildComposerModelGroups = ({
  composerOptions,
  currentHarnessId,
  visibleHarnesses,
  canSwitchHarnesses,
  showUnavailableModels = false
}: {
  composerOptions: CodexThreadOptions;
  currentHarnessId: HarnessId;
  visibleHarnesses: Partial<Record<HarnessId, boolean>>;
  canSwitchHarnesses: boolean;
  showUnavailableModels?: boolean;
}): ComposerMergedModelGroup[] => {
  const rowsByDisplayName = new Map<
    string,
    {
      id: string;
      displayName: string;
      tooltip: string;
      supports: ComposerMergedModelSupport[];
    }
  >();

  SUPPORTED_HARNESSES.forEach((harness) => {
    const harnessVisible = visibleHarnesses[harness.id] !== false;
    if (!harnessVisible && !showUnavailableModels) {
      return;
    }

    harness.modelGroups.forEach((group) => {
      group.models.forEach((modelDefinition) => {
        const model = getModelValue(modelDefinition);
        const provider = getProviderMeta(group, model);
        const displayName = getDisplayName(harness.id, model);
        const rowKey = displayName.toLowerCase();
        const disabled = !harnessVisible || (harness.id !== currentHarnessId && !canSwitchHarnesses);
        const selected = harness.id === currentHarnessId && (composerOptions.model ?? "").trim() === model;
        const row = rowsByDisplayName.get(rowKey) ?? {
          id: rowKey,
          displayName,
          tooltip: getModelTooltip(model),
          supports: []
        };

        if (row.supports.some((support) => support.harnessId === harness.id && support.model === model)) {
          rowsByDisplayName.set(rowKey, row);
          return;
        }

        row.supports.push({
          harnessId: harness.id,
          harnessLabel: harness.label,
          badge: harness.badge,
          model,
          provider,
          selected,
          disabled,
          tooltip: selected
            ? `${harness.label} is currently using ${displayName}.`
            : !harnessVisible
              ? `${harness.label} is not currently available.`
            : disabled
              ? `This thread is locked to ${SUPPORTED_HARNESSES.find((item) => item.id === currentHarnessId)?.label ?? currentHarnessId}.`
              : `Use ${displayName} with ${harness.label}.`
        });

        if (selected) {
          row.tooltip = getModelTooltip(model);
        }

        rowsByDisplayName.set(rowKey, row);
      });
    });
  });

  const groups = new Map<string, ComposerMergedModelGroup>();

  [...rowsByDisplayName.values()]
    .map<ComposerMergedModelRow>((row) => {
      row.supports.sort((left, right) => {
        const leftOrder = HARNESS_ORDER.get(left.harnessId) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = HARNESS_ORDER.get(right.harnessId) ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return left.harnessLabel.localeCompare(right.harnessLabel);
      });

      const preferredHarness =
        row.supports.find((support) => support.harnessId === currentHarnessId) ??
        row.supports.find((support) => !support.disabled) ??
        row.supports[0]!;
      const selected = row.supports.some((support) => support.selected);
      const provider =
        row.supports.find((support) => support.selected)?.provider ??
        row.supports.find((support) => support.harnessId === currentHarnessId)?.provider ??
        row.supports.reduce<ProviderMeta>(
          (best, support) => (support.provider.order < best.order ? support.provider : best),
          row.supports[0]!.provider
        );

      return {
        id: row.id,
        displayName: row.displayName,
        tooltip: row.tooltip,
        selected,
        preferredHarness,
        harnesses: row.supports,
        provider
      };
    })
    .sort((left, right) => {
      const providerDelta = left.provider.order - right.provider.order;
      if (providerDelta !== 0) {
        return providerDelta;
      }
      if (left.provider.label !== right.provider.label) {
        return left.provider.label.localeCompare(right.provider.label);
      }
      return left.displayName.localeCompare(right.displayName);
    })
    .forEach((row) => {
      const existingGroup = groups.get(row.provider.id) ?? {
        id: row.provider.id,
        label: row.provider.label,
        rows: []
      };
      existingGroup.rows.push(row);
      groups.set(row.provider.id, existingGroup);
    });

  return [...groups.values()];
};

export const findComposerModelRow = ({
  composerOptions,
  currentHarnessId,
  visibleHarnesses,
  canSwitchHarnesses,
  showUnavailableModels = false
}: {
  composerOptions: CodexThreadOptions;
  currentHarnessId: HarnessId;
  visibleHarnesses: Partial<Record<HarnessId, boolean>>;
  canSwitchHarnesses: boolean;
  showUnavailableModels?: boolean;
}): ComposerMergedModelRow | null => {
  const currentModel = (composerOptions.model ?? "").trim();
  if (!currentModel) {
    return null;
  }
  const currentDisplayName = getDisplayName(currentHarnessId, currentModel);

  const groups = buildComposerModelGroups({
    composerOptions,
    currentHarnessId,
    visibleHarnesses,
    canSwitchHarnesses,
    showUnavailableModels
  });

  for (const group of groups) {
    for (const row of group.rows) {
      if (row.displayName === currentDisplayName) {
        return row;
      }
    }
  }

  return null;
};
