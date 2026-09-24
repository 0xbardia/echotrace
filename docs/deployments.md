# Deployment certification

No deployment of the audited source revision is certified yet. The addresses and transactions in the pre-audit local manifests belong to older source hashes and are superseded; they are not release evidence. This document and the environment manifests will be replaced with verified results only after both new transactions finalize and the public read methods pass.

The targets are the official GenLayer Studio environments:

| Studio environment | Network | Chain ID | RPC |
| --- | --- | ---: | --- |
| Stable Studio | Studionet | 61999 | `https://studio.genlayer.com/api` |
| Studio development preview | Studio-dev RC | 61997 | `https://studio-dev.genlayer.com/api` |

The preview is a separate release-candidate environment and may be reset by its operators. The two environments currently require different runner pins; both network-specific contract sources are frozen in the same Git revision for a release.
