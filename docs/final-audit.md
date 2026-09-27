# Final audit record

**Current disposition: RELEASED as v1.0.0.** The source and local quality gates pass. Both hosted networks have a byte-verified deployed source, an archived deployed schema (4 writes / 13 views), a real finalized lifecycle, and 13/13 public read methods passing against finalized state. Studionet's certification is the earlier completed pass on assessment `0`; a later quota-throttled refresh attempt did not invalidate it. Studio-dev was certified on `2026-09-27` on assessment `1`. The final release commit and the `v1.0.0` tag are recorded in the repository.

## Scope

Reviewed the contract sources, state and storage layouts, validators, URL parser, prompt construction, model-output parser, group derivation, 20 direct-mode tests and fixtures, deployment runner, both manifests, archived Studionet schema, dependency locks, README and technical docs, CI, ignored files, GitHub target, and public/secret scan results. The workspace had no Git repository or history at the start. Git was initialized on `main`; the frozen source candidate is the first commit, not a commit derived from an earlier history.

The implementation remains a standalone Intelligent Contract. It stores an immutable-after-analysis provenance graph and groups, not claim truth. There is no frontend, database, backend service, payment/token path, upgrade role, or generic fact-verification endpoint.

## Environment

| Tool | Version / configuration |
| --- | --- |
| Python | 3.12.13 |
| `genlayer` CLI | 0.40.0-rc.3 |
| Stable `genvm-lint` | 0.11.0; `GENVM_VERSION=v0.3.0-rc7` |
| Preview linter / GenVM bundle | `genvm-lint` `0.11.1-rc.2` at Git revision `28450e665666300fc648dbe495110dfd0cb6a7b4`; GenVM `v0.6.0-rc6` |
| `genlayer-py` test dependency | 0.16.3 |
| `genlayer-test` | 0.29.2 |
| `pytest` | 9.1.1 |
| `uv` | 0.12.6 |
| Stable JS SDK | `genlayer-js` 1.1.8 |
| Preview JS SDK | `genlayer-js` 2.0.0-rc.1, explicit `studioDevnet` |
| Node / npm | 20.20.2 / 10.8.2 |

