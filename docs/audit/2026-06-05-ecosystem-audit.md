# Ecosystem Audit — 2026-06-05

Comprehensive audit of `ssh-mcp-pro` repository dependencies, CI/CD actions, Docker,
runtime versions, and security posture.

---

## 1. Dependency Freshness

### Runtime Dependencies

| Dependency | Declared | Latest | Action |
|---|---|---|---|
| `@modelcontextprotocol/sdk` | ^1.29.0 | 1.29.0 | Up to date |
| `jose` | 6.2.3 | 6.2.3 | Up to date (exact pin) |
| `node-ssh` | ^13.2.1 | 13.2.1 | Up to date |
| `zod` | ^4.4.3 | 4.4.3 | Up to date |

### Dev Dependencies

| Dependency | Declared | Latest | Gap |
|---|---|---|---|
| `typescript` | ^5.9.3 | 6.0.3 | Major version gap |
| `vitest` | ^4.1.7 | 4.1.8 | Minor (covered by caret) |
| `eslint` | ^9.39.4 | 10.4.1 | Major — v9 EOL 2026-08-06 |
| `prettier` | ^3.8.3 | 3.8.3 | Up to date |

### Runtime Targets

| Engine | Declared | Current | Action |
|---|---|---|---|
| Node.js | ^22.22.2 || ^24.15.0 | 26.0.0 | Add v26 to matrix |
| pnpm | ^11.0.9 (corepack) | 11.5.1 | Minor bump available |

---

## 2. CI/CD Action Pins

All actions pinned by SHA. Status per workflow:

### CI (`ci.yml`)

| Action | Pinned SHA | Version | Verdict |
|---|---|---|---|
| `actions/checkout` | `93cb6efe...` | v6 (not latest v6.0.3) | **STALE** — update to `9f698171...` |
| `actions/setup-node` | `48b55a01...` | v6.4.0 | Up to date |
| `actions/dependency-review-action` | `a1d282b3...` | v5.0.0 | Up to date |
| `actions/upload-artifact` | `043fb46d...` | v7.0.1 | Up to date |

### Docker (`docker.yml`)

| Action | Pinned SHA | Version | Verdict |
|---|---|---|---|
| `actions/checkout` | `93cb6efe...` | v6 (not latest v6.0.3) | **STALE** |

### CodeQL (`codeql.yml`)

| Action | Pinned SHA | Version | Verdict |
|---|---|---|---|
| `actions/checkout` | `93cb6efe...` | v6 (not latest v6.0.3) | **STALE** |
| `github/codeql-action/init` | `7211b7c8...` | v4.36.0 | Up to date |
| `github/codeql-action/autobuild` | `7211b7c8...` | v4.36.0 | Up to date |
| `github/codeql-action/analyze` | `7211b7c8...` | v4.36.0 | Up to date |

### Release (`release.yml`)

| Action | Pinned SHA | Version | Verdict |
|---|---|---|---|
| `actions/checkout` | `93cb6efe...` | v6 (not latest v6.0.3) | **STALE** |
| `actions/setup-node` | `48b55a01...` | v6.4.0 | Up to date |
| `googleapis/release-please-action` | `45996ed1...` | v5.0.0 | Up to date |
| `actions/attest` | `59d89421...` | v4.1.0 | Up to date |

### MCP Registry Metadata (`mcp-registry.yml`)

| Action | Pinned SHA | Version | Verdict |
|---|---|---|---|
| `actions/checkout` | `93cb6efe...` | v6 (not latest v6.0.3) | **STALE** |
| `actions/setup-node` | `48b55a01...` | v6.4.0 | Up to date |

---

## 3. Docker Image Digest

**Pinned digest:** `node:24-alpine@sha256:d1b3b4da11eefd5941e7f0b9cf17783fc99d9c6fc34884a665f40a06dbdfc94f`  
**Status:** Stale — current multi-platform digest differs.

The Dockerfile pins the same stale digest in both `build` and `runtime` stages (lines 3 and 13).

---

## 4. Security Posture

| Surface | Status |
|---|---|
| Secret scanning alerts | 0 open |
| Dependabot alerts | 0 open |
| Code scanning alerts | 0 open |
| CodeQL | Enabled (security-and-quality queries) |
| SECURITY.md | Present with disclosure policy |
| Branch protection | Active on `main` |

**No open security issues.**

---

## 5. Documentation Gaps

| Item | Status |
|---|---|
| CHANGELOG.md | **Missing** — tracked via #69 |
| Published API docs | **Missing** — tracked via #69 |
| GitHub Projects/Boards | Not configured |

---

## 6. Issues Created by This Audit

| # | Title | Labels | Priority |
|---|---|---|---|
| 74 | [DEBT] Upgrade ESLint to v10 before EOL (Aug 2026) | `priority:P1`, `area:debt`, `type:upgrade`, `risk:medium` | P1 |
| 75 | [COMPATIBILITY] Add Node.js 26 to CI test matrix | `priority:P2`, `area:compatibility`, `type:upgrade`, `risk:low` | P2 |
| 76 | [CHORE] Evaluate TypeScript 6.0 migration | `priority:P3`, `area:debt`, `type:upgrade`, `risk:medium` | P3 |
| 77 | [CHORE] Refresh CI action pins, Docker digest, pnpm version | `priority:P3`, `area:ci`, `type:task`, `risk:low` | P3 |

---

## 7. Recommendations

### Immediate (before next release)
1. Update `actions/checkout` SHA across all 5 workflows to latest v6.0.3 (`9f698171...`)
2. Refresh `node:24-alpine` Docker digest in `Dockerfile`

### Short-term (within 1 month)
3. Upgrade ESLint to v10.x (tracked in #74)
4. Add Node.js 26 to CI test matrix (tracked in #75)
5. Bump pnpm from 11.0.9 to latest compatible (tracked in #77)

### Medium-term (within 3 months)
6. Evaluate TypeScript 6.0 migration (tracked in #76)
7. Create CHANGELOG.md following Keep a Changelog convention (tracked in #69)
8. Publish generated API docs (tracked in #69)

---

Prepared during the `ssh-mcp-pro` ecosystem audit.
