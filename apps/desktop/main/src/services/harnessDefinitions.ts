import { HARNESS_DESCRIPTORS, type HarnessCapability, type HarnessDescriptor, type HarnessId, type Thread } from "@code-app/shared";
import { PROVIDER_ADAPTERS, type ProviderAdapter } from "./providerAdapters";

export type HarnessRuntimeKind = "codex_app_server" | "pty";

export interface HarnessDefinition extends HarnessDescriptor {
  runtimeKind: HarnessRuntimeKind;
  adapter?: ProviderAdapter;
  bundled?: boolean;
  supportsAuth?: boolean;
}

const descriptorById = new Map<HarnessId, HarnessDescriptor>(
  HARNESS_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor])
);

const createHarnessDefinition = (harnessId: HarnessId): HarnessDefinition => {
  const descriptor = descriptorById.get(harnessId);
  if (!descriptor) {
    throw new Error(`Missing shared harness descriptor for ${harnessId}`);
  }

  if (harnessId === "codex") {
    return {
      ...descriptor,
      runtimeKind: "codex_app_server",
      bundled: true,
      supportsAuth: true
    };
  }

  return {
    ...descriptor,
    runtimeKind: "pty",
    adapter: PROVIDER_ADAPTERS[harnessId]
  };
};

export const HARNESS_DEFINITIONS: Record<HarnessId, HarnessDefinition> = {
  codex: createHarnessDefinition("codex"),
  opencode: createHarnessDefinition("opencode"),
  gemini: createHarnessDefinition("gemini")
};

export const resolveHarnessId = (threadLike: Pick<Thread, "harnessId" | "provider"> | { harnessId?: HarnessId; provider?: HarnessId }) =>
  threadLike.harnessId ?? threadLike.provider ?? "codex";

export const getHarnessDefinition = (threadLike: HarnessId | Pick<Thread, "harnessId" | "provider">) => {
  const harnessId = typeof threadLike === "string" ? threadLike : resolveHarnessId(threadLike);
  return HARNESS_DEFINITIONS[harnessId];
};

export const harnessHasCapability = (threadLike: HarnessId | Pick<Thread, "harnessId" | "provider">, capability: HarnessCapability) =>
  getHarnessDefinition(threadLike).capabilities.includes(capability as never);

export const getPtyHarnessAdapter = (threadLike: HarnessId | Pick<Thread, "harnessId" | "provider">) => {
  const definition = getHarnessDefinition(threadLike);
  return definition.runtimeKind === "pty" ? definition.adapter ?? null : null;
};
