export const experienceTokens = {
  color: {
    canvas: "transparent",
    surface: "rgb(255 255 255 / 94%)",
    surfaceRaised: "rgb(255 255 255 / 98%)",
    text: "#111827",
    textMuted: "#64748b",
    textSoft: "#334155",
    companion: "#0f766e",
    companionHover: "#0b5f59",
    companionSoft: "#f0fdfa",
    border: "rgb(17 24 39 / 14%)",
    borderStrong: "rgb(15 118 110 / 28%)",
    controlHover: "#eef2f7",
  },
  stateColor: {
    idle: "#0f766e",
    listening: "#2563eb",
    thinking: "#475569",
    speaking: "#db2777",
    waitingApproval: "#d97706",
    muted: "#64748b",
    error: "#dc2626",
    offline: "#6b7280",
    loading: "#0891b2",
    disabled: "#94a3b8",
    empty: "#64748b",
  },
  typography: {
    family:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    caption: "0.62rem",
    label: "0.72rem",
    control: "0.84rem",
    body: "0.9rem",
  },
  spacing: {
    xxs: "2px",
    xs: "4px",
    sm: "8px",
    md: "10px",
    lg: "14px",
    xl: "18px",
  },
  radius: {
    control: "6px",
    panel: "8px",
    pill: "999px",
    avatarBody: "44px 44px 16px 16px",
  },
  elevation: {
    panel: "0 18px 44px rgb(15 23 42 / 18%)",
    avatar: "drop-shadow(0 18px 22px rgb(15 23 42 / 22%))",
  },
  border: {
    panel: "1px solid rgb(17 24 39 / 14%)",
    companion: "1px solid rgb(15 118 110 / 28%)",
  },
  motion: {
    fast: "140ms ease",
    standard: "220ms ease",
    idle: "3.8s ease-in-out",
    listening: "2.4s ease-in-out",
    speaking: "1.6s ease-in-out",
    waitingApproval: "4.8s ease-in-out",
  },
} as const;

export const componentStateRules = {
  hover: "Raise contrast through hover background or border only; do not shift layout.",
  active: "Use companion color fills for selected controls and state-specific avatar color for presence.",
  disabled: "Keep controls visible, mute contrast, and remove action affordance through the disabled attribute.",
  loading: "Use short direct copy and the loading state color only while data is unresolved.",
  error: "Use the error state color with repair-oriented copy near the failed control.",
  empty: "Keep the surface in place with muted copy and one next action when available.",
  offline: "Use muted/offline color and say which capability is unavailable without implying passive listening.",
} as const;

const cssVariableNames = {
  color: {
    canvas: "--plato-color-canvas",
    surface: "--plato-color-surface",
    surfaceRaised: "--plato-color-surface-raised",
    text: "--plato-color-text",
    textMuted: "--plato-color-text-muted",
    textSoft: "--plato-color-text-soft",
    companion: "--plato-color-companion",
    companionHover: "--plato-color-companion-hover",
    companionSoft: "--plato-color-companion-soft",
    border: "--plato-color-border",
    borderStrong: "--plato-color-border-strong",
    controlHover: "--plato-color-control-hover",
  },
  stateColor: {
    idle: "--plato-state-idle",
    listening: "--plato-state-listening",
    thinking: "--plato-state-thinking",
    speaking: "--plato-state-speaking",
    waitingApproval: "--plato-state-waiting-approval",
    muted: "--plato-state-muted",
    error: "--plato-state-error",
    offline: "--plato-state-offline",
    loading: "--plato-state-loading",
    disabled: "--plato-state-disabled",
    empty: "--plato-state-empty",
  },
  typography: {
    family: "--plato-font-family",
    caption: "--plato-font-caption",
    label: "--plato-font-label",
    control: "--plato-font-control",
    body: "--plato-font-body",
  },
  spacing: {
    xxs: "--plato-space-xxs",
    xs: "--plato-space-xs",
    sm: "--plato-space-sm",
    md: "--plato-space-md",
    lg: "--plato-space-lg",
    xl: "--plato-space-xl",
  },
  radius: {
    control: "--plato-radius-control",
    panel: "--plato-radius-panel",
    pill: "--plato-radius-pill",
    avatarBody: "--plato-radius-avatar-body",
  },
  elevation: {
    panel: "--plato-elevation-panel",
    avatar: "--plato-elevation-avatar",
  },
  border: {
    panel: "--plato-border-panel",
    companion: "--plato-border-companion",
  },
  motion: {
    fast: "--plato-motion-fast",
    standard: "--plato-motion-standard",
    idle: "--plato-motion-idle",
    listening: "--plato-motion-listening",
    speaking: "--plato-motion-speaking",
    waitingApproval: "--plato-motion-waiting-approval",
  },
} as const;

function tokenDeclarations<T extends Record<string, string>>(
  values: T,
  names: Record<keyof T, string>,
) {
  return Object.entries(values)
    .map(([key, value]) => `  ${names[key as keyof T]}: ${value};`)
    .join("\n");
}

export const experienceTokenCss = `:root {
${tokenDeclarations(experienceTokens.color, cssVariableNames.color)}
${tokenDeclarations(experienceTokens.stateColor, cssVariableNames.stateColor)}
${tokenDeclarations(experienceTokens.typography, cssVariableNames.typography)}
${tokenDeclarations(experienceTokens.spacing, cssVariableNames.spacing)}
${tokenDeclarations(experienceTokens.radius, cssVariableNames.radius)}
${tokenDeclarations(experienceTokens.elevation, cssVariableNames.elevation)}
${tokenDeclarations(experienceTokens.border, cssVariableNames.border)}
${tokenDeclarations(experienceTokens.motion, cssVariableNames.motion)}
}`;
