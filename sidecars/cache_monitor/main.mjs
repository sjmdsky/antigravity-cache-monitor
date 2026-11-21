/**
 * Cache Monitor sidecar backend.
 *
 * Read-only monitor for prompt cache hit rates, TTFT, and Decode tok/s from
 * <appData>/brain/<conversationId>/.system_generated/logs/transcript.jsonl and
 * <appData>/conversations/<conversationId>.db (SQLite WAL, read-only).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SidecarApp, Response } from 'sidecar_sdk';

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ID_RE = /^[a-zA-Z0-9_-]{8,}$/;
const MAX_CACHE_ENTRIES = 64;
const MIN_STREAM_MS = 500;
const MIN_E2E_MS = 100;

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

const COMPLETED_AT_RE = /Completed At:\s*(\S+)/;
const parseTsMs = (s) => {
  if (typeof s !== 'string' || !s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
};

function findAppDataDirs() {
  const dirs = [];
  const seen = new Set();
  const pushDir = (d) => {
    if (!d || seen.has(d)) return;
    if (existsSync(join(d, 'brain'))) {
      seen.add(d);
      dirs.push(d);
    }
  };

  const dataDir = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR;
  if (dataDir) {
    for (let d = resolve(dataDir); d !== dirname(d); d = dirname(d)) {
      if (basename(d) === 'sidecar_data') {
        pushDir(dirname(d));
        break;
      }
    }
  }

  const geminiRoot = join(homedir(), '.gemini');
  pushDir(join(geminiRoot, 'antigravity'));
  pushDir(join(geminiRoot, 'antigravity-cli'));
  try {
    for (const name of readdirSync(geminiRoot).sort()) {
      pushDir(join(geminiRoot, name));
    }
  } catch {
    // ignore missing ~/.gemini
  }

  return dirs;
}

function findTranscript(convId) {
  for (const appData of findAppDataDirs()) {
    const filePath = join(appData, 'brain', convId, '.system_generated', 'logs', 'transcript.jsonl');
    if (existsSync(filePath)) {
      return { filePath, appData };
    }
  }
  return null;
}

function parseProtoFields(buf) {
  const fields = [];
  const n = buf.length;
  let i = 0;

  const readVarint = () => {
    let val = 0n;
    let shift = 0n;
    while (i < n) {
      const b = buf[i++];
      if (shift <= 63n) {
        val |= BigInt(b & 0x7f) << shift;
      }
      if ((b & 0x80) === 0) return val;
      shift += 7n;
      if (shift > 70n) return null;
    }
    return null;
  };

  while (i < n) {
    const key = readVarint();
    if (key === null) break;
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (field <= 0) break;

    if (wire === 0) {
      const val = readVarint();
      if (val === null) break;
      fields.push({ field, wire, val });
    } else if (wire === 1) {
      if (i + 8 > n) break;
      i += 8;
      fields.push({ field, wire });
    } else if (wire === 2) {
      const lenBig = readVarint();
      if (lenBig === null || lenBig > BigInt(n - i)) break;
      const len = Number(lenBig);
      const bytes = buf.subarray(i, i + len);
      i += len;
      fields.push({ field, wire, bytes });
    } else if (wire === 5) {
      if (i + 4 > n) break;
      i += 4;
      fields.push({ field, wire });
    } else {
      break;
    }
  }
  return fields;
}

function decodeTimestampMs(buf) {
  if (!buf || buf.length === 0) return null;
  let seconds = 0n;
  let nanos = 0n;
  for (const f of parseProtoFields(buf)) {
    if (f.field === 1 && f.wire === 0) seconds = f.val;
    else if (f.field === 2 && f.wire === 0) nanos = f.val;
  }
  if (seconds <= 0n) return null;
  return Number(seconds) * 1000 + Number(nanos) / 1e6;
}

function decodeStepMeta(buf) {
  let createdAtMs = null;
  let firstTokenAtMs = null;
  let completedAtMs = null;
  let thinkingTokens = null;
  let responseTokens = null;

  for (const f of parseProtoFields(buf)) {
    if (f.wire !== 2) continue;
    if (f.field === 1) {
      createdAtMs = decodeTimestampMs(f.bytes);
    } else if (f.field === 6) {
      firstTokenAtMs = decodeTimestampMs(f.bytes);
    } else if (f.field === 7) {
      completedAtMs = decodeTimestampMs(f.bytes);
    } else if (f.field === 9) {
      let hasThink = false;
      let hasResp = false;
      let think = 0;
      let resp = 0;
      for (const uf of parseProtoFields(f.bytes)) {
        if (uf.wire !== 0) continue;
        if (uf.field === 9) {
          hasThink = true;
          think = Number(uf.val);
        } else if (uf.field === 10) {
          hasResp = true;
          resp = Number(uf.val);
        }
      }
      if (hasThink || hasResp) {
        thinkingTokens = think;
        responseTokens = resp;
      }
    }
  }

  const ttftMs = (createdAtMs !== null && firstTokenAtMs !== null && firstTokenAtMs >= createdAtMs)
    ? Math.round(firstTokenAtMs - createdAtMs)
    : null;
  const genMs = (firstTokenAtMs !== null && completedAtMs !== null && completedAtMs >= firstTokenAtMs)
    ? Math.round(completedAtMs - firstTokenAtMs)
    : null;
  const modelMs = (createdAtMs !== null && completedAtMs !== null && completedAtMs >= createdAtMs)
    ? Math.round(completedAtMs - createdAtMs)
    : null;

  return { ttftMs, genMs, modelMs, thinkingTokens, responseTokens };
}

function readDbTimings(dbPath) {
  if (!DatabaseSync || !dbPath || !existsSync(dbPath)) return null;
  let db = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true, timeout: 200 });
    const rows = db.prepare('SELECT idx, metadata FROM steps WHERE step_type = 15 ORDER BY idx').all();
    const map = new Map();
    for (const row of rows) {
      if (row && row.metadata instanceof Uint8Array) {
        const idx = Number(row.idx);
        if (Number.isFinite(idx)) {
          map.set(idx, decodeStepMeta(row.metadata));
        }
      }
    }
    return map;
  } catch {
    return null;
  } finally {
    try {
      db?.close();
    } catch {
      // ignore close errors
    }
  }
}

function percentile(sorted, p) {
  if (!sorted || sorted.length === 0) return null;
  if (sorted.length === 1) return Math.round(sorted[0]);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return Math.round(sorted[lo]);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}

function statSig(p) {
  try {
    const st = statSync(p);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return '0:0';
  }
}

const transcriptCache = new Map();

function parseTranscript(filePath, dbPath, sig) {
  const cached = transcriptCache.get(filePath);
  if (cached && cached.sig === sig) {
    transcriptCache.delete(filePath);
    transcriptCache.set(filePath, cached);
    return cached;
  }

  let raw = '';
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const dbTimings = readDbTimings(dbPath);

  const entries = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry && typeof entry === 'object') entries.push(entry);
    } catch {
      // ignore malformed jsonl line
    }
  }

  const steps = [];
  const modelMap = new Map();
  const seenModels = new Set();
  let seq = 0;
  let totalUncached = 0;
  let totalCacheRead = 0;
  let totalCacheCreate = 0;
  let totalOutput = 0;
  let missCount = 0;
  let totalDurationSec = 0;
  let timedStepCount = 0;
  const sessionTtfts = [];
  let sessionValidTpsOut = 0;
  let sessionValidTpsGenMs = 0;
  let sessionValidTpsSteps = 0;
  let sessionValidE2eOut = 0;
  let sessionValidE2eModelMs = 0;
  let sessionValidE2eSteps = 0;
  let burstStepCount = 0;
  let sessionTotalGenMs = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type !== 'PLANNER_RESPONSE') continue;

    seq += 1;
    const stepIndex = Number.isFinite(Number(entry.step_index)) ? Number(entry.step_index) : null;
    const inputTokens = toInt(entry.input_tokens);
    const cacheReadTokens = toInt(entry.cache_read_tokens);
    const cacheCreateTokens = toInt(entry.cache_creation_tokens ?? entry.cache_creation_input_tokens);
    const outputTokens = toInt(entry.output_tokens);
    const totalInput = inputTokens + cacheReadTokens + cacheCreateTokens;
    const hitPct = totalInput > 0 ? Math.round((cacheReadTokens * 100) / totalInput) : 0;
    const hitRate = totalInput > 0 ? Math.round((cacheReadTokens * 1000) / totalInput) / 10 : 0;
    const model = typeof entry.model === 'string' && entry.model ? entry.model : 'unknown';
    const isFirstForModel = !seenModels.has(model);
    seenModels.add(model);
    const isCold = isFirstForModel && cacheReadTokens === 0;
    const coldReason = isCold ? (seq === 1 ? 'session' : 'model_switch') : null;
    const isMiss = !isCold && totalInput > 0 && cacheReadTokens === 0;
    const createdAt = typeof entry.created_at === 'string' ? entry.created_at : null;

    const startMs = parseTsMs(entry.created_at);
    let firstToolStartMs = null;
    let lastToolEndMs = null;
    let nextPlannerMs = null;
    for (let j = i + 1; j < entries.length; j++) {
      const ne = entries[j];
      if (!ne || typeof ne !== 'object') continue;
      if (ne.type === 'USER_INPUT') break;
      if (ne.type === 'PLANNER_RESPONSE') {
        nextPlannerMs = parseTsMs(ne.created_at);
        break;
      }
      if (ne.type === 'GENERIC') {
        const toolStartMs = parseTsMs(ne.created_at);
        if (firstToolStartMs === null && toolStartMs !== null) {
          firstToolStartMs = toolStartMs;
        }
        const mComp = typeof ne.content === 'string' ? ne.content.match(COMPLETED_AT_RE) : null;
        const toolEndMs = (mComp ? parseTsMs(mComp[1]) : null) ?? toolStartMs;
        if (toolEndMs !== null && (lastToolEndMs === null || toolEndMs > lastToolEndMs)) {
          lastToolEndMs = toolEndMs;
        }
      }
    }
    const endMs = nextPlannerMs ?? lastToolEndMs;
    let durationSec = (startMs !== null && endMs !== null && endMs >= startMs)
      ? Math.round((endMs - startMs) / 1000)
      : null;
    let modelDurationSec = (startMs !== null && firstToolStartMs !== null && firstToolStartMs >= startMs)
      ? Math.round((firstToolStartMs - startMs) / 1000)
      : null;
    let toolDurationSec = (durationSec !== null && modelDurationSec !== null && durationSec >= modelDurationSec)
      ? (durationSec - modelDurationSec)
      : null;

    const timing = (stepIndex !== null && dbTimings) ? dbTimings.get(stepIndex) ?? null : null;
    const ttftMs = timing?.ttftMs ?? null;
    const genMs = timing?.genMs ?? null;
    const modelMs = timing?.modelMs ?? null;
    const thinkingTokens = timing?.thinkingTokens ?? null;
    const responseTokens = timing?.responseTokens ?? null;

    const isBurst = genMs !== null && outputTokens > 0 && genMs < MIN_STREAM_MS;
    const decodeTps = (genMs !== null && genMs >= MIN_STREAM_MS && outputTokens > 0)
      ? Math.round((outputTokens * 10000) / genMs) / 10
      : null;
    const e2eTps = (modelMs !== null && modelMs >= MIN_E2E_MS && outputTokens > 0)
      ? Math.round((outputTokens * 10000) / modelMs) / 10
      : null;

    if (modelMs !== null) {
      const exactModelSec = Math.round(modelMs / 1000);
      if (firstToolStartMs !== null) {
        modelDurationSec = exactModelSec;
        durationSec = durationSec !== null ? Math.max(durationSec, exactModelSec) : exactModelSec;
        toolDurationSec = Math.max(0, durationSec - modelDurationSec);
      } else {
        modelDurationSec = exactModelSec;
        durationSec = exactModelSec;
        toolDurationSec = null;
      }
    }

    totalUncached += inputTokens;
    totalCacheRead += cacheReadTokens;
    totalCacheCreate += cacheCreateTokens;
    totalOutput += outputTokens;
    if (isMiss) missCount += 1;
    if (durationSec !== null) {
      totalDurationSec += durationSec;
      timedStepCount += 1;
    }
    if (ttftMs !== null) sessionTtfts.push(ttftMs);
    if (genMs !== null) sessionTotalGenMs += genMs;
    if (decodeTps !== null) {
      sessionValidTpsOut += outputTokens;
      sessionValidTpsGenMs += genMs;
      sessionValidTpsSteps += 1;
    }
    if (e2eTps !== null) {
      sessionValidE2eOut += outputTokens;
      sessionValidE2eModelMs += modelMs;
      sessionValidE2eSteps += 1;
    }
    if (isBurst) burstStepCount += 1;

    steps.push({
      seq,
      stepIndex,
      model,
      createdAt,
      inputTokens,
      cacheReadTokens,
      cacheCreateTokens,
      outputTokens,
      totalInput,
      hitPct,
      hitRate,
      isCold,
      coldReason,
      isMiss,
      durationSec,
      modelDurationSec,
      toolDurationSec,
      ttftMs,
      genMs,
      modelMs,
      decodeTps,
      e2eTps,
      isBurst,
      thinkingTokens,
      responseTokens,
    });

    let m = modelMap.get(model);
    if (!m) {
      m = {
        model,
        steps: 0,
        totalInput: 0,
        cacheRead: 0,
        uncached: 0,
        cacheCreate: 0,
        output: 0,
        totalDurationSec: 0,
        timedSteps: 0,
        ttfts: [],
        validTpsOut: 0,
        validTpsGenMs: 0,
        validTpsSteps: 0,
        validE2eOut: 0,
        validE2eModelMs: 0,
        validE2eSteps: 0,
        burstSteps: 0,
        totalGenMs: 0,
      };
      modelMap.set(model, m);
    }
    m.steps += 1;
    m.totalInput += totalInput;
    m.cacheRead += cacheReadTokens;
    m.uncached += inputTokens;
    m.cacheCreate += cacheCreateTokens;
    m.output += outputTokens;
    if (durationSec !== null) {
      m.totalDurationSec += durationSec;
      m.timedSteps += 1;
    }
    if (ttftMs !== null) m.ttfts.push(ttftMs);
    if (genMs !== null) m.totalGenMs += genMs;
    if (decodeTps !== null) {
      m.validTpsOut += outputTokens;
      m.validTpsGenMs += genMs;
      m.validTpsSteps += 1;
    }
    if (e2eTps !== null) {
      m.validE2eOut += outputTokens;
      m.validE2eModelMs += modelMs;
      m.validE2eSteps += 1;
    }
    if (isBurst) m.burstSteps += 1;
  }

  const stepCount = steps.length;
  const latestStep = stepCount > 0 ? steps[stepCount - 1] : null;
  const prevStep = stepCount > 1 ? steps[stepCount - 2] : null;
  const deltaPct = latestStep && prevStep && !prevStep.isCold
    ? latestStep.hitPct - prevStep.hitPct
    : null;
  const totalInput = totalUncached + totalCacheRead + totalCacheCreate;
  const cumulativePct = totalInput > 0 ? Math.round((totalCacheRead * 100) / totalInput) : 0;
  const cumulativeRate = totalInput > 0 ? Math.round((totalCacheRead * 1000) / totalInput) / 10 : 0;

  const sortedSessionTtfts = [...sessionTtfts].sort((a, b) => a - b);
  const avgTtftMs = sortedSessionTtfts.length > 0
    ? Math.round(sortedSessionTtfts.reduce((acc, v) => acc + v, 0) / sortedSessionTtfts.length)
    : null;

  const models = [...modelMap.values()]
    .map(({ ttfts, validTpsOut, validTpsGenMs, validE2eOut, validE2eModelMs, totalGenMs, ...rest }) => {
      const sortedTtfts = [...ttfts].sort((a, b) => a - b);
      const mAvgTtft = sortedTtfts.length > 0
        ? Math.round(sortedTtfts.reduce((acc, v) => acc + v, 0) / sortedTtfts.length)
        : null;
      return {
        ...rest,
        hitPct: rest.totalInput > 0 ? Math.round((rest.cacheRead * 100) / rest.totalInput) : 0,
        hitRate: rest.totalInput > 0 ? Math.round((rest.cacheRead * 1000) / rest.totalInput) / 10 : 0,
        totalDurationSec: rest.timedSteps > 0 ? rest.totalDurationSec : null,
        avgDurationSec: rest.timedSteps > 0 ? Math.round(rest.totalDurationSec / rest.timedSteps) : null,
        p50TtftMs: percentile(sortedTtfts, 0.5),
        avgTtftMs: mAvgTtft,
        p95TtftMs: percentile(sortedTtfts, 0.95),
        maxTtftMs: sortedTtfts.length > 0 ? sortedTtfts[sortedTtfts.length - 1] : null,
        decodeTps: validTpsGenMs > 0 ? Math.round((validTpsOut * 10000) / validTpsGenMs) / 10 : null,
        e2eTps: validE2eModelMs > 0 ? Math.round((validE2eOut * 10000) / validE2eModelMs) / 10 : null,
        totalGenMs: totalGenMs > 0 ? totalGenMs : null,
      };
    })
    .sort((a, b) => (b.steps - a.steps) || (b.totalInput - a.totalInput));

  const summary = {
    stepCount,
    latestStep,
    prevStep,
    deltaPct,
    totalInput,
    totalUncached,
    totalCacheRead,
    totalCacheCreate,
    totalOutput,
    cumulativePct,
    cumulativeRate,
    missCount,
    isColdSession: stepCount <= 1 && totalCacheRead === 0,
    activeModel: latestStep?.model || null,
    totalDurationSec: timedStepCount > 0 ? totalDurationSec : null,
    avgDurationSec: timedStepCount > 0 ? Math.round(totalDurationSec / timedStepCount) : null,
    timedStepCount,
    hasTiming: sessionTtfts.length > 0,
    latestTtftMs: latestStep?.ttftMs ?? null,
    deltaTtftMs: (latestStep?.ttftMs != null && prevStep?.ttftMs != null)
      ? (latestStep.ttftMs - prevStep.ttftMs)
      : null,
    p50TtftMs: percentile(sortedSessionTtfts, 0.5),
    avgTtftMs,
    p95TtftMs: percentile(sortedSessionTtfts, 0.95),
    latestDecodeTps: latestStep?.decodeTps ?? null,
    latestIsBurst: Boolean(latestStep?.isBurst),
    deltaDecodeTps: (latestStep?.decodeTps != null && prevStep?.decodeTps != null)
      ? Math.round((latestStep.decodeTps - prevStep.decodeTps) * 10) / 10
      : null,
    sessionDecodeTps: sessionValidTpsGenMs > 0
      ? Math.round((sessionValidTpsOut * 10000) / sessionValidTpsGenMs) / 10
      : null,
    validTpsSteps: sessionValidTpsSteps,
    latestE2eTps: latestStep?.e2eTps ?? null,
    deltaE2eTps: (latestStep?.e2eTps != null && prevStep?.e2eTps != null)
      ? Math.round((latestStep.e2eTps - prevStep.e2eTps) * 10) / 10
      : null,
    sessionE2eTps: sessionValidE2eModelMs > 0
      ? Math.round((sessionValidE2eOut * 10000) / sessionValidE2eModelMs) / 10
      : null,
    validE2eSteps: sessionValidE2eSteps,
    burstStepCount,
    totalGenMs: sessionTotalGenMs > 0 ? sessionTotalGenMs : null,
  };

  const result = { sig, summary, models, steps };
  transcriptCache.set(filePath, result);
  if (transcriptCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = transcriptCache.keys().next().value;
    transcriptCache.delete(oldestKey);
  }
  return result;
}

const app = new SidecarApp();

app.page('/', () => readFileSync(join(__dirname, 'index.html'), 'utf-8'));

app.api('/styles.css', () => new Response(
  readFileSync(join(__dirname, 'styles.css'), 'utf-8'),
  { contentType: 'text/css; charset=utf-8', headers: { 'Cache-Control': 'no-store' } }
), 'GET');

app.api('/app.js', () => new Response(
  readFileSync(join(__dirname, 'app.js'), 'utf-8'),
  { contentType: 'application/javascript; charset=utf-8', headers: { 'Cache-Control': 'no-store' } }
), 'GET');

app.api('/api/cache', (data) => {
  const conv = (typeof data.conversationId === 'string' && data.conversationId.trim())
    || app.config.conversationId
    || '';
  if (!conv || !ID_RE.test(conv)) {
    return { conversationId: conv || null, status: 'no_conversation', etag: 'none' };
  }

  const found = findTranscript(conv);
  if (!found) {
    return { conversationId: conv, status: 'waiting', etag: `${conv}|missing` };
  }

  let st;
  try {
    st = statSync(found.filePath);
  } catch {
    return { conversationId: conv, status: 'waiting', etag: `${conv}|missing` };
  }

  const dbPath = join(found.appData, 'conversations', `${conv}.db`);
  const walPath = `${dbPath}-wal`;
  const sig = `${st.mtimeMs}:${st.size}|${statSig(dbPath)}|${statSig(walPath)}`;
  const etag = `${conv}|${sig}`;
  if (data.etag && data.etag === etag) {
    return { conversationId: conv, status: 'ok', unchanged: true, etag };
  }

  const parsed = parseTranscript(found.filePath, dbPath, sig);
  if (!parsed || parsed.steps.length === 0) {
    return { conversationId: conv, status: 'waiting', etag };
  }

  return {
    conversationId: conv,
    status: 'ok',
    etag,
    summary: parsed.summary,
    models: parsed.models,
    steps: parsed.steps,
  };
}, 'GET');

app.run();
