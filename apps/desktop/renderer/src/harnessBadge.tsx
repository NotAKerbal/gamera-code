const LIGHT_THEMES = new Set(["dawn", "linen"]);

const isLightTheme = () => {
  if (typeof document === "undefined") {
    return false;
  }
  return LIGHT_THEMES.has(document.documentElement.dataset.theme ?? "midnight");
};

type HarnessBadgeProps = {
  harness: {
    label: string;
    badge: {
      iconOnLightPath: string;
      iconOnDarkPath: string;
    };
  };
  showLabel?: boolean;
  className?: string;
};

export const HarnessBadge = ({ harness, showLabel = true, className = "" }: HarnessBadgeProps) => {
  const iconSrc = isLightTheme() ? harness.badge.iconOnLightPath : harness.badge.iconOnDarkPath;

  return (
    <span className={`harness-badge${className ? ` ${className}` : ""}`}>
      <span className="harness-badge-icon-shell" aria-hidden="true">
        <img src={iconSrc} alt="" className="harness-badge-icon" />
      </span>
      {showLabel ? <span className="harness-badge-label">{harness.label}</span> : null}
    </span>
  );
};
