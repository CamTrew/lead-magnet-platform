import { resolve4 } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';
import sharp from 'sharp';
import { validateLogoDataUrl } from './upload';
import { brandHex, extractBrandColors } from './website-brand-colors';
export { brandHex, extractBrandColors } from './website-brand-colors';

const blocked = new BlockList();
for (const [network, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['192.88.99.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const) blocked.addSubnet(network,prefix,'ipv4');
export function publicBrandAddress(address: string) { return isIP(address) === 4 && !blocked.check(address,'ipv4'); }
export function websiteBrandUrl(value: string, base?: string) {
  const url = new URL(base ? value : (/^https?:\/\//i.test(value) ? value : `https://${value}`), base);
  if (url.protocol !== 'https:' || url.port || url.username || url.password || isIP(url.hostname) || !url.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)) throw new Error('Use a public website with an https:// address.');
  url.hash = '';
  return url;
}

// Pin DNS to a checked public IPv4 address for every hop. Plain fetch after a DNS
// check would resolve again and allow DNS rebinding into private infrastructure.
export async function fetchBrandAsset(value: string, maxBytes: number, deadline = Date.now() + 12000): Promise<{ bytes: Buffer; url: string; type: string }> {
  let url = websiteBrandUrl(value);
  for (let hop = 0; hop < 4; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('The website took too long to respond. Try again or enter your brand manually.');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const addresses = await Promise.race([resolve4(url.hostname),new Promise<never>((_, reject) => {timer=setTimeout(()=>reject(new Error('Website lookup timed out.')),Math.min(remaining,4000));})]).finally(()=>clearTimeout(timer));
    if (!addresses.length || addresses.some(address => !publicBrandAddress(address))) throw new Error('Use a publicly accessible website.');
    const response = await new Promise<{ bytes: Buffer; type: string; location?: string; status: number }>((resolve, reject) => {
      const req = request(url, {
        method:'GET', headers:{'User-Agent':'Magnets-Brand-Preview/1.0','Accept':'text/html,text/css,image/*;q=0.8','Accept-Encoding':'identity'},
        // TLS still verifies the original hostname; only the socket address is pinned.
        lookup: (_hostname, _options, callback) => callback(null,addresses[0],4),
        family:4,
      }, res => {
        const status=res.statusCode || 0;
        if ([301,302,303,307,308].includes(status)) { res.destroy();resolve({bytes:Buffer.alloc(0),type:'',location:res.headers.location,status});return; }
        if (status < 200 || status >= 300) {res.destroy();reject(new Error('The website could not be read. Try another page or enter your brand manually.'));return;}
        const chunks: Buffer[]=[];let size=0;
        res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>maxBytes){res.destroy(new Error('The website file is too large to import.'));return;}chunks.push(chunk);});
        res.on('error',reject);res.on('end',()=>resolve({bytes:Buffer.concat(chunks),type:String(res.headers['content-type']||'').toLowerCase(),status}));
      });
      const timeout=setTimeout(()=>req.destroy(new Error('Website request timed out.')),Math.max(1,deadline-Date.now()));
      req.on('error',reject);req.on('close',()=>clearTimeout(timeout));req.end();
    });
    if (response.location) {url=websiteBrandUrl(response.location,url.href);continue;}
    if (response.status >= 300) throw new Error('The website redirects without a destination.');
    return {...response,url:url.href};
  }
  throw new Error('The website redirects too many times. Use its final address.');
}

function decode(value: string) {
  return value.replace(/&#(x[0-9a-f]+|\d+);|&(amp|quot|apos|lt|gt|nbsp);/gi,(_match,numeric,named)=> {
    if (numeric) {const n=parseInt(numeric.startsWith('x')?numeric.slice(1):numeric,numeric.startsWith('x')?16:10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}
    return ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '} as Record<string,string>)[named.toLowerCase()]||'';
  }).replace(/[\u0000-\u001f]/g,' ').trim();
}
function attrs(tag: string) {
  const result: Record<string,string>={};
  for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]??'');
  return result;
}
export function extractWebsiteBrand(html: string, pageUrl: string) {
  // Data extraction only: never run page scripts, JSON-LD instructions or HTML.
  const clean=html.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'');
  const meta:Record<string,string>={};const logos:{url:string;label:string;size:number}[]=[];const stylesheets:string[]=[];
  const addLogo=(value:string,label:string,size=0)=>{try{const url=websiteBrandUrl(value,pageUrl);if(/\.(svg|ico)(?:$|[?#])/i.test(url.href))return;logos.push({url:url.href,label,size});}catch{/* Unsupported addresses are ignored. */}};
  for(const tag of clean.match(/<(?:meta|link|img)\b[^>]{0,12000}>/gi)||[]) {
    const a=attrs(tag);
    if(/^<meta/i.test(tag)) meta[(a.property||a.name||'').toLowerCase()]=a.content||'';
    if(/^<link/i.test(tag)) {
      if(/(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(a.rel||'')&&a.href) {
        const sizes=[...(a.sizes||'').matchAll(/\b(\d{1,5})x(\d{1,5})\b/gi)].map(match=>Math.min(Number(match[1]),Number(match[2])));
        addLogo(a.href,'Website icon',Math.max(0,...sizes));
      }
      if(a.rel==='stylesheet'&&a.href)try{const url=websiteBrandUrl(a.href,pageUrl);if(url.origin===new URL(pageUrl).origin)stylesheets.push(url.href);}catch{}
    }
    if(/^<img/i.test(tag)&&/logo/i.test(`${a.alt||''} ${a.id||''} ${a.class||''}`)&&a.src) addLogo(a.src,'Website logo');
  }
  if(meta['og:image'])addLogo(meta['og:image'],'Social preview image');
  const title=decode(clean.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]||'').split(/\s[|–—]\s/)[0];
  const name=(meta['og:site_name']||meta['application-name']||title).slice(0,80);
  const inlineStyles=[...clean.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map(match=>match[1]).join('\n');
  const colors=extractBrandColors(inlineStyles,clean);
  const theme=brandHex(meta['theme-color']||'');
  // Rank before bounding requests: sites often list 16px favicons first and their
  // high-resolution touch icon last. Metadata only orders candidates; decoded
  // dimensions below decide whether the downloaded image is actually usable.
  const priority=(label:string)=>label==='Website logo'?0:label==='Website icon'?1:2;
  const ranked=logos.sort((a,b)=>priority(a.label)-priority(b.label)||(b.size||128)-(a.size||128));
  const seen=new Set<string>();
  const candidates=ranked.filter(candidate=>{if(seen.has(candidate.url))return false;seen.add(candidate.url);return true;});
  const selected=candidates.slice(0,5);
  const social=candidates.find(candidate=>candidate.label==='Social preview image');
  if(social&&!selected.includes(social))selected.push(social);
  return {name,primary:colors.primary,themeColor:theme,accent:colors.accent,logos:selected.map(({url,label})=>({url,label})),inlineStyles,stylesheets:[...new Set(stylesheets)].slice(0,4)};
}
export type WebsiteBrandSuggestion = { website: string; name: string; primary: string | null; accent: string | null; logo: string | null; logoLabel: string | null; notes: string[] };
export async function importWebsiteBrand(value: string, fetchAsset: typeof fetchBrandAsset = fetchBrandAsset): Promise<WebsiteBrandSuggestion> {
  const deadline=Date.now()+18000;
  const page=await fetchAsset(websiteBrandUrl(value).href,1024*1024,deadline);
  if(!/text\/html|application\/xhtml\+xml/.test(page.type))throw new Error('Enter a website page, rather than an image or file.');
  const extracted=extractWebsiteBrand(page.bytes.toString('utf8'),page.url);
  const cssResults=await Promise.allSettled(extracted.stylesheets.map(url=>fetchAsset(url,256*1024,deadline)));
  const styles=[extracted.inlineStyles,...cssResults.flatMap(result=>result.status==='fulfilled'&&result.value.type.includes('text/css')?[result.value.bytes.toString('utf8')]:[])].join('\n');
  const colors=extractBrandColors(styles,page.bytes.toString('utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,''));
  extracted.primary=colors.primary;extracted.accent=colors.accent;
  const usedThemeColour=!extracted.primary&&Boolean(extracted.themeColor);
  extracted.primary ||= extracted.themeColor;
  let logo:string|null=null;let logoLabel:string|null=null;let foundTinyImage=false;
  for(const candidate of extracted.logos){
    if(Date.now()>deadline-500)break;
    try {
      const asset=await fetchAsset(candidate.url,1024*1024,deadline);
      const mime=asset.type.split(';')[0].trim();
      if(!validateLogoDataUrl(`data:${mime};base64,${asset.bytes.toString('base64')}`,{maxBytes:1024*1024}).ok)continue;
      const meta=await sharp(asset.bytes,{limitInputPixels:16000000}).metadata();
      if(!['png','jpeg','webp','gif'].includes(meta.format||''))continue;
      const width=meta.width||0,height=meta.height||0;
      // A medium logo fits in 160×56 CSS pixels. Require enough source detail
      // for that box at 2× density, rather than enlarging a browser favicon.
      if(Math.min(width,height)<16||Math.min(320/width,112/height)>1){foundTinyImage=true;continue;}
      const png=await sharp(asset.bytes,{limitInputPixels:16000000}).rotate().resize({width:600,height:300,fit:'inside',withoutEnlargement:true}).png().toBuffer();
      if(png.length>500000)continue;
      logo=`data:image/png;base64,${png.toString('base64')}`;logoLabel=candidate.label;break;
    }catch{/* Missing or unsupported assets do not discard usable brand suggestions. */}
  }
  const notes=[];
  if(usedThemeColour)notes.push("The main colour comes from the website’s browser theme. Check it against your brand colour.");
  if(!logo)notes.push(foundTinyImage?'The website only provided images too small for a sharp logo. Keep your current logo or upload a larger PNG, JPG or WebP in Brand settings.':'No supported logo found. Keep your current logo or upload a PNG, JPG or WebP in Brand settings.');
  else if(logoLabel!=='Website logo')notes.push(`${logoLabel} found. Check that it is the logo you want to use.`);
  if(!extracted.primary&&!extracted.accent)notes.push('No brand colours found in the website styles or metadata. Your current colours are kept.');
  return {website:page.url,name:extracted.name,primary:extracted.primary,accent:extracted.accent,logo,logoLabel,notes};
}
