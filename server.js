/**
 * Poly-Glot AI GitHub App — Main server.
 * 
 * Listens for GitHub webhook events (pull_request opened/synchronize)
 * and automatically adds documentation comments to changed files.
 * 
 * @see https://poly-glot.ai
 * @author Harold Moses
 */

require('dotenv').config();

const express = require('express');
const crypto  = require('crypto');
const https   = require('https');
const pino    = require('pino');
const { createInstallationClient, getPullRequestFiles, getFileContent, createReview, getRepoConfig, createCheckRun } = require('./lib/github');
const { generateComments, analyzeCoverage } = require('./lib/polyglot');
const { detectLanguage, shouldSkip } = require('./lib/languages');
const { parseConfig, isFileAllowed } = require('./lib/config');

// ─── Plan constants ───────────────────────────────────────────
const AUTH_API          = 'https://poly-glot.ai/api/auth';
const FREE_PR_LIMIT     = 25;   // free installs: max PRs per month
const PRO_PLANS         = ['pro', 'team', 'enterprise'];
const UPGRADE_URL       = 'https://buy.stripe.com/aFa28teFm8by5s2eAc14409?prefilled_promo_code=EARLYBIRD3';
const FREE_LANGUAGES    = ['javascript', 'typescript', 'python', 'java'];

// ─── In-memory usage store (per installation, per month) ─────
// Format: { [installationId_monthKey]: count }
const usageStore = new Map();

// ─── Installation tracker (local set — used as a floor / fallback) ────────────
const installationSet = new Set();

function trackInstallation(installationId) {
    const id = String(installationId);
    if (!installationSet.has(id)) {
        installationSet.add(id);
        logger.info({ installationId: id, local: installationSet.size }, 'New installation tracked locally');
    }
}

// ─── GitHub App API — fetch real installation count ───────────────────────────
// Uses a JWT signed with the App's private key to call GET /app/installations.
// This is the authoritative count and survives Render cold starts.
// Result is cached in memory for STATS_CACHE_TTL_MS to avoid hammering the API.
const STATS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _cachedInstallCount  = 0;
let _cacheExpiry         = 0;

function getPrivateKeyForJWT() {
    const key = process.env.GITHUB_PRIVATE_KEY || '';
    // Render stores multi-line secrets as \n-escaped strings
    return key.replace(/\\n/g, '\n');
}

/**
 * Sign a minimal GitHub App JWT (RS256) using Node's built-in crypto.
 * Avoids pulling in an extra dependency — the JWT is only used for the
 * /app/installations call which has a 10-minute validity window.
 */
function signAppJWT() {
    const appId      = process.env.GITHUB_APP_ID;
    const privateKey = getPrivateKeyForJWT();
    if (!appId || !privateKey) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iat: nowSec - 60, exp: nowSec + 540, iss: String(appId) })).toString('base64url');
    const sigInput = `${header}.${payload}`;

    try {
        const sig = crypto.createSign('RSA-SHA256').update(sigInput).sign(privateKey, 'base64url');
        return `${sigInput}.${sig}`;
    } catch (err) {
        logger.warn({ err: err.message }, 'JWT signing failed — falling back to local count');
        return null;
    }
}

/**
 * Fetch the real installation count from GitHub's API.
 * Paginates through all installations (100/page) to get the true total.
 * Returns the count, or null on error (caller uses fallback).
 */
