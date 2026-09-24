# Deployment certification

This audit is not yet a complete two-network certification. Studionet deployment, lifecycle, code comparison, and an earlier finalized 13/13 public-read pass are recorded; later refreshes were blocked by the canonical daily quota. Studio development preview deployment finalized, but schema retrieval and all lifecycle/read calls were blocked by the preview daily quota. No release is claimed.

## Stable Studio — Studionet

| Field | Value |
| --- | --- |
| Studio | [Stable Studio](https://studio.genlayer.com/contracts) |
| Network | Studionet |
| Chain ID | `61999` |
| RPC | `https://studio.genlayer.com/api` |
| Contract | `0x17ED3D4Cd4Fa0970F854829299283e6004836237` |
| Deployment transaction | `0xfeab866471129d04840e9dc76e1f5da9a6b6a10536c4870bf39f21f415c4d50f` |
| Finalized | Yes, `FINALIZED / MAJORITY_AGREE` |
| Contract source | `contracts/echotrace.py` |
| Source SHA-256 | `df8b5991e21f7feb4a53e800a5246a117f23ab639ad570c703d48e6a38ef99a4` |
| Source commit | `7f0c6d89924662b6660a20d8146099b44d93977f` |
| Deployed code check | Exact UTF-8 source equality; deployed SHA-256 matches the local file |
| Deployed schema | [`deployments/schema/studionet.json`](../deployments/schema/studionet.json), SHA-256 `fe30521139bedc6b80b668b77598b9973f9f87be856574189cc1a75776a5bf57` |
| Assessment | `0`, finalized as `ANALYZED` |
| Provenance result | `SYNDICATED`; two retrieved sources in confirmed group `0`; one confirmed origin group |
| Certification | **PASS — deployment and lifecycle finalized; 13/13 reads passed** |
| Known network limitation | Shared hourly/daily RPC quota; Studio's call wrapper hides the underlying UserError text for invalid IDs |

The lifecycle used a Tribune Content Agency article and the ArcaMax copy. Both sources were returned with retrieval status `OK`. The contract stored the pair as `SYNDICATED`; `get_relation(0, 1, 0)` preserved the symmetric relation while returning the caller's requested orientation.

The runner read `DRAFT` after creation, asserted `SEALED` after sealing, then asserted `ANALYZED` after the finalized analysis call.

The second `add_source` receipt shows one validator execution as `ERROR`/`idle`; the transaction still finalized with majority agreement. This receipt was not treated as successful until finalization was observed.

| Write | Arguments (key-free) | Transaction | Final result |
| --- | --- | --- | --- |
| `create_assessment` | `("Public article provenance check", "Compare a publicly available article with another publisher's copy. EchoTrace records provenance, not factual truth.")` | `0xe452712a43e861e274ca1c90bdabf9bb7df2d1b4e6205644ac263a4c58db7506` | `FINALIZED / MAJORITY_AGREE` |
| `add_source` | `(0, "https://tribunecontentagency.com/article/taking-the-kids-ready-to-travel-like-never-before/", "Tribune Content Agency")` | `0xc60199050e5a26953fe464d900daf8e0b600069c47a27c36dc27f190f2356bc6` | `FINALIZED / MAJORITY_AGREE` |
| `add_source` | `(0, "https://www.arcamax.com/homeandleisure/travel/takingthekids/s-4280675", "ArcaMax")` | `0x99d52989da05bff68795bc6e29000ea73a7a42097e604293e40406b6a46536bc` | `FINALIZED / MAJORITY_AGREE` |
| `seal_assessment` | `(0)` | `0x9481c19148ba4b944b7a660147ab13804fb048c3d9139b62dddd8ea6d87d3b56` | `FINALIZED / MAJORITY_AGREE` |
| `analyze_sources` | `(0)`, five maximum consensus rotations | `0x11e6a432765a126f8a3b8476d8777c04ed2390c0d6be6f90b9f0e99f042df8cf` | `FINALIZED / MAJORITY_AGREE` |

The deployed schema contains 17 public methods: four writes and 13 reads. Read calls used `latest-final`.

| Public read | Studionet | Result checked |
| --- | --- | --- |
| `get_contract_info` | PASS | EchoTrace v1.0.0, 2–6 sources, group sentinel 255 |
| `get_assessment_count` | PASS | `1` |
| `get_assessment` | PASS | Assessment `0`, two sources, `ANALYZED`, revision 1 |
| `get_assessment_status` | PASS | `ANALYZED` |
| `get_source_count` | PASS | `2` |
| `get_source` | PASS | Source `0`, expected URL, retrieval `OK`, group `0` |
| `get_sources` | PASS | Both expected URLs, both retrieval `OK`, both group `0` |
| `get_relation` | PASS | Forward and reverse lookups return `SYNDICATED`, reason `syndicated` |
| `get_relations` | PASS | One canonical `(0, 1)` pair, `SYNDICATED` |
| `get_analysis_summary` | PASS | One relation, one group, two sources, no unresolved items |
| `get_provenance_group` | PASS | Group `0` contains `[0, 1]` |
| `get_provenance_groups` | PASS | Same single group as the summary |
| `map_evidence_flags` | PASS | Six `none` flags plus `insufficient` return `UNKNOWN` |

The additional `get_assessment(999999)` call was rejected with the SDK error `execution failed`; Studio's wrapper did not return the underlying `assessment not found` text. The local direct-mode test asserts that exact contract error for nonexistent assessment IDs. The runner preserves the finalized assessment ID and can resume certification with `ECHOTRACE_ASSESSMENT_ID=0` without opening another assessment.

A read-only repeat completed at `2026-09-24 11:18:55 UTC` with 8 successful method results and five RPC rate limits (`get_source`, `get_sources`, `get_relation`, `get_relations`, and `get_provenance_group`). None of the eight returned values contradicted the earlier complete pass or finalized assessment. The 13/13 matrix above records the earlier complete `latest-final` certification; no writes or contract changes followed that pass.

A `latest-final` recertification preflight completed at `2026-09-24 12:19:28 UTC`: RPC and SDK chain IDs matched `61999`, the deployer balance was sufficient, and deployed code retrieval succeeded. The following schema request was rejected with JSON-RPC code `-32029`, `Rate limit exceeded: 5000 requests per day`, `current=5000`, and `retry_after_seconds=15987`. A later paced refresh at `17:49:45 UTC` again verified chain, balance, deployed code, and the archived schema, then its first view call was rate-limited. A raw probe returned the newer stable retry value `13336` seconds. These read-only attempts submitted no transaction and made no state change.

## Studio development preview

| Field | Value |
| --- | --- |
| Studio | [Studio development preview](https://studio-dev.genlayer.com/) |
| Network | Studio Devnet (RC) |
| Chain ID | `61997` |
| Canonical RPC | `https://studio-dev.genlayer.com/api` |
| Contract | `0x4Db91B033c269DFCcfdAB666d3d621f5d8Dd2d9F` |
| Deployment transaction | `0x3031af1cec04bf97cadbe8e528f9d0263d2ab941cd94cd6529e2f3cf28f2193e` |
| Finalized | Yes, `FINALIZED / MAJORITY_AGREE` |
| Contract source | `contracts/echotrace_studio_dev.py` |
| Source SHA-256 | `1f4bcc69c58893a15d38622e0d4f1fa9535328a6a1b5e9c6530fb74ccdaa4776` |
| Source commit | `7f0c6d89924662b6660a20d8146099b44d93977f` |
| Deployed code/schema | Code retrieval preceded the quota error; schema was not retrieved |
| Assessment / lifecycle | None; no write after deployment was submitted |
| Certification | **BLOCKED — deployment finalized, schema/lifecycle/reads unavailable** |
| Known network limitation | RC state and availability may reset; the observed RPC limit is 5000 requests per day |

The matching RC SDK (`genlayer-js@2.0.0-rc.1`) selected `studioDevnet`, verified chain `61997`, quoted a deployment fee, and finalized deployment transaction `0x3031af1cec04bf97cadbe8e528f9d0263d2ab941cd94cd6529e2f3cf28f2193e` at `0x4Db91B033c269DFCcfdAB666d3d621f5d8Dd2d9F`. The next schema request returned JSON-RPC `-32029`, `Rate limit exceeded: 5000 requests per day`, `retry_after_seconds: 11228` (about `21:04:52 UTC`). No preview assessment, lifecycle transaction, schema-enumerated read, or read result is claimed. Studio-dev state and availability are temporary and may reset.

The preview manifest records the finalized deployment and the quota-blocked certification attempt. It is not a complete deployment certificate until the schema, lifecycle, and every public read pass.

## Cross-runtime source record

The authoritative application source is `contracts/echotrace.py` for Studionet. `contracts/echotrace_studio_dev.py` is the required Studio-dev release-candidate runner port; it is not claimed to be byte-identical to the stable file. Both files are frozen in source commit `7f0c6d89924662b6660a20d8146099b44d93977f` and have distinct physical SHA-256 values:

| Deployment | Physical source | Fresh SHA-256 |
| --- | --- | --- |
| Studionet | `contracts/echotrace.py` | `df8b5991e21f7feb4a53e800a5246a117f23ab639ad570c703d48e6a38ef99a4` |
| Studio-dev | `contracts/echotrace_studio_dev.py` | `1f4bcc69c58893a15d38622e0d4f1fa9535328a6a1b5e9c6530fb74ccdaa4776` |

The exact physical diff is limited to five approved compatibility regions: the `py-genlayer` dependency pin, preview-specific metadata/docstring text, equivalent GenLayer import/binding syntax, the stable/RC `EchoTrace` base-class path, and the runner-specific nondeterministic consensus entry-point name. `scripts/verify_contract_equivalence.py` normalizes only those exact regions, compares the remaining implementation and public/storage surface, and currently returns `PASS`. Its normalized logic digest is `d9ddc58beb58a61f91f1d5680d534cd408cd4fd227c73700e1b954f46a8cf19f`; it is SHA-256 of the verifier's normalized, attribute-free Python AST dump and is not a replacement for either physical source hash.

The release claim is therefore: **EchoTrace V1 uses identical application logic, state model, public ABI, provenance semantics, leader/validator algorithms, and decision-bearing consensus rules across both deployments, with network-specific GenLayer compatibility bindings required by the stable and release-candidate runtimes.** The source check does not claim identical GenLayer runtime internals. Each network must pass its own hosted lifecycle and deployed-schema/read certification.

Official environment and RC compatibility were checked against [GenLayer Networks](https://docs.genlayer.com/developers/networks) and [Consensus v0.6 Migration](https://docs.genlayer.com/developers/consensus-v06-migration). The preview is a separate RC network and may be reset.
