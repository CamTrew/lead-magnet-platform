const KEY = "magnets:creation-brief:v1";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// Keep the brief out of URLs, referrer headers, and server access logs.
export function saveCreationBrief(brief: string) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        brief: brief.trim().slice(0, 1200),
        savedAt: Date.now(),
      }),
    );
  } catch {
    /* Storage can be unavailable in private browsers. */
  }
}
export function readCreationBrief(): string {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "null");
    if (
      typeof value?.brief === "string" &&
      typeof value.savedAt === "number" &&
      Date.now() - value.savedAt < MAX_AGE
    )
      return value.brief.slice(0, 1200);
    localStorage.removeItem(KEY);
  } catch {
    /* A malformed or unavailable draft should never block auth. */
  }
  return "";
}
export function clearCreationBrief() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
