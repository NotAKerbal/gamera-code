type DynamicImporter = (specifier: string) => Promise<unknown>;

type UnknownRecord = Record<string, unknown>;

export interface CodexSdkModule {
  Codex: new (options?: UnknownRecord) => UnknownRecord;
}

let cachedModule: CodexSdkModule | null = null;

const dynamicImport: DynamicImporter = new Function(
  "specifier",
  "return import(specifier);"
) as DynamicImporter;

const asRecord = (value: unknown): UnknownRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as UnknownRecord;
};

const collectText = (value: unknown, bucket: string[]) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      bucket.push(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectText(item, bucket));
    return;
  }

  const record = asRecord(value);
  if (!record) {
    return;
  }

  const directText = record.text;
  if (typeof directText === "string" && directText.trim()) {
    bucket.push(directText.trim());
  }

  const maybeFields = [
    record.content,
    record.message,
    record.delta,
    record.output,
    record.outputText,
    record.finalResponse
  ];
  maybeFields.forEach((field) => collectText(field, bucket));
};

export const loadCodexSdk = async (): Promise<CodexSdkModule> => {
  if (cachedModule) {
    return cachedModule;
  }

  const mod = (await dynamicImport("@openai/codex-sdk")) as UnknownRecord;
  if (!mod || typeof mod.Codex !== "function") {
    throw new Error("Failed to load @openai/codex-sdk Codex class.");
  }

  cachedModule = mod as unknown as CodexSdkModule;
  return cachedModule;
};

export const extractCodexResponseText = (runResult: unknown): string => {
  const parts: string[] = [];
  collectText(runResult, parts);

  const deduped = parts.filter((part, idx) => parts.indexOf(part) === idx);
  return deduped.join("\n\n").trim();
};
