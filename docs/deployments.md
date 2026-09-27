# Deployment certification

Both hosted deployments are certified: **Studionet 13/13 PASS** and **Studio-dev 13/13 PASS**. Each network has a byte-verified deployed source, an archived deployed schema with 4 writes and 13 views, a real finalized lifecycle, and every public read method exercised against finalized state at `latest-final`. See [final-audit.md](final-audit.md) for the audit record.

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

**Those quota errors do not invalidate the completed certification.** The 13/13 pass is the final Studionet certification for v1.0.0 and is not re-run for a newer timestamp. A rate-limited refresh is the absence of new evidence, not contradictory evidence: the eight repeat values that did return agreed with the finalized assessment, and the contract source has not changed since the pass (physical SHA-256 `df8b5991e21f7feb4a53e800a5246a117f23ab639ad570c703d48e6a38ef99a4`, identical in the audited commit `8f0eddb` and in the final release commit).

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
| Deployed code check | Exact byte equality; deployed SHA-256 `1f4bcc69…4776` equals the local file |
| Deployed schema | [`deployments/schema/studio-dev.json`](../deployments/schema/studio-dev.json), SHA-256 `fe30521139bedc6b80b668b77598b9973f9f87be856574189cc1a75776a5bf57` |
| Schema surface | 17 public methods: 4 writes, 13 views |
| Assessment | `1`, finalized as `ANALYZED` |
| Provenance result | `SYNDICATED` (reason `syndicated`); both sources retrieved `OK` in confirmed group `0` |
| Certification | **PASS — 13/13 reads passed** |
| Known network limitation | RC state and availability may be reset by GenLayer; shared daily RPC quota |

The matching RC SDK (`genlayer-js@2.0.0-rc.1`) selected the explicit `studioDevnet` chain, verified chain `61997`, and finalized the deployment at `0x4Db91B033c269DFCcfdAB666d3d621f5d8Dd2d9F`. On `2026-09-27` the daily quota had reset, so certification resumed on the **existing** deployment rather than redeploying: the candidate address was probed once, deployed code was retrieved and compared, and the schema was archived. No redeployment occurred.

The archived preview schema is **byte-identical** to the archived Studionet schema (both SHA-256 `fe30521139bedc6b80b668b77598b9973f9f87be856574189cc1a75776a5bf57`), which independently confirms that both deployments expose the same 17-method ABI. It was compared against the frozen source's expected surface: exactly the 4 expected writes and 13 expected views, with no unexpected and no missing methods.

### Signer provenance

Assessment writes are permissionless, so the account that drove the certified lifecycle is **not** the account that deployed the contract. Both roles are recorded explicitly:

| Role | Address | Evidence |
| --- | --- | --- |
| Deployment signer | `0x525D449fd34dcFC6D8c315E6264dE21711bD0415` | `from_address` of the finalized deployment receipt |
| Lifecycle / certification signer | `0xb30ECb18C8BB422c587788627f84E406D8652EF0` | `from_address` of the lifecycle receipts; `creator` of assessment `1` |

The original deployment key was held in a temporary file outside the repository that no longer exists; it is not required and was not recovered. The certified lifecycle used a dedicated certification key created for this release. No private key is stored in the repository.

### Certified lifecycle — assessment 1

| Write | Arguments (key-free) | Transaction | Final result |
| --- | --- | --- | --- |
| `create_assessment` | `("Public article provenance check", "Compare a publicly available article with another publisher's copy. EchoTrace records provenance, not factual truth.")` | `0xa62b9a915f110f46ae092c4b38d5291753b3730061f4f7561aebfe4afab40d82` | `FINALIZED / MAJORITY_AGREE` |
| `add_source` | `(1, "https://tribunecontentagency.com/article/taking-the-kids-ready-to-travel-like-never-before/", "Tribune Content Agency")` | `0x3416b0db589b384f753c15a2bdbff2daf0eb61f8d302fdbc8491e919bfa94bdc` | `FINALIZED / MAJORITY_AGREE` |
| `add_source` | `(1, "https://www.arcamax.com/homeandleisure/travel/takingthekids/s-4280675", "ArcaMax")` | `0x469338759ed9c3275acd074934181f6d12d506943b67dfcefb106df4ba245a9d` | `FINALIZED / MAJORITY_AGREE` |
| `seal_assessment` | `(1)` | `0x9be74705aa7eb68b70f458e1e0b315418b8411b2fc3c45d4208fa5e0bd82dfa8` | `FINALIZED / MAJORITY_AGREE` |
| `analyze_sources` | `(1)` | `0xe346fb279a860dbf5904f23b68b413c092815847232b7ddc75416f1661ba0ef2` | `FINALIZED / MAJORITY_AGREE` |

Both public URLs returned retrieval status `OK` through the hosted web client. Hosted consensus determined the relation; it was not forced. The stored result is `SYNDICATED` with reason `syndicated`, both sources in confirmed group `0`, one confirmed origin group, zero unresolved sources, zero unresolved relations, and `ambiguous: false`. `UNKNOWN` would have been an equally valid outcome.

Before this lifecycle, one `create_assessment` (`0x63c87884a4277c5725e673c36a33a867ca74eb136284d5a8ef6531581cef9f63`) was submitted to confirm the preview accepts a write from the unfunded dedicated certification account. It finalized `MAJORITY_AGREE` and permanently created assessment `0` with placeholder text. Assessment `0` remains an empty `DRAFT` and is not part of the release evidence; the certified lifecycle is assessment `1`. This is recorded rather than hidden because assessment creation is permissionless and permanent by design.