async function fetchGitHubInstallationCount() {
    const jwt = signAppJWT();
    if (!jwt) return null;

    return new Promise((resolve) => {
        let total = 0;
        let page  = 1;

        function fetchPage() {
            const path = `/app/installations?per_page=100&page=${page}`;
            const req  = https.request({
                hostname: 'api.github.com',
                path,
                method:  'GET',
                headers: {
                    'Authorization': `Bearer ${jwt}`,
                    'Accept':        'application/vnd.github+json',
                    'User-Agent':    'poly-glot-ai-github-app/1.1.0',
                    'X-GitHub-Api-Version': '2022-11-28',
                }
            }, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk; });
                res.on('end', () => {
                    try {
                        if (res.statusCode !== 200) {
                            logger.warn({ status: res.statusCode, path }, 'GitHub API non-200');
                            return resolve(null);
                        }
                        const items = JSON.parse(body);
                        if (!Array.isArray(items)) return resolve(null);
                        total += items.length;
                        if (items.length === 100) {
                            // There may be more — fetch next page
                            page++;
                            fetchPage();
                        } else {
                            logger.info({ total, pages: page }, 'GitHub installation count fetched');
                            resolve(total);
                        }
                    } catch (e) {
                        logger.warn({ err: e.message }, 'GitHub API parse error');
                        resolve(null);
                    }
                });
            });
            req.on('error', (e) => {
                logger.warn({ err: e.message }, 'GitHub API request error');
                resolve(null);
            });
            req.setTimeout(8000, () => { req.destroy(); resolve(null); });
            req.end();
        }
        fetchPage();
    });
}

/**
 * Returns the cached GitHub installation count, refreshing if stale.
 * Falls back to the local installationSet.size if the API is unavailable.
 */
async function getInstallationCount() {
    const now = Date.now();
    if (now < _cacheExpiry) return _cachedInstallCount;

    const apiCount = await fetchGitHubInstallationCount();
    if (apiCount !== null) {
        // API is authoritative — use it, but floor at the local set size
        _cachedInstallCount = Math.max(apiCount, installationSet.size);
    } else {
        // API unavailable — use local set (floor only, won't survive restarts)
        _cachedInstallCount = installationSet.size;
    }
    _cacheExpiry = now + STATS_CACHE_TTL_MS;
    return _cachedInstallCount;
}

function monthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getInstallationUsage(installationId) {
    return usageStore.get(`${installationId}_${monthKey()}`) || 0;
}

function incrementInstallationUsage(installationId) {
    const key   = `${installationId}_${monthKey()}`;
    const count = (usageStore.get(key) || 0) + 1;
    usageStore.set(key, count);
    return count;
}

/**
 * Validate a license token against the poly-glot.ai auth API.
 * Returns the plan string ('pro'|'team'|'enterprise') or null if invalid/free.
 */
async function validateLicenseToken(token) {
    if (!token) return null;
    return new Promise((resolve) => {
        const body = JSON.stringify({ token });
        const req  = https.request(AUTH_API, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(PRO_PLANS.includes(json.plan) ? json.plan : null);
                } catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(5000, () => { req.destroy(); resolve(null); });
        req.write(body);
        req.end();
    });
}

/**
 * Get the license token for a repo from .polyglot.yml config or env.
 */
function getLicenseToken(config) {
    return config.licenseToken || config.license_token || process.env.POLYGLOT_LICENSE_TOKEN || '';
}

/**
 * Build the upgrade required comment body.
 */
function buildUpgradeComment(reason, used, limit) {
    return [
        `## 🔒 Poly-Glot AI — Upgrade Required`,
        ``,
        `**${reason}**`,
        ``,
        `| Plan | Price | PRs/month | Languages |`,
        `|------|-------|-----------|-----------|`,
        `| Free | $0 | ${limit} | JS, TS, Python, Java |`,
        `| Pro | $9/mo | Unlimited | All 12 languages |`,
        `| Team | $29/mo | Unlimited | All 12 + shared token |`,
        ``,
        `> 🎁 Use code **\`EARLYBIRD3\`** for **50% off your first 3 months**`,
        ``,
        `**[→ Upgrade at poly-glot.ai](${UPGRADE_URL})**`,
        ``,
        `Already subscribed? Add your license token to \`.polyglot.yml\`:`,
        `\`\`\`yaml`,
        `license_token: YOUR_TOKEN_HERE`,
        `\`\`\``,
        ``,
        `> Powered by [Poly-Glot AI](https://poly-glot.ai)`,
    ].join('\n');
}

const logger = pino({ name: 'poly-glot-app' });

const app = express();

