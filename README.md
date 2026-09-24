# EchoTrace

Consensus source-independence registry for GenLayer.

EchoTrace seals a small set of HTTPS URLs and asks validators to decide, independently, whether those pages are independent evidence or the same story told again. The persisted result is a pairwise provenance graph and, where the graph is unambiguous, provenance groups.

It does not decide whether a factual claim is true.

A collection of URLs is not a collection of independent sources. Ten articles can all come from one press release, one wire story, or one original investigation. Downstream systems that count URLs will over-count support. EchoTrace exists so they can count independently supported origins instead.

GenLayer consensus is required because the inputs are live web pages and a language model. A single operator, a single fetch, or a schema check on the leader's JSON is not enough. Every validator retrieves the pages and reproduces the decision-bearing fields. See [docs/consensus.md](docs/consensus.md).

## Why this is not a thin LLM wrapper

- The source set is stateful. After `seal_assessment`, URLs cannot be added, removed, or replaced.
- Validators fetch the sealed URLs themselves. They do not trust the leader's page text.
- Validators run the same grounding and classification. A schema-valid but wrong label is rejected. Direct-mode tests call `run_validator` with a forged `INDEPENDENT` result while the pages are syndicated, and the validator returns false.
- Equivalence compares canonical decision fields (retrieval, relation code, reason code, groups, counts, ambiguity). Free-form wording is not consensus-critical.
- The relationship graph is stored as reusable on-chain state. Callers read relations and groups. They do not re-prompt the model.
- Uncertainty stays categorical. Missing evidence is `UNKNOWN`, not an independence score and not a default of `INDEPENDENT`.

## State machine

```text
DRAFT --seal_assessment--> SEALED --analyze_sources--> ANALYZED
```

| Status | Who can change it | What is allowed |
| --- | --- | --- |
| `DRAFT` (0) | The creator only | `add_source`, `seal_assessment` |
| `SEALED` (1) | Anyone, once | `analyze_sources` |
| `ANALYZED` (2) | Nobody | Reads only |

`create_assessment` starts a draft. Analysis is one-shot. A second `analyze_sources` reverts with `already analyzed`. There is no admin key that can rewrite a result.

`context` is a short note about why the collection exists. It is not sent to the model and it is not a claim to verify.

## Relations

Stored pairs are canonical: source id `a < b`. `get_relation` flips orientation when the caller swaps the ids.

| Code | Name | Meaning |
| --- | --- | --- |
| 0 | `INDEPENDENT` | Both pages contain grounded evidence of original primary reporting, they are not near-copies, and neither page names the other's host. Absence of a copied paragraph is not enough. |
| 1 | `A_DERIVES_FROM_B` | Grounded attribution or derivative language shows that A relies on B. |
| 2 | `B_DERIVES_FROM_A` | The inverse. |
| 3 | `COMMON_ORIGIN` | Both pages explicitly rely on the same named upstream origin. |
| 4 | `SYNDICATED` | A grounded syndication, reprint, or agency-distribution phrase is present, and the two pages have at least 45% token Jaccard overlap. |
| 5 | `UNKNOWN` | Not enough stable evidence, a contradiction, or a fetch that did not succeed. |

Reason codes that can be stored: `independent`, `a_derives_from_b`, `b_derives_from_a`, `common_origin`, `syndicated`, `insufficient`, `contradiction`, `unfetched`.

`map_evidence_flags` is a pure view of the priority table. It does not fetch the web and it does not ground quotes. Analysis ignores the model's own `evidence` label and replaces it after grounding.

Provenance groups are deterministic clusters of sources that should not be counted as mutually independent. Failed fetches stay in group `255` (`unassigned`). If two successfully fetched sources are `UNKNOWN`, or if `INDEPENDENT` appears inside a related component, that component is left unassigned and `ambiguous` is true. The contract does not invent a clean cluster. Details are in [docs/architecture.md](docs/architecture.md).

## Consensus, briefly

For each sealed URL the leader calls `gl.nondet.web.get`. Non-200, empty body, and exceptions are `failed`. They are not independent. The model is called only for pairs whose retrieval is `ok`/`ok`. The prompt marker is `ECHO_TRACE_TASK_V1`. Page text is wrapped as untrusted data. Title, context, and labels are not included.

