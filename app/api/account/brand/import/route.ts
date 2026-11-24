import { z } from 'zod';
import { getCurrentDashboardBase } from '@/lib/auth';
import { assistantEnabled } from '@/lib/assistant-auth';
import { readAssistantBody } from '@/lib/assistant-request';
import { getBrandImportVersion, applyImportedBrand } from '@/lib/platform-store';
import { importWebsiteBrand } from '@/lib/website-brand';
import { validateLogoDataUrl } from '@/lib/upload';
import { enforceRateLimits, RateLimitError, rateLimitResponse } from '@/lib/rate-limit';
import { invalidatePublishedLeadMagnetCache } from '@/lib/public-lead-magnet-cache';
export const runtime='nodejs';
export const maxDuration=30;

export async function POST(request:Request) {
  if(!assistantEnabled())return new Response(null,{status:404});
  const payload=await getCurrentDashboardBase();if(!payload)return new Response(null,{status:401});
  try {
    const {website}=z.object({website:z.string().trim().min(3).max(2048)}).strict().parse(JSON.parse(await readAssistantBody(request,5000)));
    await enforceRateLimits([{scope:'brand:import',identifier:payload.account.id,limit:12,windowSeconds:3600}]);
    const version=await getBrandImportVersion(payload.account.id);
    const suggestion=await importWebsiteBrand(website);
    return Response.json({suggestion,version},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    if(error instanceof RateLimitError)return rateLimitResponse(error);
    return Response.json({error:'We could not read that website. Use a public HTTPS page, try again, or keep your current branding.'},{status:400});
  }
}
const hex=z.string().regex(/^#[a-fA-F0-9]{6}$/);
const changesSchema=z.object({name:z.string().trim().min(1).max(80).optional(),primary:hex.optional(),accent:hex.optional(),
  logo:z.string().max(670000).refine(value=>Boolean(value)&&validateLogoDataUrl(value,{maxBytes:500000,maxLength:670000}).ok,'Use a valid raster logo under 500 KB.').optional(),
}).strict().refine(value=>Object.keys(value).length>0,'Select at least one brand detail.');
export async function PUT(request:Request) {
  if(!assistantEnabled())return new Response(null,{status:404});
  const payload=await getCurrentDashboardBase();if(!payload)return new Response(null,{status:401});
  try{
    const input=z.object({version:z.string().regex(/^[a-f0-9]{64}$/),changes:changesSchema}).strict().parse(JSON.parse(await readAssistantBody(request,700000)));
    await enforceRateLimits([{scope:'brand:apply',identifier:payload.account.id,limit:30,windowSeconds:3600}]);
    const brand=await applyImportedBrand(payload.account.id,input.version,input.changes);
    invalidatePublishedLeadMagnetCache();
    return Response.json({brand},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    if(error instanceof RateLimitError)return rateLimitResponse(error);
    const conflict=error instanceof Error&&error.message.startsWith('Brand settings changed.');
    return Response.json({error:conflict?error.message:'Check the selected brand details and try again.'},{status:conflict?409:400});
  }
}
