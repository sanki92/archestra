import {
  CUSTOM_THEME_ID,
  type CustomTheme,
  DEFAULT_THEME_ID,
  type OrganizationTheme,
} from "@shared";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  useAppearanceSettings,
  useUpdateAppearanceSettings,
} from "./organization.query";

const THEME_STORAGE_KEY = "archestra-theme";
const DEFAULT_THEME: OrganizationTheme = DEFAULT_THEME_ID as OrganizationTheme;
const CUSTOM_STYLE_ELEMENT_ID = "archestra-custom-theme";

export function useOrgTheme() {
  const pathname = usePathname();

  // Check if we're on an auth page (login, signup, etc.)
  const isAuthPage = pathname?.startsWith("/auth/");

  // Always use public appearance endpoint - it returns the same data for all pages
  // and works without authentication
  const { data: appearance, isLoading: isLoadingAppearance } =
    useAppearanceSettings();

  const {
    theme: themeFromBackend,
    logo,
    logoDark,
    customTheme,
  } = appearance ?? {};

  const updateThemeMutation = useUpdateAppearanceSettings(
    "Appearance settings updated",
    "Failed to update appearance settings",
  );

  const themeFromLocalStorage =
    typeof window !== "undefined"
      ? (localStorage.getItem(THEME_STORAGE_KEY) as OrganizationTheme | null)
      : null;

  const [currentUITheme, setCurrentUITheme] = useState<OrganizationTheme>(
    themeFromBackend || themeFromLocalStorage || DEFAULT_THEME,
  );

  const saveAppearance = useCallback(
    async (themeId: OrganizationTheme) => {
      setCurrentUITheme(themeId);
      await updateThemeMutation.mutateAsync({
        theme: themeId,
      });
      applyThemeInLocalStorage(themeId);
    },
    [updateThemeMutation],
  );

  // whenever currentUITheme changes, apply the theme on the UI
  // Font is automatically applied via CSS --font-sans variable in the theme class
  useEffect(() => {
    applyThemeOnUI(currentUITheme);
  }, [currentUITheme]);

  // Re-inject custom theme CSS whenever the org's custom theme JSON or the
  // selected theme changes. Removed when a non-custom theme is selected.
  useEffect(() => {
    if (currentUITheme === CUSTOM_THEME_ID) {
      applyCustomThemeCss(customTheme ?? null);
    } else {
      removeCustomThemeCss();
    }
  }, [currentUITheme, customTheme]);

  // whenever themeFromBackend is loaded and is different from themeFromLocalStorage, update local storage and UI
  // Only sync after actual data loads (not during placeholder loading) to prevent flicker
  useEffect(() => {
    if (
      !isLoadingAppearance &&
      themeFromBackend &&
      themeFromBackend !== themeFromLocalStorage
    ) {
      applyThemeInLocalStorage(themeFromBackend);
      setCurrentUITheme(themeFromBackend);
    }
  }, [themeFromBackend, themeFromLocalStorage, isLoadingAppearance]);

  // For auth pages, return limited data (read-only appearance, no update functions)
  if (isAuthPage) {
    return {
      currentUITheme: currentUITheme || DEFAULT_THEME,
      themeFromBackend,
      customTheme: customTheme ?? null,
      setPreviewTheme: undefined,
      saveAppearance: undefined,
      logo,
      logoDark,
      DEFAULT_THEME,
      isLoadingAppearance,
      applyThemeOnUI,
    };
  }

  return {
    currentUITheme: currentUITheme || DEFAULT_THEME,
    themeFromBackend,
    customTheme: customTheme ?? null,
    setPreviewTheme: setCurrentUITheme,
    saveAppearance,
    logo,
    logoDark,
    DEFAULT_THEME,
    isLoadingAppearance,
    applyThemeOnUI,
  };
}

const applyThemeOnUI = (themeId: OrganizationTheme) => {
  const root = document.documentElement;
  const themeClasses = Array.from(root.classList).filter((cls) =>
    cls.startsWith("theme-"),
  );
  for (const cls of themeClasses) {
    root.classList.remove(cls);
  }
  root.classList.add(`theme-${themeId}`);
};

const applyThemeInLocalStorage = (themeId: OrganizationTheme) => {
  localStorage.setItem(THEME_STORAGE_KEY, themeId);
};

/**
 * Inject the org's custom theme as a `<style>` element. Var names are
 * restricted to `[a-z0-9-]` and values must not contain CSS-terminator or
 * brace characters — anything else is dropped to keep the injection safe.
 *
 * Exported so callers (e.g. the appearance settings page) can drive a live
 * preview of an unsaved draft. Pass `null` to clear the injected styles.
 */
export function applyCustomThemeCss(customTheme: CustomTheme | null) {
  if (typeof document === "undefined") return;

  const existing = document.getElementById(CUSTOM_STYLE_ELEMENT_ID);
  if (!customTheme) {
    existing?.remove();
    return;
  }

  const lightVars = renderCustomThemeVars(customTheme.light);
  const darkVars = renderCustomThemeVars(customTheme.dark);
  const css = `html.theme-${CUSTOM_THEME_ID} {\n${lightVars}\n}\nhtml.dark.theme-${CUSTOM_THEME_ID} {\n${darkVars}\n}\n`;

  const style =
    existing instanceof HTMLStyleElement
      ? existing
      : document.createElement("style");
  style.id = CUSTOM_STYLE_ELEMENT_ID;
  style.textContent = css;
  if (!existing) {
    document.head.appendChild(style);
  }
}

function removeCustomThemeCss() {
  if (typeof document === "undefined") return;
  document.getElementById(CUSTOM_STYLE_ELEMENT_ID)?.remove();
}

const SAFE_VAR_NAME = /^[a-z0-9-]+$/i;
const UNSAFE_VAR_VALUE = /[{};<>\\@]/;

function renderCustomThemeVars(vars: Record<string, string>): string {
  return Object.entries(vars)
    .filter(
      ([key, value]) =>
        SAFE_VAR_NAME.test(key) && !UNSAFE_VAR_VALUE.test(value),
    )
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n");
}
