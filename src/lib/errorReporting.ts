import { trackEvent } from './analytics';
import { VERSION } from '../version';

type ClientErrorCategory = 'insert_before' | 'remove_child' | 'tx' | 'max_size' | 'other';

interface ErrorReportingOptions {
  pageType: string;
}

interface NormalizedClientError {
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stackHead?: string;
}

let installed = false;

function trim(value: string | undefined, max = 180): string | undefined {
  if (!value) return undefined;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function normalizeReason(reason: unknown): NormalizedClientError {
  if (reason instanceof Error) {
    return {
      message: reason.message || reason.name,
      stackHead: trim(reason.stack?.split('\n').slice(0, 3).join(' | '), 260),
    };
  }
  if (typeof reason === 'string') return { message: reason };
  try {
    return { message: JSON.stringify(reason) || 'Unknown promise rejection' };
  } catch {
    return { message: 'Unknown promise rejection' };
  }
}

function normalizeErrorEvent(event: ErrorEvent): NormalizedClientError {
  const fromError = event.error instanceof Error ? normalizeReason(event.error) : null;
  return {
    message: event.message || fromError?.message || 'Unknown client error',
    source: event.filename || undefined,
    line: event.lineno || undefined,
    column: event.colno || undefined,
    stackHead: fromError?.stackHead,
  };
}

export function getClientErrorCategory(message: string): ClientErrorCategory {
  const lower = message.toLowerCase();
  if (lower.includes('insertbefore')) return 'insert_before';
  if (lower.includes('removechild') || lower.includes('remove child')) return 'remove_child';
  if (lower.includes('maximum size') || lower.includes('maximum call stack') || lower.includes('quotaexceeded')) return 'max_size';
  if (/\btx\b/.test(lower) || lower.includes("evaluating 'tx'") || lower.includes('evaluating "tx"')) return 'tx';
  return 'other';
}

export function getClientErrorSignature(message: string): string {
  const category = getClientErrorCategory(message);
  return `${category}:${message.toLowerCase().replace(/\s+/g, ' ').slice(0, 96)}`;
}

function getUserAgentFamily(): string {
  const ua = navigator.userAgent;
  if (ua.includes('YaBrowser')) return 'yandex';
  if (ua.includes('Edg/')) return 'edge';
  if (ua.includes('OPR/') || ua.includes('Opera')) return 'opera';
  if (ua.includes('Firefox/')) return 'firefox';
  if (ua.includes('Chrome/')) return 'chrome';
  if (ua.includes('Safari/')) return 'safari';
  return 'other';
}

function clarityEventName(category: ClientErrorCategory): string {
  switch (category) {
    case 'insert_before': return 'js_error_insert_before';
    case 'remove_child': return 'js_error_remove_child';
    case 'tx': return 'js_error_tx';
    case 'max_size': return 'js_error_max_size';
    default: return 'js_error_other';
  }
}

function reportClientError(error: NormalizedClientError, pageType: string): void {
  const message = trim(error.message || 'Unknown client error') ?? 'Unknown client error';
  const category = getClientErrorCategory(message);

  trackEvent('client_error_captured', {
    message,
    signature: getClientErrorSignature(message),
    source: trim(error.source, 160),
    line: error.line,
    column: error.column,
    stack_head: error.stackHead,
    path: window.location.pathname,
    page_type: pageType,
    app_version: VERSION,
    user_agent_family: getUserAgentFamily(),
  });

  try {
    window.clarity?.('event', clarityEventName(category));
  } catch {
    // Clarity must never become another source of user-facing errors.
  }
}

export function installClientErrorReporting({ pageType }: ErrorReportingOptions): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', event => {
    reportClientError(normalizeErrorEvent(event), pageType);
  });

  window.addEventListener('unhandledrejection', event => {
    reportClientError(normalizeReason(event.reason), pageType);
  });
}
