// Pasted line breaks are harmless in body copy but make Resend reject subjects.
// Keep inbox metadata on one line without joining words across pasted lines.
export function cleanEmailHeaderText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}
