import type { PostSignupQuizQuestion, PostSignupQuizRoute } from './types';

export interface LeadMagnetValidationIssue {
  message: string;
  path: Array<string | number>;
}

export function validateQuizConfiguration({
  published,
  questions,
  routes,
}: {
  published: boolean;
  questions: PostSignupQuizQuestion[];
  routes: PostSignupQuizRoute[];
}): LeadMagnetValidationIssue[] {
  const issues: LeadMagnetValidationIssue[] = [];
  const questionIds = new Set<string>();
  const optionsByQuestion = new Map<string, Set<string>>();

  questions.forEach((question, questionIndex) => {
    if (questionIds.has(question.id)) {
      issues.push({
        message: `Quiz question ${questionIndex + 1} has a duplicate internal ID. Remove it and add it again.`,
        path: ['postSignupQuizQuestions', questionIndex, 'id'],
      });
    }
    questionIds.add(question.id);

    const optionIds = new Set<string>();
    question.options.forEach((option, optionIndex) => {
      if (optionIds.has(option.id)) {
        issues.push({
          message: `Question ${questionIndex + 1} has a duplicate answer. Remove it and add it again.`,
          path: ['postSignupQuizQuestions', questionIndex, 'options', optionIndex, 'id'],
        });
      }
      optionIds.add(option.id);
    });
    optionsByQuestion.set(question.id, optionIds);
  });

  const routeIds = new Set<string>();
  routes.forEach((route, routeIndex) => {
    if (routeIds.has(route.id)) {
      issues.push({
        message: `Quiz route ${routeIndex + 1} has a duplicate internal ID. Remove it and add it again.`,
        path: ['postSignupQuizRoutes', routeIndex, 'id'],
      });
    }
    routeIds.add(route.id);

    if (published && !route.destinationUrl.trim()) {
      issues.push({
        message: `Quiz route ${routeIndex + 1} needs a destination URL before publishing.`,
        path: ['postSignupQuizRoutes', routeIndex, 'destinationUrl'],
      });
    }
    if (published && route.conditions.length === 0) {
      issues.push({
        message: `Quiz route ${routeIndex + 1} needs at least one matching answer before publishing.`,
        path: ['postSignupQuizRoutes', routeIndex, 'conditions'],
      });
    }

    const conditionedQuestions = new Set<string>();
    route.conditions.forEach((condition, conditionIndex) => {
      const conditionPath = ['postSignupQuizRoutes', routeIndex, 'conditions', conditionIndex];
      if (conditionedQuestions.has(condition.questionId)) {
        issues.push({
          message: `Quiz route ${routeIndex + 1} can only choose one answer per question.`,
          path: [...conditionPath, 'questionId'],
        });
      }
      conditionedQuestions.add(condition.questionId);

      const optionIds = optionsByQuestion.get(condition.questionId);
      if (!optionIds) {
        issues.push({
          message: `Quiz route ${routeIndex + 1} refers to a question that no longer exists.`,
          path: [...conditionPath, 'questionId'],
        });
      } else if (!optionIds.has(condition.optionId)) {
        issues.push({
          message: `Quiz route ${routeIndex + 1} refers to an answer that no longer exists.`,
          path: [...conditionPath, 'optionId'],
        });
      }
    });
  });

  return issues;
}
