# Antigravity — Phase 0 only

Read `README_FIRST.md` and all specification documents in `docs/` before making changes. The CodeAlpha PDF is the assignment source; the reconciliation document controls conflicts; the design and backend addenda complete the original design and backend documents.

We are starting implementation of `CodeAlpha_EcommerceStore`. Follow the implementation order in `docs/CodeAlpha_Backend_Contract_Addendum.md`.

## Scope for this run: Phase 0 only

Implement only the Phase 0 deliverables:
- repository/project scaffold and the approved folder tree;
- `package.json` with the exact approved production dependencies and Node 22.x engine;
- `.gitignore` and placeholder-only `.env.example` / `.env.test.example` as specified;
- `docs/STATUS.md` skeleton with every test and AC status initially `NOT RUN`;
- `src/config.js` with the specified pure, testable `loadConfig(env)` validation;
- the smallest required unit/static tests for Phase 0 (including UT-11, STAT-05, STAT-07 and any phase-gated checks identified by the contract).

Do not build database migrations, API endpoints, frontend pages, or deployment configuration beyond what Phase 0 specifically calls for. Do not create database credentials or invent environment values. Do not change the approved technology stack, folder/file names, currency rules, security rules, or excluded-feature list.

## Working method

1. Inspect the workspace first and preserve any existing user files.
2. Briefly list the Phase 0 files and tasks you intend to create.
3. Implement Phase 0 only.
4. Run only the tests that can genuinely be run without a configured database. Report exact commands and outputs.
5. Mark a test `PASS` only if it was actually run and passed; otherwise leave it `NOT RUN` or `BLOCKED` with a reason.
6. Do not mark Phase 0 complete until its required test gates have actually passed.

At the end, report files created/changed, commands executed, real test results, configuration still needed from me, and the precise next phase. Do not proceed to Phase 1 automatically.