// ── CORS — allow browser requests from poly-glot.ai and dashboard ────────────
app.use((_req, res, next) => {
  res.set('Access-Control-Allow-Origin',  '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});
app.options('*', (_req, res) => res.sendStatus(204));

// Capture raw body for signature verification BEFORE JSON parsing
app.use((req, _res, next) => {
  let data = '';
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => {
    req.rawBody = data;
    try { req.body = JSON.parse(data); } catch (e) { req.body = {}; }
    next();
  });
});

const PORT = process.env.PORT || 3000;

// ─── Health check ────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    name: 'Poly-Glot AI GitHub App',
    version: '1.1.1',
    status: 'running',
    docs: 'https://poly-glot.ai',
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Public stats endpoint (used by poly-glot.ai live counter) ───────────────
app.get('/stats', async (_req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'public, max-age=300'); // 5-min CDN cache
  try {
    const installations = await getInstallationCount();
    res.json({
      installations,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err: err.message }, '/stats error');
    res.json({
      installations: installationSet.size,
      timestamp: new Date().toISOString(),
    });
  }
});

// ─── Webhook signature verification ─────────────────────────
function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-hub-signature-256'];
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  // Skip verification if no secret configured or in development without signature
  if (!secret || !signature) {
    if (!secret) logger.warn('GITHUB_WEBHOOK_SECRET not set — skipping verification');
    if (!signature) logger.warn('No signature header — skipping verification (dev mode)');
    return next();
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(req.rawBody || JSON.stringify(req.body));
  const expected = `sha256=${hmac.digest('hex')}`;

  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      logger.warn({ received: signature, expected }, 'Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } catch (e) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
}

// ─── Webhook endpoint ────────────────────────────────────────
app.post('/webhook', verifyWebhookSignature, async (req, res) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;

  logger.info({ event, action: payload.action }, 'Webhook received');

  // Respond immediately — process async
  res.status(202).json({ status: 'accepted' });

  try {
    // Track every unique installation we see
    const installId = payload.installation?.id;
    if (installId) trackInstallation(installId);

    if (event === 'pull_request' && ['opened', 'synchronize'].includes(payload.action)) {
      await handlePullRequest(payload);
    } else if (event === 'installation') {
      logger.info({ installationId: installId, action: payload.action, account: payload.installation?.account?.login }, 'Installation event');
    } else {
      logger.debug({ event, action: payload.action }, 'Ignoring event');
    }
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack, event }, 'Error processing webhook');
  }
});

