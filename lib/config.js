/**
 * Configuration parser for Poly-Glot AI GitHub App.
 * Reads .polyglot.yml from the repo and merges with defaults.
 */

const yaml = require('js-yaml');
const logger = require('pino')({ name: 'config' });

/**
 * Default configuration values.
 */
const DEFAULTS = {
  // AI provider: 'openai' or 'anthropic'
  provider: 'openai',

  // Model to use
  model: null, // null = provider default

  // Comment mode: 'doc', 'why', or 'both'
  mode: 'doc',

  // Only comment files with less than this documentation coverage ratio
  coverageThreshold: 0.5,

  // Maximum number of files to process per PR
  maxFiles: 15,

  // Maximum file size in bytes (skip very large files)
  maxFileSize: 50000,

  // File patterns to include (empty = all supported)
  include: [],

  // File patterns to exclude
  exclude: [],

  // Whether to post inline review comments or a single PR comment
  reviewStyle: 'inline', // 'inline' or 'summary'

  // Whether to create a GitHub Check Run with coverage analysis
  checkRun: true,
};

/**
 * Parse a .polyglot.yml config string and merge with defaults.
 * @param {string|null} yamlString - Raw YAML content from the repo
 * @returns {object} Merged configuration
 */
function parseConfig(yamlString) {
  if (!yamlString) return { ...DEFAULTS };

  try {
    const parsed = yaml.load(yamlString);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS };

    return {
      provider:          parsed.provider || DEFAULTS.provider,
      model:             parsed.model || DEFAULTS.model,
      mode:              parsed.mode || DEFAULTS.mode,
      coverageThreshold: parsed.coverage_threshold ?? DEFAULTS.coverageThreshold,
      maxFiles:          parsed.max_files ?? DEFAULTS.maxFiles,
      maxFileSize:       parsed.max_file_size ?? DEFAULTS.maxFileSize,
      include:           Array.isArray(parsed.include) ? parsed.include : DEFAULTS.include,
      exclude:           Array.isArray(parsed.exclude) ? parsed.exclude : DEFAULTS.exclude,
      reviewStyle:       parsed.review_style || DEFAULTS.reviewStyle,
      checkRun:          parsed.check_run ?? DEFAULTS.checkRun,
    };
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to parse .polyglot.yml, using defaults');
    return { ...DEFAULTS };
  }
}

/**
 * Check if a file path matches the include/exclude patterns.
 * @param {string} filePath
 * @param {object} config
 * @returns {boolean}
 */
function isFileAllowed(filePath, config) {
  // Check excludes first
  if (config.exclude.length > 0) {
    for (const pattern of config.exclude) {
      if (filePath.includes(pattern) || matchGlob(filePath, pattern)) {
        return false;
      }
    }
  }

  // If includes are specified, file must match at least one
  if (config.include.length > 0) {
    return config.include.some(
      pattern => filePath.includes(pattern) || matchGlob(filePath, pattern)
    );
  }

  return true;
}

/**
 * Simple glob matcher (supports * and **).
 * @param {string} filePath
 * @param {string} pattern
 * @returns {boolean}
 */
function matchGlob(filePath, pattern) {
  const regex = pattern
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*')
    .replace(/\./g, '\\.');

  return new RegExp(`^${regex}$`).test(filePath);
}

module.exports = {
  DEFAULTS,
  parseConfig,
  isFileAllowed,
};