The current official [network documentation](https://docs.genlayer.com/developers/networks) identifies Studionet as chain 61999 and Studio development preview as chain 61997 with separate canonical RPCs. The [v0.6 migration guide](https://docs.genlayer.com/developers/consensus-v06-migration) requires a matching RC SDK/CLI family and the explicit preview network. The source variants use that split rather than relabeling a stable chain object.

## Frozen contract source

| Target | Authoritative source | Class | SHA-256 |
| --- | --- | --- | --- |
| Studionet | `contracts/echotrace.py` | `EchoTrace` | `df8b5991e21f7feb4a53e800a5246a117f23ab639ad570c703d48e6a38ef99a4` |
| Studio-dev | `contracts/echotrace_studio_dev.py` | `EchoTrace` | `1f4bcc69c58893a15d38622e0d4f1fa9535328a6a1b5e9c6530fb74ccdaa4776` |

Both frozen contract files are in source candidate commit `7f0c6d89924662b6660a20d8146099b44d93977f`; `git diff` against that commit confirms neither contract has changed. `uv.lock` and `package-lock.json` are committed; `uv lock --check` passes.

The files are intentionally not byte-identical. `cmp -s contracts/echotrace.py contracts/echotrace_studio_dev.py` returns nonzero. The complete `diff -u` contains only five approved compatibility regions: the `py-genlayer` dependency pin, preview-specific module metadata/docstring text, the GenLayer import/binding form, the EchoTrace contract base-class path, and the nondeterministic consensus entry-point binding. No business logic, storage field, public method, security check, prompt, relation/group rule, leader/validator algorithm, `_same_decision` field, or decision-bearing consensus rule differs. `contracts/echotrace.py` is the canonical V1 source; `contracts/echotrace_studio_dev.py` is its required release-candidate runner port.

## Cross-Runtime Source Equivalence

The stable and Studio-dev deployments are intentionally different runtime families: Studionet is chain `61999` on the stable GenLayer stack, while Studio-dev is chain `61997` on the release-candidate stack with a matching RC SDK/CLI/network configuration. The two physical files therefore must not be described as the exact same source file. Their distinct physical hashes are the release evidence for the files actually uploaded to each network.

The deterministic check at `scripts/verify_contract_equivalence.py` validates the two dependency declarations, the exact approved preview metadata, the exact approved import/binding forms, the exact `EchoTrace` base binding, and the exact leader/validator nondeterministic entry-point binding. It then compares the complete remaining Python AST and all non-approved comments, including constants, storage dataclasses and fields, constructor and state transitions, URL/security logic, prompt and hostile-page handling, structured-output parsing, relation/group logic, leader/validator code, `_same_decision`, public methods, and authorization rules. It exits non-zero on any unexpected application-level difference. The current run is `PASS`; its deterministic normalized logic SHA-256 is `d9ddc58beb58a61f91f1d5680d534cd408cd4fd227c73700e1b954f46a8cf19f` (this is a normalized implementation digest, not either physical `source_sha256`). The digest is SHA-256 of the UTF-8 `ast.dump(..., annotate_fields=True, include_attributes=False)` after the five exact transformations described above. The check proves source-level application equivalence; it does not prove that the two GenLayer dependency/runtime implementations are identical. Runtime behavior is certified independently on each hosted network.

## Findings

| ID | Severity | Finding | Affected file(s) | Remediation | Final status |
| --- | --- | --- | --- | --- | --- |
| CONS-001 | HIGH | A validator that accepts a schema-valid leader object can agree with a semantically false provenance label. | `contracts/echotrace.py`, `contracts/echotrace_studio_dev.py`, `tests/test_echotrace.py` | Validators independently fetch and classify evidence, then compare canonical decision fields. Added/verified a forged `INDEPENDENT` result on syndicated evidence: the schema-only predicate accepts it and EchoTrace's validator rejects it. | Fixed; adversarial regression passes. |
| PROV-001 | MEDIUM | Reversing a pair without also reversing its quote semantics can invert directional provenance. | Both contract sources; `tests/test_echotrace.py` | Require strict canonical `a < b` model pairs; reject reversed or duplicate pairs. The read method orients canonical stored edges for the caller. | Fixed; orientation and malformed-pair tests pass. |
| WEB-001 | MEDIUM | A small raw-page cap could end inside a long script/style block, discard the article text that followed it, or expose a truncated active block as evidence. | Both contract sources; `tests/test_echotrace.py`; `docs/security.md` | Inspect at most 60,000 raw characters, discard script/style content that has no closing tag in that window, normalize at most 5,000 characters, and cap each model evidence string at 4,000. | Fixed; long-style/truncated-script regression passes. |
| TOOL-001 | MEDIUM | Stable and preview Studio do not accept the same GenLayer runner/transaction family. | Both contract sources; `package.json`; `scripts/exercise.mjs` | Keep stable and RC source/SDK selections separate, validate each RPC chain ID, use `studioDevnet` for preview, and quote preview write fees through its SDK. | Fixed; both networks certified on their matching SDK/runtime families. |
| CI-001 | MEDIUM | CI originally checked the preview runner before preparing its version-specific bundle and relied on a cached/default runtime selection. | `.github/workflows/test.yml`; `README.md` | Pin stable runner `v0.3.0-rc7` and preview runner `v0.6.0-rc6`, download both before lint, and run each linter with its matching `GENVM_VERSION`. | **Resolved.** GitHub Actions `direct-mode` passes on the published final release commit. |
| URL-001 | MEDIUM | Contract URL parsing cannot validate the final redirect target or resolve DNS answers before the GenVM fetch. | Both contract sources; `docs/security.md` | Reject unsafe literal and lexical hosts and document that redirect/DNS-rebinding enforcement is not exposed by this web API. | Residual platform limitation; documented, not represented as prevented. |
| DEP-001 | HIGH | Final two-environment certification was incomplete because the canonical daily quotas blocked post-deployment schema, lifecycle, and read calls on the preview. | `deployments/`, `docs/deployments.md` | Preserved the finalized preview receipt and re-ran certification against the existing deployment once the preview quota window reset. | **Resolved.** Both networks certified 13/13; no redeployment was required. |
| STATE-001 | LOW | Permissionless assessment creation can grow permanent global state even though each assessment is bounded. | Both contract sources; `docs/security.md` | Document the `u32` lifetime ceiling, no delete/quota path, and dependency on network fee/state policy. | Accepted usage limitation; not a per-assessment bound. |
| REPO-001 | INFO | The local project had no repository history or configured remote, so a release could not preserve an existing local history. | Repository metadata | Verified the required GitHub repository was public and empty, initialized a clean `main`, and configured only the required `origin`. | Resolved; first source candidate committed locally. |

Severity totals: **CRITICAL 0**; **HIGH 2 (2 fixed)**; **MEDIUM 5 (4 fixed, 1 documented residual limitation)**; **LOW 1 (accepted usage limitation)**; **INFO 1 (resolved)**.

## Consensus audit

The leader copies the sealed URLs into memory, fetches each URL through GenVM web, records retrieval as `OK` or failed, normalizes the body, asks for strict pair JSON only when at least one pair has two successful fetches, grounds positive flags against page quotes and relation-specific text, derives canonical relations and groups, and returns the decision object.

Each validator repeats retrieval, model classification, grounding, relation mapping, and group derivation against its own observations. The leader's page text and free-form explanation are not trusted or stored. `_same_decision` compares retrieval outcomes, canonical pair IDs and closed relation/reason codes, ordered groups, counts, and ambiguity. Stable Studionet uses `gl.vm.run_nondet_unsafe`; the preview runner exposes the corresponding call as `gl.vm.run_nondet`.

The adversarial test `test_validator_rejects_schema_valid_wrong_classification` feeds a well-shaped, enum-valid `INDEPENDENT` leader object for syndicated pages. The schema-only predicate returns true; the real validator recomputes the evidence and returns false. Malformed outputs and validator disagreement do not write partial analysis state.

## Storage audit

Persistent state uses GenLayer storage `TreeMap`s, `@allow_storage` dataclasses, fixed-width `u8`/`u32` values and `Address`. Assessment IDs increase monotonically with a u32 overflow guard; source IDs are append-only within a draft. Sources freeze on seal. Relations use one canonical `a < b` key. Failed or unresolved sources use the explicit unassigned group value `255`. Full page text and raw model output are not persisted. Linter validation and calldata serialization tests pass.

## Repository sanitization

The publishable file tree, filenames, commit subjects/bodies, and release notes return zero whole-word implementation-attribution matches. Secret-pattern and sensitive-filename scans over tracked and untracked publishable files return no matches; the only 64-hex strings in the tree are the recorded public SHA-256 digests and transaction hashes. No private key is stored in the repository. The deployment and certification keys live in mode-600 files outside the repository.

## Security audit

HTTPS URL checks reject userinfo, fragments, control/sentinel characters, localhost and local suffixes, digit-only aliases, and literal private, loopback, link-local, multicast, reserved, and unspecified addresses. IPv4-mapped IPv6 is normalized and tested. URLs, source count, titles, context, labels, fetched evidence, pair count, and model output have explicit bounds.

Page text is JSON data, angle brackets are escaped, assessment metadata is excluded from the prompt, and strict output parsing requires exact pair coverage and bounded evidence. Positive labels must be grounded in quoted page text and relation-specific stems. Validators independently repeat that work. 404, 503, empty-body, full-fetch-failure, prompt-injection, malformed-output, and changed-evidence tests pass.

Residual limits: redirects and DNS rebinding cannot be enforced by the contract because the web client does not expose those details. The runtime fetches a response before the contract can cap processed characters. Pages and models can change between executions, and text-stem grounding is a conservative heuristic rather than a proof of journalistic independence. These cases can produce `UNKNOWN`, disagreement, or an accepted but mistaken inference; the graph is not a truth oracle.

## Tests

| Command | Result |
| --- | --- |
| `uv run pytest -rA` | **20 passed, 0 failed, 0 skipped** |
| `GENVM_VERSION=v0.3.0-rc7 uv run genvm-lint check contracts/echotrace.py` | **PASS**, 3 checks; validation found 17 public methods (13 view, 4 write) |
| `GENVM_VERSION=v0.3.0-rc7 uv run genvm-lint typecheck contracts/echotrace.py` | **PASS**, no type errors |
| `GENVM_VERSION=v0.6.0-rc6 uv tool run --from 'git+https://github.com/genlayerlabs/genvm-linter@28450e665666300fc648dbe495110dfd0cb6a7b4' genvm-lint check contracts/echotrace_studio_dev.py` | **PASS**, 3 checks; validation found 17 public methods (13 view, 4 write) |
| `node --check scripts/exercise.mjs` | **PASS**, including explicit assessment-resume support for read-certification retries |
| Local RPC queue self-check | **PASS**, concurrent calls serialize at the configured interval |
| `uv lock --check` | **PASS** |
| `npm audit --omit=dev --audit-level=high` | **PASS**, 0 reported vulnerabilities |

The optional command `GENVM_VERSION=v0.6.0-rc6 uv tool run --from 'git+https://github.com/genlayerlabs/genvm-linter@28450e665666300fc648dbe495110dfd0cb6a7b4' genvm-lint typecheck contracts/echotrace_studio_dev.py` exited 1 and emitted 25 `Object of type "Annotated" is not callable` diagnostics on fixed-width `u8`/`u32` constructor calls; its summary reported 0 errors and 0 warnings. The required preview `check` command passes. This typechecker result remains a toolchain limitation to compare against preview hosted execution, not a suppressed lint finding.

The direct-mode suite uses local fixtures and mocked web/model calls; it has no live-site or paid-model dependency. No tests are intentionally skipped. The currently installed stable `genlayer-test` direct-mode runner does not exercise the preview hosted stack; its contract source passes the pinned RC linter, while hosted preview lifecycle remains a release gate.

## Hosted certification

### Studionet

The deployment finalized with majority agreement. The real lifecycle for assessment `0` finalized as `ANALYZED`; both public URLs returned `OK`, and hosted consensus stored `SYNDICATED`, group `[0, 1]`, one confirmed origin group. The deployed code was fetched and byte-for-byte UTF-8 matched `contracts/echotrace.py`; the deployed schema was archived.

All five hosted writes—deploy, create assessment, two source additions, seal, and analysis—have finalized transaction receipts with majority agreement. An earlier finalized run passed all 13 schema-enumerated reads at `latest-final`. The additional nonexistent assessment ID read was rejected with the SDK's generic `execution failed` wrapper; direct-mode tests verify the contract's underlying `assessment not found` `UserError`. A read-only repeat completed at `2026-09-24 11:18:55 UTC` with 8 successful responses and 5 RPC rate limits; none contradicted the complete pass, and it made no writes or state changes. A later 17:49:45 UTC refresh confirmed the expected chain, balance, deployed code, and archived schema, then the first finalized read hit the daily quota. A raw schema probe supplied the newer stable retry value `13336` seconds; no further stable reads or writes were attempted.

**That `13/13 PASS` is the accepted final Studionet certification for v1.0.0 and is not re-run for a newer timestamp.** The later quota-throttled refreshes are the absence of new evidence, not contradictory evidence: the eight repeat values that did return agreed with the finalized assessment, and the contract source has not changed since the pass. Spending further shared quota to make a timestamp newer would add nothing and would risk the completed result.

### Studio development preview

The explicit RC `studioDevnet` client verified chain ID `61997`, quoted fees, and finalized deployment at `0x4Db91B033c269DFCcfdAB666d3d621f5d8Dd2d9F` in transaction `0x3031af1cec04bf97cadbe8e528f9d0263d2ab941cd94cd6529e2f3cf28f2193e` with `MAJORITY_AGREE`. The first schema request on `2026-09-24` returned `Rate limit exceeded: 5000 requests per day` with `retry_after_seconds: 11228`, so no lifecycle or preview read method was called that day.

On `2026-09-27`, after the preview quota window reset, certification resumed. The candidate address was probed once and the deployment still existed, so it was **not** redeployed. Deployed code was retrieved and is **byte-identical** to `contracts/echotrace_studio_dev.py` (deployed SHA-256 `1f4bcc69c58893a15d38622e0d4f1fa9535328a6a1b5e9c6530fb74ccdaa4776`, 48,764 bytes) — the strongest comparison the runtime supports, with no platform transformation. The deployed schema was archived and is byte-identical to the archived Studionet schema (both SHA-256 `fe30521139bedc6b80b668b77598b9973f9f87be856574189cc1a75776a5bf57`), and matched the frozen source's expected surface exactly: 4 writes and 13 views, none unexpected, none missing.

A real lifecycle then ran to finalization on assessment `1` with two public HTTPS sources, both retrieved `OK`. `create_assessment`, two `add_source` calls, `seal_assessment`, and `analyze_sources` all finalized `MAJORITY_AGREE`. Hosted consensus returned `SYNDICATED` / `syndicated` with both sources in confirmed group `0`, one origin group, and `ambiguous: false`. The classification was not forced; `UNKNOWN` would have been a valid success.

All 13 deployed read methods then passed at `latest-final`, and a nonexistent-ID read was rejected as an execution failure. The full per-call values are in [`deployments/studio-dev.json`](../deployments/studio-dev.json).

Two signer roles are recorded because assessment writes are permissionless and the certified lifecycle signer is not the deployer: deployment was signed by `0x525D449fd34dcFC6D8c315E6264dE21711bD0415`, and the lifecycle and read certification were signed by a dedicated certification key created for this release, `0xb30ECb18C8BB422c587788627f84E406D8652EF0`. The original deployment key lived in a temporary file outside the repository that no longer exists; it was not needed and was not recovered, and no private key is stored in the repository. One pre-certification `create_assessment` probe from the unfunded certification account finalized `MAJORITY_AGREE` and permanently created an empty `DRAFT` assessment `0`; that is recorded in the manifest rather than hidden, and the certified lifecycle is assessment `1`.

One tooling correction was required: `scripts/exercise.mjs` aborted a preview write when the signing balance was below the quoted fee. The preview demonstrably does not enforce that (a zero-balance write finalized `MAJORITY_AGREE`), so the check now reports the shortfall instead of aborting. The change is confined to the preview code path.

See [deployments.md](deployments.md), [`deployments/studionet.json`](../deployments/studionet.json), [`deployments/studio-dev.json`](../deployments/studio-dev.json), and the archived [Studionet schema](../deployments/schema/studionet.json).

## Read methods

Both deployments expose the same 17 public methods: four writes and 13 views. The archived schemas are byte-identical. Every one of the 13 read methods passed on both networks against finalized state at `latest-final`, giving **13/13 PASS on Studionet and 13/13 PASS on Studio-dev**. The per-method matrix, arguments, and decoded values are in [deployments.md](deployments.md).

## Residual risks

- Studio's hosted wrapper does not expose the specific `assessment not found` reason for an invalid assessment ID; the call is rejected as an execution failure, and direct-mode tests verify the precise contract error.
- Studionet's shared RPC quota throttles repeat certification calls. The completed 13/13 pass is the certification of record and is not re-run; a throttled refresh is not a failure. The preview shows the same shared daily limit.
- Studio-dev is a temporary RC environment and may be reset by GenLayer, which would invalidate the preview address, schema, and lifecycle evidence in this record. The Studionet deployment is the stable record.
- The contract's independence and syndication decisions are grounded heuristics over mutable pages, not factual truth or guaranteed origin identity.
- Permissionless assessment storage is permanent and can grow toward the `u32` lifetime ceiling. Fee and state policy are network-level controls, not contract-level quotas. The preview deployment carries one empty `DRAFT` assessment from a capability probe.
- The preview lifecycle was driven by a dedicated certification account rather than the deployer, because assessment writes are permissionless. Deployed code equality and the deployed schema, not signer identity, establish that the certified code is the frozen source.
