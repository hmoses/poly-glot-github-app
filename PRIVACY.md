# Privacy Policy — Poly-Glot AI GitHub App

**Last updated:** April 2, 2025

## Overview

Poly-Glot AI ("the App") is a GitHub App that analyzes pull request code changes and generates documentation comment suggestions. This policy explains what data the App accesses, how it processes that data, and your rights.

## What Data We Access

When installed on a repository, the App accesses:

- **Pull request metadata**: PR number, title, branch names, commit SHAs
- **Changed file contents**: Source code of files modified in a pull request (read-only)
- **Repository configuration**: `.polyglot.yml` file if present in the repo root

## How We Process Data

1. **In-memory processing only**: Code is read from GitHub's API, processed in memory, and discarded immediately after the AI generates documentation suggestions.
2. **AI provider calls**: Code snippets are sent to OpenAI or Anthropic (depending on configuration) to generate documentation comments. These calls are governed by OpenAI's and Anthropic's respective privacy policies.
3. **No persistent storage**: We do not store, log, or retain any source code, file contents, or repository data.
4. **No analytics on code**: We do not analyze your code for any purpose other than generating documentation comments for the specific PR being processed.

## Third-Party Services

The App uses the following third-party services to generate documentation:

- **OpenAI API** ([Privacy Policy](https://openai.com/policies/privacy-policy/)): Used when configured as the AI provider
- **Anthropic API** ([Privacy Policy](https://www.anthropic.com/privacy)): Used when configured as the AI provider

Both providers have data processing agreements that prohibit using API inputs for model training.

## What We Do NOT Do

- ❌ Store or log your source code
- ❌ Share code with any party other than your configured AI provider
- ❌ Use your code for training AI models
- ❌ Track individual developers
- ❌ Collect personal information
- ❌ Sell any data

## Data Flow

```
GitHub PR Event → App Server (in-memory) → AI Provider → Documentation Suggestions → GitHub PR Review
                                                          ↓
                                                   Memory cleared
```

## Your Rights

- **Uninstall at any time**: Remove the App from your GitHub organization or repository settings
- **Configuration control**: Use `.polyglot.yml` to control which files are analyzed
- **Self-hosting**: You may self-host the App to keep all processing within your own infrastructure

## Self-Hosted Deployments

If you self-host the Poly-Glot AI GitHub App, all data processing occurs entirely within your infrastructure. No data is sent to Poly-Glot AI servers. The only external calls are to your configured AI provider (OpenAI or Anthropic).

## Contact

For privacy questions or concerns:

- **Email**: hwmoses2@icloud.com
- **Website**: [poly-glot.ai](https://poly-glot.ai)
- **GitHub**: [github.com/hmoses](https://github.com/hmoses)

## Changes

We may update this privacy policy from time to time. Changes will be posted in this repository and noted with an updated date.
