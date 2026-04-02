/**
 * GitHub API helpers for Poly-Glot AI GitHub App.
 * Handles authentication, fetching PR files, and posting review comments.
 */

const { createAppAuth } = require('@octokit/auth-app');
const { Octokit } = require('octokit');
const logger = require('pino')({ name: 'github' });

/**
 * Create an authenticated Octokit instance for a specific installation.
 * @param {number} installationId - GitHub App installation ID
 * @returns {Octokit}
 */
function createInstallationClient(installationId) {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_PRIVATE_KEY,
      installationId,
    },
  });
}

/**
 * Get the list of files changed in a pull request.
 * @param {Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @returns {Promise<Array>} List of changed files with patch data
 */
async function getPullRequestFiles(octokit, owner, repo, pullNumber) {
  const files = [];
  let page = 1;

  while (true) {
    const { data } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
      page,
    });

    files.push(...data);

    if (data.length < 100) break;
    page++;
  }

  return files;
}

/**
 * Get file contents from a specific ref.
 * @param {Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {string} path
 * @param {string} ref - Branch or commit SHA
 * @returns {Promise<string>} File contents as UTF-8 string
 */
async function getFileContent(octokit, owner, repo, path, ref) {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if (data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }

    return data.content || '';
  } catch (err) {
    if (err.status === 404) {
      logger.warn({ path, ref }, 'File not found');
      return null;
    }
    throw err;
  }
}

/**
 * Create a pull request review with inline comments suggesting documentation.
 * @param {Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @param {string} commitSha - The head commit SHA of the PR
 * @param {Array<{ path: string, body: string, line: number }>} comments - Inline comments
 * @param {string} summary - Review body/summary
 */
async function createReview(octokit, owner, repo, pullNumber, commitSha, comments, summary) {
  try {
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: commitSha,
      body: summary,
      event: 'COMMENT',
      comments: comments.map(c => ({
        path: c.path,
        body: c.body,
        line: c.line,
        side: 'RIGHT',
      })),
    });

    logger.info({ owner, repo, pullNumber, commentCount: comments.length }, 'Review posted');
  } catch (err) {
    // If inline comments fail (e.g., line not in diff), fall back to a PR comment
    logger.warn({ err: err.message }, 'Failed to post inline review, falling back to PR comment');
    await postPRComment(octokit, owner, repo, pullNumber, summary, comments);
  }
}

/**
 * Fallback: post documentation suggestions as a single PR comment.
 */
async function postPRComment(octokit, owner, repo, pullNumber, summary, comments) {
  let body = summary + '\n\n---\n\n';
  body += '### 📝 Suggested Documentation\n\n';

  for (const c of comments) {
    body += `**\`${c.path}\`** (line ${c.line}):\n${c.body}\n\n`;
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: pullNumber,
    body,
  });
}

/**
 * Get the .polyglot.yml configuration from a repository (if it exists).
 * @param {Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {string} ref
 * @returns {Promise<string|null>}
 */
async function getRepoConfig(octokit, owner, repo, ref) {
  // Try both .polyglot.yml and .polyglot.yaml
  for (const filename of ['.polyglot.yml', '.polyglot.yaml']) {
    const content = await getFileContent(octokit, owner, repo, filename, ref);
    if (content) return content;
  }
  return null;
}

/**
 * Post a check run with documentation analysis results.
 * @param {Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {string} headSha
 * @param {string} status - 'in_progress' | 'completed'
 * @param {string} conclusion - 'success' | 'neutral' | 'action_required'
 * @param {object} output - { title, summary, text }
 */
async function createCheckRun(octokit, owner, repo, headSha, status, conclusion, output) {
  try {
    await octokit.rest.checks.create({
      owner,
      repo,
      name: 'Poly-Glot AI Documentation',
      head_sha: headSha,
      status,
      conclusion,
      output,
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to create check run');
  }
}

module.exports = {
  createInstallationClient,
  getPullRequestFiles,
  getFileContent,
  createReview,
  getRepoConfig,
  createCheckRun,
};
