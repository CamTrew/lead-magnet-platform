import type { CampaignPackage } from "./campaign-schema";
export const exampleCampaign: CampaignPackage = {
  format: "checklist",
  title: "Price your next freelance project",
  audience: "Freelance designers preparing a project quote",
  resource: {
    introduction:
      "A good quote starts before you open a spreadsheet. Use this checklist to define the work, understand the cost, and send a proposal you can stand behind.",
    sections: [
      {
        heading: "Define the actual job",
        body: "Write the deliverables down before talking about a number. A website can mean a single page or a full content and design project. Name the parts you are responsible for.",
        items: [
          "List every page, asset, and handover file.",
          "Write down what the client will supply and when.",
          "Specify the number of revision rounds included.",
        ],
      },
      {
        heading: "Count the work around the work",
        body: "Include discovery, meetings, revisions, quality checks, and handover in your estimate. Compare it with a similar completed project if you have one.",
        items: [
          "Estimate time for each deliverable.",
          "Add time for feedback, administration, and testing.",
          "Identify dependencies that could change your estimate.",
        ],
      },
      {
        heading: "Build a quote with boundaries",
        body: "Explain the price alongside the scope. The client should be able to see what they get and how changes will be handled.",
        items: [
          "State the total fee and payment milestones.",
          "Include a process for work outside the agreed scope.",
          "Confirm the timeline, assumptions, and approval process.",
        ],
      },
      {
        heading: "Check before you send",
        body: "Read the proposal as if you were seeing the project for the first time. Ask a colleague to point out anything ambiguous.",
        items: [
          "Check that the scope and fee match.",
          "Verify every date and deliverable.",
          "End with one clear next step for the client.",
        ],
      },
    ],
    closing:
      "Save a copy of your estimate. After the project, compare it with the actual time spent. Use that difference to improve your next quote.",
  },
  page: {
    subtitle:
      "A practical checklist for freelance designers who want to send their next quote with confidence.",
    description:
      "Catch the work that gets missed before it eats into your fee.",
    bullets: [
      "Define what is included before quoting.",
      "Account for meetings, revisions, and handover.",
      "Explain your price with clear project boundaries.",
    ],
    bulletsHeading: "Inside the checklist",
    ctaText: "Send me the checklist",
    formHeading: "Make your next quote clearer",
    formSubtext:
      "Get the free checklist in your inbox.",
  },
  delivery: {
    subject: "Your project pricing checklist",
    preview: "Start with the deliverables for your next website project.",
    body: "Hey {name},\n\nHere's your project pricing checklist: [open the checklist]({resource_url}).\n\nI'd start with the scope section. Keep your current proposal open next to it and check what you've included for pages, handover files and rounds of feedback.\n\nThen work through the estimate. Meetings, revisions and testing all take time, so they need a place in the quote too.\n\nKeep a copy of the finished estimate. When the project wraps up, compare it with the time you actually spent. That gives you something concrete to work from next time.",
  },
  followUps: [],
  imagePrompt:
    "An editorial still life of a neatly arranged design proposal, a black pencil, and folded warm-white paper on a cream surface. Small orange accent. Soft directional studio light. No words, logos, numbers, or letters.",
};
