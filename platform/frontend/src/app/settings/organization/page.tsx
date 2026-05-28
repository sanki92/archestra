"use client";

import {
  CUSTOM_THEME_ID,
  type CustomTheme,
  DEFAULT_APP_DESCRIPTION,
  DEFAULT_APP_NAME,
  getThemeItemById,
} from "@shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  SettingsCardHeader,
  SettingsSaveBar,
  SettingsSectionStack,
} from "@/components/settings/settings-block";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useOnUnmount } from "@/lib/hooks/use-lifecycle";
import {
  organizationKeys,
  useOrganization,
  useUpdateAppearanceSettings,
  useUpdateAuthSettings,
} from "@/lib/organization.query";
import { applyCustomThemeCss, useOrgTheme } from "@/lib/theme.hook";
import { ChatLinksEditor } from "./_components/chat-links-editor";
import {
  type ChatLinkEditorValue,
  sanitizeChatLinks,
  validateChatLink,
} from "./_components/chat-links-editor.utils";
import { ChatPlaceholdersEditor } from "./_components/chat-placeholders-editor";
import { CustomThemeEditor } from "./_components/custom-theme-editor";
import { FaviconUpload } from "./_components/favicon-upload";
import { LogosSection } from "./_components/logos-section";
import { OAuthTokenLifetimeSection } from "./_components/oauth-token-lifetime-section";
import { OnboardingWizardEditor } from "./_components/onboarding-wizards-editor";
import {
  type OnboardingWizardValue,
  sanitizeOnboardingWizard,
  validateOnboardingWizard,
} from "./_components/onboarding-wizards-editor.utils";
import { OrganizationTokenSection } from "./_components/organization-token-section";
import { SiteNotificationsSection } from "./_components/site-notifications-section";
import { ThemeSelector } from "./_components/theme-selector";

