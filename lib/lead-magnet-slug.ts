// Suggestions only: never apply this to an existing URL or a manually chosen slug.
const FILLER = new Set('a an and are as at be best by can do does for from get how in into is it its of on or our should that the their these this to top use using want what when which who why will with you your next ways way'.split(' '));
const MAX_BASE_LENGTH = 28;

export function suggestLeadMagnetSlug(title: string): string {
  const words = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b\d+\s*[-–]?\s*(?:minutes?|mins?|hours?|days?|weeks?|months?)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter(word => word && !FILLER.has(word) && !/^\d+$/.test(word));
  const selected: string[] = [];
  for (const word of [...new Set(words)]) {
    if (selected.length === 3) break;
    if ([...selected, word].join('-').length > MAX_BASE_LENGTH) {
      if (!selected.length) selected.push(word.slice(0, MAX_BASE_LENGTH));
      break;
    }
    selected.push(word);
  }
  return selected.join('-') || 'resource';
}
