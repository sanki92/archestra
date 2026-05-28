import { z } from "zod";
import { SUPPORTED_THEMES } from "./themes/theme-config";

export const OrganizationThemeSchema = z.enum(SUPPORTED_THEMES);
export const OrganizationCustomFontSchema = z.enum([
  "lato",
  "inter",
  "open-sans",
  "roboto",
  "source-sans-pro",
  "jetbrains-mono",
]);

/**
 * Free-form CSS variable map. Keys are CSS variable names without the `--`
 * prefix (e.g. `background`, `font-sans`, `radius`). Values are raw CSS values.
 * We deliberately do not enumerate keys here — the custom theme is meant to
 * expose every variable the platform reads, so admins can override anything.
 */
const CustomThemeVarsSchema = z.record(z.string(), z.string());

export const CustomThemeSchema = z.object({
  light: CustomThemeVarsSchema,
  dark: CustomThemeVarsSchema,
});

export type OrganizationTheme = z.infer<typeof OrganizationThemeSchema>;
export type OrganizationCustomFont = z.infer<
  typeof OrganizationCustomFontSchema
>;
export type CustomTheme = z.infer<typeof CustomThemeSchema>;
