// TriageGenie manifest validator — offline substitute for `forge lint`.
//
// `forge lint` cannot run here: Forge CLI 15 requires a login before any
// command (see BUILD-LOG.md), and logging in is out of scope until the
// Atlassian developer account exists. This script checks everything lint
// would check locally: YAML parses, required keys, cross-references between
// modules/functions/actions/resources, handler exports, and scope sanity.
// It does NOT check anything that needs the platform (app id registration,
// scope approval, Rovo availability).
//
// Run with: npx tsx scripts/validate-manifest.ts

import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';

let passed = 0;
let failed = 0;
const warnings: string[] = [];

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const ROOT = new URL('..', import.meta.url).pathname;
const manifest = parse(readFileSync(`${ROOT}manifest.yml`, 'utf8')) as Record<string, unknown>;
const indexSrc = readFileSync(`${ROOT}src/index.ts`, 'utf8');

console.log('TriageGenie manifest validation — offline\n');

console.log('[1] Top-level shape');
check('app key present', !!manifest.app);
check('modules key present', !!manifest.modules);
check('permissions.scopes present', Array.isArray((manifest.permissions as Record<string, unknown>)?.scopes));
const app = manifest.app as Record<string, unknown>;
const runtime = app?.runtime as Record<string, unknown>;
check('runtime is nodejs24.x', runtime?.name === 'nodejs24.x', `got ${String(runtime?.name)}`);
if (typeof app?.id === 'string' && app.id.includes('00000000-0000-0000-0000-000000000000')) {
  warnings.push('app.id is a placeholder — run `forge register` once the Atlassian account exists');
  console.log('  WARN  app.id is a placeholder (expected until forge register)');
}
check(
  'app.id is a well-formed ARI',
  typeof app?.id === 'string' && /^ari:cloud:ecosystem::app\/[0-9a-f-]{36}$/.test(app.id as string),
);

console.log('[2] Modules present');
const modules = manifest.modules as Record<string, unknown[]>;
for (const key of ['jira:issuePanel', 'trigger', 'rovo:agent', 'action', 'rovo:mcp', 'function']) {
  check(`module ${key} declared`, Array.isArray(modules[key]) && (modules[key] as unknown[]).length > 0);
}
check('exactly one rovo:mcp module', (modules['rovo:mcp'] as unknown[]).length === 1);
check('exactly one rovo:agent module', (modules['rovo:agent'] as unknown[]).length === 1);

console.log('[3] Function cross-references');
const functions = modules.function as { key: string; handler: string }[];
const functionKeys = new Set(functions.map((f) => f.key));
for (const f of functions) {
  const [, fn] = String(f.handler).split('.');
  check(
    `function ${f.key} handler index.${fn} is exported from src/index.ts`,
    new RegExp(`export (async function ${fn}|const ${fn})`).test(indexSrc),
  );
}
const resolverRef = (modules['jira:issuePanel'] as { resolver?: { function?: string } }[])[0]?.resolver?.function;
check('issuePanel resolver references a declared function', !!resolverRef && functionKeys.has(resolverRef));
check('issuePanel render is native (UI Kit)', (modules['jira:issuePanel'] as { render?: string }[])[0]?.render === 'native');
const triggerFn = (modules.trigger as { function?: string; events?: string[] }[])[0];
check('trigger references a declared function', !!triggerFn?.function && functionKeys.has(triggerFn.function));
check(
  'trigger listens to avi:jira:created:issue',
  (triggerFn?.events ?? []).includes('avi:jira:created:issue'),
);
const actions = modules.action as { key: string; function?: string; actionVerb?: string }[];
const actionKeys = new Set(actions.map((a) => a.key));
for (const a of actions) {
  check(`action ${a.key} references a declared function`, !!a.function && functionKeys.has(a.function));
  check(`action ${a.key} has actionVerb GET`, a.actionVerb === 'GET');
}

console.log('[4] Rovo agent + MCP cross-references');
const agent = (modules['rovo:agent'] as { name?: string; prompt?: string; actions?: string[] }[])[0];
check('agent name <= 30 chars', (agent?.name ?? '').length <= 30, `got ${(agent?.name ?? '').length}`);
check('agent prompt is a resource reference', typeof agent?.prompt === 'string' && agent.prompt.startsWith('resource:'));
const [promptResource, promptFile] = (agent?.prompt ?? '').replace('resource:', '').split(';');
check(
  `agent prompt file ${promptFile} exists`,
  existsSync(`${ROOT}${(manifest.resources as { key: string; path: string }[]).find((r) => r.key === promptResource)?.path ?? ''}/${promptFile}`),
);
for (const a of agent?.actions ?? []) {
  check(`agent action ${a} is declared`, actionKeys.has(a));
}
const mcp = (modules['rovo:mcp'] as { name?: string; tools?: string[] }[])[0];
check('mcp name <= 30 chars', (mcp?.name ?? '').length <= 30, `got ${(mcp?.name ?? '').length}`);
for (const t of mcp?.tools ?? []) {
  check(`mcp tool ${t} is declared`, actionKeys.has(t));
}
check('agent actions == mcp tools', JSON.stringify([...(agent?.actions ?? [])].sort()) === JSON.stringify([...(mcp?.tools ?? [])].sort()));

console.log('[5] Resources');
const resources = manifest.resources as { key: string; path: string }[];
for (const r of resources) {
  check(`resource ${r.key} path exists (${r.path})`, existsSync(`${ROOT}${r.path}`));
}
const panelResource = (modules['jira:issuePanel'] as { resource?: string }[])[0]?.resource;
check('issuePanel resource is declared', resources.some((r) => r.key === panelResource));

console.log('[6] Scopes');
const scopes = ((manifest.permissions as Record<string, unknown>)?.scopes ?? []) as string[];
check('no duplicate scopes', new Set(scopes).size === scopes.length);
check(
  'all scopes are known shapes',
  scopes.every((s) => /^(read|write|manage|delete):[a-z:-]+$/.test(s) || s === 'storage:app'),
  scopes.filter((s) => !/^(read|write|manage|delete):[a-z:-]+$/.test(s) && s !== 'storage:app').join(','),
);
for (const s of ['read:jira-work', 'write:jira-work', 'read:jira-user', 'storage:app', 'read:graph:issue:jira']) {
  check(`scope ${s} present`, scopes.includes(s));
}
check('no broad retired graph scopes', !scopes.includes('read:graph:jira') && !scopes.includes('read:graph:confluence'));
check('scope count under the 50 cap', scopes.length <= 50, `got ${scopes.length}`);

console.log(`\n${passed} passed, ${failed} failed.`);
for (const w of warnings) console.log(`WARN: ${w}`);
if (failed > 0) {
  console.log('MANIFEST VALIDATION FAILED');
  process.exit(1);
}
console.log('MANIFEST VALIDATION PASSED');