export default function OrganizationSettingsPage() {
  const updateMutation = useUpdateAppearanceSettings(
    "Organization settings updated",
    "Failed to update organization settings",
  );
  const updateAuthSettingsMutation = useUpdateAuthSettings(
    "Auth settings updated",
    "Failed to update Auth settings",
  );
  const [hasThemeChanges, setHasThemeChanges] = useState(false);
  const queryClient = useQueryClient();
  const { data: organization } = useOrganization();

  const orgTheme = useOrgTheme();
  const {
    currentUITheme,
    themeFromBackend,
    customTheme: customThemeFromBackend,
    setPreviewTheme,
    applyThemeOnUI,
    saveAppearance,
    logo,
    logoDark,
    DEFAULT_THEME,
    isLoadingAppearance,
  } = orgTheme ?? {
    currentUITheme: "modern-minimal" as const,
    DEFAULT_THEME: "modern-minimal" as const,
    customTheme: null,
  };

  useOnUnmount(() => {
    if (themeFromBackend) {
      applyThemeOnUI?.(themeFromBackend);
      setPreviewTheme?.(themeFromBackend);
    }
    // Drop any in-flight custom-theme draft preview so the rest of the app
    // doesn't keep rendering unsaved CSS variables.
    applyCustomThemeCss(customThemeFromBackend ?? null);
  });

  const handleLogoChange = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: organizationKeys.details() });
  }, [queryClient]);

  // Field state for non-theme settings
  const [appName, setAppName] = useState<string | null>(null);
  const [ogDescription, setOgDescription] = useState<string | null>(null);
  const [footerText, setFooterText] = useState<string | null>(null);
  const [chatLinks, setChatLinks] = useState<ChatLinkEditorValue[] | null>(
    null,
  );
  const [showChatLinkValidationErrors, setShowChatLinkValidationErrors] =
    useState(false);
  // `undefined` = untouched (fall back to server value), `null` = explicitly cleared
  const [onboardingWizardDraft, setOnboardingWizardDraft] = useState<
    OnboardingWizardValue | null | undefined
  >(undefined);
  const [
    showOnboardingWizardValidationErrors,
    setShowOnboardingWizardValidationErrors,
  ] = useState(false);
  const [chatErrorSupportMessage, setChatErrorSupportMessage] = useState<
    string | null
  >(null);
  const [slimChatErrorUi, setSlimChatErrorUi] = useState<boolean | null>(null);
  const [chatPlaceholders, setChatPlaceholders] = useState<string[] | null>(
    null,
  );
  const [animateChatPlaceholders, setAnimateChatPlaceholders] = useState<
    boolean | null
  >(null);
  const [showTwoFactor, setShowTwoFactor] = useState<boolean | null>(null);
  // `undefined` = untouched; `null` = explicitly cleared
  const [customThemeDraft, setCustomThemeDraft] = useState<
    CustomTheme | null | undefined
  >(undefined);
  const [isCustomThemeDialogOpen, setIsCustomThemeDialogOpen] = useState(false);
  const [isCustomThemeValid, setIsCustomThemeValid] = useState(true);

  // Derived values (use local state if changed, otherwise org data)
  const effectiveAppName = appName ?? organization?.appName ?? "";
  const effectiveOgDescription =
    ogDescription ?? organization?.ogDescription ?? "";
  const effectiveFooterText = footerText ?? organization?.footerText ?? "";
  const effectiveChatLinks = chatLinks ?? organization?.chatLinks ?? [];
  const effectiveOnboardingWizard: OnboardingWizardValue | null =
    onboardingWizardDraft !== undefined
      ? onboardingWizardDraft
      : organization?.onboardingWizard
        ? {
            label: organization.onboardingWizard.label,
            pages: organization.onboardingWizard.pages.map((page) => ({
              image: page.image ?? null,
              content: page.content,
            })),
          }
        : null;
  const effectiveChatErrorSupportMessage =
    chatErrorSupportMessage ?? organization?.chatErrorSupportMessage ?? "";
  const effectiveSlimChatErrorUi =
    slimChatErrorUi ?? organization?.slimChatErrorUi ?? false;
  const effectiveChatPlaceholders =
    chatPlaceholders ?? organization?.chatPlaceholders ?? [];
  const effectiveAnimateChatPlaceholders =
    animateChatPlaceholders ?? organization?.animateChatPlaceholders ?? true;
  const effectiveShowTwoFactor =
    showTwoFactor ?? organization?.showTwoFactor ?? false;
  const liveChatLinkValidationErrors = effectiveChatLinks.map((link) =>
    validateChatLink(link),
  );
  const saveChatLinkValidationErrors = effectiveChatLinks.map((link) =>
    validateChatLink(link, { requireComplete: true }),
  );
  const hasLiveChatLinkValidationErrors = liveChatLinkValidationErrors.some(
    (errors) => !!errors.label || !!errors.url,
  );
  const displayedChatLinkValidationErrors = showChatLinkValidationErrors
    ? saveChatLinkValidationErrors
    : liveChatLinkValidationErrors;
  const hasChatLinkValidationErrors = saveChatLinkValidationErrors.some(
    (errors) => !!errors.label || !!errors.url,
  );

  const liveOnboardingWizardValidationError = validateOnboardingWizard(
    effectiveOnboardingWizard,
  );
  const saveOnboardingWizardValidationError = validateOnboardingWizard(
    effectiveOnboardingWizard,
    { requireComplete: true },
  );
  const hasLiveOnboardingWizardValidationError =
    !!liveOnboardingWizardValidationError.label ||
    !!liveOnboardingWizardValidationError.pages;
  const displayedOnboardingWizardValidationError =
    showOnboardingWizardValidationErrors
      ? saveOnboardingWizardValidationError
      : liveOnboardingWizardValidationError;
  const hasOnboardingWizardValidationError =
    !!saveOnboardingWizardValidationError.label ||
    !!saveOnboardingWizardValidationError.pages;

  const hasFieldChanges =
    appName !== null ||
    ogDescription !== null ||
    footerText !== null ||
    chatLinks !== null ||
    onboardingWizardDraft !== undefined ||
    chatErrorSupportMessage !== null ||
    slimChatErrorUi !== null ||
    chatPlaceholders !== null ||
    animateChatPlaceholders !== null ||
    showTwoFactor !== null ||
    customThemeDraft !== undefined;

  const effectiveCustomTheme: CustomTheme | null =
    customThemeDraft !== undefined
      ? customThemeDraft
      : (customThemeFromBackend ?? null);

  // Drive a live preview of the draft custom theme on the page underneath
  // the editor dialog. When the user navigates away from the `custom` theme,
  // the hook's own effect takes back over and clears the override.
  useEffect(() => {
    if (currentUITheme !== CUSTOM_THEME_ID) return;
    applyCustomThemeCss(effectiveCustomTheme);
  }, [currentUITheme, effectiveCustomTheme]);

  const handleSaveFields = async () => {
    const data: Record<string, unknown> = {};
    if (appName !== null) data.appName = appName || null;
    if (ogDescription !== null) data.ogDescription = ogDescription || null;
    if (footerText !== null) data.footerText = footerText || null;
    if (chatLinks !== null) {
      const sanitizedChatLinks = sanitizeChatLinks(chatLinks);
      data.chatLinks =
        sanitizedChatLinks.length > 0 ? sanitizedChatLinks : null;
    }
    if (onboardingWizardDraft !== undefined) {
      data.onboardingWizard = sanitizeOnboardingWizard(onboardingWizardDraft);
    }
    if (chatErrorSupportMessage !== null) {
      data.chatErrorSupportMessage = chatErrorSupportMessage.trim() || null;
    }
    if (slimChatErrorUi !== null) {
      data.slimChatErrorUi = slimChatErrorUi;
    }
    if (chatPlaceholders !== null)
      data.chatPlaceholders =
        chatPlaceholders.length > 0 ? chatPlaceholders : null;
    if (animateChatPlaceholders !== null) {
      data.animateChatPlaceholders = animateChatPlaceholders;
    }
    if (customThemeDraft !== undefined) {
      data.customTheme = customThemeDraft;
    }
    const updatedOrganization = await updateMutation.mutateAsync(data);
    if (!updatedOrganization) {
      return;
    }

    // Reset local state after save
    setAppName(null);
    setOgDescription(null);
    setFooterText(null);
    setChatLinks(null);
    setShowChatLinkValidationErrors(false);
    setOnboardingWizardDraft(undefined);
    setShowOnboardingWizardValidationErrors(false);
    setChatErrorSupportMessage(null);
    setSlimChatErrorUi(null);
    setChatPlaceholders(null);
    setAnimateChatPlaceholders(null);
    setShowTwoFactor(null);
    setCustomThemeDraft(undefined);
    setIsCustomThemeValid(true);
  };

  const handleSaveAuthFields = async () => {
    if (showTwoFactor === null) {
      return;
    }

    const updatedOrganization = await updateAuthSettingsMutation.mutateAsync({
      showTwoFactor,
    });
    if (!updatedOrganization) {
      return;
    }

    setShowTwoFactor(null);
  };

  if (isLoadingAppearance) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-lg text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <SettingsSectionStack>
      {/* Appearance Section */}
      <div>
        <h3 className="text-lg font-medium mb-4">Appearance</h3>
        <SettingsSectionStack>
          <LogosSection
            currentLogo={logo}
            currentLogoDark={logoDark}
            currentIconLogo={organization?.iconLogo}
            currentIconLogoDark={organization?.iconLogoDark}
            onChange={handleLogoChange}
          />
          <FaviconUpload
            currentFavicon={organization?.favicon}
            onFaviconChange={handleLogoChange}
          />
          <ThemeSelector
            selectedTheme={currentUITheme}
            onThemeSelect={(themeId) => {
              if (themeId === CUSTOM_THEME_ID) {
                // Seed the JSON from whichever theme the page is currently
                // showing so the dialog never opens against a blank canvas.
                if (effectiveCustomTheme === null) {
                  const seedFrom =
                    currentUITheme === CUSTOM_THEME_ID
                      ? themeFromBackend
                      : currentUITheme;
                  const seedItem = seedFrom
                    ? getThemeItemById(seedFrom)
                    : undefined;
                  if (seedItem) {
                    setCustomThemeDraft({
                      light: { ...seedItem.cssVars.light },
                      dark: { ...seedItem.cssVars.dark },
                    });
                  }
                }
                setIsCustomThemeDialogOpen(true);
              }
              setPreviewTheme?.(themeId);
              setHasThemeChanges(themeId !== themeFromBackend);
            }}
          />

          <CustomThemeEditor
            open={isCustomThemeDialogOpen}
            onOpenChange={setIsCustomThemeDialogOpen}
            value={effectiveCustomTheme}
            onChange={(next) => setCustomThemeDraft(next)}
            onValidityChange={setIsCustomThemeValid}
          />

          <Card>
            <SettingsCardHeader
              title="Branding"
              description="Customize your organization's browser tab title, OpenGraph description, footer text, chat links, and chat placeholders."
            />
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="appName">App Name</Label>
                <Input
                  id="appName"
                  placeholder={DEFAULT_APP_NAME}
                  value={effectiveAppName}
                  onChange={(e) => setAppName(e.target.value)}
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground">
                  Shown in the browser tab title. This also brands the built-in
                  MCP server name and built-in MCP tool names and prefix.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ogDescription">OpenGraph Description</Label>
                <Textarea
                  id="ogDescription"
                  placeholder={DEFAULT_APP_DESCRIPTION}
                  value={effectiveOgDescription}
                  onChange={(e) => setOgDescription(e.target.value)}
                  maxLength={500}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Used when sharing links to your platform.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="footerText">Footer Text</Label>
                <Textarea
                  id="footerText"
                  placeholder="Leave empty to show version number"
                  value={effectiveFooterText}
                  onChange={(e) => setFooterText(e.target.value)}
                  maxLength={500}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Custom text shown in the footer alongside the version number.
                </p>
              </div>
              <ChatLinksEditor
                links={effectiveChatLinks}
                validationErrors={displayedChatLinkValidationErrors}
                onChange={setChatLinks}
              />
              <OnboardingWizardEditor
                wizard={effectiveOnboardingWizard}
                validationError={displayedOnboardingWizardValidationError}
                onChange={setOnboardingWizardDraft}
                onPersist={async (sanitized) => {
                  const result = await updateMutation.mutateAsync({
                    onboardingWizard: sanitized,
                  });
                  if (!result) return false;
                  // Clear the draft so the settings save bar no longer flags
                  // onboarding as dirty.
                  setOnboardingWizardDraft(undefined);
                  setShowOnboardingWizardValidationErrors(false);
                  return true;
                }}
              />
              <div className="space-y-2">
                <Label htmlFor="chatErrorSupportMessage">
                  Support Contact Message
                </Label>
                <Input
                  id="chatErrorSupportMessage"
                  placeholder="e.g. Contact support@company.com for assistance and send us the information below"
                  value={effectiveChatErrorSupportMessage}
                  onChange={(e) => setChatErrorSupportMessage(e.target.value)}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground">
                  Shown alongside errors in chat. Use this to direct users to
                  your support team.
                </p>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <Label htmlFor="slimChatErrorUi">
                    Simplified Chat Error Cards
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Hide provider, model, stack trace, and raw error details in
                    chat. Users will only see the support message or default
                    error text plus correlation IDs.
                  </p>
                </div>
                <Switch
                  id="slimChatErrorUi"
                  className="mt-0.5"
                  checked={effectiveSlimChatErrorUi}
                  onCheckedChange={(checked) => setSlimChatErrorUi(checked)}
                />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <Label htmlFor="animateChatPlaceholders">
                    Animate Chat Placeholders
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Show the chat placeholder text with a typing animation.
                    Single placeholder entries always stay static.
                  </p>
                </div>
                <Switch
                  id="animateChatPlaceholders"
                  className="mt-0.5"
                  checked={effectiveAnimateChatPlaceholders}
                  onCheckedChange={(checked) =>
                    setAnimateChatPlaceholders(checked)
                  }
                />
              </div>
              <ChatPlaceholdersEditor
                placeholders={effectiveChatPlaceholders}
                onChange={setChatPlaceholders}
              />
            </CardContent>
          </Card>

          <SiteNotificationsSection />
        </SettingsSectionStack>
      </div>

      {/* Auth Section */}
      <div>
        <h3 className="text-lg font-medium mb-4">Auth</h3>
        <SettingsSectionStack>
          <OAuthTokenLifetimeSection />

          <Card>
            <SettingsCardHeader
              title="Two-Factor Authentication"
              description="Show 2FA setup to members in their authentication settings."
              action={
                <Switch
                  id="showTwoFactor"
                  checked={effectiveShowTwoFactor}
                  onCheckedChange={(checked) => setShowTwoFactor(checked)}
                />
              }
            />
          </Card>

          <OrganizationTokenSection />
        </SettingsSectionStack>
      </div>

      {/* Unified save bar for all changes (theme + fields) */}
      <SettingsSaveBar
        hasChanges={hasThemeChanges || hasFieldChanges}
        isSaving={
          updateMutation.isPending || updateAuthSettingsMutation.isPending
        }
        permissions={{ organizationSettings: ["update"] }}
        onSave={async () => {
          if (hasFieldChanges && hasChatLinkValidationErrors) {
            setShowChatLinkValidationErrors(true);
            return;
          }
          if (hasFieldChanges && hasOnboardingWizardValidationError) {
            setShowOnboardingWizardValidationErrors(true);
            return;
          }

          if (hasThemeChanges) {
            await saveAppearance?.(currentUITheme || DEFAULT_THEME);
            setHasThemeChanges(false);
          }
          if (hasFieldChanges && showTwoFactor !== null) {
            await handleSaveAuthFields();
          }
          if (
            hasFieldChanges &&
            (appName !== null ||
              ogDescription !== null ||
              footerText !== null ||
              chatLinks !== null ||
              onboardingWizardDraft !== undefined ||
              chatErrorSupportMessage !== null ||
              slimChatErrorUi !== null ||
              chatPlaceholders !== null ||
              animateChatPlaceholders !== null ||
              customThemeDraft !== undefined)
          ) {
            await handleSaveFields();
          }
        }}
        onCancel={() => {
          if (hasThemeChanges) {
            setPreviewTheme?.(themeFromBackend || DEFAULT_THEME);
            setHasThemeChanges(false);
          }
          setAppName(null);
          setOgDescription(null);
          setFooterText(null);
          setChatLinks(null);
          setShowChatLinkValidationErrors(false);
          setOnboardingWizardDraft(undefined);
          setShowOnboardingWizardValidationErrors(false);
          setChatErrorSupportMessage(null);
          setChatPlaceholders(null);
          setAnimateChatPlaceholders(null);
          setShowTwoFactor(null);
          setCustomThemeDraft(undefined);
          setIsCustomThemeValid(true);
        }}
        disabledSave={
          hasLiveChatLinkValidationErrors ||
          hasLiveOnboardingWizardValidationError ||
          !isCustomThemeValid
        }
      />
    </SettingsSectionStack>
  );
}
