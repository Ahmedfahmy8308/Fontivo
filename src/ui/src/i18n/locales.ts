// Fontivo Multilingual Language Packs (i18n)
import { ar } from "./ar";
import { en } from "./en";

export interface LanguageOption {
  code: string;
  name: string;
  dir: "rtl" | "ltr";
  flag: string;
}

export type TranslationDictionary = Record<string, string>;

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "ar", name: "العربية", dir: "rtl", flag: "AR" },
  { code: "en", name: "English", dir: "ltr", flag: "EN" },
];

export const translations: Record<string, TranslationDictionary> = {
  ar,
  en,
};
