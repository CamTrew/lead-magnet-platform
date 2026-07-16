import assert from 'node:assert/strict';
import {
  isSafeQuizDestination,
  resolveQuizDestination,
} from '../lib/quiz-routing';
import { validateQuizConfiguration } from '../lib/lead-magnet-validation';

const questions = [
  {
    id: 'goal',
    prompt: 'What do you want to improve?',
    options: [
      { id: 'pipeline', label: 'Pipeline', destinationUrl: '' },
      { id: 'positioning', label: 'Positioning', destinationUrl: 'https://example.com/positioning' },
    ],
  },
  {
    id: 'team-size',
    prompt: 'How large is your team?',
    options: [
      { id: 'solo', label: 'Just me', destinationUrl: '' },
      { id: 'team', label: 'A team', destinationUrl: '' },
    ],
  },
];

assert.equal(isSafeQuizDestination('https://example.com/next'), true);
assert.equal(isSafeQuizDestination('http://example.com/next'), true);
assert.equal(isSafeQuizDestination('javascript:alert(1)'), false);
assert.equal(isSafeQuizDestination('/relative-url'), false);

assert.equal(
  resolveQuizDestination(
    questions,
    [{
      id: 'positioning-team',
      destinationUrl: 'https://example.com/positioning-team',
      conditions: [
        { questionId: 'goal', optionId: 'positioning' },
        { questionId: 'team-size', optionId: 'team' },
      ],
    }],
    [
      { questionId: 'goal', optionId: 'positioning' },
      { questionId: 'team-size', optionId: 'team' },
    ]
  ),
  'https://example.com/positioning-team'
);

assert.equal(
  resolveQuizDestination(
    questions,
    [{
      id: 'unsafe-route',
      destinationUrl: 'javascript:alert(1)',
      conditions: [{ questionId: 'goal', optionId: 'pipeline' }],
    }],
    [{ questionId: 'goal', optionId: 'pipeline' }]
  ),
  ''
);

assert.equal(
  resolveQuizDestination(
    questions,
    [],
    [{ questionId: 'goal', optionId: 'positioning' }]
  ),
  'https://example.com/positioning'
);

assert.deepEqual(
  validateQuizConfiguration({
    published: true,
    questions,
    routes: [{
      id: 'valid-route',
      destinationUrl: 'https://example.com/next',
      conditions: [{ questionId: 'goal', optionId: 'pipeline' }],
    }],
  }),
  []
);

const invalidRouteIssues = validateQuizConfiguration({
  published: true,
  questions,
  routes: [{
    id: 'invalid-route',
    destinationUrl: '',
    conditions: [{ questionId: 'goal', optionId: 'deleted-option' }],
  }],
});
assert.equal(invalidRouteIssues.some((issue) => issue.message.includes('destination URL')), true);
assert.equal(invalidRouteIssues.some((issue) => issue.message.includes('no longer exists')), true);

assert.equal(
  validateQuizConfiguration({
    published: false,
    questions,
    routes: [{ id: 'draft-route', destinationUrl: '', conditions: [] }],
  }).length,
  0,
  'Incomplete routes must remain valid while the page is a draft.'
);

console.log('Quiz routing smoke test passed.');
