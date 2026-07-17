import type {
  PostSignupQuizQuestion,
  PostSignupQuizRoute,
} from './types';

export type QuizAnswerSelection = {
  questionId: string;
  optionId: string;
};

/** Remove route conditions that no longer point to a current question/answer pair. */
export function pruneQuizRouteConditions(
  questions: PostSignupQuizQuestion[],
  routes: PostSignupQuizRoute[]
) {
  const optionIdsByQuestion = new Map(
    questions.map((question) => [
      question.id,
      new Set(question.options.map((option) => option.id)),
    ])
  );

  return routes.map((route) => ({
    ...route,
    conditions: route.conditions.filter((condition) =>
      optionIdsByQuestion.get(condition.questionId)?.has(condition.optionId)
    ),
  }));
}

export function isSafeQuizDestination(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Routes are evaluated in their configured order after the final answer.
 * A route only applies when every condition is present in the submitted set.
 */
export function resolveQuizDestination(
  questions: PostSignupQuizQuestion[],
  routes: PostSignupQuizRoute[],
  answers: QuizAnswerSelection[]
) {
  const selected = new Set(answers.map((answer) => `${answer.questionId}:${answer.optionId}`));

  for (const route of routes) {
    if (!isSafeQuizDestination(route.destinationUrl) || route.conditions.length === 0) continue;
    if (route.conditions.every((condition) => selected.has(`${condition.questionId}:${condition.optionId}`))) {
      return route.destinationUrl;
    }
  }

  // Keep existing quizzes working. Legacy destination URLs are evaluated only
  // after the last answer, with the latest question taking precedence.
  for (const question of [...questions].reverse()) {
    const answer = answers.find((candidate) => candidate.questionId === question.id);
    const option = question.options.find((candidate) => candidate.id === answer?.optionId);
    if (option && isSafeQuizDestination(option.destinationUrl)) return option.destinationUrl;
  }

  return '';
}

export function resolveQuizProgress(
  questions: PostSignupQuizQuestion[],
  routes: PostSignupQuizRoute[],
  answers: QuizAnswerSelection[]
) {
  const completed = questions.length > 0 && questions.every((question) =>
    answers.some((answer) => answer.questionId === question.id)
  );

  return {
    completed,
    destinationUrl: completed ? resolveQuizDestination(questions, routes, answers) : '',
  };
}
