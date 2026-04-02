<div align="center">

# 🤖 Poly-Glot AI — GitHub App

**Automatically add professional documentation comments to your pull requests.**

JSDoc · PyDoc · Javadoc · Doxygen · KDoc · GoDoc · Rustdoc · and more

[![GitHub Marketplace](https://img.shields.io/badge/GitHub%20Marketplace-Poly--Glot%20AI-blue?logo=github)](https://github.com/marketplace/poly-glot-ai)
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Extension-007ACC?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=poly-glot-ai.poly-glot)
[![Website](https://img.shields.io/badge/Website-poly--glot.ai-7dd3fc)](https://poly-glot.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## 🚀 What It Does

Poly-Glot AI automatically reviews your pull requests and suggests professional documentation comments for undocumented code. When you open or update a PR, the app:

1. 🔍 **Scans** changed files for missing documentation
2. 📊 **Analyzes** documentation coverage per file
3. 🤖 **Generates** doc comments using OpenAI or Anthropic
4. 💬 **Posts** inline review suggestions directly on your PR
5. ✅ **Reports** a Check Run with coverage metrics

## 🌐 Supported Languages (12)

| Language | Doc Format | Extensions |
|----------|-----------|------------|
| JavaScript | JSDoc | `.js`, `.jsx`, `.mjs`, `.cjs` |
| TypeScript | TSDoc | `.ts`, `.tsx` |
| Python | PyDoc | `.py`, `.pyi` |
| Java | Javadoc | `.java` |
| Kotlin | KDoc | `.kt`, `.kts` |
| C | Doxygen | `.c`, `.h` |
| C++ | Doxygen | `.cpp`, `.hpp`, `.cc`, `.cxx` |
| C# | XML Doc | `.cs` |
| Go | GoDoc | `.go` |
| Rust | Rustdoc | `.rs` |
| Swift | Swift Markup | `.swift` |
| PHP | PHPDoc | `.php` |
| Ruby | YARD | `.rb`, `.rake` |

## ⚡ Quick Start

### 1. Install from GitHub Marketplace

👉 [**Install Poly-Glot AI**](https://github.com/marketplace/poly-glot-ai) on your repositories.

### 2. Configure (Optional)

Add a `.polyglot.yml` to your repository root:

```yaml
# AI provider: 'openai' or 'anthropic'
provider: openai

# Comment mode: 'doc', 'why', or 'both'
# - doc: Standard documentation comments (JSDoc, PyDoc, etc.)
# - why: Explain reasoning, trade-offs, and edge cases
# - both: Both doc comments and why-comments
mode: both

# Only suggest docs for files below this coverage threshold (0.0–1.0)
coverage_threshold: 0.5

# Maximum files to process per PR
max_files: 15

# Maximum file size in bytes
max_file_size: 50000

# Review style: 'inline' (per-file suggestions) or 'summary' (single comment)
review_style: inline

# Include/exclude file patterns
include: []
exclude:
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/vendor/**"

# Create a GitHub Check Run with coverage analysis
check_run: true
```

### 3. Open a Pull Request

That's it! Poly-Glot AI will automatically analyze your PR and post documentation suggestions.

## 💡 Comment Modes

### 📖 Doc Mode (default)
Generates standard documentation comments — parameters, return types, exceptions:

```javascript
/**
 * Authenticate a user with email and password.
 * @param {string} email - The user's email address
 * @param {string} password - The user's password (plaintext, hashed internally)
 * @returns {Promise<AuthResult>} Authentication result with token and user profile
 * @throws {AuthenticationError} If credentials are invalid
 */
async function authenticateUser(email, password) { ... }
```

### 🧠 Why Mode
Explains the *reasoning* behind code decisions:

```javascript
// Why: Rate-limit auth attempts per IP to prevent credential stuffing.
// 5 attempts/min was chosen based on OWASP guidelines.
// Uses sliding window instead of fixed to prevent burst attacks at window edges.
if (await isRateLimited(ip, 5, 60)) { ... }
```

### 📖🧠 Both Mode
Combines doc comments AND why-comments for maximum context.

## 🔒 Privacy & Security

- **Your code stays private** — the app reads PR diffs only for analysis
- **Your API key** — uses your own OpenAI or Anthropic key
- **No data retention** — code is processed in memory, never stored
- **Open source** — audit every line of this app

See [PRIVACY.md](PRIVACY.md) for our full privacy policy.

## 🏗️ Self-Hosting

You can self-host the Poly-Glot AI GitHub App:

### Using Docker

```bash
# Clone the repo
git clone https://github.com/hmoses/poly-glot-github-app.git
cd poly-glot-github-app

# Configure
cp .env.example .env
# Edit .env with your GitHub App credentials and API keys

# Run
docker-compose up -d
```

### Using Node.js

```bash
git clone https://github.com/hmoses/poly-glot-github-app.git
cd poly-glot-github-app
npm install
cp .env.example .env
# Edit .env with your credentials
npm start
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_APP_ID` | ✅ | Your GitHub App ID |
| `GITHUB_PRIVATE_KEY` | ✅ | Your GitHub App private key (PEM) |
| `GITHUB_WEBHOOK_SECRET` | ✅ | Webhook secret for signature verification |
| `OPENAI_API_KEY` | ⚡ | OpenAI API key (at least one AI key required) |
| `ANTHROPIC_API_KEY` | ⚡ | Anthropic API key (at least one AI key required) |
| `PORT` | ❌ | Server port (default: 3000) |

## 🧩 Ecosystem

Poly-Glot AI is available across multiple platforms:

| Platform | Link |
|----------|------|
| 🌐 Web App | [poly-glot.ai](https://poly-glot.ai) |
| 💻 VS Code Extension | [Marketplace](https://marketplace.visualstudio.com/items?itemName=poly-glot-ai.poly-glot) |
| 🤖 GitHub App | [Marketplace](https://github.com/marketplace/poly-glot-ai) |
| 🖥️ CLI | `npx poly-glot-ai-cli` |
| 🔌 MCP Server | `poly-glot-mcp` |

## 📝 License

[MIT](LICENSE) — Harold Moses / Poly-Glot AI

---

<div align="center">

**[poly-glot.ai](https://poly-glot.ai)** · Add documentation to any codebase — in seconds.

</div>
