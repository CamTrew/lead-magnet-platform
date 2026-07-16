import { z } from 'zod';

const copyField = (max: number) => z.string().trim().min(1).max(max).optional();

export const leadMagnetCopilotPatchSchema = z.object({
  title: copyField(160),
  subtitle: copyField(240),
  description: copyField(5000),
  bullets: z.array(z.string().trim().min(1).max(220)).min(1).max(20).optional(),
  bulletsHeading: copyField(140),
  ctaText: copyField(80),
  formHeading: copyField(140),
  formSubtext: copyField(240),
  emailSubject: copyField(180),
  emailPreview: copyField(240),
  emailBody: copyField(10000),
  postSignupHeading: copyField(160),
  postSignupBody: copyField(5000),
  postSignupCtaLabel: copyField(80),
}).strict();

export const leadMagnetCopilotFollowUpUpdateSchema = z.object({
  id: z.string().trim().min(1).max(80),
  subject: copyField(180),
  preview: copyField(240),
  body: copyField(10000),
}).strict();

export const leadMagnetCopilotResponseSchema = z.object({
  reply: z.string().trim().min(1).max(1800),
  updates: leadMagnetCopilotPatchSchema,
  followUpEmailUpdates: z.array(leadMagnetCopilotFollowUpUpdateSchema).max(10),
}).strict();

export const leadMagnetCopilotMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
}).strict();

const followUpDraftSchema = z.object({
  id: z.string().trim().min(1).max(80),
  subject: z.string().max(180),
  preview: z.string().max(240),
  body: z.string().max(10000),
}).strict();

export const leadMagnetCopilotDraftSchema = z.object({
  title: z.string().max(160),
  subtitle: z.string().max(240),
  description: z.string().max(5000),
  bullets: z.array(z.string().max(220)).max(20),
  bulletsHeading: z.string().max(140),
  ctaText: z.string().max(80),
  formHeading: z.string().max(140),
  formSubtext: z.string().max(240),
  emailSubject: z.string().max(180),
  emailPreview: z.string().max(240),
  emailBody: z.string().max(10000),
  postSignupHeading: z.string().max(160),
  postSignupBody: z.string().max(5000),
  postSignupCtaLabel: z.string().max(80),
  followUpEmails: z.array(followUpDraftSchema).max(10),
}).strict();

export const leadMagnetCopilotRequestSchema = z.object({
  messages: z.array(leadMagnetCopilotMessageSchema).min(1).max(20),
  draft: leadMagnetCopilotDraftSchema,
}).strict().superRefine((value, ctx) => {
  const conversationLength = value.messages.reduce((total, message) => total + message.content.length, 0);
  if (conversationLength > 24_000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'This chat is getting long. Start a new chat and continue from the updated draft.',
      path: ['messages'],
    });
  }
});

export type LeadMagnetCopilotPatch = z.infer<typeof leadMagnetCopilotPatchSchema>;
export type LeadMagnetCopilotFollowUpUpdate = z.infer<typeof leadMagnetCopilotFollowUpUpdateSchema>;
export type LeadMagnetCopilotResponse = z.infer<typeof leadMagnetCopilotResponseSchema>;
export type LeadMagnetCopilotMessage = z.infer<typeof leadMagnetCopilotMessageSchema>;
export type LeadMagnetCopilotDraft = z.infer<typeof leadMagnetCopilotDraftSchema>;
