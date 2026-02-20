/**
 * Format provider codes for display
 * Combines multiple provider codes with " - " separator
 * Only shows non-empty codes
 * 
 * @example
 * formatProviderCodes("1231015", "1231015", "") → "1231015 - 1231015"
 * formatProviderCodes("558888", "", "") → "558888"
 * formatProviderCodes("", "1230464", "") → "1230464"
 */
export function formatProviderCodes(
  code1: string | null | undefined,
  code2: string | null | undefined,
  code3: string | null | undefined = ""
): string {
  const codes = [code1, code2, code3]
    .filter(code => code && code.trim() !== "")
    .map(code => code!.trim());
  
  return codes.length > 0 ? codes.join(" - ") : "";
}
