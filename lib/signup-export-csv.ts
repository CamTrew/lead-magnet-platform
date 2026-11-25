import type { getSignupExportData } from './platform-store';

const standardHeaders = ['Email', 'Name', 'Lead magnet', 'Lead magnet slug', 'Signed up at', 'Last signed up at', 'Signup count'];

function csvRow(cells: string[]) {
  return cells.map(value => {
    // Field names and answers are user-controlled and may be opened in a spreadsheet.
    const literal = /^\s*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value;
    return /[",\r\n]/.test(literal) ? '"' + literal.replace(/"/g, '""') + '"' : literal;
  }).join(',');
}

export function signupExportCsv({ signups, magnets, answers }: Awaited<ReturnType<typeof getSignupExportData>>) {
  const columns = new Map<string, {label: string; slug: string}>();
  const slugs = new Map(magnets.map(magnet => [magnet.id, magnet.slug]));
  for (const magnet of magnets) {
    for (const field of magnet.fields) {
      columns.set(magnet.id + '/' + field.id, {label: field.label, slug: magnet.slug});
    }
  }

  const values = new Map<string, Map<string, string>>();
  for (const { email, magnet_id, answer } of answers) {
    const key = magnet_id + '/' + answer.id;
    // Answers arrive newest first, so a retired field gets its last recorded label.
    if (!columns.has(key)) columns.set(key, {label: answer.label, slug: slugs.get(magnet_id) || magnet_id});
    const byField = values.get(email) || new Map<string, string>();
    byField.set(key, answer.value);
    values.set(email, byField);
  }

  const counts = new Map<string, number>();
  for (const {label} of columns.values()) {
    const key = label.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const headers = [...standardHeaders];
  const used = new Set(headers.map(header => header.toLowerCase()));
  for (const {label, slug} of columns.values()) {
    const key = label.toLowerCase();
    const base = counts.get(key)! > 1 || used.has(key) ? label + ' (' + slug + ')' : label;
    let header = base;
    for (let suffix = 2; used.has(header.toLowerCase()); suffix++) header = base + ' ' + suffix;
    headers.push(header);
    used.add(header.toLowerCase());
  }

  const keys = [...columns.keys()];
  const rows = [csvRow(headers)];
  for (const signup of signups) {
    const byField = values.get(signup.email.toLowerCase());
    rows.push(csvRow([
      signup.email, signup.name, signup.firstLeadMagnetTitle, signup.firstLeadMagnetSlug,
      new Date(signup.firstSignupAt).toISOString(), new Date(signup.latestSignupAt).toISOString(),
      String(signup.signupCount), ...keys.map(key => byField?.get(key) || ''),
    ]));
  }
  return rows.join('\n') + '\n';
}
