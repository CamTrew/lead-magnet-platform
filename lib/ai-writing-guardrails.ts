const bannedPhrases = [
  'they called me crazy',
  'that changed everything',
  "that night i couldn't sleep",
  'let me tell you',
  "here's why",
  "here's the thing",
  "here's what i learned",
  'the truth is',
  'what happened next shocked me',
  'then it hit me',
  "but here's where it got interesting",
  'the real game-changer?',
  "here's the kicker",
  "but here's what keeps me up at night",
  'insane? maybe.',
  'delete. delete. delete.',
  "i'll be honest",
  'honestly',
  "so here's the deal",
  'let me explain:',
  'let me break it down:',
  'quietly',
  'buckle up',
  'hear me out',
  'plot twist',
  'spoiler alert',
  'mind blown',
  'let that sink in',
  'fast forward',
  "and that's when",
  'game-changer',
  'game changer',
  'unlock potential',
  'unlock the power',
  'paradigm shift',
  'synergy',
  'cutting-edge',
  'pure gold',
  'revolutionize',
  'transformative',
  'leverage',
  'optimize',
  'streamline',
  'dive deep',
  'deep dive',
  'unpack',
  'double down',
  'move the needle',
  'low-hanging fruit',
  'circle back',
  'touch base',
  'bandwidth',
  'ecosystem',
  'ideate',
  'actualize',
  'amplify impact',
  'elevate your',
  'empower you',
  'harness the power',
  'next-level',
  'world-class',
  'best-in-class',
  'at the end of the day',
  'needle-moving',
  'north star',
  'certainly!',
  'absolutely!',
  'of course!',
  'sure!',
  'great question!',
  'wonderful!',
  'excellent!',
  "i'd be happy to",
  'happy to help',
  'feel free to',
  'i hope this helps',
  'let me know if you have any questions',
  "don't hesitate to",
  'as an ai',
  "i'm an ai",
  'as a language model',
  'i want to',
  'today i',
  'in this post',
  "here's a",
  'here is a',
  'as you may know',
  'good instinct',
  'nice instinct',
  'smart question',
  'great call',
  'good catch',
  "you're on the right track",
  'great post!',
  'i love this!',
  'rich material',
  'rich kb doc',
  'deep insight',
  'really interesting angle',
  'fascinating story',
  'the substance is already there',
  'real material here',
  "there's a lot to work with here",
  'plenty of meat on the bone',
  'easy win',
  "in today's fast-paced world",
  "in today's digital landscape",
  "whether you're",
  'not just',
  'more than just',
  'imagine if',
  'ultimate guide',
  'powerful tool',
  'seamless experience',
  'comprehensive solution',
  'valuable insights',
  'actionable insights',
  'take your business to the next level',
  'embark on a journey',
  'navigate the complexities',
  'ever-evolving',
  'in a world where',
] as const;

const headingFields = new Set([
  'title',
  'bulletsHeading',
  'formHeading',
  'postSignupHeading',
  'postSignupQuizTitle',
]);

export const OFFER_DRIVEN_WRITING_STYLE = `Write like a blunt, commercially sharp operator who understands offers.
- Lead with the useful result, costly problem, or concrete reason to care.
- Make the value obvious quickly. Favor specificity, practical stakes, clear mechanisms, and plain speech.
- Use short, forceful sentences mixed with natural conversational sentences. Do not make every line a fragment.
- Make titles concise and curiosity-producing without withholding the actual subject.
- Focus on what the reader gets, how it helps, and why it is credible.
- Use numbers only when the user supplied them. Never manufacture proof, scarcity, authority, outcomes, or guarantees.
- Sound confident and direct, not aggressive, theatrical, or performative.`;