// ─── Pull Request Handler ────────────────────────────────────
async function handlePullRequest(payload) {
  const { pull_request: pr, installation, repository } = payload;
  const owner = repository.owner.login;
  const repo = repository.name;
  const pullNumber = pr.number;
  const headSha = pr.head.sha;
  const headRef = pr.head.ref;
  const installationId = installation.id;

  logger.info({ owner, repo, pullNumber, headSha }, 'Processing pull request');

  // Create authenticated client for this installation
  const octokit = createInstallationClient(installationId);

  // Create an in-progress check run
  await createCheckRun(octokit, owner, repo, headSha, 'in_progress', null, {
    title: 'Poly-Glot AI — Analyzing documentation coverage…',
    summary: 'Scanning changed files for missing documentation.',
  });

  // Load repo config (.polyglot.yml)
  const rawConfig = await getRepoConfig(octokit, owner, repo, headRef);
  const config = parseConfig(rawConfig);

  // ── Plan gate: validate license token ────────────────────────────────────
  const licenseToken = getLicenseToken(config);
  const plan         = await validateLicenseToken(licenseToken);
  const isPro        = PRO_PLANS.includes(plan);

  logger.info({ owner, repo, plan: plan || 'free', isPro }, 'Plan resolved');

  // ── Gate: monthly PR limit for free installations ─────────────────────────
  if (!isPro) {
      const used = getInstallationUsage(installationId);
      if (used >= FREE_PR_LIMIT) {
          logger.warn({ owner, repo, used, limit: FREE_PR_LIMIT }, 'Free PR limit reached');
          await createCheckRun(octokit, owner, repo, headSha, 'completed', 'neutral', {
              title: `Poly-Glot AI — Free plan limit reached (${used}/${FREE_PR_LIMIT} PRs this month)`,
              summary: buildUpgradeComment(
                  `You've used ${used}/${FREE_PR_LIMIT} free PR reviews this month.`,
                  used, FREE_PR_LIMIT
              ),
          });
          return;
      }
      // Increment usage
      incrementInstallationUsage(installationId);
      logger.info({ owner, repo, used: used + 1, limit: FREE_PR_LIMIT }, 'Free PR usage incremented');
  }

  // Resolve API keys: repo-level config → server environment variables
  const { openaiKey, anthropicKey } = await resolveApiKeys(octokit, owner, repo, config);
  config.openaiKey = openaiKey;
  config.anthropicKey = anthropicKey;

  if (!config.openaiKey && !config.anthropicKey) {
    logger.warn({ owner, repo }, 'No AI API key configured — posting setup instructions');

    // Post a helpful setup comment so the repo owner knows exactly what to do
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body: SETUP_COMMENT,
    });

    await createCheckRun(octokit, owner, repo, headSha, 'completed', 'neutral', {
      title: 'Poly-Glot AI — Setup required',
      summary: 'No API key found. See the comment on this PR for setup instructions, or visit https://poly-glot.ai.',
    });
    return;
  }

  // Auto-select provider based on available keys
  if (!config.openaiKey && config.provider === 'openai') {
    config.provider = 'anthropic';
  } else if (!config.anthropicKey && config.provider === 'anthropic') {
    config.provider = 'openai';
  }

  // Get changed files
  const files = await getPullRequestFiles(octokit, owner, repo, pullNumber);
  logger.info({ fileCount: files.length }, 'PR files fetched');

  // Filter and analyze files
  const reviewComments = [];
  const analysisResults = [];
  let processedCount = 0;

  for (const file of files) {
    // Skip deleted files, renames, and binary files
    if (file.status === 'removed' || !file.patch) continue;

    // Skip unsupported files
    if (shouldSkip(file.filename)) continue;
    const langInfo = detectLanguage(file.filename);
    if (!langInfo) continue;
    if (!isFileAllowed(file.filename, config)) continue;

    // ── Gate: language restriction for free plan ──────────────────────────
    if (!isPro && !FREE_LANGUAGES.includes(langInfo.language)) {
      logger.info(
        { file: file.filename, language: langInfo.language },
        'Skipping file — language requires Pro plan'
      );
      analysisResults.push({
        file: file.filename,
        needsDocs: false,
        score: 'N/A',
        reason: `🔒 ${langInfo.name} requires Pro plan (free: JS, TS, Python, Java)`,
      });
      continue;
    }

    // Respect max files limit
    if (processedCount >= config.maxFiles) {
      logger.info({ maxFiles: config.maxFiles }, 'Max files limit reached');
      break;
    }

    // Get full file content
    const content = await getFileContent(octokit, owner, repo, file.filename, headRef);
    if (!content) continue;

    // Check file size
    if (Buffer.byteLength(content) > config.maxFileSize) {
      logger.info({ file: file.filename, size: Buffer.byteLength(content) }, 'File too large, skipping');
      continue;
    }

    // Analyze documentation coverage
    const coverage = analyzeCoverage(content, file.filename);
    analysisResults.push({ file: file.filename, ...coverage });

    if (!coverage.needsDocs) {
      logger.info({ file: file.filename, score: coverage.score }, 'Documentation sufficient');
      continue;
    }

    // Generate documentation
    logger.info({ file: file.filename, mode: config.mode }, 'Generating documentation');
    const documented = await generateComments(content, file.filename, config, { mode: config.mode });

    if (!documented || documented === content) {
      logger.info({ file: file.filename }, 'No documentation changes needed');
      continue;
    }

    // Build a suggestion comment
    const firstChangedLine = extractFirstAddedLine(file.patch);

    reviewComments.push({
      path: file.filename,
      line: firstChangedLine || 1,
      body: buildSuggestionComment(file.filename, content, documented, langInfo, coverage),
    });

    processedCount++;
  }

  // Build analysis summary
  const summary = buildAnalysisSummary(analysisResults, reviewComments.length, config);

  // Post review if there are comments
  if (reviewComments.length > 0) {
    if (config.reviewStyle === 'inline') {
      await createReview(octokit, owner, repo, pullNumber, headSha, reviewComments, summary);
    } else {
      // Post as a single PR comment
      let body = summary + '\n\n---\n\n';
      for (const c of reviewComments) {
        body += c.body + '\n\n---\n\n';
      }
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body,
      });
    }
  }

  // Complete the check run
  const conclusion = reviewComments.length > 0 ? 'action_required' : 'success';
  await createCheckRun(octokit, owner, repo, headSha, 'completed', conclusion, {
    title: reviewComments.length > 0
      ? `Poly-Glot AI — ${reviewComments.length} file(s) need documentation`
      : 'Poly-Glot AI — All files well documented ✅',
    summary,
    text: analysisResults.map(r =>
      `| \`${r.file}\` | ${r.needsDocs ? '⚠️' : '✅'} | ${r.score} | ${r.reason} |`
    ).join('\n'),
  });

  logger.info({ owner, repo, pullNumber, comments: reviewComments.length }, 'PR processing complete');
}

