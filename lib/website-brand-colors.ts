/** Bounded static CSS inspection. No page scripts or remote CSS imports are executed. */
export function brandHex(value: string) {
  const match = value.trim().match(/^#([a-f\d]{3}|[a-f\d]{6})$/i);
  if (!match) return null;
  const hex = match[1];
  return '#' + (hex.length === 3 ? [...hex].map(c => c + c).join('') : hex).toUpperCase();
}

function colorHex(value: string): string | null {
  const clean = value.trim().replace(/\s*!important\s*$/i, '');
  const hex = brandHex(clean);
  if (hex) return hex;
  const match = clean.match(/^(rgb|rgba|hsl|hsla)\(([^()]+)\)$/i);
  if (!match) return null;
  const parts = match[2].replace(/[,/]/g, ' ').trim().split(/\s+/);
  // Translucent shadows, borders and hover tints aren't the underlying brand colour.
  if (parts.length < 3 || parts.length > 4 || (parts[3] && !['1', '100%'].includes(parts[3]))) return null;
  if (parts.some(part => !/^-?(?:\d*\.)?\d+(?:%|deg)?$/.test(part))) return null;
  let rgb: number[];
  if (match[1].toLowerCase().startsWith('rgb')) {
    if (parts.slice(0, 3).some(part => part.endsWith('deg'))) return null;
    rgb = parts.slice(0, 3).map(part => Number.parseFloat(part) * (part.endsWith('%') ? 2.55 : 1));
  } else {
    if (!parts[1].endsWith('%') || !parts[2].endsWith('%')) return null;
    const hue = ((Number.parseFloat(parts[0]) % 360) + 360) % 360 / 60;
    const saturation = Number.parseFloat(parts[1]) / 100, lightness = Number.parseFloat(parts[2]) / 100;
    if (saturation < 0 || saturation > 1 || lightness < 0 || lightness > 1) return null;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs(hue % 2 - 1)), m = lightness - chroma / 2;
    rgb = (hue < 1 ? [chroma,x,0] : hue < 2 ? [x,chroma,0] : hue < 3 ? [0,chroma,x] : hue < 4 ? [0,x,chroma] : hue < 5 ? [x,0,chroma] : [chroma,0,x]).map(n => (n + m) * 255);
  }
  if (rgb.some(n => !Number.isFinite(n) || n < 0 || n > 255.00001)) return null;
  return '#' + rgb.map(n => Math.round(n).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function extractBrandColors(source: string, html?: string) {
  const css = source.slice(0, 2 * 1024 * 1024).replace(/\/\*[\s\S]*?\*\//g, '');
  const variables = new Map<string, string>();
  // Read root declarations first, so a later dark-mode override cannot replace
  // the base palette. Other scoped declarations are not global brand evidence.
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/(?:^|,)\s*(?::root|html|:host)(?:\s*,|\s*$)/.test(rule[1]) && !/^\s*@theme\b/.test(rule[1])) continue;
    for (const entry of rule[2].matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
      if (!variables.has(entry[1])) variables.set(entry[1], entry[2].trim());
    }
  }
  function resolve(value: string, seen = new Set<string>()): string {
    if (seen.size >= 8) return '';
    return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]+))?\)/g, (_m, key: string, fallback: string) => {
      if (seen.has(key)) return '';
      return resolve(variables.get(key) || fallback || '', new Set([...seen, key]));
    });
  }
  function variableColor(names: string[]) {
    for (const name of names) {
      const value = resolve(variables.get('--' + name) || '');
      const color = colorHex(value) || colorHex(`hsl(${value})`);
      if (color) return color;
    }
    return null;
  }
  const primary = variableColor(['primary','primary-color','color-primary','brand','brand-color','brand-primary','color-brand','brand-orange']);
  const accent = variableColor(['accent','accent-color','color-accent','secondary','secondary-color','brand-secondary','color-secondary']);
  const usedClasses = html === undefined ? null : new Set([...html.matchAll(/\bclass\s*=\s*["']([^"']*)["']/gi)].flatMap(m => m[1].split(/\s+/)));
  const candidates: {color: string; role: 'primary' | 'accent'; score: number}[] = [];
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of rule[1].split(',')) {
      // Only base classes used by this page count. Ignore hover/focus variants,
      // unrelated framework utilities, and compound selectors we cannot resolve.
      const match = selector.trim().match(/^\.([a-zA-Z_][\w-]*)$/);
      if (!match || (usedClasses && !usedClasses.has(match[1]))) continue;
      const name = match[1].toLowerCase();
      if (!/(?:^|-)(?:brand|primary|accent|secondary)(?:-|$)/.test(name) || /(?:^|-)(?:foreground|light|muted|disabled)(?:-|$)/.test(name)) continue;
      const role = /(?:^|-)(?:accent|secondary)(?:-|$)/.test(name) ? 'accent' : 'primary';
      const shade = name.match(/-(\d{2,3})$/);
      if (shade && Number(shade[1]) < 400) continue;
      const button = /(?:^|-)(?:btn|button)(?:-|$)/.test(name);
      for (const declaration of rule[2].matchAll(/(?:^|;)\s*(background-color|background|color)\s*:\s*([^;]+)/g)) {
        if (button && declaration[1] === 'color') continue;
        const color = colorHex(resolve(declaration[2]));
        if (!color) continue;
        const score = (button ? 100 : declaration[1].startsWith('background') ? 60 : 40) + (/primary|accent|secondary/.test(name) ? 20 : 0) - (shade ? Math.abs(Number(shade[1]) - 600) / 100 : 0);
        candidates.push({color, role, score});
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return {primary: primary || candidates.find(c => c.role === 'primary')?.color || null, accent: accent || candidates.find(c => c.role === 'accent')?.color || null};
}
