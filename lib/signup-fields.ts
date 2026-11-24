import { z } from 'zod';

export const MAX_DROPDOWN_OPTIONS = 30;

const fieldId = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/i);
export const signupFieldsSchema = z.array(z.object({
  id: fieldId.describe('Stable identifier, e.g. business-website. Preserve it when editing.'),
  label: z.string().trim().min(1).max(100),
  format: z.enum(['text', 'url', 'choice']),
  required: z.boolean(),
  choices: z.array(z.string().trim().min(1).max(100)).max(MAX_DROPDOWN_OPTIONS).default([]),
}).strict()).max(12).superRefine((fields, ctx) => {
  const labels = new Set(['name', 'email']);
  const ids = new Set<string>();
  for (const [index, field] of fields.entries()) {
    const label = field.label.toLowerCase();
    if (labels.has(label) || ids.has(field.id)) ctx.addIssue({code:'custom', path:[index], message:'Give each extra field a unique name and ID.'});
    labels.add(label);
    ids.add(field.id);
    if (field.format === 'choice' ? field.choices.length < 2 || new Set(field.choices).size !== field.choices.length : field.choices.length > 0)
      ctx.addIssue({code:'custom', path:[index,'choices'], message:'Only dropdowns have options. Supply at least two different options.'});
  }
});
export type SignupField = z.infer<typeof signupFieldsSchema>[number];
export type SignupAnswer = { id: string; label: string; value: string };
export const submittedFieldsSchema = z.array(z.object({ id: fieldId, value: z.string().trim().max(2048) }).strict()).max(12);

export function resolveSignupAnswers(fields: SignupField[], input: z.infer<typeof submittedFieldsSchema>) {
  const values = new Map(input.map(answer => [answer.id, answer.value]));
  if (values.size !== input.length || input.some(answer => !fields.some(field => field.id === answer.id))) throw new Error('The signup form changed. Refresh the page and try again.');
  const answers: SignupAnswer[] = [];
  for (const field of fields) {
    const value = values.get(field.id);
    if (!value) {
      if (field.required) throw new Error('Please complete the field “' + field.label + '”.');
      continue;
    }
    if (field.format === 'choice' && !field.choices.includes(value)) throw new Error('Choose a listed option for “' + field.label + '”.');
    if (field.format === 'url' && (!URL.canParse(value) || !['https:', 'http:'].includes(new URL(value).protocol))) throw new Error('Enter a full website address for “' + field.label + '”.');
    answers.push({id:field.id, label:field.label, value});
  }
  return answers;
}
