import type { PromptAttachment } from "@code-app/shared";

declare module "@code-app/shared" {
  interface MessageEvent {
    attachments?: PromptAttachment[];
  }
}