Quotes must be substrings of the normalized page (at least 12 characters) and must contain the stems the claimed relation requires. Ungrounded model flags are dropped. If nothing remains, the pair is `UNKNOWN` / `insufficient`.

The validator runs that whole path again and compares the decision with `_same_decision`. Malformed model output raises `malformed llm output` before any analysis writes. A failed consensus transaction does not leave a partial graph: the VM reverts the call, and status stays `SEALED`.

Leader and validator entry points differ by network. Studionet uses `gl.vm.run_nondet_unsafe`. The Studio development preview renamed that call to `gl.vm.run_nondet`. The comparison function is the same.

## Contract methods

The zero-argument `EchoTrace()` constructor initializes empty storage; it is not listed among `gen_getContractSchema` methods. The deployed calldata schema reports `u32` parameters and returns as `int`, and structured Python dictionaries as generic `dict`.

Writes:

| Method | Rule |
| --- | --- |
| `create_assessment(title: str, context: str) -> u32` | Opens the next monotonic id. Title required, max 120. Context max 400. |
| `add_source(assessment_id: u32, url: str, label: str) -> u32` | Creator, draft only. HTTPS, no userinfo, no fragment, host checks, no duplicate canonical URL. Label max 80. Cap 6 sources. |
| `seal_assessment(assessment_id: u32) -> None` | Creator, draft, at least 2 sources. |
| `analyze_sources(assessment_id: u32) -> None` | Anyone, sealed, not yet analyzed. |

Views (`@gl.public.view`):

| Method | Return |
| --- | --- |
| `get_contract_info()` | `dict[str, Any]` |
| `get_assessment_count()` | `u32` |
| `get_assessment(assessment_id: u32)` | `dict[str, Any]` |
| `get_assessment_status(assessment_id: u32)` | `str` |
| `get_source_count(assessment_id: u32)` | `u32` |
| `get_source(assessment_id: u32, source_id: u32)` | `dict[str, Any]` |
| `get_sources(assessment_id: u32)` | `list[dict[str, Any]]` |
| `get_relation(assessment_id: u32, source_a: u32, source_b: u32)` | `dict[str, Any]` |
| `get_relations(assessment_id: u32)` | `list[dict[str, Any]]` |
| `get_analysis_summary(assessment_id: u32)` | `dict[str, Any]` |
| `get_provenance_group(assessment_id: u32, group_id: u32)` | `dict[str, Any]` |
| `get_provenance_groups(assessment_id: u32)` | `list[dict[str, Any]]` |
| `map_evidence_flags(explicit_attribution: str, syndication: str, derivative: str, shared_upstream: str, independent_primary: str, evidence: str)` | `str` |

Unknown ids raise a deliberate `UserError` (`assessment not found`, `source not found`, `relation not found`, `group not found`). They are not raw index crashes. Reads that need an analysis before `ANALYZED` raise `analysis not ready`. Hosted simulators sometimes wrap that `UserError` text; the deployments record the wrapper string actually returned.

## Storage

| Collection | Key | Contents |
| --- | --- | --- |
| `assessments` | `TreeMap[u32, Assessment]` | Creator, title, context, status, counts, ambiguity |
| `sources` | `"{assessment_id}:{source_id}"` | URL, label, canonical URL, retrieval, group id |
| `relations` | `"{assessment_id}:{a}:{b}"` with `a < b` | Relation code and reason code |

Dataclasses use `@allow_storage` and fixed-width integers (`u8`, `u32`, `Address`). Full page text and raw model responses are not stored. URLs are copied with `gl.storage.copy_to_memory` before the nondeterministic closure is created.

Bounds: 2–6 sources, URL 512, title 120, context 400, label 80, raw response text considered up to 60,000 characters, normalized page text 5,000, model evidence strings 4,000, and a 45% pairwise Jaccard threshold.

## Security model

