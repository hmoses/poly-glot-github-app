/**
 * Language detection and comment style mapping for Poly-Glot AI GitHub App.
 * Supports 12 languages with their standard documentation comment formats.
 */

const LANGUAGE_MAP = {
  // JavaScript / TypeScript — JSDoc
  '.js':   { language: 'javascript',  docStyle: 'jsdoc',    name: 'JavaScript' },
  '.jsx':  { language: 'javascript',  docStyle: 'jsdoc',    name: 'JSX' },
  '.ts':   { language: 'typescript',  docStyle: 'tsdoc',    name: 'TypeScript' },
  '.tsx':  { language: 'typescript',  docStyle: 'tsdoc',    name: 'TSX' },
  '.mjs':  { language: 'javascript',  docStyle: 'jsdoc',    name: 'JavaScript (ESM)' },
  '.cjs':  { language: 'javascript',  docStyle: 'jsdoc',    name: 'JavaScript (CJS)' },

  // Python — PyDoc / reStructuredText / Google / NumPy
  '.py':   { language: 'python',      docStyle: 'pydoc',    name: 'Python' },
  '.pyi':  { language: 'python',      docStyle: 'pydoc',    name: 'Python (stub)' },

  // Java — Javadoc
  '.java': { language: 'java',        docStyle: 'javadoc',  name: 'Java' },

  // Kotlin — KDoc
  '.kt':   { language: 'kotlin',      docStyle: 'kdoc',     name: 'Kotlin' },
  '.kts':  { language: 'kotlin',      docStyle: 'kdoc',     name: 'Kotlin Script' },

  // C / C++ — Doxygen
  '.c':    { language: 'c',           docStyle: 'doxygen',  name: 'C' },
  '.h':    { language: 'c',           docStyle: 'doxygen',  name: 'C Header' },
  '.cpp':  { language: 'cpp',         docStyle: 'doxygen',  name: 'C++' },
  '.hpp':  { language: 'cpp',         docStyle: 'doxygen',  name: 'C++ Header' },
  '.cc':   { language: 'cpp',         docStyle: 'doxygen',  name: 'C++' },
  '.cxx':  { language: 'cpp',         docStyle: 'doxygen',  name: 'C++' },

  // C# — XML doc comments
  '.cs':   { language: 'csharp',      docStyle: 'xmldoc',   name: 'C#' },

  // Go — GoDoc
  '.go':   { language: 'go',          docStyle: 'godoc',    name: 'Go' },

  // Rust — Rustdoc
  '.rs':   { language: 'rust',        docStyle: 'rustdoc',  name: 'Rust' },

  // Swift — Swift markup
  '.swift':{ language: 'swift',       docStyle: 'swift',    name: 'Swift' },

  // PHP — PHPDoc
  '.php':  { language: 'php',         docStyle: 'phpdoc',   name: 'PHP' },

  // Ruby — YARD
  '.rb':   { language: 'ruby',        docStyle: 'yard',     name: 'Ruby' },
  '.rake': { language: 'ruby',        docStyle: 'yard',     name: 'Ruby (Rake)' },
};

/**
 * Files and directories to always skip.
 */
const SKIP_PATTERNS = [
  /node_modules\//,
  /vendor\//,
  /dist\//,
  /build\//,
  /\.min\./,
  /\.bundle\./,
  /\.test\./,
  /\.spec\./,
  /__tests__\//,
  /\.d\.ts$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
];

/**
 * Detect language info from a file path.
 * @param {string} filePath
 * @returns {{ language: string, docStyle: string, name: string } | null}
 */
function detectLanguage(filePath) {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return LANGUAGE_MAP[ext] || null;
}

/**
 * Check if a file should be skipped.
 * @param {string} filePath
 * @returns {boolean}
 */
function shouldSkip(filePath) {
  return SKIP_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Get all supported file extensions.
 * @returns {string[]}
 */
function supportedExtensions() {
  return Object.keys(LANGUAGE_MAP);
}

module.exports = {
  LANGUAGE_MAP,
  detectLanguage,
  shouldSkip,
  supportedExtensions,
};
