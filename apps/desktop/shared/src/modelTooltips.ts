const MODEL_TOOLTIPS: Record<string, string> = {
  "gpt-5.4": "Flagship GPT-5.4 model for strong reasoning, coding, and agentic work.",
  "gpt-5.3-codex": "Latest frontier agentic coding model.",
  "gpt-5.3-codex-spark": "Faster Codex-tuned GPT-5.3 variant for quick edits and lighter agent loops.",
  "gpt-5.2-codex": "Frontier agentic coding model.",
  "opencode/gpt-5.4-pro": "Highest-capability GPT-5.4 option for the hardest coding, reasoning, and agent workflows.",
  "opencode/gpt-5.4": "Flagship GPT-5.4 model for strong reasoning, coding, and agentic work.",
  "opencode/gpt-5.2": "Balanced GPT-5 model with broad gains in knowledge, reasoning, and coding.",
  "opencode/gpt-5-nano": "Fastest, lowest-cost GPT-5 variant for simple classifications, extraction, and short tasks.",
  "opencode/claude-opus-4-6": "Anthropic's most capable Claude 4.6 model for complex research, coding, and deep reasoning.",
  "opencode/claude-opus-4-5": "Earlier top-end Claude Opus 4.5 model for demanding analysis and coding.",
  "opencode/claude-sonnet-4-6": "Balanced Claude 4.6 model for strong coding and reasoning with better speed than Opus.",
  "opencode/claude-sonnet-4-5": "Earlier balanced Claude 4.5 model for everyday coding and analysis.",
  "opencode/claude-haiku-4-5": "Fast Claude 4.5 model for lightweight drafting, extraction, and low-latency tasks.",
  "opencode/gemini-3.1-pro": "Highest-capability Gemini 3.1 Pro route for complex reasoning, coding, and multimodal work.",
  "opencode/gemini-3-pro": "Balanced Gemini 3 Pro route for general reasoning and coding.",
  "opencode/gemini-3-flash": "Low-latency Gemini 3 Flash route for fast chat, extraction, and high-throughput tasks.",
  "google-vertex/gemini-3.1-pro-preview":
    "Vertex AI preview route for Gemini 3.1 Pro, aimed at complex reasoning, coding, and multimodal work.",
  "google-vertex/gemini-3-pro-preview": "Vertex AI preview route for Gemini 3 Pro, tuned for general reasoning and coding.",
  "google-vertex/gemini-3-flash-preview":
    "Vertex AI preview route for Gemini 3 Flash, optimized for low latency and high throughput.",
  "opencode/gpt-5.3-codex": "Latest frontier agentic coding model.",
  "opencode/gpt-5.3-codex-spark": "Faster Codex-tuned GPT-5.3 variant for quick edits and lighter agent loops.",
  "opencode/gpt-5.2-codex": "Frontier agentic coding model.",
  "google-vertex/deepseek-ai/deepseek-v3.1-maas":
    "Vertex AI MaaS route for DeepSeek V3.1, focused on strong coding and reasoning.",
  "opencode/glm-5": "Latest Z.ai GLM family route for general reasoning and coding.",
  "opencode/glm-4.7": "Earlier GLM 4.7 route for general reasoning and instruction following.",
  "opencode/glm-4.6": "Older GLM 4.6 route kept for compatibility and lower-cost experiments.",
  "google-vertex/zai-org/glm-5-maas": "Vertex AI MaaS route for Z.ai GLM-5.",
  "google-vertex/zai-org/glm-4.7-maas": "Vertex AI MaaS route for Z.ai GLM-4.7.",
  "opencode/kimi-k2.5": "Moonshot AI's Kimi K2.5 route, aimed at long-context reasoning and coding.",
  "google-vertex/openai/gpt-oss-120b-maas":
    "Vertex AI MaaS route for OpenAI's 120B-parameter open-weight GPT OSS model.",
  "google-vertex/openai/gpt-oss-20b-maas":
    "Vertex AI MaaS route for OpenAI's 20B-parameter open-weight GPT OSS model.",
  "google-vertex/meta/llama-4-maverick-17b-128e-instruct-maas":
    "Vertex AI MaaS route for Meta's Llama 4 Maverick instruct model.",
  "google-vertex/meta/llama-3.3-70b-instruct-maas":
    "Vertex AI MaaS route for Meta's Llama 3.3 70B instruct model.",
  "google-vertex/qwen/qwen3-235b-a22b-instruct-2507-maas":
    "Vertex AI MaaS route for Alibaba's Qwen3 235B instruct model.",
  "opencode/minimax-m2.5": "MiniMax's current M2.5 route for reasoning, coding, and general assistant tasks.",
  "opencode/minimax-m2.5-free": "Free-tier MiniMax M2.5 route with the same family model but tighter provider limits.",
  "opencode/minimax-m2.1": "Earlier MiniMax M2.1 route for lighter reasoning and lower-cost tasks.",
  "opencode/big-pickle": "Provider-specific experimental route exposed by OpenCode."
};

export const getModelTooltip = (model: string): string => MODEL_TOOLTIPS[model] ?? model;
