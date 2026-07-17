import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const statePath = join(tmpdir(), 'magnets-post-signup-e2e.json');
const baseUrl = process.env.POST_SIGNUP_E2E_BASE_URL || 'http://localhost:3001';
const richEmailBody = `# Your resource is ready

Hello **{name}** — this bold introduction rendered correctly.

## Useful links

[Visit Magnets](https://magnets.so)

1. Open your resource
2. Check the numbered list

- Links stay clickable
- Images stay visible

---

![Magnets test image](https://magnets.so/icon-192.png)

Download your resource: {download_link}`;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Run with node --env-file=.env.local.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

async function readState() {
  return JSON.parse(await readFile(statePath, 'utf8'));
}

async function removeStateFile() {
  await unlink(statePath).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });
}

async function cleanupExisting() {
  try {
    const state = await readState();
    await pool.query('delete from public.magnets_accounts where id = $1::uuid', [state.accountId]);
    await pool.query('delete from neon_auth.session where "userId" = $1::uuid', [state.ownerUserId]);
    await pool.query('delete from neon_auth."user" where id = $1::uuid', [state.ownerUserId]);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await removeStateFile();
}

async function setup() {
  await cleanupExisting();

  const accountId = randomUUID();
  const magnetId = randomUUID();
  const ownerUserId = randomUUID();
  const sessionToken = `${randomUUID()}${randomUUID()}`;
  const runId = randomUUID().slice(0, 8);
  const slug = `codex-post-signup-e2e-${runId}`;

  await pool.query('begin');
  try {
    await pool.query(
      `insert into neon_auth."user" (id, name, email, "emailVerified")
       values ($1::uuid, 'Codex E2E', $2, true)`,
      [ownerUserId, `codex-e2e-${runId}@example.invalid`]
    );
    await pool.query(
      `insert into neon_auth.session (token, "userId", "expiresAt", "updatedAt")
       values ($1, $2::uuid, now() + interval '1 day', now())`,
      [sessionToken, ownerUserId]
    );
    await pool.query(
      `insert into public.magnets_accounts (
        id, owner_user_id, username, subdomain, domain, logo_text,
        onboarding_completed_at
      ) values ($1::uuid, $2::uuid, $3, 'get', '', 'Magnets E2E', now())`,
      [accountId, ownerUserId, `codex-e2e-${runId}`]
    );
    await pool.query(
      `insert into public.magnets_lead_magnets (
        id, account_id, slug, title, subtitle, description, bullets,
        bullets_heading, cta_text, form_heading, form_subtext, download_link,
        email_subject, email_body, post_signup_mode, post_signup_heading,
        post_signup_body, published
      ) values (
        $1::uuid, $2::uuid, $3, 'Codex post-signup E2E',
        'Temporary page for post-signup regression testing',
        'This page is automatically removed after the test.',
        '["Standard confirmation", "Redirect", "Custom page", "Quiz routing"]'::jsonb,
        'Scenarios covered', 'Run safe test', 'Post-signup E2E test',
        'Uses Resend’s designated delivered test address.',
        'https://magnets.so/terms?codex-e2e=resource', 'Codex E2E delivery',
        $4, 'message',
        'E2E custom next step', 'The custom next-step page rendered correctly.', true
      )`,
      [magnetId, accountId, slug, richEmailBody]
    );
    await pool.query('commit');
  } catch (error) {
    await pool.query('rollback');
    throw error;
  }

  const state = { accountId, magnetId, ownerUserId, runId, sessionToken, slug };
  await writeFile(statePath, JSON.stringify(state), { mode: 0o600 });
  console.log(JSON.stringify({ accountId, magnetId, ownerUserId, runId, slug, publicUrl: `${baseUrl}/p/${magnetId}` }));
}

function quizConfig(mode = 'original') {
  const questions = [
    {
      id: 'q-goal',
      prompt: 'What is your main goal?',
      options: [
        { id: 'growth', label: 'Grow faster', destinationUrl: '' },
        { id: 'efficiency', label: 'Save time', destinationUrl: '' },
      ],
    },
    ...(mode === 'replaced'
      ? []
      : [{
          id: 'q-speed',
          prompt: 'How soon do you want results?',
          options: [
            { id: 'fast', label: 'This month', destinationUrl: '' },
            {
              id: 'steady',
              label: 'Over the next quarter',
              destinationUrl: `${baseUrl}/terms?codex-e2e=option-destination`,
            },
          ],
        }]),
    ...(mode === 'original'
      ? []
      : [{
          id: 'q-team',
          prompt: 'What team size are you planning for?',
          options: [
            { id: 'solo', label: 'Just me', destinationUrl: '' },
            { id: 'team', label: 'A team', destinationUrl: '' },
          ],
        }]),
  ];

  return {
    questions,
    routes: mode === 'replaced'
      ? []
      : [
          {
            id: 'growth-fast',
            destinationUrl: `${baseUrl}/privacy?codex-e2e=matched-route`,
            conditions: [
              { questionId: 'q-goal', optionId: 'growth' },
              { questionId: 'q-speed', optionId: 'fast' },
            ],
          },
        ],
  };
}

async function setScenario(name) {
  const state = await readState();
  const scenarios = {
    message: {
      mode: 'message',
      redirectUrl: `${baseUrl}/terms?codex-e2e=stale-message-redirect`,
      quizEnabled: false,
      quiz: { questions: [], routes: [] },
    },
    unsafe_redirect: {
      mode: 'redirect',
      redirectUrl: 'javascript:alert(1)',
      quizEnabled: false,
      quiz: { questions: [], routes: [] },
    },
    redirect: {
      mode: 'redirect',
      redirectUrl: `${baseUrl}/terms?codex-e2e=redirect`,
      quizEnabled: false,
      quiz: { questions: [], routes: [] },
    },
    page: {
      mode: 'page',
      redirectUrl: 'https://google.com/this-must-not-win',
      quizEnabled: false,
      quiz: { questions: [], routes: [] },
    },
    quiz: {
      mode: 'page',
      redirectUrl: 'https://google.com/this-must-not-win',
      quizEnabled: true,
      quiz: quizConfig('original'),
    },
    quiz_changed: {
      mode: 'page',
      redirectUrl: 'https://google.com/this-must-not-win',
      quizEnabled: true,
      quiz: quizConfig('replaced'),
    },
    quiz_extended: {
      mode: 'page',
      redirectUrl: 'https://google.com/this-must-not-win',
      quizEnabled: true,
      quiz: quizConfig('extended'),
    },
  };
  const scenario = scenarios[name];
  assert(scenario, `Unknown scenario: ${name}`);

  if (name === 'unsafe_redirect') {
    // Recreate a legacy/externally-written unsafe value. The normal save API
    // correctly rejects this value, but the public page must still fail safe.
    await pool.query(
      `update public.magnets_lead_magnets
       set post_signup_mode = $2,
           post_signup_redirect_url = $3,
           post_signup_quiz_enabled = false,
           post_signup_quiz_questions = '{"questions":[],"routes":[]}'::jsonb,
           updated_at = now()
       where id = $1::uuid`,
      [state.magnetId, scenario.mode, scenario.redirectUrl]
    );
  } else {
    const response = await fetch(`${baseUrl}/api/lead-magnets/${state.magnetId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `magnets_session=${state.sessionToken}`,
      },
      body: JSON.stringify({
        slug: state.slug,
        title: 'Codex post-signup E2E',
        subtitle: 'Temporary page for post-signup regression testing',
        description: 'This page is automatically removed after the test.',
        bullets: ['Standard confirmation', 'Redirect', 'Custom page', 'Quiz routing'],
        bulletsHeading: 'Scenarios covered',
        ctaText: 'Run safe test',
        formHeading: 'Post-signup E2E test',
        formSubtext: 'Uses Resend’s designated delivered test address.',
        imageUrl: '',
        downloadLink: 'https://magnets.so/terms?codex-e2e=resource',
        emailSubject: 'Codex E2E delivery',
        emailBody: richEmailBody,
        emailPreview: 'Controlled post-signup regression test',
        followUpEnabled: false,
        followUpStopOnBooking: false,
        followUpEmails: [],
        resendFollowUpAutomationId: '',
        postSignupMode: scenario.mode,
        postSignupRedirectUrl: scenario.redirectUrl,
        postSignupHeading: 'E2E custom next step',
        postSignupBody: 'The custom next-step page rendered correctly.',
        postSignupVideoUrl: '',
        postSignupCtaLabel: 'View privacy page',
        postSignupCtaUrl: `${baseUrl}/privacy?codex-e2e=custom-cta`,
        postSignupQuizEnabled: scenario.quizEnabled,
        postSignupQuizTitle: 'Quick E2E quiz',
        postSignupQuizDescription: 'Two questions to verify routing.',
        postSignupQuizQuestions: scenario.quiz.questions,
        postSignupQuizRoutes: scenario.quiz.routes,
        published: true,
      }),
    });
    const responseBody = await response.json().catch(() => ({}));
    assert.equal(response.status, 200, `Save API failed (${response.status}): ${responseBody.error || 'unknown error'}`);
  }

  console.log(JSON.stringify({
    scenario: name,
    accountId: state.accountId,
    magnetId: state.magnetId,
    ownerUserId: state.ownerUserId,
    runId: state.runId,
    slug: state.slug,
    publicUrl: `${baseUrl}/p/${state.magnetId}`,
  }));
}

async function createSubmission(label = 'direct') {
  const state = await readState();
  const result = await pool.query(
    `insert into public.magnets_submissions (account_id, lead_magnet_id, name, email)
     values ($1::uuid, $2::uuid, 'Codex E2E', $3)
     returning id`,
    [state.accountId, state.magnetId, `delivered+codex-${label}-${state.runId}@resend.dev`]
  );
  console.log(JSON.stringify({
    submissionId: result.rows[0].id,
    accountId: state.accountId,
    magnetId: state.magnetId,
    runId: state.runId,
  }));
}

async function counts() {
  const state = await readState();
  const result = await pool.query(
    `select
       (select count(*)::int from public.magnets_submissions where lead_magnet_id = $1::uuid) as submissions,
       (select count(*)::int from public.magnets_quiz_responses where lead_magnet_id = $1::uuid) as quiz_responses`,
    [state.magnetId]
  );
  console.log(JSON.stringify(result.rows[0]));
}

async function cleanup() {
  const state = await readState().catch(() => null);
  if (state) {
    await pool.query('delete from public.magnets_accounts where id = $1::uuid', [state.accountId]);
    await pool.query('delete from neon_auth.session where "userId" = $1::uuid', [state.ownerUserId]);
    await pool.query('delete from neon_auth."user" where id = $1::uuid', [state.ownerUserId]);
  }
  await removeStateFile();
  console.log(JSON.stringify({ cleaned: Boolean(state), accountId: state?.accountId || null }));
}

const [command, argument] = process.argv.slice(2);

try {
  if (command === 'setup') await setup();
  else if (command === 'set') await setScenario(argument);
  else if (command === 'submission') await createSubmission(argument);
  else if (command === 'counts') await counts();
  else if (command === 'cleanup') await cleanup();
  else throw new Error('Usage: post-signup-e2e.mjs <setup|set|submission|counts|cleanup> [value]');
} finally {
  await pool.end();
}