## Final read matrix

Every deployed public read method, called exactly once with valid arguments against finalized state at `latest-final`. `PASS` means the RPC call executed, the calldata was accepted, the return decoded, and the value was consistent with the finalized state.

| Read Method | Studionet | Studio-dev |
|---|---|---|
| get_contract_info | PASS | PASS |
| get_assessment_count | PASS | PASS |
| get_assessment | PASS | PASS |
| get_assessment_status | PASS | PASS |
| get_source_count | PASS | PASS |
| get_source | PASS | PASS |
| get_sources | PASS | PASS |
| get_relation | PASS | PASS |
| get_relations | PASS | PASS |
| get_analysis_summary | PASS | PASS |
| get_provenance_group | PASS | PASS |
| get_provenance_groups | PASS | PASS |
| map_evidence_flags | PASS | PASS |

Studionet's column is the accepted historical certification of assessment `0`. Studio-dev's column is the `2026-09-27` certification of assessment `1`. `get_relation` was called in both directions on both networks. The Studio-dev read methods and per-call values are in [`deployments/studio-dev.json`](../deployments/studio-dev.json).

| Public read | Studionet (assessment 0) | Studio-dev (assessment 1) |
| --- | --- | --- |
| `get_contract_info` | EchoTrace v1.0.0, 2–6 sources, group sentinel 255 | Same, decoded from the preview |
| `get_assessment_count` | `1` | `2` |
| `get_assessment` | Assessment `0`, two sources, `ANALYZED`, revision 1 | Assessment `1`, two sources, `ANALYZED`, revision 1 |
| `get_assessment_status` | `ANALYZED` | `ANALYZED` |
| `get_source_count` | `2` | `2` |
| `get_source` | Source `0`, expected URL, retrieval `OK`, group `0` | Source `0`, expected URL, retrieval `OK`, group `0` |
| `get_sources` | Both expected URLs, both retrieval `OK`, both group `0` | Both expected URLs, both retrieval `OK`, both group `0` |
| `get_relation` | Forward and reverse return `SYNDICATED`, reason `syndicated` | Forward and reverse return `SYNDICATED`, reason `syndicated` |
| `get_relations` | One canonical `(0, 1)` pair, `SYNDICATED` | One canonical `(0, 1)` pair, `SYNDICATED` |
| `get_analysis_summary` | One relation, one group, two sources, no unresolved items | One relation, one group, two sources, no unresolved items |
| `get_provenance_group` | Group `0` contains `[0, 1]` | Group `0` contains `[0, 1]` |
| `get_provenance_groups` | Same single group as the summary | Same single group as the summary |
| `map_evidence_flags` | Six `none` flags plus `insufficient` return `UNKNOWN` | Six `none` flags plus `insufficient` return `UNKNOWN` |

A nonexistent-ID probe (`get_assessment` with an out-of-range id) was rejected on both networks. Studio wraps the contract's deliberate `assessment not found` `UserError` in a generic `execution failed` / `Missing or invalid parameters` message; direct-mode tests assert the specific contract error.

## Cross-runtime source record

The authoritative application source is `contracts/echotrace.py` for Studionet. `contracts/echotrace_studio_dev.py` is the required Studio-dev release-candidate runner port; it is not claimed to be byte-identical to the stable file. Both files are frozen in source commit `7f0c6d89924662b6660a20d8146099b44d93977f` and have distinct physical SHA-256 values:

| Deployment | Physical source | Fresh SHA-256 |
| --- | --- | --- |
| Studionet | `contracts/echotrace.py` | `df8b5991e21f7feb4a53e800a5246a117f23ab639ad570c703d48e6a38ef99a4` |
| Studio-dev | `contracts/echotrace_studio_dev.py` | `1f4bcc69c58893a15d38622e0d4f1fa9535328a6a1b5e9c6530fb74ccdaa4776` |

The exact physical diff is limited to five approved compatibility regions: the `py-genlayer` dependency pin, preview-specific metadata/docstring text, equivalent GenLayer import/binding syntax, the stable/RC `EchoTrace` base-class path, and the runner-specific nondeterministic consensus entry-point name. `scripts/verify_contract_equivalence.py` normalizes only those exact regions, compares the remaining implementation and public/storage surface, and currently returns `PASS`. Its normalized logic digest is `d9ddc58beb58a61f91f1d5680d534cd408cd4fd227c73700e1b954f46a8cf19f`; it is SHA-256 of the verifier's normalized, attribute-free Python AST dump and is not a replacement for either physical source hash.

The release claim is therefore: **EchoTrace V1 uses identical application logic, state model, public ABI, provenance semantics, leader/validator algorithms, and decision-bearing consensus rules across both deployments, with network-specific GenLayer compatibility bindings required by the stable and release-candidate runtimes.** The source check does not claim identical GenLayer runtime internals. Each network must pass its own hosted lifecycle and deployed-schema/read certification.

Official environment and RC compatibility were checked against [GenLayer Networks](https://docs.genlayer.com/developers/networks) and [Consensus v0.6 Migration](https://docs.genlayer.com/developers/consensus-v06-migration). The preview is a separate RC network and may be reset.
