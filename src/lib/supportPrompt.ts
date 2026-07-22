export const SUPPORT_URL = 'https://boosty.to/klussforge';
export const SUPPORT_PROMPT_STORAGE_KEY = 'mapkluss_support_prompt_hidden_until';
export const SUPPORT_PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

type SupportPromptStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function shouldShowSupportPrompt(
  storage: Pick<SupportPromptStorage, 'getItem'> | null | undefined,
  now = Date.now(),
): boolean {
  if (!storage) return true;
  try {
    const raw = storage.getItem(SUPPORT_PROMPT_STORAGE_KEY);
    if (!raw) return true;
    const hiddenUntil = Number(raw);
    return !Number.isFinite(hiddenUntil) || hiddenUntil <= now;
  } catch {
    return true;
  }
}

export function deferSupportPrompt(
  storage: Pick<SupportPromptStorage, 'setItem'> | null | undefined,
  now = Date.now(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SUPPORT_PROMPT_STORAGE_KEY, String(now + SUPPORT_PROMPT_COOLDOWN_MS));
  } catch {
    // The prompt remains dismissible for the current page even if storage is unavailable.
  }
}
