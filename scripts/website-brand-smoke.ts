import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { brandHex, extractBrandColors, extractWebsiteBrand, importWebsiteBrand, publicBrandAddress, websiteBrandUrl, fetchBrandAsset } from '../lib/website-brand';
import { query } from '../lib/db';
import { getBrandImportVersion, applyImportedBrand, getCreationBrand } from '../lib/platform-store';

async function main(){
  const db=new URL(process.env.DATABASE_URL||'');assert.equal(db.hostname,'127.0.0.1');assert.equal(db.port,'55439');assert.equal(db.pathname,'/magnets_staging_test');
  for(const address of ['127.0.0.1','10.1.2.3','172.16.1.1','192.168.1.1','169.254.169.254','100.64.1.1','0.0.0.0','224.0.0.1','::1','::ffff:127.0.0.1','198.19.2.1'])assert.equal(publicBrandAddress(address),false,address);
  assert.equal(publicBrandAddress('8.8.8.8'),true);
  for(const url of ['http://example.com','https://user:pass@example.com','https://localhost','https://example.com:444','https://127.1','https://[::1]','file:///etc/passwd'])assert.throws(()=>websiteBrandUrl(url),url);
  await assert.rejects(fetchBrandAsset('https://127.0.0.1',1024));
  assert.equal(websiteBrandUrl('/logo.png','https://example.com/about').href,'https://example.com/logo.png');
  assert.equal(brandHex('#abc'),'#AABBCC');assert.equal(brandHex('url(evil)'),null);
  // Distinctiva-style compiled utility CSS has no primary/accent variables.
  // Used solid button colours beat pale sections, unused classes and hover states.
  const compiledCss=`.btn-primary{background:#ff0000}.bg-brand-50{background-color:#f0f9f7}
    .btn-brand-glow:hover{background-color:#142d2d}.btn-brand-glow{color:#fff;background-color:#1b3b3b;background-image:radial-gradient(#fff,#0000)}
    .text-brand-900{color:#0f2626}.text-brand-accent{color:#3bbfb2}`;
  assert.deepEqual(extractBrandColors(compiledCss,'<button class="btn-brand-glow">Start</button><div class="bg-brand-50 text-brand-900"><span class="text-brand-accent">Brand</span></div>'),{primary:'#1B3B3B',accent:'#3BBFB2'});
  assert.deepEqual(extractBrandColors(compiledCss,'<p class="unrelated">Plain page</p>'),{primary:null,accent:null});
  assert.deepEqual(extractBrandColors(':root{--palette:27 59 59;--primary:rgb(var(--palette));--accent:174 53% 49%}.dark{--primary:#fff}'),{primary:'#1B3B3B',accent:'#3BBFB2'});
  assert.deepEqual(extractBrandColors(':root{--a:var(--b);--b:var(--a);--primary:var(--a);--accent:rgba(59,191,178,.2)}'),{primary:null,accent:null});
  assert.equal(extractBrandColors('/* :root{--primary:#ff0000} */ :root{--primary:var(--missing,#1b3b3b)}').primary,'#1B3B3B');
  const compiledImport=await importWebsiteBrand('https://example.com',async url=>url.endsWith('.css')?
    {url,type:'text/css',bytes:Buffer.from(compiledCss)}:
    {url,type:'text/html',bytes:Buffer.from('<link rel="stylesheet" href="/site.css"><button class="btn-brand-glow">Start</button><span class="text-brand-accent">Brand</span>')});
  assert.equal(compiledImport.primary,'#1B3B3B');assert.equal(compiledImport.accent,'#3BBFB2');
  const html=`<meta property="og:site_name" content="Acme &amp; Co"><meta name="theme-color" content="#123456"><title>Fallback | Home</title><script><img alt="logo" src="https://evil.example/script.png"></script><img alt="Company logo" src="/logo.png"><img alt="Logo" src="data:image/svg+xml,evil"><link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="https://third-party.example/style.css">`;
  const extracted=extractWebsiteBrand(html,'https://example.com');
  assert.equal(extracted.name,'Acme & Co');assert.deepEqual(extracted.logos,[{url:'https://example.com/logo.png',label:'Website logo'}]);assert.deepEqual(extracted.stylesheets,['https://example.com/brand.css']);
  const image=await sharp({create:{width:320,height:200,channels:3,background:'#ff9900'}}).png().toBuffer();
  const imported=await importWebsiteBrand('https://example.com',async url=>{
    if(url.endsWith('logo.png'))return {url,type:'image/png',bytes:image};
    if(url.endsWith('brand.css'))return {url,type:'text/css',bytes:Buffer.from(':root{--accent-color:#fab;}')};
    return {url,type:'text/html',bytes:Buffer.from(html)};
  });
  assert.equal(imported.accent,'#FFAABB');assert.equal(imported.primary,'#123456');assert.ok(imported.logo?.startsWith('data:image/png;base64,'));
  assert.equal((await sharp(Buffer.from(imported.logo!.split(',')[1],'base64')).metadata()).width,320);
  const icons=[16,32,48,57,60,72,120,180,1024].map(size=>`<link rel="icon" sizes="${size}x${size}" href="/icon-${size}.png">`).join('');
  const iconCandidates=extractWebsiteBrand(icons,'https://example.com').logos;
  assert.equal(iconCandidates[0].url,'https://example.com/icon-1024.png','largest icon must survive the request cap');
  const tiny=await sharp({create:{width:16,height:16,channels:3,background:'#111111'}}).png().toBuffer();
  const large=await sharp({create:{width:1024,height:1024,channels:3,background:'#ff9900'}}).png().toBuffer();
  const fetched:string[]=[];
  const sharpIcon=await importWebsiteBrand('https://example.com',async url=>{
    if(url.endsWith('.png')){fetched.push(url);return {url,type:'image/png',bytes:url.endsWith('1024.png')?large:tiny};}
    return {url,type:'text/html',bytes:Buffer.from(icons)};
  });
  assert.deepEqual(fetched,['https://example.com/icon-1024.png']);
  assert.equal((await sharp(Buffer.from(sharpIcon.logo!.split(',')[1],'base64')).metadata()).width,300);
  const tinyOnly=await importWebsiteBrand('https://example.com',async url=>url.endsWith('.png')?
    {url,type:'image/png',bytes:tiny}:{url,type:'text/html',bytes:Buffer.from('<link rel="icon" sizes="1024x1024" href="/tiny.png">')});
  assert.equal(tinyOnly.logo,null,'actual decoded dimensions override misleading size metadata');
  assert.ok(tinyOnly.notes.some(note=>note.includes('too small')));
  const fallback=await importWebsiteBrand('https://example.com',async url=>url.endsWith('.png')?
    {url,type:'image/png',bytes:url.endsWith('social.png')?image:tiny}:
    {url,type:'text/html',bytes:Buffer.from(`${icons}<meta property="og:image" content="/social.png">`)});
  assert.equal(fallback.logoLabel,'Social preview image','a usable fallback must not be crowded out by icon variants');
  const missing=await importWebsiteBrand('https://example.com',async url=>({url,type:'text/html',bytes:Buffer.from('<title>Plain website</title>')}));
  assert.equal(missing.logo,null);assert.equal(missing.primary,null);assert.ok(missing.notes.length>=2);
  const user=randomUUID(),account=randomUUID();
  await query('insert into neon_auth."user" (id,email,name) values ($1,$2,$3)',[user,`${user}@example.invalid`,'Brand test']);
  await query('insert into public.magnets_accounts (id,owner_user_id,logo_text,domain,brand) values ($1,$2,$3,$4,$5::jsonb)',[account,user,'Original','customer.example',JSON.stringify({primary:'#111111',accent:'#222222',pageTheme:'dark',privacyPolicyUrl:'https://example.com/privacy',logoSize:'large'})]);
  try {
    const before=await query('select * from public.magnets_accounts where id=$1',[account]);
    const version=await getBrandImportVersion(account);assert.ok(version);
    // Extraction never persists anything.
    assert.equal((await getCreationBrand(account))?.logoText,'Original');
    await assert.rejects(applyImportedBrand(randomUUID(),version,{name:'Foreign'}),/Account not found/);
    const result=await applyImportedBrand(account,version,{name:imported.name,primary:imported.primary!,logo:imported.logo!});
    assert.equal(result.logoText,'Acme & Co');assert.equal(result.accent,'#222222');
    const after=await query('select * from public.magnets_accounts where id=$1',[account]);
    for(const key of Object.keys(before.rows[0]))if(!['logo_text','logo_url','brand','updated_at'].includes(key))assert.deepEqual(after.rows[0][key],before.rows[0][key],`${key} preserved`);
    assert.equal(after.rows[0].brand.privacyPolicyUrl,'https://example.com/privacy');assert.equal(after.rows[0].brand.logoSize,'large');
    await assert.rejects(applyImportedBrand(account,version,{name:'Stale overwrite'}),/Brand settings changed/);
    console.log('PASS: website extraction, safe address boundaries, raster image import, missing-field fallback, explicit application, ownership, conflict protection and preservation of unrelated account fields.');
  }finally{await query('delete from neon_auth."user" where id=$1',[user]);await globalThis.magnetsPgPool?.end();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