HTTPS-only URL canonicalization rejects userinfo, fragments, localhost, `.local` / `.internal`, and literal private, loopback, link-local, multicast, reserved, and unspecified addresses, plus all-digit hosts. Prompt text inside pages cannot change the task. There is no owner method that edits analyzed results.

This does not make web content trustworthy, and it does not stop a page from changing between validators. Those cases fail closed (disagreement or `UNKNOWN`). The full list of checks and the things this version does not claim are in [docs/security.md](docs/security.md).

## Limitations

- Not a truth oracle. Two independent false articles remain two independent sources.
- Not a browser. Script, style, and tags are stripped. Client-rendered text that never appears in the HTTP body is invisible.
- Grounding is stem-and-quote based. A real derivation that does not use the required phrases becomes `UNKNOWN`, on purpose.
- The submitted URL is checked for SSRF. If the GenVM web client follows a redirect, this contract does not see the final hop.
- At most six sources. Pair count is `n*(n-1)/2`.
- Assessments are permanent and permissionless. The `u32` ID counter prevents wraparound but is not a small usage quota; total storage grows with assessments, so deployments rely on network fee and state policies.
- Analysis is one-shot. A later page edit does not refresh the graph.
- Studionet and Studio development preview do not accept the same `py-genlayer` runner. The decision logic is shared. The files are not byte-identical. See below.

## Testing

Direct-mode tests use mocked web pages and model responses. They do not call live websites.

```bash
uv sync --locked --group test
GENVM_VERSION=v0.3.0-rc7 uv run genvm-lint download --version v0.3.0-rc7
GENVM_VERSION=v0.6.0-rc6 uv tool run --from 'git+https://github.com/genlayerlabs/genvm-linter@28450e665666300fc648dbe495110dfd0cb6a7b4' genvm-lint download --version v0.6.0-rc6
GENVM_VERSION=v0.3.0-rc7 uv run genvm-lint check contracts/echotrace.py
GENVM_VERSION=v0.3.0-rc7 uv run genvm-lint typecheck contracts/echotrace.py
GENVM_VERSION=v0.6.0-rc6 uv tool run --from 'git+https://github.com/genlayerlabs/genvm-linter@28450e665666300fc648dbe495110dfd0cb6a7b4' genvm-lint check contracts/echotrace_studio_dev.py
uv run python scripts/verify_contract_equivalence.py
mkdir -p "$HOME/.cache/gltest-direct"
cp "$HOME/.cache/genvm-linter/genvm-universal-v0.3.0-rc7.tar.xz" "$HOME/.cache/gltest-direct/"
uv run pytest -rA
```

The cache copy works around `genlayer-test==0.29.2` looking for the former GenVM archive filename. Studionet checks use runner `v0.3.0-rc7`; preview checks use runner `v0.6.0-rc6` with the preview linter pinned to its public RC commit. Both bundles are downloaded before lint so CI does not depend on a prewarmed cache. `scripts/verify_contract_equivalence.py` is a narrow source-level check: it normalizes only the five approved stable/RC compatibility regions and rejects any other implementation difference. Python is 3.12; exact test dependencies are locked in `uv.lock`.

The suite covers lifecycle and authorization, URL bounds and parser edge cases, serialization, relation semantics, group derivation, prompt injection, retrieval failures, malformed model output, validator disagreement, and a schema-valid but semantically wrong leader result.

## Deployment

The frozen Studionet source is deployed at `0x17ED3D4Cd4Fa0970F854829299283e6004836237` on chain `61999`, with source SHA-256 `df8b5991e21f7feb4a53e800a5246a117f23ab639ad570c703d48e6a38ef99a4`. Its hosted lifecycle finalized as `SYNDICATED` for two retrieved sources, grouped as one confirmed origin. A complete pass exercised all 13 public reads against finalized state. Later read-only refreshes encountered the shared RPC quota; they made no writes and returned no contradictory values. A nonexistent assessment read was rejected with the Studio wrapper's generic `execution failed` message; the wrapper did not expose the underlying `assessment not found` reason, which direct-mode tests verify.

