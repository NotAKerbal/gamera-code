import { Gemini, Google, OpenAI, OpenCode } from "@lobehub/icons";
import type { ComponentType, SVGProps } from "react";

type HarnessBadgeIcon = "openai" | "opencode" | "google" | "gemini";
type HarnessBadgeIconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: string | number; title?: string }>;

const HARNESS_BADGE_ICONS = {
  openai: OpenAI,
  opencode: OpenCode,
  google: Google,
  gemini: Gemini
} satisfies Record<HarnessBadgeIcon, HarnessBadgeIconComponent>;

type HarnessBadgeProps = {
  harness: {
    label: string;
    badge: {
      icon: HarnessBadgeIcon;
    };
  };
  showLabel?: boolean;
  className?: string;
};

export const HarnessBadge = ({ harness, showLabel = true, className = "" }: HarnessBadgeProps) => {
  const Icon = HARNESS_BADGE_ICONS[harness.badge.icon];

  return (
    <span className={`harness-badge${className ? ` ${className}` : ""}`}>
      <span className="harness-badge-icon-shell" aria-hidden="true">
        <Icon className="harness-badge-icon" aria-hidden="true" />
      </span>
      {showLabel ? <span className="harness-badge-label">{harness.label}</span> : null}
    </span>
  );
};
