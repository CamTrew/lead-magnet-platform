import assert from 'node:assert/strict';
import {
  isSafeQuizDestination,
  pruneQuizRouteConditions,
  resolveQuizDestination,
  resolveQuizProgress,
} from '../lib/quiz-routing';
import { validateQuizConfiguration } from '../lib/lead-magnet-validation';
import {
  isSafePostSignupDestination,
  postSignupVideoEmbedUrl,
  resolvePostSignupExperience,
} from '../lib/post-signup';

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
assert.equal(isSafePostSignupDestination('https://example.com/next'), true);
assert.equal(isSafePostSignupDestination('javascript:alert(1)'), false);
assert.equal(postSignupVideoEmbedUrl('https://youtu.be/video-id'), 'https://www.youtube.com/embed/video-id');
assert.equal(postSignupVideoEmbedUrl('https://www.youtube.com/watch?v=watch-id'), 'https://www.youtube.com/embed/watch-id');
assert.equal(postSignupVideoEmbedUrl('https://www.loom.com/share/loom-id'), 'https://www.loom.com/embed/loom-id');
assert.equal(postSignupVideoEmbedUrl('https://example.com/video'), '');
assert.equal(postSignupVideoEmbedUrl('https://notyoutube.com/watch?v=fake'), '');

const experienceBase = {
  postSignupMode: 'message' as const,
  postSignupRedirectUrl: '',
  postSignupQuizEnabled: false,
  postSignupQuizQuestions: questions,
};
assert.deepEqual(resolvePostSignupExperience(experienceBase), { kind: 'message' });
assert.deepEqual(
  resolvePostSignupExperience({
    ...experienceBase,
    postSignupMode: 'redirect',
    postSignupRedirectUrl: 'https://example.com/redirect',
  }),
  { kind: 'redirect', url: 'https://example.com/redirect' }
);
assert.deepEqual(
  resolvePostSignupExperience({
    ...experienceBase,
    postSignupMode: 'redirect',
    postSignupRedirectUrl: 'javascript:alert(1)',
  }),
  { kind: 'message' },
  'An unsafe redirect must fall back to the standard confirmation.'
);
assert.deepEqual(
  resolvePostSignupExperience({
    ...experienceBase,
    postSignupMode: 'page',
    postSignupRedirectUrl: 'https://google.com/stale-redirect',
  }),
  { kind: 'page' }
);
assert.deepEqual(
  resolvePostSignupExperience({
    ...experienceBase,
    postSignupMode: 'page',
    postSignupRedirectUrl: 'https://google.com/stale-redirect',
    postSignupQuizEnabled: true,
  }),
  { kind: 'quiz' },
  'A stale redirect URL must never override the selected custom-page or quiz mode.'
);
assert.deepEqual(
  resolvePostSignupExperience({
    ...experienceBase,
    postSignupMode: 'page',
    postSignupQuizEnabled: true,
    postSignupQuizQuestions: [],
  }),
  { kind: 'page' },
  'A page with no valid quiz questions must still show its custom next step.'
);

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

assert.deepEqual(
  resolveQuizProgress(
    questions,
    [{
      id: 'positioning-team',
      destinationUrl: 'https://example.com/positioning-team',
      conditions: [
        { questionId: 'goal', optionId: 'positioning' },
        { questionId: 'team-size', optionId: 'team' },
      ],
    }],
    [{ questionId: 'goal', optionId: 'positioning' }]
  ),
  { completed: false, destinationUrl: '' },
  'A partial quiz must not redirect early.'
);

assert.deepEqual(
  resolveQuizProgress(
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
  { completed: true, destinationUrl: 'https://example.com/positioning-team' }
);

const questionsWithSharedOptionIds = [
  {
    id: 'first',
    prompt: 'First?',
    options: [
      { id: 'yes', label: 'Yes', destinationUrl: '' },
      { id: 'no', label: 'No', destinationUrl: '' },
    ],
  },
  {
    id: 'second',
    prompt: 'Second?',
    options: [
      { id: 'yes', label: 'Yes', destinationUrl: '' },
      { id: 'no', label: 'No', destinationUrl: '' },
    ],
  },
];
const sharedIdRoutes = [{
  id: 'shared-ids',
  destinationUrl: 'https://example.com/shared',
  conditions: [
    { questionId: 'first', optionId: 'yes' },
    { questionId: 'second', optionId: 'yes' },
    { questionId: 'deleted', optionId: 'yes' },
  ],
}];
assert.deepEqual(
  pruneQuizRouteConditions(questionsWithSharedOptionIds, sharedIdRoutes)[0].conditions,
  [
    { questionId: 'first', optionId: 'yes' },
    { questionId: 'second', optionId: 'yes' },
  ],
  'Stale conditions are cleared by question/answer pair without affecting matching IDs on other questions.'
);
assert.deepEqual(
  pruneQuizRouteConditions(questionsWithSharedOptionIds.slice(1), sharedIdRoutes)[0].conditions,
  [{ questionId: 'second', optionId: 'yes' }],
  'Removing a question clears only that question state.'
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
