export type UiLang = 'sv' | 'en';

/** Swedish if the phone is set to sv, otherwise English. */
export function uiLang(language?: string): UiLang {
  const value =
    language ??
    (typeof navigator !== 'undefined' ? navigator.language : 'en');
  return value.toLowerCase().startsWith('sv') ? 'sv' : 'en';
}

export const LOADS_FROM_KRAFT = 'loads-from-kraft';

export function loadsFromKraftLabel(lang: UiLang = uiLang()): string {
  return lang === 'sv' ? 'Belastning från Kraft' : 'Loads from Kraft';
}

export function localizePlanLabel(label: string | null | undefined, lang: UiLang = uiLang()): string | null {
  if (!label) return label ?? null;
  if (label !== LOADS_FROM_KRAFT) return label;
  return loadsFromKraftLabel(lang);
}
