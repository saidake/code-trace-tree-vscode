# Contributing

Welcome! This short guide explains how to contribute effectively to **Code Trace Tree** (VS Code / Cursor).

## Submitting an issue

- If you find a bug, please submit an issue to our GitHub [repository](https://github.com/saidake/code-trace-tree-vscode/issues).
- Before submitting, search the issue tracker to see if your problem already exists.
- Include the extension version, VS Code / Cursor version, OS, and enough detail to reproduce the problem.

## Branch Naming Convention

Use lowercase, kebab-case, and a type prefix:

- `feature/<short-title>`
- `bugfix/<short-title>`
- `docs/<short-title>`

**Example**: `bugfix/fix-trace-point-highlight`

For release preparation branches:

- `release/<version>`

**Example**: `release/1.0.1`

## Commits

- Keep commits small and focused.
- Prefer this repository's commit style:

```text
type: short summary
```

The summary starts with a lowercase letter (do not capitalize the first word).

**Examples**:

- `feat: reorder editor menu and add go-to-tree action`
- `fix: selection is lost after renaming a trace point`
- `docs: add Preview section and update How to use`

Common types: `feat`, `fix`, `docs`/`doc`, `style`, `refactor`, `chore`, `ci`.

See [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for additional inspiration.

## Development Setup

The extension module lives under `main/`.

### Prerequisites

- Node.js and yarn
- VS Code or Cursor

### Build / run

```bash
cd main && yarn install
```

Press **F5** to launch an Extension Development Host.

### Checks before opening a PR

```bash
cd main
yarn compile
```

Manually smoke-test the flows you touched in the Extension Development Host when possible.

## Pull Requests

1. Fork the repo on GitHub
2. Create a branch from `main` (see [Branch Naming](#branch-naming-convention))
3. Make the changes and push (see [Commits](#commits))
4. Open a pull request with enough context to review and verify

Thank you for contributing!
