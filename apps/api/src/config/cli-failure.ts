/**
 * Stable, sanitized text for CLI failure exits.
 *
 * Mongoose and network errors can contain connection strings, credentials or
 * stack traces. Entry points deliberately discard the underlying error text.
 */
export function cliFailureMessage(label: string, _error?: unknown): string {
  return `[${label}] failed. Check environment configuration and database availability; details are not printed.`;
}
