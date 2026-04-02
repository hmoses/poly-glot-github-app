/**
 * Core documentation generation engine for Poly-Glot AI GitHub App.
 * Calls OpenAI or Anthropic to generate doc comments for code.
 */

const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { detectLanguage } = require('./languages');
const logger = require('pino')({ name: 'polyglot' });

/**
 * Build the system prompt for documentation generation.
 * @param {string} docStyle - The doc comment style (jsdoc, pydoc, javadoc, etc.)
 * @param {string} languageName - Human-readable language name
 * @param {object} options - Generation options
 * @returns {string}
 */
function buildSystemPrompt(docStyle, languageName, options = {}) {
  const commentTypes = [];
  if (options.mode === 'why' || options.mode === 'both') {
    commentTypes.push('why-comments that explain the reasoning, trade-offs, and edge cases behind the code');
  }
  if (options.mode === 'doc' || options.mode === 'both' || !options.mode) {
    commentTypes.push(`standard ${docStyle} documentation comments with parameter descriptions, return types, and thrown exceptions`);
  }

  return `You are Poly-Glot AI, an expert code documentation engine.
Your task is to add ${commentTypes.join(' AND ')} to ${languageName} code.

Rules:
1. Output ONLY the documented code — no markdown fences, no explanations, no extra text.
2. Use the ${docStyle} comment format standard for ${languageName}.
3. Preserve the original code exactly — only add comments, never change logic.
4. For functions/methods/classes without documentation, add complete doc comments.
5. For functions that already have docs, leave them untouched unless they are clearly wrong.
6. Keep comments concise but informative.
7. If adding why-comments, place them as inline comments near the relevant code explaining the reasoning.
8. Do not add trivial comments like "// increment i" — only document non-obvious behavior.`;
}

/**
 * Generate documentation comments for a code snippet.
 * @param {string} code - The source code to document
 * @param {string} filePath - File path (used for language detection)
 * @param {object} config - App configuration
 * @param {object} options - Generation options { mode: 'doc'|'why'|'both' }
 * @returns {Promise<string|null>} Documented code or null if unsupported
 */
async function generateComments(code, filePath, config, options = {}) {
  const langInfo = detectLanguage(filePath);
  if (!langInfo) {
    logger.info({ filePath }, 'Unsupported file type, skipping');
    return null;
  }

  const systemPrompt = buildSystemPrompt(langInfo.docStyle, langInfo.name, options);

  const userMessage = `Add documentation comments to this ${langInfo.name} code:\n\n${code}`;

  if (config.provider === 'anthropic') {
    return callAnthropic(systemPrompt, userMessage, config);
  }
  return callOpenAI(systemPrompt, userMessage, config);
}

/**
 * Call OpenAI API to generate documentation.
 */
async function callOpenAI(systemPrompt, userMessage, config) {
  const client = new OpenAI({ apiKey: config.openaiKey });

  const response = await client.chat.completions.create({
    model: config.model || 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.2,
    max_tokens: 8192,
  });

  return response.choices[0]?.message?.content?.trim() || null;
}

/**
 * Call Anthropic API to generate documentation.
 */
async function callAnthropic(systemPrompt, userMessage, config) {
  const client = new Anthropic({ apiKey: config.anthropicKey });

  const response = await client.messages.create({
    model: config.model || 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userMessage },
    ],
    temperature: 0.2,
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock?.text?.trim() || null;
}

/**
 * Analyze a code file and determine if it needs documentation.
 * Returns a rough "documentation density" score.
 * @param {string} code - Source code
 * @param {string} filePath - File path
 * @returns {{ needsDocs: boolean, score: number, reason: string }}
 */
function analyzeCoverage(code, filePath) {
  const langInfo = detectLanguage(filePath);
  if (!langInfo) {
    return { needsDocs: false, score: 1.0, reason: 'Unsupported file type' };
  }

  const lines = code.split('\n');
  const totalLines = lines.length;

  if (totalLines < 5) {
    return { needsDocs: false, score: 1.0, reason: 'File too small' };
  }

  // Count function/method/class declarations (rough heuristic)
  const funcPatterns = {
    javascript:  /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\(|[^=]+=>\s*)|\w+\s*\(.*\)\s*\{)/,
    typescript:  /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*[=:]\s*(?:async\s+)?(?:function|\(|[^=]+=>\s*)|\w+\s*\(.*\)\s*[:{])/,
    python:      /(?:def\s+\w+|class\s+\w+)/,
    java:        /(?:(?:public|private|protected|static)\s+.*\w+\s*\(|class\s+\w+)/,
    kotlin:      /(?:fun\s+\w+|class\s+\w+)/,
    c:           /(?:\w+\s+\w+\s*\()/,
    cpp:         /(?:\w+\s+\w+\s*\(|class\s+\w+)/,
    csharp:      /(?:(?:public|private|protected|static)\s+.*\w+\s*\(|class\s+\w+)/,
    go:          /(?:func\s+(?:\(\w+\s+\*?\w+\)\s+)?\w+)/,
    rust:        /(?:fn\s+\w+|struct\s+\w+|impl\s+\w+|trait\s+\w+)/,
    swift:       /(?:func\s+\w+|class\s+\w+|struct\s+\w+)/,
    php:         /(?:function\s+\w+|class\s+\w+)/,
    ruby:        /(?:def\s+\w+|class\s+\w+|module\s+\w+)/,
  };

  const docPatterns = {
    jsdoc:   /\/\*\*[\s\S]*?\*\//g,
    tsdoc:   /\/\*\*[\s\S]*?\*\//g,
    pydoc:   /"""[\s\S]*?"""|\'\'\'[\s\S]*?\'\'\'/g,
    javadoc: /\/\*\*[\s\S]*?\*\//g,
    kdoc:    /\/\*\*[\s\S]*?\*\//g,
    doxygen: /\/\*\*[\s\S]*?\*\/|\/\/\/.*$/gm,
    xmldoc:  /\/\/\/.*$/gm,
    godoc:   /\/\/\s+\w+.*$/gm,
    rustdoc: /\/\/\/.*$/gm,
    swift:   /\/\/\/.*$/gm,
    phpdoc:  /\/\*\*[\s\S]*?\*\//g,
    yard:    /#\s+@\w+|#\s+\w+.*$/gm,
  };

  const funcPattern = funcPatterns[langInfo.language];
  const docPattern = docPatterns[langInfo.docStyle];

  if (!funcPattern) {
    return { needsDocs: false, score: 0.5, reason: 'Cannot analyze this language' };
  }

  let funcCount = 0;
  for (const line of lines) {
    if (funcPattern.test(line)) funcCount++;
  }

  if (funcCount === 0) {
    return { needsDocs: false, score: 1.0, reason: 'No functions detected' };
  }

  const docMatches = code.match(docPattern) || [];
  const docCount = docMatches.length;

  const score = Math.min(docCount / funcCount, 1.0);
  const needsDocs = score < 0.5; // Less than 50% coverage

  return {
    needsDocs,
    score: Math.round(score * 100) / 100,
    reason: `${docCount}/${funcCount} functions documented (${Math.round(score * 100)}%)`,
  };
}

module.exports = {
  generateComments,
  analyzeCoverage,
  buildSystemPrompt,
};
