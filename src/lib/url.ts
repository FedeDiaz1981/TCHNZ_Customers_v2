export function safeParseAbsoluteUrl(value: string | undefined | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed);
  } catch {
    if (!trimmed.includes("://")) {
      try {
        return new URL(`https://${trimmed}`);
      } catch {
        return null;
      }
    }

    return null;
  }
}
