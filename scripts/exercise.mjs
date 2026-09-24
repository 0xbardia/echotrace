/**
 * Deploy the network-specific EchoTrace source and certify the hosted schema.
 * RPC calls are serialized at 20-second intervals to stay under observed shared quotas.
 *
 *   ECHOTRACE_KEY_FILE=/secure/path/to/key node scripts/exercise.mjs studionet
 *   ECHOTRACE_KEY_FILE=/secure/path/to/key node scripts/exercise.mjs studio-dev
 *
 * ECHOTRACE_CONTRACT resumes writes against an existing deployment.
 * ECHOTRACE_ASSESSMENT_ID rechecks an existing lifecycle without creating another.
 * The private key is never written to the repository.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const originalFetch = globalThis.fetch.bind(globalThis);
const MIN_RPC_INTERVAL_MS = 20_000;
let lastFetchAt = 0;
let fetchTail = Promise.resolve();
globalThis.fetch = (input, init = {}) => {
  const request = fetchTail.then(async () => {
    const delay = MIN_RPC_INTERVAL_MS - (Date.now() - lastFetchAt);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    lastFetchAt = Date.now();
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has("User-Agent")) headers.set("User-Agent", "genlayer-cli");
    return originalFetch(input, { ...init, headers });
  });
  // ponytail: one shared request queue stays under the observed refill rate; split by host only if needed.
  fetchTail = request.then(() => undefined, () => undefined);
  return request;
};

const sdkPackage = process.argv[2] === "studio-dev" ? "genlayer-js-rc" : "genlayer-js";
const sdk = await import(sdkPackage);
const sdkChains = await import(`${sdkPackage}/chains`);
const sdkTypes = await import(`${sdkPackage}/types`);
const { createAccount, createClient } = sdk;
const { studionet, studioDevnet } = sdkChains;
const { TransactionHashVariant } = sdkTypes;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const networkName = process.argv[2];
const NETWORKS = {
  studionet: {
    chainId: 61999,
    name: "GenLayer Studio Network",
    rpc: "https://studio.genlayer.com/api",
    explorer: "https://explorer-studio.genlayer.com",
    txAbi: "v5",
  },
  "studio-dev": {
    chainId: 61997,
    name: "GenLayer Studio Devnet",
    rpc: "https://studio-dev.genlayer.com/api",
    explorer: "https://explorer-studio-dev.genlayer.com",
    // Studio development preview runs the consensus v0.6 addTransaction ABI.
    txAbi: "v6",
  },
};

if (!NETWORKS[networkName]) {
  console.error("usage: node scripts/exercise.mjs <studionet|studio-dev>");
  process.exit(2);
}

function loadKey() {
  const file = process.env.ECHOTRACE_KEY_FILE;
  if (!file) throw new Error("set ECHOTRACE_KEY_FILE to a secure key file outside the repository");
  const line = readFileSync(file, "utf8").split(/\r?\n/)[0].trim();
  if (!line) throw new Error("empty private key");
  return line.startsWith("0x") ? line : `0x${line}`;
}

function chainFor(spec) {
  if (spec.txAbi === "v6") {
    return studioDevnet;
  }
  return {
    ...studionet,
    id: spec.chainId,
    name: spec.name,
    rpcUrls: { default: { http: [spec.rpc] } },
    blockExplorers: { default: { name: spec.name, url: spec.explorer } },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonSafe(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item)),
  );
}

function errorText(error) {
  const messages = [];
  for (let current = error, depth = 0; current && depth < 4; current = current.cause, depth += 1) {
    for (const key of ["shortMessage", "details", "message"]) {
      const value = current?.[key];
      if (typeof value === "string" && value && !messages.includes(value)) messages.push(value);
    }
  }
  return messages.join(" | ") || String(error);
}

function trimTx(tx) {
  if (!tx || typeof tx !== "object") return tx;
  const full = jsonSafe(tx);
  const leaders = Array.isArray(full.consensus_data?.leader_receipt)
    ? full.consensus_data.leader_receipt.map((receipt) => ({
        execution_result: receipt.execution_result,
        vote: receipt.vote,
        mode: receipt.mode,
      }))
    : undefined;
  return {
    status: full.statusName || full.status,
    result: full.resultName || full.result,
    from_address: full.from_address,
    to_address: full.to_address,
    contract_address: full.data?.contract_address,
    votes: full.consensus_data?.votes,
    leaders,
  };
}

function statusOf(tx) {
  const value = tx?.statusName ?? tx?.status_name ?? tx?.status ?? "";
  if ((typeof value === "number" && Number.isInteger(value)) || (typeof value === "string" && /^[0-9]+$/.test(value))) {
    const names = {
      "0": "UNINITIALIZED", "1": "PENDING", "2": "PROPOSING", "3": "COMMITTING",
      "4": "REVEALING", "5": "ACCEPTED", "6": "UNDETERMINED", "7": "FINALIZED",
      "8": "CANCELED", "9": "APPEAL_REVEALING", "10": "APPEAL_COMMITTING",
      "11": spec.txAbi === "v6" ? "VALIDATORS_TIMEOUT" : "READY_TO_FINALIZE",
      "12": spec.txAbi === "v6" ? "LEADER_TIMEOUT" : "VALIDATORS_TIMEOUT",
      "13": spec.txAbi === "v6" ? "LEADER_REVEALING" : "LEADER_TIMEOUT",
    };
    return names[String(value)] || String(value);
  }
  return String(value);
}

function resultOf(tx) {
  const value = tx?.resultName ?? tx?.result_name ?? tx?.result ?? "";
  if ((typeof value === "number" && Number.isInteger(value)) || (typeof value === "string" && /^[0-9]+$/.test(value))) {
    const names = spec.txAbi === "v6"
      ? { "0": "IDLE", "1": "MAJORITY_AGREE", "2": "MAJORITY_DISAGREE", "3": "MAJORITY_TIMEOUT", "4": "DETERMINISTIC_VIOLATION", "5": "NO_MAJORITY" }
      : { "0": "IDLE", "1": "AGREE", "2": "DISAGREE", "3": "TIMEOUT", "4": "DETERMINISTIC_VIOLATION", "5": "NO_MAJORITY", "6": "MAJORITY_AGREE", "7": "MAJORITY_DISAGREE" };
    return names[String(value)] || String(value);
  }
  return String(value);
}

function contractAddressOf(tx) {
  const candidates = [
    tx?.data?.contract_address,
    tx?.data?.contractAddress,
    tx?.contract_address,
    tx?.contractAddress,
    tx?.to_address,
    tx?.txDataDecoded?.contractAddress,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)) {
      if (value.toLowerCase() !== "0x0000000000000000000000000000000000000000") return value;
    }
  }
  return null;
}

function executionFailed(tx) {
  const result = resultOf(tx);
  const exec = String(tx?.txExecutionResultName || "");
  if (statusOf(tx) === "FINALIZED") return result !== "MAJORITY_AGREE";
  return (
    result === "FAILURE" ||
    result === "MAJORITY_DISAGREE" ||
    result === "MAJORITY_TIMEOUT" ||
    result === "DETERMINISTIC_VIOLATION" ||
    result === "NO_MAJORITY" ||
    exec === "FINISHED_WITH_ERROR"
  );
}

async function waitTx(client, hash, label, timeoutMs) {
  const start = Date.now();
  let last = "";
  let finalizeAttempted = false;
  while (Date.now() - start < timeoutMs) {
    let tx;
    try {
      tx = await client.getTransaction({ hash });
    } catch (error) {
      const message = error?.shortMessage || error?.message || String(error);
      if (message !== last) {
        console.log(`[${label}] poll error: ${message}`);
        last = message;
      }
      await sleep(4000);
      continue;
    }
    const status = statusOf(tx);
    const result = resultOf(tx);
    const line = `${status} ${result}`.trim();
    if (line !== last) {
      console.log(`[${label}] ${line}`);
      last = line;
    }
    if (status === "FINALIZED") {
      if (result !== "MAJORITY_AGREE") {
        const error = new Error(`${label} finalized without majority agreement: ${status} ${result}`);
        error.tx = tx;
        throw error;
      }
      return tx;
    }
    if (status === "CANCELED" || status === "LEADER_TIMEOUT" || status === "VALIDATORS_TIMEOUT") {
      const error = new Error(`${label} ended with ${status} ${result}`);
      error.tx = tx;
      throw error;
    }
    if (executionFailed(tx) && (status === "ACCEPTED" || status === "UNDETERMINED")) {
      const error = new Error(`${label} execution failed: ${status} ${result}`);
      error.tx = tx;
      throw error;
    }
    if (status === "READY_TO_FINALIZE" && !finalizeAttempted) {
      finalizeAttempted = true;
      try {
        console.log(`[${label}] calling finalizeTransaction`);
        await client.finalizeTransaction({ txId: hash });
      } catch (error) {
        console.log(`[${label}] finalizeTransaction error: ${error?.message || error}`);
      }
    }
    await sleep(5000);
  }
  throw new Error(`${label} timed out; last status: ${last}`);
}

async function traceOf(client, hash) {
  try {
    return jsonSafe(await client.debugTraceTransaction({ hash }));
  } catch (error) {
    return { traceError: error?.message || String(error) };
  }
}

const spec = NETWORKS[networkName];
const account = createAccount(loadKey());
const client = createClient({ chain: chainFor(spec), account });
const codePath = process.env.ECHOTRACE_CONTRACT_PATH ||
  (networkName === "studio-dev" ? "contracts/echotrace_studio_dev.py" : "contracts/echotrace.py");
const code = readFileSync(path.join(root, codePath), "utf8");
let sourceCommit = repositoryCommit;
try {
  sourceCommit = execFileSync("git", ["log", "-1", "--format=%H", "--", codePath], { cwd: root, encoding: "utf8" }).trim() || repositoryCommit;
} catch {
  // An explicitly supplied untracked source has no separate source revision.
}
const codeSha256 = createHash("sha256").update(code).digest("hex");
const outDir = path.join(root, "deployments");
const schemaDir = path.join(outDir, "schema");
mkdirSync(outDir, { recursive: true });
mkdirSync(schemaDir, { recursive: true });
const outPath = path.join(outDir, `${networkName}.json`);

async function rpc(method, params) {
  const response = await fetch(spec.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(`${method} failed: ${JSON.stringify(payload.error || payload).slice(0, 500)}`);
  }
  return payload.result;
}

let record = {
  network: networkName,
  project: "EchoTrace",
  version: "1.0.0",
  environment: networkName === "studionet" ? "Stable Studio" : "Studio Development Preview",
  chainId: spec.chainId,
  chain_id: spec.chainId,
  rpc: spec.rpc,
  explorer: spec.explorer,
  deployer: account.address,
  contractPath: codePath,
  contractSha256: codeSha256,
  contract_source: codePath,
  source_sha256: codeSha256,
  gitCommit: sourceCommit,
  git_commit: sourceCommit,
  repositoryCommit,
  repository_commit: repositoryCommit,
  sdk: sdkPackage === "genlayer-js-rc" ? "genlayer-js@2.0.0-rc.1" : "genlayer-js@1.1.8",
  transactionAbi: spec.txAbi,
  readVariant: TransactionHashVariant.LATEST_FINAL,
  startedAt: new Date().toISOString(),
  transactions: {},
  reads: {},
  readMethods: {},
  contractAddress: null,
  contract_address: null,
  deployment_transaction: null,
  finalized: false,
  lifecycle_test: null,
  read_methods_passed: 0,
  read_methods_total: 0,
  certification_status: "BLOCKED",
  smoke: {
    urls: [
      "https://tribunecontentagency.com/article/taking-the-kids-ready-to-travel-like-never-before/",
      "https://www.arcamax.com/homeandleisure/travel/takingthekids/s-4280675",
    ],
    note: "A public Tribune Content Agency article and its ArcaMax published copy. They are used as a real provenance case; hosted consensus determines the stored relation.",
  },
};

if (existsSync(outPath)) {
  try {
    const prior = JSON.parse(readFileSync(outPath, "utf8"));
    if (prior.contractSha256 === codeSha256) {
      record.transactions = prior.transactions || {};
      record.contractAddress = prior.contractAddress || record.contractAddress;
      record.startedAt = prior.startedAt || record.startedAt;
      record.assessmentId = prior.assessmentId;
      record.invalidIdBehavior = prior.invalidIdBehavior;
      for (const tx of Object.values(record.transactions)) {
        if (tx.receipt) tx.receipt = trimTx(tx.receipt);
      }
    }
  } catch {
    // A partial or corrupt record is replaced as steps succeed.
  }
}
if (process.env.ECHOTRACE_CONTRACT) {
  record.contractAddress = process.env.ECHOTRACE_CONTRACT;
}

function save() {
  writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n");
}

console.log(`network=${networkName} chain=${spec.chainId} abi=${spec.txAbi} deployer=${account.address}`);
console.log(`contract sha256=${codeSha256}`);

try {
  const actualChainId = Number(BigInt(await rpc("eth_chainId", [])));
  const sdkRpc = client.chain.rpcUrls.default.http[0];
  if (actualChainId !== spec.chainId || Number(client.chain.id) !== spec.chainId || sdkRpc !== spec.rpc) {
    throw new Error(`network mismatch: RPC=${actualChainId}/${sdkRpc}, SDK=${client.chain.id}, expected=${spec.chainId}/${spec.rpc}`);
  }
  const balance = await rpc("eth_getBalance", [account.address, "latest"]);
  record.preflight = {
    rpcChainId: actualChainId,
    sdkChainId: client.chain.id,
    deployer: account.address,
    balanceWei: balance,
    verifiedAt: new Date().toISOString(),
  };
  async function pricedFees(overrides = {}, writeRequest) {
    if (spec.txAbi !== "v6") return undefined;
    const estimated = writeRequest
      ? await client.estimateTransactionFeesForWrite({ ...writeRequest, ...overrides })
      : await client.estimateTransactionFees(overrides);
    const balanceWei = BigInt(await rpc("eth_getBalance", [account.address, "latest"]));
    const feeValue = BigInt(estimated.feeValue);
    if (balanceWei < feeValue) {
      throw new Error(`insufficient balance for estimated fee: balance=${balanceWei}, fee=${feeValue}`);
    }
    const fees = {
      distribution: estimated.distribution,
      feeValue,
    };
    console.log(`balanceWei=${balanceWei.toString()} feeValue=${fees.feeValue.toString()}`);
    return fees;
  }

  if (!record.contractAddress) {
    console.log("deploying");
    const deployHash = await client.deployContract({ code, args: [], fees: await pricedFees() });
    record.transactions.deploy = { hash: deployHash };
    save();
    const deployTx = await waitTx(client, deployHash, "deploy", 8 * 60 * 1000);
    const address = contractAddressOf(deployTx);
    record.transactions.deploy.receipt = trimTx(deployTx);
    record.transactions.deploy.status = statusOf(deployTx);
    record.transactions.deploy.result = resultOf(deployTx);
    record.contractAddress = address;
    record.contract_address = address;
    record.deployment_transaction = deployHash;
    save();
    if (!address) throw new Error("deploy finalized but contract address was not found");
  }
  const address = record.contractAddress;
  record.contract_address = address;
  record.deployment_transaction = record.transactions.deploy?.hash || null;
  console.log(`contract=${address}`);
  save();

  const codeB64 = await rpc("gen_getContractCode", [address]);
  const deployedCode = Buffer.from(codeB64, "base64");
  const deployedCodeSha256 = createHash("sha256").update(deployedCode).digest("hex");
  if (deployedCode.toString("utf8") !== code) {
    throw new Error(`deployed code differs from frozen source (deployed sha256=${deployedCodeSha256})`);
  }
  const schema = await rpc("gen_getContractSchema", [address]);
  const schemaText = JSON.stringify(schema, null, 2) + "\n";
  writeFileSync(path.join(schemaDir, `${networkName}.json`), schemaText);
  const schemaMethods = Object.entries(schema.methods || {}).map(([name, meta]) => ({
    name,
    readonly: meta.readonly === true,
    params: meta.params,
    ret: meta.ret,
  }));
  const publicReadMethods = schemaMethods.filter((method) => method.readonly).map((method) => method.name).sort();
  const publicWriteMethods = schemaMethods.filter((method) => !method.readonly).map((method) => method.name).sort();
  // The deployed schema, not a local expected-count constant, is the read ABI
  // of record. The known plans below provide strong value assertions; any
  // additional schema method is still called below and therefore audited.
  const knownReadMethods = new Set([
    "get_analysis_summary", "get_assessment", "get_assessment_count", "get_assessment_status",
    "get_contract_info", "get_provenance_group", "get_provenance_groups", "get_relation",
    "get_relations", "get_source", "get_source_count", "get_sources", "map_evidence_flags",
  ]);
  if (publicReadMethods.length === 0) {
    throw new Error("deployed schema exposes no public read methods");
  }
  record.schemaReadMethods = publicReadMethods;
  record.schemaReadMethodCount = publicReadMethods.length;
  record.schemaUnexpectedReadMethods = publicReadMethods.filter((method) => !knownReadMethods.has(method));
  record.schemaMissingKnownReadMethods = [...knownReadMethods].filter((method) => !publicReadMethods.includes(method)).sort();
  const expectedWriteMethods = ["add_source", "analyze_sources", "create_assessment", "seal_assessment"].sort();
  if (JSON.stringify(publicWriteMethods) !== JSON.stringify(expectedWriteMethods)) {
    throw new Error(`deployed write schema mismatch: ${JSON.stringify(publicWriteMethods)}`);
  }
  record.deployedCodeSha256 = deployedCodeSha256;
  record.deployedCodeMatchesSource = true;
  record.schemaPath = `deployments/schema/${networkName}.json`;
  record.schemaSha256 = createHash("sha256").update(schemaText).digest("hex");
  record.publicMethods = schemaMethods;
  save();

  async function view(functionName, args, variant = TransactionHashVariant.LATEST_FINAL) {
    return client.readContract({
      address,
      functionName,
      args,
      transactionHashVariant: variant,
    });
  }

  async function step(key, functionName, args, options = {}, timeoutMs = 8 * 60 * 1000) {
    if (record.transactions[key]?.status === "FINALIZED" && !record.transactions[key]?.error) {
      console.log(`skip ${key} already finalized`);
      return;
    }
    console.log(`write ${key}`);
    const writeRequest = { address, functionName, args, value: 0n };
    const hash = await client.writeContract({
      ...writeRequest,
      consensusMaxRotations: options.consensusMaxRotations,
      fees: await pricedFees(options.feeOverrides || {}, writeRequest),
    });
    record.transactions[key] = { hash, functionName, args };
    save();
    try {
      const tx = await waitTx(client, hash, key, timeoutMs);
      record.transactions[key].receipt = trimTx(tx);
      record.transactions[key].status = statusOf(tx);
      record.transactions[key].result = resultOf(tx);
      save();
    } catch (error) {
      record.transactions[key].error = error.message;
      if (error.tx) record.transactions[key].receipt = trimTx(error.tx);
      record.transactions[key].trace = await traceOf(client, hash);
      save();
      throw error;
    }
  }

  let count = Number(await view("get_assessment_count", []));
  const requestedAid = process.env.ECHOTRACE_ASSESSMENT_ID === undefined
    ? null
    : Number(process.env.ECHOTRACE_ASSESSMENT_ID);
  if (requestedAid !== null && (!Number.isInteger(requestedAid) || requestedAid < 0 || requestedAid >= count)) {
    throw new Error(`invalid ECHOTRACE_ASSESSMENT_ID: ${process.env.ECHOTRACE_ASSESSMENT_ID}`);
  }
  let aid = requestedAid ?? (Number.isInteger(record.assessmentId) ? record.assessmentId : -1);
  const existingStatus = aid >= 0 && aid < count ? await view("get_assessment_status", [aid]) : null;
  if (aid < 0 || aid >= count || (existingStatus === "ANALYZED" && requestedAid === null)) {
    const before = count;
    const title = "Public article provenance check";
    const context = "Compare a publicly available article with another publisher's copy. EchoTrace records provenance, not factual truth.";
    await step(`create_assessment_${before}`, "create_assessment", [title, context]);
    count = Number(await view("get_assessment_count", []));
    if (count !== before + 1) throw new Error(`assessment count did not increment: ${before} -> ${count}`);
    aid = before;
    record.assessmentId = aid;
    save();
  }
  record.assessmentId = aid;
  let status = await view("get_assessment_status", [aid]);
  console.log(`assessment ${aid} status=${status} count=${count}`);
  if (status === "DRAFT") {
    let sourceCount = Number(await view("get_source_count", [aid]));
    const urls = record.smoke.urls;
    const labels = ["Tribune Content Agency", "ArcaMax"];
    for (let i = sourceCount; i < urls.length; i += 1) {
      await step(`add_source_${aid}_${i}`, "add_source", [aid, urls[i], labels[i]]);
    }
    sourceCount = Number(await view("get_source_count", [aid]));
    if (sourceCount !== urls.length) {
      throw new Error(`source count mismatch before seal: ${sourceCount}`);
    }
    await step(`seal_assessment_${aid}`, "seal_assessment", [aid]);
    status = await view("get_assessment_status", [aid]);
    if (status !== "SEALED") throw new Error(`expected SEALED after seal, got ${status}`);
  }
  if (status === "SEALED") {
    await step(
      `analyze_sources_${aid}`,
      "analyze_sources",
      [aid],
      {
        consensusMaxRotations: 5,
        feeOverrides: { rotations: [5n] },
      },
      20 * 60 * 1000,
    );
    status = await view("get_assessment_status", [aid]);
  }
  if (status !== "ANALYZED") {
    throw new Error(`expected ANALYZED before reads, got ${status}`);
  }
  const assessment = await view("get_assessment", [aid]);
  if (assessment.assessment_id !== aid || assessment.creator?.toLowerCase() !== account.address.toLowerCase() ||
      assessment.title !== "Public article provenance check" || assessment.source_count !== 2 ||
      assessment.has_analysis !== true || assessment.status !== "ANALYZED") {
    throw new Error(`lifecycle assessment inconsistent: ${JSON.stringify(assessment)}`);
  }
  const sourceRows = await view("get_sources", [aid]);
  if (!Array.isArray(sourceRows) || sourceRows.length !== 2 || sourceRows.some((row, index) =>
      row.retrieval_status !== "OK" || row.url !== record.smoke.urls[index])) {
    throw new Error(`hosted retrieval did not succeed for both sources: ${JSON.stringify(sourceRows)}`);
  }
  const relations = await view("get_relations", [aid]);
  if (!Array.isArray(relations) || relations.length !== 1 || !["INDEPENDENT", "A_DERIVES_FROM_B", "B_DERIVES_FROM_A", "COMMON_ORIGIN", "SYNDICATED", "UNKNOWN"].includes(relations[0].relation)) {
    throw new Error(`unexpected relation result: ${JSON.stringify(relations)}`);
  }
  const actualGroups = await view("get_provenance_groups", [aid]);
  if (!Array.isArray(actualGroups) || actualGroups.length === 0) {
    throw new Error("hosted analysis has no confirmed group; get_provenance_group cannot be validly certified");
  }
  const analyzedSummary = await view("get_analysis_summary", [aid]);
  if (analyzedSummary.confirmed_group_count !== actualGroups.length ||
      analyzedSummary.unresolved_source_count !== sourceRows.filter((row) => !row.group_assigned).length ||
      analyzedSummary.unresolved_relation_count !== relations.filter((row) => row.relation === "UNKNOWN").length) {
    throw new Error(`analysis summary inconsistent with graph: ${JSON.stringify(analyzedSummary)}`);
  }

  async function read(key, functionName, args, check) {
    try {
      const value = await view(functionName, args, TransactionHashVariant.LATEST_FINAL);
      const valid = check ? check(value) : true;
      record.reads[key] = { functionName, args, ok: valid, value: jsonSafe(value) };
      const prior = record.readMethods[functionName];
      record.readMethods[functionName] = {
        ok: (prior?.ok ?? true) && valid,
        calls: [...(prior?.calls || []), { key, args: jsonSafe(args), ok: valid }],
      };
    } catch (error) {
      record.reads[key] = {
        functionName,
        args,
        ok: false,
        error: errorText(error),
      };
      const prior = record.readMethods[functionName];
      record.readMethods[functionName] = {
        ok: false,
        calls: [...(prior?.calls || []), { key, args: jsonSafe(args), ok: false }],
      };
    }
    console.log(`read ${key} ok=${record.reads[key].ok}`);
    save();
  }

  const expect = (condition) => (value) => condition(value);
  const relation = relations[0].relation;
  const reverseRelation = {
    A_DERIVES_FROM_B: "B_DERIVES_FROM_A",
    B_DERIVES_FROM_A: "A_DERIVES_FROM_B",
  }[relation] || relation;
  const reverseReason = {
    a_derives_from_b: "b_derives_from_a",
    b_derives_from_a: "a_derives_from_b",
  }[relations[0].reason] || relations[0].reason;
  const knownReadPlans = {
    get_contract_info: [{ key: "get_contract_info", args: [], check: expect((value) => value?.name === "EchoTrace" && value?.version === "1.0.0" && value?.min_sources === 2 && value?.max_sources === 6 && value?.unassigned_group_id === 255) }],
    get_assessment_count: [{ key: "get_assessment_count", args: [], check: expect((value) => Number(value) === count) }],
    get_assessment: [{ key: "get_assessment", args: [aid], check: expect((value) => value?.assessment_id === aid && value?.creator?.toLowerCase() === account.address.toLowerCase() && value?.source_count === 2 && value?.has_analysis === true && value?.status === "ANALYZED") }],
    get_assessment_status: [{ key: "get_assessment_status", args: [aid], check: expect((value) => value === "ANALYZED") }],
    get_source_count: [{ key: "get_source_count", args: [aid], check: expect((value) => Number(value) === 2) }],
    get_source: [{ key: "get_source", args: [aid, 0], check: expect((value) => value?.assessment_id === aid && value?.source_id === 0 && value?.url === record.smoke.urls[0] && value?.retrieval_status === "OK") }],
    get_sources: [{ key: "get_sources", args: [aid], check: expect((value) => Array.isArray(value) && value.length === 2 && value.every((row, i) => row.source_id === i && row.url === record.smoke.urls[i] && row.retrieval_status === "OK")) }],
    get_relation: [
      { key: "get_relation_forward", args: [aid, 0, 1], check: expect((value) => value?.source_a === 0 && value?.source_b === 1 && value?.canonical_source_a === 0 && value?.relation === relation && value?.reason === relations[0].reason) },
      { key: "get_relation_reverse", args: [aid, 1, 0], check: expect((value) => value?.source_a === 1 && value?.source_b === 0 && value?.canonical_source_a === 0 && value?.relation === reverseRelation && value?.reason === reverseReason) },
    ],
    get_relations: [{ key: "get_relations", args: [aid], check: expect((value) => Array.isArray(value) && value.length === 1 && value[0].source_a === 0 && value[0].source_b === 1 && value[0].relation === relation && value[0].reason === relations[0].reason) }],
    get_analysis_summary: [{ key: "get_analysis_summary", args: [aid], check: expect((value) => value?.assessment_id === aid && value?.status === "ANALYZED" && value?.relation_count === 1 && value?.source_count === 2) }],
    get_provenance_group: [{ key: "get_provenance_group", args: [aid, actualGroups[0].group_id], check: expect((value) => value?.group_id === actualGroups[0].group_id && JSON.stringify(value?.source_ids) === JSON.stringify(actualGroups[0].source_ids)) }],
    get_provenance_groups: [{ key: "get_provenance_groups", args: [aid], check: expect((value) => Array.isArray(value) && JSON.stringify(value) === JSON.stringify(actualGroups)) }],
    map_evidence_flags: [{ key: "map_evidence_flags", args: ["none", "none", "none", "none", "none", "insufficient"], check: expect((value) => value === "UNKNOWN") }],
  };
  const defaultReadArg = ([name, type], index) => {
    if (name === "assessment_id") return aid;
    if (name === "source_a" || name === "source_id") return 0;
    if (name === "source_b") return 1;
    if (name === "group_id") return actualGroups[0]?.group_id ?? 0;
    if (type === "string") {
      if (name === "evidence") return "insufficient";
      if (name.endsWith("_flags") || ["explicit_attribution", "syndication", "derivative", "shared_upstream", "independent_primary"].includes(name)) return "none";
      return "";
    }
    return index === 0 ? 0 : 0;
  };
  for (const methodName of publicReadMethods) {
    const plans = knownReadPlans[methodName] || [{
      key: `schema_${methodName}`,
      args: (schema.methods[methodName]?.params || []).map(defaultReadArg),
      check: (value) => value !== undefined,
    }];
    for (const plan of plans) {
      await read(plan.key, methodName, plan.args, plan.check);
    }
  }
  try {
    await view("get_assessment", [999999], TransactionHashVariant.LATEST_FINAL);
    record.invalidIdBehavior = { method: "get_assessment", passed: false, note: "nonexistent id unexpectedly returned" };
  } catch (error) {
    const message = errorText(error);
    const rejected = /execution failed/i.test(message) && !/rate limit|quota|timeout/i.test(message);
    if (rejected) {
      record.invalidIdBehavior = {
        method: "get_assessment",
        passed: true,
        error: message,
        note: "The hosted read was rejected as an execution failure. Studio wraps the contract UserError; direct-mode tests verify the specific assessment not found reason.",
      };
      delete record.invalidIdProbeRetry;
    } else if (/rate limit|quota|timeout/i.test(message)) {
      record.invalidIdProbeRetry = { method: "get_assessment", passed: false, error: message };
    } else {
      record.invalidIdBehavior = { method: "get_assessment", passed: false, error: message, note: "The failure was not a contract execution rejection." };
    }
  }

  const failedReads = publicReadMethods.filter((method) => !record.readMethods[method]?.ok);
  const lifecycleTxKeys = [
    `create_assessment_${aid}`,
    `add_source_${aid}_0`,
    `add_source_${aid}_1`,
    `seal_assessment_${aid}`,
    `analyze_sources_${aid}`,
  ];
  const lifecycleFinalized = lifecycleTxKeys.every((key) => record.transactions[key]?.status === "FINALIZED");
  record.lifecycleTest = {
    assessmentId: aid,
    status,
    sourceUrls: record.smoke.urls,
    relation: relations[0].relation,
    transactions: Object.fromEntries(lifecycleTxKeys.map((key) => [key, record.transactions[key]])),
    finalized: lifecycleFinalized,
  };
  record.lifecycle_test = record.lifecycleTest;
  record.completedAt = new Date().toISOString();
  record.readMethodsPassed = publicReadMethods.length - failedReads.length;
  record.readMethodsTotal = publicReadMethods.length;
  record.read_methods_passed = record.readMethodsPassed;
  record.read_methods_total = record.readMethodsTotal;
  record.finalized = record.transactions.deploy?.status === "FINALIZED" &&
    record.transactions.deploy?.result === "MAJORITY_AGREE";
  record.certification_status = record.finalized && lifecycleFinalized && failedReads.length === 0 &&
    record.invalidIdBehavior.passed && record.deployedCodeMatchesSource ? "PASS" : "FAIL";
  record.certificationStatus = record.certification_status;
  record.failedReads = failedReads;
  delete record.error;
  save();
  if (failedReads.length || !record.invalidIdBehavior.passed || record.certification_status !== "PASS") {
    throw new Error(`certification failed: reads=${failedReads.join(",") || "ok"}, invalidId=${record.invalidIdBehavior.passed}, status=${record.certification_status}`);
  }
  console.log("done", outPath);
} catch (error) {
  record.completedAt = new Date().toISOString();
  record.finalized = record.transactions.deploy?.status === "FINALIZED" &&
    record.transactions.deploy?.result === "MAJORITY_AGREE";
  record.certification_status = record.transactions.deploy?.hash ? "FAIL" : "BLOCKED";
  record.error = error?.message || String(error);
  save();
  console.error(record.error);
  process.exit(1);
}