// ─── Setup comment (shown when no API key is available) ──────

const SETUP_COMMENT = `## 🔑 Poly-Glot AI — Setup Required

To use Poly-Glot AI on this repository, you need to configure your API key.

**Option 1: Quick setup**
Add your OpenAI API key to this repository's secrets:
1. Go to **Settings → Secrets and variables → Actions**
2. Add a new secret named \`OPENAI_API_KEY\`
3. Paste your OpenAI API key (get one at [platform.openai.com](https://platform.openai.com/api-keys))

**Option 2: Use Anthropic**
Add \`ANTHROPIC_API_KEY\` instead.

Your key goes directly to OpenAI/Anthropic — Poly-Glot AI never sees it.

> 🔒 Powered by [Poly-Glot AI](https://poly-glot.ai) · Your code stays private`;

// ─── API key resolution ───────────────────────────────────────

/**
 * Resolve the AI API keys to use for this repository.
 *
 * Resolution order (first match wins):
 *   1. `openai_api_key` / `anthropic_api_key` fields in the repo's `.polyglot.yml`
 *      (only recommended for self-hosted deployments; not suitable for shared use)
 *   2. `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` from the server's environment variables
 *
 * GitHub Actions secrets cannot be read by GitHub Apps via the REST API — the
 * secrets endpoint only reveals whether a secret *exists*, not its value.  If
 * you need per-repo keys, embed them in `.polyglot.yml` (self-hosted) or
 * configure them through the Poly-Glot dashboard at https://poly-glot.ai.
 *
 * @param {import('@octokit/rest').Octokit} octokit - Authenticated installation client
 * @param {string} owner  - Repository owner / org login
 * @param {string} repo   - Repository name
 * @param {object} config - Already-parsed .polyglot.yml config object
 * @returns {Promise<{ openaiKey: string|undefined, anthropicKey: string|undefined }>}
 */
async function resolveApiKeys(octokit, owner, repo, config) {
  // 1. Keys embedded directly in .polyglot.yml (e.g. self-hosted setups)
  if (config.openai_api_key || config.anthropic_api_key) {
    logger.info({ owner, repo }, 'Using API key from .polyglot.yml');
    return {
      openaiKey: config.openai_api_key || undefined,
      anthropicKey: config.anthropic_api_key || undefined,
    };
  }

  // 2. Server-level environment variables (the app operator's keys)
  if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) {
    logger.info({ owner, repo }, 'Using API key from server environment');
    return {
      openaiKey: process.env.OPENAI_API_KEY,
      anthropicKey: process.env.ANTHROPIC_API_KEY,
    };
  }

  // 3. Nothing found — caller will post setup instructions
  logger.warn({ owner, repo }, 'No API key found in .polyglot.yml or server environment');
  return { openaiKey: undefined, anthropicKey: undefined };
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Extract the first added line number from a patch.
 */
function extractFirstAddedLine(patch) {
  if (!patch) return 1;
  const lines = patch.split('\n');
  let currentLine = 0;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      return currentLine;
    }
    if (!line.startsWith('-')) {
      currentLine++;
    }
  }

  return 1;
}

/**
 * Build a suggestion comment with the documented code.
 */
