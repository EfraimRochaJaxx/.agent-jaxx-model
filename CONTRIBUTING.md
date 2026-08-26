# Contributing to Agent Jaxx Model

Thank you for your interest in contributing to **Agent Jaxx Model**!

## Dogfooding Philosophy

Agent Jaxx Model manages its own development using its own framework. All contributors (humans and AI agents) follow the protocol documented in [`AGENTS.md`](./AGENTS.md).

## Development Workflow

1. **Clone and Install Dependencies**:
   ```bash
   git clone https://github.com/Jaxx-Systems/agent-jaxx-model.git
   cd agent-jaxx-model
   npm install
   ```

2. **Open a Managed Session**:
   ```bash
   node packages/cli/dist/index.js session open --agent <your-name>
   ```

3. **Check Architecture & Impact**:
   - Before refactoring core types or shared modules, check the Dependency Graph in the dashboard:
     ```bash
     npm run dashboard:start
     ```
   - Inspect downstream blast radius for files you plan to modify.

4. **Run Pre-Commit Verification**:
   ```bash
   node packages/cli/dist/index.js verify
   ```
   This automatically runs the quality gates (`doctor --quality`), AST complexity checks, and test suites.

5. **Closing Work**:
   ```bash
   node packages/cli/dist/index.js session close --summary "<what was done and how it was verified>"
   ```

## Code Quality Standards

- **TypeScript**: Strict type-checking with zero `any` leaks.
- **Cyclomatic Complexity**: Max complexity threshold $\le 10$ per function.
- **Testing**: 100% test coverage for security boundaries and schema validations (`npx vitest run`).
- **Whitelabel Invariant**: No hardcoded project assumptions in core packages. Project-specific values belong in `frame.config.ts`.
