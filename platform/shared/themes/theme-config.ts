/**
 * Theme configuration - defines which themes from tweakcn registry we support
 */

/**
 * Supported themes from the tweakcn registry
 * This is the single source of truth for which themes are available
 */
export const SUPPORTED_THEMES = [
  "modern-minimal",
  "clean-slate",
  "mono",
  "twitter",
  "tangerine",
  "bubblegum",
  "caffeine",
  "amber-minimal",
  "cosmic-night",
  "doom-64",
  "mocha-mousse",
  "nature",
  "sunset-horizon",
  "neo-brutalism",
  "vercel",
  "claude",
  "vintage-paper",
  "boxy-minimalistic",
  "catppuccin",
  "solarized-dark",
  "gruvbox-dark",
  "dracula-dark",
  "monokai-dark",
  "moonlight-dark",
  "custom",
] as const;

/**
 * Theme ID used for the per-organization custom theme.
 * The CSS variables for this theme are stored in `organization.custom_theme`
 * (JSON) and injected at runtime, so this ID has no entry in
 * `tweakcn-themes.json` and is not emitted into `themes.css`.
 */
export const CUSTOM_THEME_ID = "custom";

/**
 * Default theme ID
 */
export const DEFAULT_THEME_ID = "cosmic-night";