/**
 * Build a deep-link URL to poly-glot.ai with the file code pre-loaded.
 * Encodes the original source so users can edit and re-generate in the web UI.
 * @param {string} code - Original source code
 * @param {string} filePath - File path (used for language detection)
 * @param {object} langInfo - Language info object
 * @returns {string} Full URL to poly-glot.ai with code pre-loaded
 */
function buildDeepLink(code, filePath, langInfo) {
  // Encode the code as base64 to safely pass as a URL parameter
  const encoded = Buffer.from(code).toString('base64');
  const ext = filePath.slice(filePath.lastIndexOf('.') + 1);
  const params = new URLSearchParams({
    code: encoded,
    lang: langInfo.language,
    style: langInfo.docStyle,
    file: filePath,
    ext,
    ref: 'github-app',
  });
  return `https://poly-glot.ai/?${params.toString()}`;
}

function buildSuggestionComment(filePath, original, documented, langInfo, coverage) {
  const deepLink = buildDeepLink(original, filePath, langInfo);

  return [
    `### 📝 Poly-Glot AI — Documentation Suggestion`,
    ``,
    `**\`${filePath}\`** — ${langInfo.name} (${langInfo.docStyle}) — Coverage: ${Math.round(coverage.score * 100)}%`,
    ``,
    `<details>`,
    `<summary>📄 View suggested documented version (click to expand)</summary>`,
    ``,
    '```' + (langInfo.language || ''),
    documented,
    '```',
    ``,
    `</details>`,
    ``,
    `| Action | Link |`,
    `|--------|------|`,
    `| 🌐 **Edit & regenerate in Poly-Glot AI** | [Open \`${filePath}\` in web editor →](${deepLink}) |`,
    `| 💻 **Use in VS Code** | [Install VS Code Extension →](https://marketplace.visualstudio.com/items?itemName=poly-glot-ai.poly-glot) |`,
    `| ⌨️ **Use CLI** | \`npx poly-glot-ai-cli comment ${filePath}\` |`,
    ``,
    `> 💡 The **web editor link** opens poly-glot.ai with this file's code pre-loaded — regenerate with different settings, modes, or your own API key.`,
    `> Powered by [Poly-Glot AI](https://poly-glot.ai) · ${langInfo.docStyle} format`,
  ].join('\n');
}

/**
 * Build the analysis summary for the review body.
 */
function buildAnalysisSummary(results, commentCount, config) {
  const total = results.length;
  const needsDocs = results.filter(r => r.needsDocs).length;
  const avgScore = total > 0
    ? Math.round((results.reduce((sum, r) => sum + r.score, 0) / total) * 100)
    : 100;

  return [
    `## 🤖 Poly-Glot AI Documentation Analysis`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Files analyzed | ${total} |`,
    `| Files needing docs | ${needsDocs} |`,
    `| Average coverage | ${avgScore}% |`,
    `| Comment mode | ${config.mode} |`,
    `| Provider | ${config.provider} |`,
    ``,
    commentCount > 0
      ? `📝 **${commentCount} file(s)** have documentation suggestions below.`
      : `✅ All analyzed files meet the documentation threshold (${Math.round(config.coverageThreshold * 100)}%).`,
    ``,
    `| 🌐 [Open Poly-Glot AI Web Editor](https://poly-glot.ai/?ref=github-app) | 💻 [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=poly-glot-ai.poly-glot) | ⌨️ [CLI on npm](https://www.npmjs.com/package/poly-glot-ai-cli) |`,
    `|---|---|---|`,
    ``,
    `> Configure via \`.polyglot.yml\` in your repo root · [Documentation](https://poly-glot.ai) · [GitHub App Source](https://github.com/hmoses/poly-glot-github-app)`,
  ].join('\n');
}

// ─── Start server ────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info({ port: PORT }, '🚀 Poly-Glot AI GitHub App is running');
  // Warm the installation count cache immediately on boot so the first
  // /stats request is served from cache without blocking
  getInstallationCount()
    .then(n => logger.info({ installations: n }, 'Installation count warmed'))
    .catch(() => {});
});

module.exports = app;
