export type AssistantProvider = 'ChatGPT' | 'Claude';

export const SAVED_LEAD_MAGNET_PROMPT = 'Using Magnets, create a new lead magnet document from scratch using my saved idea and brand.';

// Prefill a complete unsent draft. A URL cannot select a custom app or open
// its mention picker: the user enables Magnets through ChatGPT's composer.
export function chatgptCreateUrl(resumeSavedIdea = true) {
  const prompt = resumeSavedIdea ? SAVED_LEAD_MAGNET_PROMPT : 'Help me create a lead magnet with Magnets.';
  return `https://chatgpt.com/?${new URLSearchParams({ prompt, surface: 'work' })}`;
}

export const CHATGPT_CREATE_URL = chatgptCreateUrl();

// Prefills a draft only. The user still enables Magnets and sends the message.
// Keep saved ideas, brand details and account credentials out of external URLs.
export function claudeCreateUrl(resumeSavedIdea = true) {
  const prompt = resumeSavedIdea ? SAVED_LEAD_MAGNET_PROMPT : 'Help me create a lead magnet with Magnets.';
  return `https://claude.ai/new?${new URLSearchParams({ q: prompt })}`;
}

// Claude documents this prefilled form, not an automatic installation or consent.
// https://github.com/anthropics/claude-ai-mcp/issues/74
export function assistantSetupUrl(provider: AssistantProvider, origin: string) {
  if (provider === 'ChatGPT') return 'https://chatgpt.com/plugins';
  const url = new URL('https://claude.ai/customize/connectors');
  url.search = new URLSearchParams({
    modal: 'add-custom-connector',
    connectorName: 'Magnets',
    connectorUrl: `${new URL(origin).origin}/mcp/workspace`,
  }).toString();
  return url.toString();
}

// Display-only attribution. OAuth token validation remains the authority for access.
export function assistantProvider(name: string, redirectUri: string): AssistantProvider | null {
  try {
    const host = new URL(redirectUri).hostname.toLowerCase();
    const matches = (domain: string) => host === domain || host.endsWith(`.${domain}`);
    if (matches('chatgpt.com') || matches('openai.com')) return 'ChatGPT';
    if (matches('claude.ai') || matches('claude.com')) return 'Claude';
  } catch { /* Older/custom clients may only have a recognizable display name. */ }
  const chatgpt = /\bchatgpt\b/i.test(name);
  const claude = /\bclaude\b/i.test(name);
  return chatgpt !== claude ? (chatgpt ? 'ChatGPT' : 'Claude') : null;
}

export function hasAssistantConnection(connections: readonly { provider?: AssistantProvider | null }[], provider: AssistantProvider | null) {
  return provider !== null && connections.some(connection => connection.provider === provider);
}

// Older creation-only grants remain valid, but cannot satisfy workspace consent.
export function hasWorkspaceAssistantConnection(connections: readonly { provider?: AssistantProvider | null; access?: string }[], provider: AssistantProvider | null) {
  return provider !== null && connections.some(connection => connection.provider === provider && connection.access === 'workspace');
}