Studio development preview uses chain `61997` and `contracts/echotrace_studio_dev.py` (SHA-256 `1f4bcc69c58893a15d38622e0d4f1fa9535328a6a1b5e9c6530fb74ccdaa4776`). Deployment finalized at `0x4Db91B033c269DFCcfdAB666d3d621f5d8Dd2d9F` in transaction `0x3031af1cec04bf97cadbe8e528f9d0263d2ab941cd94cd6529e2f3cf28f2193e`; schema retrieval and the hosted lifecycle/read certification remain blocked by the canonical RPC's 5000-requests/day quota. See [docs/deployments.md](docs/deployments.md) and the environment records in `deployments/` for the captured results.

The two Studio environments currently require distinct runner pins. Both contract files are in the same audited source revision and the automated `scripts/verify_contract_equivalence.py` check passes after normalizing only the five approved runtime-binding regions. Their physical source-file SHA-256 values remain distinct by design. The release claim is identical EchoTrace V1 application logic, state model, public ABI, provenance semantics, leader/validator algorithms, and decision-bearing consensus rules—not byte-identical source or identical GenLayer runtime internals. Studionet uses chain 61999 and `https://studio.genlayer.com/api`; Studio development preview uses chain 61997 and `https://studio-dev.genlayer.com/api` and may be reset by its operators.

There are 17 public methods: four writes (`create_assessment`, `add_source`, `seal_assessment`, `analyze_sources`) and 13 reads (`get_contract_info`, `get_assessment_count`, `get_assessment`, `get_assessment_status`, `get_source_count`, `get_source`, `get_sources`, `get_relation`, `get_relations`, `get_analysis_summary`, `get_provenance_group`, `get_provenance_groups`, and `map_evidence_flags`). The hosted certification script reads the deployed schema and calls each read at `latest-final`.

To deploy and certify using a securely supplied key file:

```bash
npm ci
ECHOTRACE_KEY_FILE=/secure/path/to/key node scripts/exercise.mjs studionet
ECHOTRACE_KEY_FILE=/secure/path/to/key node scripts/exercise.mjs studio-dev
```

The script selects the matching stable or RC JavaScript SDK, verifies the RPC chain ID before signing, checks the quoted fee against the deployer balance where the network charges one, waits for finalization, fetches deployed code/schema, and checks every actual read method. It serializes RPC requests at 20-second intervals to stay below the observed shared hourly and daily refill limits. Do not put the key file in the repository.

To retry certification of an already analyzed assessment after an RPC read limit, set `ECHOTRACE_CONTRACT` and `ECHOTRACE_ASSESSMENT_ID` to the deployed address and assessment ID. The runner then reads that finalized lifecycle instead of creating another.

## Example

Create, add two sources, seal, then let any account analyze. After finality:

```text
get_relation(id, 0, 1) -> relation, reason
get_analysis_summary(id) -> confirmed_group_count, unresolved counts, ambiguous
get_provenance_groups(id) -> only groups the graph can support
```

Another contract or an off-chain reader should treat `confirmed_group_count` as the number of independently supported origins, and should not count unassigned sources (`group_id == 255`) as confirmed independent evidence.

## Reuse

The primitive is the contract plus the equivalence rule, not a frontend. Deploy `contracts/echotrace.py` on the stable runner or `contracts/echotrace_studio_dev.py` on the preview runner. Keep the source set sealed before any nondeterministic work. Do not add an admin path that overwrites `relations`. If you change grounding stems or the priority table, change the tests that prove a format-only validator is insufficient, and bump `CONTRACT_VERSION`.

## Layout

```text
contracts/echotrace.py              Studionet contract, tested in direct mode
contracts/echotrace_studio_dev.py   Preview-runner port, same decision logic
tests/                              Direct-mode suite
fixtures/                           Controlled HTML used by the tests
docs/architecture.md
docs/consensus.md
docs/security.md
docs/deployments.md
deployments/*.json                  Environment deployment and certification evidence
scripts/exercise.mjs                Deploy and exercise both networks
scripts/verify_contract_equivalence.py  Narrow cross-runtime source check
```

## Release status

Version 1.0.0 is the candidate version, not a published release. The GitHub repository has no release tag yet. The public release is withheld until both hosted deployments are finalized and every public read method passes on each.
