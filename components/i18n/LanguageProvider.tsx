"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

export type Language = "zh" | "en";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = "systemcraft-language";
const DEFAULT_LANGUAGE: Language = "en";

function readBrowserLanguage(): Language {
  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (stored === "zh" || stored === "en") {
    return stored;
  }

  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const [hasHydrated, setHasHydrated] = useState(false);

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((current) => (current === "zh" ? "en" : "zh"));
  }, []);

  useEffect(() => {
    setLanguageState(readBrowserLanguage());
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.language = language;
  }, [hasHydrated, language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage
    }),
    [language, setLanguage, toggleLanguage]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider.");
  }

  return context;
}

export function useLocalizedText() {
  const { language } = useLanguage();

  return useCallback(
    (zh: string, en: string) => (language === "zh" ? zh : en),
    [language]
  );
}

export function LanguageToggle({
  className = "",
  variant = "dark"
}: {
  className?: string;
  variant?: "dark" | "light";
}) {
  const { language, toggleLanguage } = useLanguage();
  const isChinese = language === "zh";

  return (
    <button
      type="button"
      className={`language-toggle language-toggle-${variant} ${className}`}
      onClick={toggleLanguage}
      aria-label={isChinese ? "Switch to English" : "切换到中文"}
    >
      <span>{isChinese ? "中文" : "English"}</span>
      <strong>{isChinese ? "EN" : "中"}</strong>
    </button>
  );
}
