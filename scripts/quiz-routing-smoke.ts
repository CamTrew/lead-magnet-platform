import assert from 'node:assert/strict';
import {
  isSafeQuizDestination,
  resolveQuizDestination,
} from '../lib/quiz-routing';

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

console.log('Quiz routing smoke test passed.');
