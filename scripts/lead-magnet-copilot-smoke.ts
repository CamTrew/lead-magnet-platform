import assert from 'node:assert/strict';
import { humanVoiceViolations } from '../lib/ai-writing-guardrails';
import {
  LEAD_MAGNET_COPILOT_INSTRUCTIONS,
  selectCopilotConversationMemory,
} from '../lib/lead-magnet-copilot-prompt';

const longConversation = Array.from({ length: 80 }, (_, index) => ({
  role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
  content: index === 0
    ? 'This is for freelance designers who need to price brand projects.'
    : index === 79
      ? 'Use the warmer headline we agreed on, but keep the pricing promise.'
      : `Exchange ${index}: ${'context '.repeat(80)}`,
}));

const selected = selectCopilotConversationMemory(longConversation, 8_000);
assert.equal(selected[0].content, longConversation[0].content, 'keeps the original audience context');
assert.equal(selected.at(-1)?.content, longConversation.at(-1)?.content, 'keeps the current request');
assert.ok(
  selected.reduce((total, message) => total + message.content.length, 0) <= 8_000,
  'keeps model memory inside the character budget'
);

assert.match(LEAD_MAGNET_COPILOT_INSTRUCTIONS, /Ask at most one focused question/i);
assert.match(LEAD_MAGNET_COPILOT_INSTRUCTIONS, /Never invent proof/i);
assert.match(LEAD_MAGNET_COPILOT_INSTRUCTIONS, /not a chatbot/i);
assert.match(LEAD_MAGNET_COPILOT_INSTRUCTIONS, /perceived value/i);

assert.ok(humanVoiceViolations({ title: 'The ultimate guide for your business' }).length > 0);
assert.ok(humanVoiceViolations({ reply: "Whether you're a founder or freelancer, this is for you." }).length > 0);
assert.deepEqual(humanVoiceViolations({ title: 'Price brand projects without second-guessing the quote' }), []);

console.log('Lead magnet copilot memory and voice checks passed.');
