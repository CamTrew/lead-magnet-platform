import { CAMPAIGN_COMPLETION_GUIDANCE } from "@/lib/campaign-content";
import { CAMPAIGN_ARTWORK_GUIDANCE, CAMPAIGN_ARTWORK_OFFER } from "@/lib/campaign-artwork-guidance";
import { registerWorkspaceTools, WORKSPACE_ASSISTANT_INSTRUCTIONS } from '@/lib/assistant-workspace';
import { uploadAssistantResource, ASSISTANT_FILE_MAX_BYTES } from '@/lib/assistant-resource-upload';
import { LeadMagnetCreationLimitError, leadMagnetCreationLimitDetails } from '@/lib/lead-magnet-creation-limit';
import { MAX_LEAD_MAGNET_CREATIONS_PER_WINDOW, LEAD_MAGNET_CREATION_WINDOW_SECONDS } from '@/lib/limits';
import { readAssistantBody } from "@/lib/assistant-request";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { campaignImageBrief } from "@/lib/campaign-image-brand";
import { attachCampaignCover } from "@/lib/campaign-cover";
import { GRAPHIC_FORMAT, GRAPHIC_SOURCE_LIMIT, renderCampaignGraphic, parseCampaignGraphic } from "@/lib/campaign-graphic";
import {
  assistantEnabled,
  assistantOrigin,
  ASSISTANT_SCOPE,
  WORKSPACE_ASSISTANT_SCOPE,
  tokenHash,
} from "@/lib/assistant-auth";
import {
  authenticateAssistantToken,
  getCreationRequest,
  getCreationBrand,
  creationBrandVersion,
  getCampaign,
  getCampaignForEditing,
  updateCampaignCopy,
  listCampaigns,
} from "@/lib/platform-store";
import {
  campaignPackageSchema,
  campaignChangesSchema,
  CAMPAIGN_WRITING_INSTRUCTIONS,
  FOLLOW_UP_CHOICE_QUESTION,
  RESOURCE_CHOICE_QUESTION,
  validateCampaignPackage,
} from "@/lib/campaign-schema";
import { publishCampaign, campaignLinks, createAndPublishCampaign } from "@/lib/campaign-service";
import {
  enforceRateLimits,
  RateLimitError,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { humanVoiceViolations } from "@/lib/ai-writing-guardrails";
import { invalidatePublishedLeadMagnetCache } from "@/lib/public-lead-magnet-cache";
import { log } from "@/lib/logger";
const result = (value: Record<string, unknown>, logoImage?: { type: "image"; mimeType: "image/png"; data: string }) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }, ...(logoImage ? [logoImage] : [])],
  structuredContent: value,
});
export async function handleAssistantMcp(request: Request, workspace = false) {
  if (!assistantEnabled()) return new Response(null, { status: 404 });
  const origin = assistantOrigin(),
    resource = `${origin}/mcp${workspace ? "/workspace" : ""}`;
  const scope = workspace ? WORKSPACE_ASSISTANT_SCOPE : ASSISTANT_SCOPE;
  const instructions = CAMPAIGN_WRITING_INSTRUCTIONS + (workspace ? `\n${WORKSPACE_ASSISTANT_INSTRUCTIONS}` : "");
  const auth = request.headers.get("authorization") || "";
  const grant = auth.startsWith("Bearer ")
    ? await authenticateAssistantToken(tokenHash(auth.slice(7)), resource)
    : null;
  if (!grant)
    return Response.json(
      { error: "unauthorized" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp${workspace ? "/workspace" : ""}", scope="${scope}"`,
          "Cache-Control": "no-store",
        },
      },
    );
  // Browser-origin requests are not required for remote server-to-server MCP.
  if (request.headers.get("origin") && request.headers.get("origin") !== origin)
    return new Response(null, { status: 403 });
  try {
    await enforceRateLimits([
      {
        scope: "assistant:tools",
        identifier: grant.account_id,
        limit: 120,
        windowSeconds: 3600,
      },
    ]);
    const raw = await readAssistantBody(request, 2 * 1024 * 1024);
    const body = JSON.parse(raw);
    const server = new McpServer(
      { name: "Magnets", version: "0.1.0" },
      { instructions },
    );
    const securitySchemes = [{ type: "oauth2", scopes: [scope] }];
    server.registerTool(
      "get_creation_guide",
      {
        description:
          "Get the creation instructions and saved idea. First establish whether the user already has a resource or wants to create one together in chat, unless they already made that choice.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
        _meta: { securitySchemes },
      },
      async () => {
        const [savedBrief, brand] = await Promise.all([
          getCreationRequest(grant.account_id), getCreationBrand(grant.account_id),
        ]);
        return result({
          instructions,
          workspaceAccess: workspace,
          workspaceConnectionUrl: `${origin}/mcp/workspace`,
          resourceChoice: {
            question: RESOURCE_CHOICE_QUESTION,
            askBeforeGenerating: true,
            skipIfAlreadyAnswered: true,
            explicitNewResourceIntent: "Create a new document or create from scratch means create_together is already selected. Do not ask whether they already have a resource. Use the saved idea and brand and begin creating.",
            appliesTo: "new_campaigns_only",
            options: [
              { value: "existing", label: "I already have a lead magnet", nextStep: "Ask for their file or Magnets Hosted resources link. Deliver the original resource unchanged, and build the page and email around it." },
              { value: "create_together", label: "Let's create one together", nextStep: "Use their saved idea and brand to develop a new resource in this chat. Clarify only missing audience or outcome details." },
            ],
          },
          emailChoice: { question: FOLLOW_UP_CHOICE_QUESTION, askBeforeSaving: true, skipIfAlreadyAnswered: true, supportedFollowUpCount: [1, 2, 3], followUpDaysAfterSignup: [1, 4, 9] },
          creationLimit: { limit: MAX_LEAD_MAGNET_CREATIONS_PER_WINDOW, windowSeconds: LEAD_MAGNET_CREATION_WINDOW_SECONDS, sharedAcross: 'Manual creation, ChatGPT, Claude and campaign imports. Editing does not count.' },
          files: { uploadTool: "upload_resource", maxChatUploadBytes: ASSISTANT_FILE_MAX_BYTES, uploadPageUrl: `${origin}/dashboard/resources`, maxDashboardUploadBytes: 50 * 1024 * 1024, instruction: "Use the exact user-selected file when requested. If attachment bytes are unavailable, ask for upload through Hosted resources and the resulting resource link; never invent an upload or replace it with a generated PDF." },
          savedBrief,
          // Appearance only. Inline logos can be large and never need to enter model context.
          brand: brand ? { name: brand.logoText.slice(0, 80), primary: brand.primary,
            accent: brand.accent, pageTheme: brand.pageTheme, hasLogo: Boolean(brand.logoUrl) } : null,
          formats: [
            "checklist",
            "cheat-sheet",
            "worksheet",
            "guide",
            "templates",
          ],
        });
      },
    );
    server.registerTool(
      "upload_resource",
      {
        description: "Upload an original file the user explicitly wants to offer as their lead magnet, without changing its bytes. Requires actual file bytes, not extracted text or an attachment URL. Up to 1 MB; larger files or inaccessible attachment bytes must use uploadPageUrl. Identical filename/bytes retry safely. Stores privately in the account's Hosted resources and returns its resourceId for save_campaign.resource.hostedResource. Does not create or publish a campaign.",
        inputSchema: { filename: z.string().trim().min(1).max(240), fileBase64: z.string().min(1).max(1400000) },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        _meta: { securitySchemes },
      },
      async ({ filename, fileBase64 }) => {
        try {
          await enforceRateLimits([{ scope: 'assistant:file-upload', identifier: grant.account_id, limit: 20, windowSeconds: 3600 }]);
          const uploaded = await uploadAssistantResource(grant.account_id, filename, fileBase64);
          return result({ uploaded: true, resourceId: uploaded.id, filename: uploaded.originalFilename, contentType: uploaded.contentType, sizeBytes: uploaded.sizeBytes, uploadPageUrl: `${origin}/dashboard/resources`, nextStep: 'Use resource:{hostedResource:resourceId} in save_campaign. Base the page and email on the original file. Do not generate replacement content.' });
        } catch (error) {
          log.warn('Assistant file upload failed', { route: '/mcp', accountId: grant.account_id, extra: { error } });
          return { ...result({ uploaded: false, message: 'File upload did not complete. Check the file type and size, then retry the original bytes or use Hosted resources. Do not create a replacement PDF or claim the file was uploaded.', uploadPageUrl: `${origin}/dashboard/resources`, maxChatUploadBytes: ASSISTANT_FILE_MAX_BYTES }), isError: true };
        }
      },
    );
    server.registerTool(
      "save_campaign",
      {
        description:
          "Save a lead magnet using either a generated resource or the exact user-selected file via resource.hostedResource (a resourceId from upload_resource or their Magnets /resources/ link), plus page, delivery email, optional explicitly requested follow-ups and image prompt and automatically publish its landing page when URL and email delivery setup are ready. Before drafting, ask whether they already have a lead magnet or want to create one together, unless already answered. Also ask whether they want delivery only or follow-up emails too, unless already answered. Wait for their choice before saving. Tell the user creation makes the page public. Use a unique requestId per new campaign and reuse it when retrying. Does not send email until someone signs up.",
        inputSchema: {
          requestId: z.string().min(8).max(100),
          brief: z.string().max(1200),
          campaign: campaignPackageSchema,
          followUpsRequested: z.boolean().default(false).describe("Ask delivery-only or follow-ups before saving unless already answered. True only after the user chooses follow-ups and their number (1–3); false for delivery only, with followUps: []."),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
        _meta: { securitySchemes },
      },
      async ({ requestId, brief, campaign, followUpsRequested }) => {
        const content = validateCampaignPackage(campaign);
        const creation = await createAndPublishCampaign(
          grant.account_id,
          requestId,
          brief,
          content,
          origin,
          { followUpsRequested },
        ).catch((error: unknown) => {
          if (error instanceof LeadMagnetCreationLimitError) return error;
          throw error;
        });
        if (creation instanceof LeadMagnetCreationLimitError) {
          return { ...result(leadMagnetCreationLimitDetails(creation)), isError: true };
        }
        const { campaign: row, publicationError } = creation;
        const imageBrief = await campaignImageBrief(row.content, await getCreationBrand(grant.account_id));
        const links = await campaignLinks(grant.account_id, row, origin, true);
        return result({
          imageGeneration: imageBrief.imageGeneration,
          campaignId: row.id,
          publicationError,
          ...links,
          cover:
            "Images are optional. No placeholder artwork is added. Real artwork can be attached separately.",
          message: CAMPAIGN_COMPLETION_GUIDANCE,
        }, imageBrief.logoImage);
      },
    );
    server.registerTool(
      "list_campaigns",
      {
        description:
          "List campaigns created through this workflow. Does not expose subscribers or integration credentials.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
        _meta: { securitySchemes },
      },
      async () =>
        result({
          campaigns: (await listCampaigns(grant.account_id)).map((c) => ({
            id: c.id,
            title: c.content.title,
            status: c.published_at ? "published" : "draft",
            reviewUrl: `${origin}/create?campaign=${c.id}`,
            editorUrl: c.lead_magnet_id ? `${origin}/dashboard/pages/${c.lead_magnet_id}` : null,
            publicUrl: c.published_at && c.lead_magnet_id ? `${origin}/p/${c.lead_magnet_id}` : null,
            audienceUrl: `${origin}/dashboard/signups`,
          })),
        }),
    );
    server.registerTool(
      "get_campaign",
      {
        description:
          "Read current campaign copy and editVersion before editing. Also call immediately before generating any cover image: imageGeneration contains the current saved brand, prompt, logo reference and brandVersion. Includes page-editor changes.",
        inputSchema: { campaignId: z.string().uuid() },
        annotations: { readOnlyHint: true },
        _meta: { securitySchemes },
      },
      async ({ campaignId }) => {
        const editable = await getCampaignForEditing(grant.account_id, campaignId);
        if (!editable) throw new Error("Campaign not found.");
        const row = editable.campaign;
        const imageBrief = await campaignImageBrief(editable.content, await getCreationBrand(grant.account_id));
        const links = await campaignLinks(grant.account_id, row, origin);
        return result({
          id: row.id,
          content: editable.content,
          editVersion: editable.editVersion,
          followUpsEnabled: editable.magnet.followUpEnabled,
          ...links,
          published: links.status === 'published',
          imageOffer: !row.cover_data ? CAMPAIGN_ARTWORK_OFFER : null,
          imagePrompt: imageBrief.imageGeneration.prompt,
          imageGeneration: imageBrief.imageGeneration,
          hasCustomImage: Boolean(row.cover_data),
        }, imageBrief.logoImage);
      },
    );
    server.registerTool(
      "update_campaign",
      {
        description: "Edit only requested copy in an existing campaign: resource, title, landing page, delivery email or image prompt, or add, rename, reorder or remove signup fields and dropdown options in changes.page.signupFields. Send the complete revised list with stable field IDs. Removing a question keeps past signup answers. First read get_campaign and supply editVersion. Published copy changes go live immediately and require explicit user permission via confirmLiveEdit. Follow-ups can only be added/removed on never-published drafts with no automation; use the editor for existing sequences. Does not send emails or change publishing, images, domains, subscribers or settings.",
        inputSchema: {
          campaignId: z.string().uuid(),
          editVersion: z.string().regex(/^[a-f0-9]{64}$/),
          changes: campaignChangesSchema,
          confirmLiveEdit: z.boolean().default(false),
          followUpsRequested: z.boolean().default(false),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        _meta: { securitySchemes },
      },
      async ({ campaignId, editVersion, changes, confirmLiveEdit, followUpsRequested }) => {
        const violations = humanVoiceViolations(changes);
        if (violations.length) throw new Error(`Revise the copy before saving: ${violations.slice(0,12).join('; ')}`);
        const edited = await updateCampaignCopy(grant.account_id, campaignId, editVersion, changes, { confirmLiveEdit, followUpsRequested });
        invalidatePublishedLeadMagnetCache();
        return result({ updated: true, editVersion: edited.editVersion,
          ...await campaignLinks(grant.account_id, edited.campaign, origin),
          message: 'The requested changes are saved. Return the edit link and the live link if present. No emails have been sent.' });
      },
    );
    server.registerTool(
      "attach_campaign_cover",
      {
        description:
          `Attach a generated image or a code-created graphic exported to PNG. ${CAMPAIGN_ARTWORK_GUIDANCE}`,
        inputSchema: {
          campaignId: z.string().uuid(),
          imageBase64: z.string().min(1).max(1400000),
          confirmLiveEdit: z.boolean().default(false),
          brandVersion: z.string().regex(/^[a-f0-9]{64}$/).optional().describe("Use imageGeneration.brandVersion from the get_campaign call immediately before generation. Rejects attachment if saved branding changed. Optional only for older clients."),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
        _meta: { securitySchemes },
      },
      async ({ campaignId, imageBase64, brandVersion, confirmLiveEdit }) => {
        await attachCampaignCover(grant.account_id, campaignId, imageBase64, brandVersion, confirmLiveEdit);
        const row = await getCampaign(grant.account_id, campaignId);
        if (!row) throw new Error("Campaign not found.");
        return result({ attached: true, ...await campaignLinks(grant.account_id, row, origin),
          message: "The generated image is now the landing-page image and campaign thumbnail. Return the live link if present, plus the editor and audience links." });
      },
    );
    const graphicInput = {
      campaignId: z.string().uuid(),
      svg: z.string().min(1).max(GRAPHIC_SOURCE_LIMIT).describe(GRAPHIC_FORMAT),
      brandVersion: z.string().regex(/^[a-f0-9]{64}$/).describe('Use the fresh imageGeneration.brandVersion from get_campaign.'),
    };
    async function checkGraphicOwnerAndBrand(campaignId: string, brandVersion: string) {
      const campaign = await getCampaign(grant!.account_id, campaignId);
      if (!campaign) throw new Error('Campaign not found.');
      const brand = await getCreationBrand(grant!.account_id);
      if (!brand || creationBrandVersion(brand) !== brandVersion) throw new Error('Your saved brand changed. Call get_campaign and preview the graphic with the current brand.');
      return campaign;
    }
    server.registerTool('preview_campaign_graphic', {
      description: `For Claude or any assistant unable to transfer binary files: send your compact SVG drawing here. Magnets renders a PNG and returns it as an image for inspection, plus sourceHash. No external network access, base64 transcription, paid image API or page change is needed. Reuse the same SVG source in attach_campaign_graphic after approval. ${GRAPHIC_FORMAT}`,
      inputSchema: graphicInput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: { securitySchemes },
    }, async ({ campaignId, svg, brandVersion }) => {
      await checkGraphicOwnerAndBrand(campaignId, brandVersion);
      const graphic = await renderCampaignGraphic(svg);
      return result({ preview: true, attached: false, sourceHash: graphic.sourceHash, brandVersion,
        width: graphic.width, height: graphic.height,
        message: 'Inspect and show this rendered PNG. No page was changed. Once attachment is authorized, call attach_campaign_graphic with the exact same svg, sourceHash and brandVersion. Do not copy the PNG base64 into a tool call.' },
      { type: 'image', mimeType: 'image/png', data: graphic.png.toString('base64') });
    });
    server.registerTool('attach_campaign_graphic', {
      description: 'Attach the exact graphic previewed with preview_campaign_graphic. Send its original compact SVG and returned sourceHash, not PNG base64. Magnets renders and saves the PNG using the existing image upload safeguards. Explain that this updates the live page; set confirmLiveEdit:true only after attachment is authorized. Do not silently redraw a previously approved PNG as a different graphic; show the new preview if recreating it.',
      inputSchema: { ...graphicInput, sourceHash: z.string().regex(/^[a-f0-9]{64}$/), confirmLiveEdit: z.boolean().default(false) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: { securitySchemes },
    }, async ({ campaignId, svg, sourceHash, brandVersion, confirmLiveEdit }) => {
      await checkGraphicOwnerAndBrand(campaignId, brandVersion);
      if (parseCampaignGraphic(svg).sourceHash !== sourceHash) throw new Error('The drawing differs from the preview. Call preview_campaign_graphic again and use its sourceHash.');
      const graphic = await renderCampaignGraphic(svg);
      await attachCampaignCover(grant!.account_id, campaignId, graphic.png.toString('base64'), brandVersion, confirmLiveEdit);
      const campaign = await getCampaign(grant!.account_id, campaignId);
      if (!campaign) throw new Error('Campaign not found.');
      return result({ attached: true, ...await campaignLinks(grant!.account_id, campaign, origin),
        message: 'The graphic is now the landing-page image and thumbnail. Return the live page link if present, plus the editor and audience links.' });
    });
    server.registerTool(
      "publish_campaign",
      {
        description:
          "Publish a reviewed campaign and activate a follow-up sequence only if one was explicitly requested. Call only after the user explicitly asks to publish this campaign. Returns its public URL. Finish with that link, make clear it is live, offer to improve it together in chat, and invite them to write their own post and start capturing emails. Never generate promotional post copy.",
        inputSchema: {
          campaignId: z.string().uuid(),
          confirmPublication: z.literal(true),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
        _meta: { securitySchemes },
      },
      async ({ campaignId }) =>
        result(await publishCampaign(grant.account_id, campaignId)),
    );
    if (workspace) registerWorkspaceTools(server, grant.account_id, request);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request, { parsedBody: body });
    } finally {
      await server.close();
    }
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    log.warn("Assistant request failed", {
      route: "/mcp",
      accountId: grant.account_id,
      extra: { error },
    });
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: "Request failed. Retry or review the campaign in Magnets.",
        },
      },
      { status: 500 },
    );
  }
}
