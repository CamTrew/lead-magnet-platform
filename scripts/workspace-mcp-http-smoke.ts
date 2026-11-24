import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { query } from '../lib/db';
import { createDatabaseSession, findLeadMagnetForAccount, getAccountWithSecrets } from '../lib/platform-store';
import { pkceChallenge } from '../lib/assistant-auth';
import { encryptSecret } from '../lib/secrets';
import { hasWorkspaceAssistantConnection } from '../lib/assistant-provider';

async function main() {
  const db=new URL(process.env.DATABASE_URL || '');
  assert.equal(db.hostname,'127.0.0.1');assert.equal(db.port,'55439');assert.equal(db.pathname,'/magnets_staging_test');
  const origin='http://127.0.0.1:'+(process.env.MCP_TEST_PORT || '3108'),resource=origin+'/mcp/workspace';
  const users=[randomUUID(),randomUUID()],accounts=[randomUUID(),randomUUID()],clients:Client[]=[],clientIds:string[]=[];
  const cookies:string[]=[];
  const seedSecret='re_workspace_local_secret_never_return';
  let counter=1;
  async function authorize(index:number, workspace=true) {
    const r=await fetch(origin+'/oauth/register',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':`2001:db8:${users[index].slice(0,4)}::1`},body:JSON.stringify({client_name:'ChatGPT workspace test',redirect_uris:['https://example.com/callback']})});
    assert.equal(r.status,201);const {client_id}=await r.json();clientIds.push(client_id);
    const audience=workspace?resource:origin+'/mcp',scope=workspace?'workspace:manage':'campaigns:create',verifier='w'.repeat(64);
    const fields={client_id,redirect_uri:'https://example.com/callback',response_type:'code',code_challenge:pkceChallenge(verifier),code_challenge_method:'S256',state:randomUUID(),resource:audience,scope};
    const headers={cookie:cookies[index],origin,'content-type':'application/x-www-form-urlencoded'};
    const consent=await fetch(origin+'/oauth/authorize?'+new URLSearchParams(fields),{headers});assert.equal(consent.status,200);
    const html=await consent.text();assert.match(html,workspace?/View, import, export and delete signups/:/cannot read subscribers/);
    const bad=await fetch(origin+'/oauth/authorize/confirm',{method:'POST',redirect:'manual',headers,body:new URLSearchParams({...fields,scope:workspace?'campaigns:create':'workspace:manage'})});assert.equal(bad.status,400,'Scope must match audience');
    const approve=await fetch(origin+'/oauth/authorize/confirm',{method:'POST',redirect:'manual',headers,body:new URLSearchParams(fields)});
    assert.equal(approve.status,303);const code=new URL(approve.headers.get('location')!).searchParams.get('code')!;
    const token=await fetch(origin+'/oauth/token',{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id,resource:audience,redirect_uri:fields.redirect_uri,code,code_verifier:verifier})});
    assert.equal(token.status,200);const tokens=await token.json();assert.equal(tokens.scope,scope);
    const client=new Client({name:'Workspace smoke',version:'1'});clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(audience),{requestInit:{headers:{authorization:`Bearer ${tokens.access_token}`}}}));
    return {client,client_id,...tokens};
  }
  async function call(client:Client,name:string,args:Record<string,unknown>,error=false) {
    const result=await client.callTool({name,arguments:args});
    assert.equal(Boolean(result.isError),error,JSON.stringify(result));
    assert.ok(!JSON.stringify(result).includes(seedSecret),'Secrets must never appear in tool results');
    return JSON.parse((result.content as {text:string}[])[0].text);
  }
  try {
    for(let i=0;i<users.length;i++) {
      await query('insert into neon_auth."user" (id,email,name) values ($1,$2,$3)',[users[i],`${users[i]}@example.invalid`,`Workspace ${i}`]);
      await query('insert into public.magnets_accounts (id,owner_user_id,username,resend_api_key) values ($1,$2,$3,$4)',[accounts[i],users[i],`ws-${users[i].slice(0,8)}`,encryptSecret(seedSecret)]);
      cookies.push(`magnets_session=${await createDatabaseSession(users[i])}`);
    }
    const unauth=await fetch(resource,{method:'POST'});assert.equal(unauth.status,401);assert.match(unauth.headers.get('www-authenticate')!,/mcp\/workspace/);
    const meta=await (await fetch(origin+'/.well-known/oauth-protected-resource/mcp/workspace')).json();assert.equal(meta.resource,resource);assert.deepEqual(meta.scopes_supported,['workspace:manage']);
    const a=await authorize(0),b=await authorize(1),legacy=await authorize(0,false);
    assert.equal((await a.client.listTools()).tools.length,14);assert.equal((await legacy.client.listTools()).tools.length,10);
    assert.equal((await fetch(resource,{method:'POST',headers:{authorization:`Bearer ${legacy.access_token}`}})).status,401);
    assert.equal((await fetch(origin+'/mcp',{method:'POST',headers:{authorization:`Bearer ${a.access_token}`}})).status,401);
    assert.equal((await fetch(origin+'/oauth/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:legacy.client_id,resource,refresh_token:legacy.refresh_token})})).status,400,'Legacy refresh cannot upgrade access');
    const connections=await (await fetch(origin+'/api/assistant-connections',{headers:{cookie:cookies[0]}})).json();
    assert.equal(hasWorkspaceAssistantConnection(connections.connections,'ChatGPT'),true);
    assert.equal(hasWorkspaceAssistantConnection(connections.connections.filter((c:{access:string})=>c.access==='campaigns'),'ChatGPT'),false);
    await call(a.client,'get_workspace_guide',{});
    // Create through the normal app first, proving MCP can access older/manual magnets.
    const manual=await fetch(origin+'/api/lead-magnets',{method:'POST',headers:{cookie:cookies[0],'content-type':'application/json'},body:JSON.stringify({title:'Existing checklist',slug:'existing-checklist',downloadLink:'https://example.com/original.pdf'})});
    assert.equal(manual.status,200,await manual.clone().text());const id=(await manual.json()).leadMagnet.id;
    const read=()=>call(a.client,'read_workspace',{what:'lead_magnet',id});
    const before=await read();assert.equal(before.fields.title,'Existing checklist');
    await call(b.client,'read_workspace',{what:'lead_magnet',id},true);
    await call(b.client,'update_lead_magnet',{id,editVersion:before.editVersion,changes:{title:'Cross-account edit'}},true);
    const updated=await call(a.client,'update_lead_magnet',{id,editVersion:before.editVersion,changes:{signupFields:[{id:'company',label:'Company name',format:'text',required:false}],title:'A better checklist',subtitle:'A practical checklist for your next project',description:'Define the scope of your next project.',bullets:['Define your scope'],bulletsHeading:'What is inside',ctaText:'Get the checklist',formHeading:'Send me the checklist',formSubtext:'Enter your email to receive it.',emailPreview:'Start with your project scope.',emailSubject:'Your checklist',emailBody:'Hi {name},\n\nHere is your checklist: https://example.com/original.pdf'}});assert.equal(updated.status,200);
    const after=await read();assert.equal(after.fields.signupFields[0].label,'Company name');assert.equal(after.fields.title,'A better checklist');assert.equal(after.fields.downloadLink,before.fields.downloadLink);assert.deepEqual(after.fields.followUpEmails,before.fields.followUpEmails);
    await call(a.client,'update_lead_magnet',{id,editVersion:before.editVersion,changes:{title:'Stale overwrite'}},true);
    await call(a.client,'update_lead_magnet',{id,editVersion:after.editVersion,changes:{accountId:accounts[1]}},true);
    await call(a.client,'update_lead_magnet',{id,editVersion:after.editVersion,changes:{title:'A bad — dash'}},true);
    await call(a.client,'update_lead_magnet',{id,editVersion:after.editVersion,changes:{followUpEnabled:true}},true);
    // Live edit confirmation and race detection are enforced under the save lock.
    await call(a.client,'update_lead_magnet',{id,editVersion:after.editVersion,changes:{published:true}},true);
    const published=await call(a.client,'update_lead_magnet',{id,editVersion:after.editVersion,changes:{published:true},confirmLiveEdit:true});assert.equal(published.status,200);
    const live=await read();
    const concurrent=await Promise.all([1,2].map(n=>a.client.callTool({name:'update_lead_magnet',arguments:{id,editVersion:live.editVersion,changes:{subtitle:`Concurrent ${n}`},confirmLiveEdit:true}})));
    assert.equal(concurrent.filter(r=>!r.isError).length,1,'Only one edit based on a shared revision may succeed');
    const versions=await call(a.client,'read_workspace',{what:'versions',id});assert.equal(versions.status,200);assert.ok(versions.result.versions.length);
    const snapshotId=String(versions.result.versions[1].id);
    const latest=await read();
    const restored=await call(a.client,'perform_workspace_action',{action:'restore_version',id,editVersion:latest.editVersion,body:{versionId:snapshotId},confirmed:true});assert.equal(restored.status,200);
    assert.equal((await read()).fields.published,true,'Restore preserves publishing state');
    // Follow-up editing works without exposing or accepting provider IDs, even on legacy pages.
    const fresh=await read();
    const sequence=await call(a.client,'update_lead_magnet',{id,editVersion:fresh.editVersion,changes:{followUpEmails:[{id:'email-one',subject:'A useful next step',preview:'Your checklist',body:'Hi {name},\n\nHere is the checklist you asked for.',delayMinutes:1440}]},followUpsRequested:true,confirmLiveEdit:true});assert.equal(sequence.status,200);
    assert.equal((await findLeadMagnetForAccount(accounts[0],id))!.followUpEmails.length,1);
    await call(a.client,'read_workspace',{what:'analytics',id});await call(a.client,'read_workspace',{what:'quiz_insights',id});
    await call(b.client,'read_workspace',{what:'analytics',id},true);await call(b.client,'read_workspace',{what:'quiz_insights',id},true);
    // Scoped audience import, search, export and delete. Import must not send email.
    const email='reader@example.invalid';
    const imported=await call(a.client,'perform_workspace_action',{action:'import_signups',body:{type:'manual',leadMagnetId:id,name:'Reader',email},confirmed:true});assert.equal(imported.status,200);
    const signups=await call(a.client,'read_workspace',{what:'signups',search:email});assert.equal(signups.result.signups[0].email,email);
    const otherSignups=await call(b.client,'read_workspace',{what:'signups',search:email});assert.equal(otherSignups.result.signups.length,0);
    const exported=await call(a.client,'read_workspace',{what:'export_signups',leadMagnetId:id});assert.match(exported.downloadUrl,/\/api\/signups\/export/);
    assert.match(await (await fetch(exported.downloadUrl,{headers:{cookie:cookies[0]}})).text(),/reader@example.invalid/);
    await call(a.client,'perform_workspace_action',{action:'delete_signup',body:{email}},true);
    await call(a.client,'perform_workspace_action',{action:'delete_signup',body:{email},confirmed:true});
    assert.equal((await call(a.client,'read_workspace',{what:'signups',search:email})).result.signups.length,0);
    // Settings only merge changed fields and never round-trip secrets to the assistant.
    const overview=await call(a.client,'read_workspace',{what:'overview'});
    await call(a.client,'perform_workspace_action',{action:'update_settings',editVersion:overview.editVersion,body:{logoText:'Changed'}},true);
    await call(a.client,'perform_workspace_action',{action:'update_settings',editVersion:overview.editVersion,body:{resendApiKey:'re_bad'},confirmed:true},true);
    const settings=await call(a.client,'perform_workspace_action',{action:'update_settings',editVersion:overview.editVersion,body:{logoText:'My brand',brand:{primary:'#112233'}},confirmed:true});assert.equal(settings.status,200);
    const current=await getAccountWithSecrets(accounts[0]);assert.equal(current!.resendApiKey,seedSecret);assert.equal(current!.logoText,'My brand');assert.equal(current!.brand.accent,overview.settings.brand.accent);
    await call(a.client,'perform_workspace_action',{action:'update_settings',editVersion:overview.editVersion,body:{logoText:'Stale brand'},confirmed:true},true);
    const freshOverview=await call(a.client,'read_workspace',{what:'overview'});
    const disconnected=await call(a.client,'perform_workspace_action',{action:'disconnect_integration',editVersion:freshOverview.editVersion,body:{provider:'beehiiv'},confirmed:true});assert.equal(disconnected.status,200);
    assert.equal((await getAccountWithSecrets(accounts[0]))!.resendApiKey,seedSecret,'Disconnecting one integration preserves other credentials');
    const profile=await call(a.client,'perform_workspace_action',{action:'update_profile',body:{name:'Updated profile'}});assert.equal(profile.status,200);
    // Parallel reads must not bleed account context into each other.
    const parallel=await Promise.all(Array.from({length:8},(_,i)=>call(i%2?a.client:b.client,'read_workspace',{what:'overview'})));
    parallel.forEach((r,i)=>assert.equal(r.profile.email,`${users[i%2?0:1]}@example.invalid`));
    const resources=await call(a.client,'read_workspace',{what:'resources'});assert.ok(resources.uploaded.resources);
    await call(a.client,'read_workspace',{what:'secure_setup'});await call(a.client,'read_workspace',{what:'qr_code',id});
    await call(a.client,'perform_workspace_action',{action:'test_slack'},true);
    await call(a.client,'perform_workspace_action',{action:'delete_resource',id:randomUUID(),confirmed:true},true);
    await call(b.client,'perform_workspace_action',{action:'delete_lead_magnet',id,confirmed:true},true);
    assert.ok(await findLeadMagnetForAccount(accounts[0],id));
    const made=await call(a.client,'perform_workspace_action',{action:'create_lead_magnet',body:{title:'From chat',slug:`chat-${counter++}`}});assert.equal(made.status,200);
    await call(a.client,'perform_workspace_action',{action:'delete_lead_magnet',id:made.result.leadMagnet.id},true);
    await call(a.client,'perform_workspace_action',{action:'delete_lead_magnet',id:made.result.leadMagnet.id,confirmed:true});
    assert.equal(await findLeadMagnetForAccount(accounts[0],made.result.leadMagnet.id),null);
    const conn=connections.connections.find((c:{access:string})=>c.access==='workspace');
    await call(a.client,'perform_workspace_action',{action:'disconnect_assistant',body:{id:conn.id},confirmed:true});
    assert.equal((await fetch(resource,{method:'POST',headers:{authorization:`Bearer ${a.access_token}`}})).status,401);
    console.log('PASS: workspace OAuth consent/isolation, legacy token containment, old-page edits, save conflicts, live confirmation, restoration, follow-ups, audience import/export/delete, settings preservation, secrets redaction, account isolation, resources, analytics and revocation.');
  } finally {
    for(const client of clients)await client.close();
    for(const id of clientIds)await query('delete from public.magnets_assistant_clients where id=$1',[id]);
    for(const user of users) {await query('delete from neon_auth.session where "userId"=$1',[user]);await query('delete from neon_auth."user" where id=$1',[user]);}
    await globalThis.magnetsPgPool?.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