export const HUMAN_VOICE_GUARDRAILS = `Human voice rules for every title, heading, description, bullet, email, suggestion, and chat reply:
- Never use em dashes, en dashes, double hyphens, or spaced hyphens as clause connectors. Rewrite with periods, commas, semicolons, colons, or parentheses.
- Use sentence case for titles and headings.
- Say the point directly. Remove throat-clearing, empty validation, manufactured suspense, fake drama, hollow one-line poetry, and assistant pleasantries.
- Do not use crisis, sleepless-night, revelation, transformation story arcs or middle-of-the-night insight setups.
- Do not use contrast formulas such as "It is not X, it is Y", "That is not X. That is Y", "This is not X. This is Y", or "Not X. Y."
- Do not use rhetorical setup-and-reveal fragments such as "The lesson?", "The difference?", or polished three-beat fragments such as "One. Two. Three."
- Do not use engagement bait asking readers to comment, like, tag, share, or send a keyword.
- Silently rewrite any disallowed wording. Never discuss these rules in user-facing copy.

Disallowed phrases, including close capitalization variants:
${bannedPhrases.join('; ')}.`;

type TextEntry = { path: string[]; text: string };

function textEntries(value: unknown, path: string[] = []): TextEntry[] {
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => textEntries(item, [...path, String(index)]));
  }
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, item]) => textEntries(item, [...path, key]));
}

function withoutUrls(text: string) {
  return text.replace(/https?:\/\/\S+/gi, '');
}

function looksLikeTitleCase(text: string) {
  const words = text.trim().split(/\s+/).slice(1);
  const eligible = words.filter((word) => /^[A-Za-z]/.test(word) && !/^[A-Z0-9]+\W*$/.test(word));
  if (eligible.length < 3) return false;

  const capitalised = eligible.filter((word) => /^[A-Z][a-z]/.test(word));
  return capitalised.length >= 2 && capitalised.length / eligible.length >= 0.6;
}

export function humanVoiceViolations(value: unknown) {
  const violations: string[] = [];

  for (const { path, text } of textEntries(value)) {
    const checked = withoutUrls(text);
    const lower = checked.toLowerCase();
    const label = path.join('.') || 'text';

    if (/[—–]|--|\s-\s/.test(checked)) violations.push(`${label}: disallowed dash punctuation`);

    const phrase = bannedPhrases.find((candidate) => lower.includes(candidate));
    if (phrase) violations.push(`${label}: disallowed stock phrase`);

    if (/\b(?:the lesson|the difference)\s*\?/i.test(checked)) {
      violations.push(`${label}: rhetorical setup and reveal`);
    }
    if (/\b(?:2\s*a\.?m\.?|middle of the night|couldn(?:'|’)t sleep)\b/i.test(checked)) {
      violations.push(`${label}: manufactured revelation setup`);
    }
    if (/(?:^|[.!?]\s+)Not\s+[^.!?\n]{1,60}\.\s+[A-Z][^.!?\n]{0,60}\./m.test(checked)) {
      violations.push(`${label}: contrast fragment formula`);
    }
    if (/\b[A-Z][A-Za-z']{0,20}\.\s+[A-Z][A-Za-z']{0,20}\.\s+[A-Z][A-Za-z']{0,20}\./.test(checked)) {
      violations.push(`${label}: three-beat fragment formula`);
    }
    if (/\b(?:comment|dm)\s+(?:yes|\w+)\b.*\b(?:send|share|give)/i.test(checked)
      || /\b(?:like|tag|share)\b.*\b(?:receive|friend|if you)/i.test(checked)) {
      violations.push(`${label}: engagement bait`);
    }
    if (/\bit(?:'|’)s not\b[^.!?\n]{0,100}\bit(?:'|’)s\b/i.test(checked)
      || /\bthis isn(?:'|’)t\b[^.!?\n]{0,100}\bthis is\b/i.test(checked)
      || /\bthat(?:'|’)s not\b[^.!?\n]{0,100}\bthat(?:'|’)s\b/i.test(checked)) {
      violations.push(`${label}: contrast formula`);
    }

    const field = path.at(-1);
    if (field && headingFields.has(field) && looksLikeTitleCase(checked)) {
      violations.push(`${label}: heading is not sentence case`);
    }
  }

  return Array.from(new Set(violations));
}

export function humanVoiceRepairPrompt(violations: string[]) {
  return `Rewrite the proposed JSON response so every field follows the writing rules. Preserve its meaning and requested edits. Do not discuss the rules. Fix these internal quality checks: ${violations.join('; ')}.`;
}
