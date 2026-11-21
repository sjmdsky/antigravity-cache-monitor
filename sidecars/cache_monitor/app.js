(() => {
  'use strict';

  const POLL_MS = 1500;
  const COMPACT_STORAGE_KEY = 'cache-monitor.compact';
  const METRIC_STORAGE_KEY = 'cache-monitor.chartMetric';
  const TPS_MODE_STORAGE_KEY = 'cache-monitor.tpsMode';
  const params = new URLSearchParams(window.location.search);

  const el = {
    app: document.getElementById('app'),
    modelPill: document.getElementById('model-pill'),
    btnCompact: document.getElementById('btn-compact'),
    livePill: document.getElementById('live-pill'),
    liveText: document.getElementById('live-text'),
    emptyState: document.getElementById('empty-state'),
    emptyTitle: document.getElementById('empty-title'),
    emptyDesc: document.getElementById('empty-desc'),
    dashboard: document.getElementById('dashboard'),
    stepLabel: document.getElementById('step-label'),
    stepBadge: document.getElementById('step-badge'),
    stepPct: document.getElementById('step-pct'),
    stepBar: document.getElementById('step-bar'),
    stepSub: document.getElementById('step-sub'),
    totalBadge: document.getElementById('total-badge'),
    totalPct: document.getElementById('total-pct'),
    totalBar: document.getElementById('total-bar'),
    totalSub: document.getElementById('total-sub'),
    ttftLabel: document.getElementById('ttft-label'),
    ttftBadge: document.getElementById('ttft-badge'),
    ttftVal: document.getElementById('ttft-val'),
    ttftSub: document.getElementById('ttft-sub'),
    tpsModeE2e: document.getElementById('tps-mode-e2e'),
    tpsModeDecode: document.getElementById('tps-mode-decode'),
    tpsBadge: document.getElementById('tps-badge'),
    tpsVal: document.getElementById('tps-val'),
    tpsUnit: document.getElementById('tps-unit'),
    tpsSub: document.getElementById('tps-sub'),
    metricHit: document.getElementById('metric-hit'),
    metricTtft: document.getElementById('metric-ttft'),
    metricTps: document.getElementById('metric-tps'),
    trendMeta: document.getElementById('trend-meta'),
    trendChart: document.getElementById('trend-chart'),
    tooltip: document.getElementById('chart-tooltip'),
    tabSteps: document.getElementById('tab-steps'),
    tabModels: document.getElementById('tab-models'),
    detailBody: document.getElementById('detail-body'),
  };

  const state = {
    activeTab: 'steps',
    chartMetric: 'hit',
    tpsMode: 'e2e',
    compact: false,
    lastConv: '',
    lastEtag: '',
    payload: null,
    visibleSteps: [],
    inFlight: false,
  };

  const currentConv = () => window.sidecar?.conversationId || params.get('conversationId') || '';

  const fetcher = window.sidecar?.fetch ? window.sidecar.fetch.bind(window.sidecar) : window.fetch.bind(window);

  // Sync light/dark data-theme from host --background CSS variable.
  function syncScheme() {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--background, #f7f7f8)';
    document.documentElement.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    const nums = (c.match(/[\d.]+/g) || []).map(Number);
    if (nums.length < 3) return;
    const scale = c.startsWith('color(') ? 1 : 255;
    const [r, g, b] = nums.slice(0, 3).map((v) => v / scale);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const theme = lum < 0.5 ? 'dark' : 'light';
    if (document.documentElement.dataset.theme !== theme) {
      document.documentElement.dataset.theme = theme;
    }
  }

  syncScheme();
  new MutationObserver(() => syncScheme()).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style'],
  });

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));

  function fmtTokens(n) {
    const num = Number(n) || 0;
    if (num >= 1_000_000) {
      const dec = num >= 10_000_000 ? 1 : 2;
      return `${(num / 1_000_000).toFixed(dec)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return String(num);
  }

  function shortModel(name) {
    if (!name) return 'unknown';
    return String(name).replace(/^gemini-/i, '');
  }

  function fmtTime(iso) {
    if (!iso) return '--';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '--';
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  function fmtDuration(sec) {
    if (sec === null || sec === undefined || !Number.isFinite(sec) || sec < 0) return '--';
    const s = Math.round(sec);
    if (s < 60) return `${s}s`;
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    if (mins < 60) return rem > 0 ? `${mins}m${rem}s` : `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remM = mins % 60;
    return remM > 0 ? `${hrs}h${remM}m` : `${hrs}h`;
  }

  function tierOf(pct, isCold) {
    if (isCold) return 'cold';
    if (pct >= 80) return 'good';
    if (pct >= 50) return 'warn';
    if (pct >= 20) return 'low';
    return 'bad';
  }

  function fmtLatency(ms) {
    if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '--';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return fmtDuration(ms / 1000);
  }

  function fmtLatencyDelta(deltaMs) {
    if (deltaMs === null || deltaMs === undefined || !Number.isFinite(deltaMs)) return '';
    if (Math.abs(deltaMs) < 50) return '→ 0s';
    const sign = deltaMs > 0 ? '+' : '-';
    const arrow = deltaMs > 0 ? '↑' : '↓';
    return `${arrow} ${sign}${fmtLatency(Math.abs(deltaMs))}`;
  }

  function fmtTps(tps) {
    if (tps === null || tps === undefined || !Number.isFinite(tps) || tps <= 0) return '--';
    return tps >= 100 ? String(Math.round(tps)) : tps.toFixed(1);
  }

  function ttftTier(ms) {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) return 'cold';
    if (ms < 5000) return 'good';
    if (ms < 10000) return 'warn';
    if (ms < 20000) return 'low';
    return 'bad';
  }

  function tpsTier(tps, mode = 'e2e', isBurst = false) {
    if ((mode === 'decode' && isBurst) || tps === null || tps === undefined || !Number.isFinite(tps)) {
      return 'cold';
    }
    if (mode === 'e2e') {
      if (tps >= 80) return 'good';
      if (tps >= 40) return 'warn';
      if (tps >= 15) return 'low';
      return 'bad';
    }
    if (tps >= 120) return 'good';
    if (tps >= 60) return 'warn';
    if (tps >= 30) return 'low';
    return 'bad';
  }

  function niceCeil(maxVal) {
    if (!Number.isFinite(maxVal) || maxVal <= 0) return 10;
    const exp = Math.floor(Math.log10(maxVal));
    const base = Math.pow(10, exp);
    const norm = maxVal / base;
    let nice = 10;
    if (norm <= 1) nice = 1;
    else if (norm <= 2) nice = 2;
    else if (norm <= 2.5) nice = 2.5;
    else if (norm <= 5) nice = 5;
    return nice * base;
  }

  function setLiveStatus(mode, text) {
    el.livePill.classList.remove('is-paused', 'is-error');
    if (mode === 'paused') el.livePill.classList.add('is-paused');
    if (mode === 'error') el.livePill.classList.add('is-error');
    el.liveText.textContent = text;
  }

  function setCompact(next) {
    state.compact = Boolean(next);
    el.app.classList.toggle('is-compact', state.compact);
    el.btnCompact.setAttribute('aria-pressed', state.compact ? 'true' : 'false');
    try {
      localStorage.setItem(COMPACT_STORAGE_KEY, state.compact ? '1' : '0');
    } catch {
      // Sandboxed iframe origin may restrict storage.
    }
  }

  function setChartMetric(next, { persist = true, rerender = true } = {}) {
    const valid = next === 'ttft' || next === 'tps' ? next : 'hit';
    state.chartMetric = valid;
    for (const btn of [el.metricHit, el.metricTtft, el.metricTps]) {
      const active = btn.dataset.metric === valid;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if (persist) {
      try {
        localStorage.setItem(METRIC_STORAGE_KEY, valid);
      } catch {
        // Sandboxed iframe origin may restrict storage.
      }
    }
    if (rerender && state.payload?.status === 'ok') {
      renderChart(state.payload.steps, state.payload.summary);
    }
  }

  function setTpsMode(next, { persist = true, rerender = true } = {}) {
    const valid = next === 'decode' ? 'decode' : 'e2e';
    state.tpsMode = valid;
    for (const btn of [el.tpsModeE2e, el.tpsModeDecode]) {
      const active = btn.dataset.tpsMode === valid;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if (persist) {
      try {
        localStorage.setItem(TPS_MODE_STORAGE_KEY, valid);
      } catch {
        // Sandboxed iframe origin may restrict storage.
      }
    }
    if (rerender && state.payload?.status === 'ok') {
      renderKpis(state.payload.summary);
      if (state.chartMetric === 'tps') {
        renderChart(state.payload.steps, state.payload.summary);
      }
      renderDetails(state.payload);
    }
  }

  try {
    if (localStorage.getItem(COMPACT_STORAGE_KEY) === '1') {
      setCompact(true);
    }
    const savedMetric = localStorage.getItem(METRIC_STORAGE_KEY);
    if (savedMetric === 'hit' || savedMetric === 'ttft' || savedMetric === 'tps') {
      setChartMetric(savedMetric, { persist: false, rerender: false });
    }
    const savedTpsMode = localStorage.getItem(TPS_MODE_STORAGE_KEY);
    if (savedTpsMode === 'e2e' || savedTpsMode === 'decode') {
      setTpsMode(savedTpsMode, { persist: false, rerender: false });
    }
  } catch {
    // Ignore storage error.
  }

  el.btnCompact.addEventListener('click', () => setCompact(!state.compact));

  for (const btn of [el.metricHit, el.metricTtft, el.metricTps]) {
    btn.addEventListener('click', () => {
      const next = btn.dataset.metric;
      if (next && next !== state.chartMetric) {
        setChartMetric(next);
      }
    });
  }

  for (const btn of [el.tpsModeE2e, el.tpsModeDecode]) {
    btn.addEventListener('click', () => {
      const next = btn.dataset.tpsMode;
      if (next && next !== state.tpsMode) {
        setTpsMode(next);
      }
    });
  }

  for (const btn of [el.tabSteps, el.tabModels]) {
    btn.addEventListener('click', () => {
      const next = btn.dataset.tab;
      if (!next || next === state.activeTab) return;
      state.activeTab = next;
      el.tabSteps.classList.toggle('active', next === 'steps');
      el.tabSteps.setAttribute('aria-selected', next === 'steps' ? 'true' : 'false');
      el.tabModels.classList.toggle('active', next === 'models');
      el.tabModels.setAttribute('aria-selected', next === 'models' ? 'true' : 'false');
      if (state.payload?.status === 'ok') {
        renderDetails(state.payload);
      }
    });
  }

  function showEmpty(title, desc) {
    el.modelPill.classList.add('hidden');
    el.dashboard.classList.add('hidden');
    el.emptyState.classList.remove('hidden');
    el.emptyTitle.textContent = title;
    el.emptyDesc.textContent = desc;
  }

  function renderKpis(summary) {
    const step = summary.latestStep;
    const stepTier = tierOf(step.hitPct, step.isCold);
    el.stepLabel.textContent = `单步 · Step #${step.seq}`;
    el.stepPct.className = `kpi-pct c-${stepTier}`;
    el.stepPct.textContent = step.isCold ? 'cold' : `${step.hitPct}%`;
    el.stepBar.className = `bar-fill bg-${stepTier}`;
    el.stepBar.style.width = `${step.isCold ? 0 : Math.max(step.hitPct, step.hitPct > 0 ? 2 : 0)}%`;
    const stepDurText = (step.durationSec !== null && step.durationSec !== undefined)
      ? ` · 用时 ${fmtDuration(step.durationSec)}`
      : '';
    el.stepSub.textContent = `命中 ${fmtTokens(step.cacheReadTokens)} / ${fmtTokens(step.totalInput)} · 新增 ${fmtTokens(step.inputTokens)}${stepDurText}`;
    el.stepSub.title = el.stepSub.textContent;

    if (step.isCold) {
      el.stepBadge.className = 'kpi-badge';
      el.stepBadge.textContent = step.coldReason === 'model_switch' ? '切模型冷启动' : '首步冷启动';
    } else if (step.isMiss) {
      el.stepBadge.className = 'kpi-badge miss';
      el.stepBadge.textContent = '⚠ Miss';
    } else if (summary.deltaPct !== null) {
      if (summary.deltaPct > 0) {
        el.stepBadge.className = 'kpi-badge up';
        el.stepBadge.textContent = `↑ +${summary.deltaPct}%`;
      } else if (summary.deltaPct < 0) {
        el.stepBadge.className = 'kpi-badge down';
        el.stepBadge.textContent = `↓ ${summary.deltaPct}%`;
      } else {
        el.stepBadge.className = 'kpi-badge';
        el.stepBadge.textContent = '→ 0%';
      }
    } else {
      el.stepBadge.className = 'kpi-badge';
      el.stepBadge.textContent = `${step.hitRate}%`;
    }

    const totalTier = tierOf(summary.cumulativePct, summary.isColdSession);
    el.totalBadge.className = summary.missCount > 0 ? 'kpi-badge miss' : 'kpi-badge';
    el.totalBadge.textContent = summary.missCount > 0
      ? `${summary.stepCount} steps · ${summary.missCount} miss`
      : `${summary.stepCount} ${summary.stepCount === 1 ? 'step' : 'steps'}`;
    el.totalPct.className = `kpi-pct c-${totalTier}`;
    el.totalPct.textContent = summary.isColdSession ? 'cold' : `${summary.cumulativePct}%`;
    el.totalBar.className = `bar-fill bg-${totalTier}`;
    el.totalBar.style.width = `${summary.isColdSession ? 0 : Math.max(summary.cumulativePct, summary.cumulativePct > 0 ? 2 : 0)}%`;
    const totalDurText = (summary.totalDurationSec !== null && summary.totalDurationSec !== undefined)
      ? ` · 用时 ${fmtDuration(summary.totalDurationSec)}`
      : '';
    el.totalSub.textContent = `已命中 ${fmtTokens(summary.totalCacheRead)} / ${fmtTokens(summary.totalInput)} · 输出 ${fmtTokens(summary.totalOutput)}${totalDurText}`;
    el.totalSub.title = el.totalSub.textContent;

    el.ttftLabel.textContent = `TTFT · Step #${step.seq}`;
    const tTier = ttftTier(step.ttftMs);
    el.ttftVal.className = `kpi-pct c-${tTier}`;
    el.ttftVal.textContent = fmtLatency(step.ttftMs);

    if (summary.deltaTtftMs !== null && summary.deltaTtftMs !== undefined) {
      if (summary.deltaTtftMs <= -50) {
        el.ttftBadge.className = 'kpi-badge up';
      } else if (summary.deltaTtftMs >= 50) {
        el.ttftBadge.className = 'kpi-badge down';
      } else {
        el.ttftBadge.className = 'kpi-badge';
      }
      el.ttftBadge.textContent = fmtLatencyDelta(summary.deltaTtftMs);
    } else if (summary.p50TtftMs !== null && summary.p50TtftMs !== undefined) {
      el.ttftBadge.className = 'kpi-badge';
      el.ttftBadge.textContent = `P50 ${fmtLatency(summary.p50TtftMs)}`;
    } else {
      el.ttftBadge.className = 'kpi-badge';
      el.ttftBadge.textContent = '--';
    }

    if (summary.hasTiming) {
      el.ttftSub.textContent = `会话 P50 ${fmtLatency(summary.p50TtftMs)} · P95 ${fmtLatency(summary.p95TtftMs)}`;
      el.ttftSub.title = `会话 P50 ${fmtLatency(summary.p50TtftMs)} · 均 ${fmtLatency(summary.avgTtftMs)} · P95 ${fmtLatency(summary.p95TtftMs)}`;
    } else {
      el.ttftSub.textContent = '旧版会话，无首字时间戳';
      el.ttftSub.title = el.ttftSub.textContent;
    }

    const isE2e = state.tpsMode === 'e2e';
    const setTpsBadge = (deltaVal, sessionVal) => {
      if (deltaVal !== null && deltaVal !== undefined) {
        const d = Math.round(deltaVal);
        if (d > 0) {
          el.tpsBadge.className = 'kpi-badge up';
          el.tpsBadge.textContent = `↑ +${d}`;
        } else if (d < 0) {
          el.tpsBadge.className = 'kpi-badge down';
          el.tpsBadge.textContent = `↓ ${d}`;
        } else {
          el.tpsBadge.className = 'kpi-badge';
          el.tpsBadge.textContent = '→ 0';
        }
      } else if (sessionVal != null) {
        el.tpsBadge.className = 'kpi-badge';
        el.tpsBadge.textContent = `Σ ${fmtTps(sessionVal)}`;
      } else {
        el.tpsBadge.className = 'kpi-badge';
        el.tpsBadge.textContent = '--';
      }
    };

    const splitTitle = step.thinkingTokens != null
      ? ` · 思 ${fmtTokens(step.thinkingTokens)} + 答 ${fmtTokens(step.responseTokens)}`
      : '';

    if (isE2e) {
      if (step.e2eTps !== null && step.e2eTps !== undefined) {
        el.tpsVal.className = `kpi-pct c-${tpsTier(step.e2eTps, 'e2e', false)}`;
        el.tpsVal.textContent = fmtTps(step.e2eTps);
        el.tpsUnit.classList.remove('hidden');
        setTpsBadge(summary.deltaE2eTps, summary.sessionE2eTps);
        const sessText = summary.sessionE2eTps != null
          ? `${fmtTps(summary.sessionE2eTps)} tok/s`
          : '--';
        el.tpsSub.textContent = `会话 ${sessText} · 总耗时 ${fmtLatency(step.modelMs)}`;
        const decNote = step.isBurst
          ? ' · Decode burst'
          : (step.decodeTps != null ? ` · Decode ${fmtTps(step.decodeTps)} tok/s` : '');
        el.tpsSub.title = `${el.tpsSub.textContent}${decNote}${splitTitle}`;
      } else {
        el.tpsVal.className = 'kpi-pct c-cold';
        el.tpsVal.textContent = '--';
        el.tpsUnit.classList.add('hidden');
        el.tpsBadge.className = 'kpi-badge';
        el.tpsBadge.textContent = '--';
        el.tpsSub.textContent = summary.hasTiming ? '暂无有效 E2E 数据' : '旧版会话，无速率数据';
        el.tpsSub.title = el.tpsSub.textContent;
      }
    } else if (step.isBurst) {
      el.tpsVal.className = 'kpi-pct c-cold';
      el.tpsVal.textContent = 'burst';
      el.tpsUnit.classList.add('hidden');
      el.tpsBadge.className = 'kpi-badge';
      el.tpsBadge.textContent = summary.sessionDecodeTps != null
        ? `Σ ${fmtTps(summary.sessionDecodeTps)}`
        : '单包返回';
      const sessText = summary.sessionDecodeTps != null
        ? `${fmtTps(summary.sessionDecodeTps)} tok/s`
        : '--';
      el.tpsSub.textContent = `会话 ${sessText} · 单包 ${fmtLatency(step.genMs)}`;
      const e2eNote = step.e2eTps != null ? ` · E2E ${fmtTps(step.e2eTps)} tok/s` : '';
      el.tpsSub.title = `单包/极短流式返回 (生成 ${fmtLatency(step.genMs)})${e2eNote}`;
    } else if (step.decodeTps !== null && step.decodeTps !== undefined) {
      el.tpsVal.className = `kpi-pct c-${tpsTier(step.decodeTps, 'decode', false)}`;
      el.tpsVal.textContent = fmtTps(step.decodeTps);
      el.tpsUnit.classList.remove('hidden');
      setTpsBadge(summary.deltaDecodeTps, summary.sessionDecodeTps);
      const sessText = summary.sessionDecodeTps != null
        ? `${fmtTps(summary.sessionDecodeTps)} tok/s`
        : '--';
      el.tpsSub.textContent = `会话 ${sessText} · 生成 ${fmtLatency(step.genMs)}`;
      const e2eNote = step.e2eTps != null ? ` · E2E ${fmtTps(step.e2eTps)} tok/s` : '';
      el.tpsSub.title = `${el.tpsSub.textContent}${e2eNote}${splitTitle}`;
    } else {
      el.tpsVal.className = 'kpi-pct c-cold';
      el.tpsVal.textContent = '--';
      el.tpsUnit.classList.add('hidden');
      el.tpsBadge.className = 'kpi-badge';
      el.tpsBadge.textContent = '--';
      el.tpsSub.textContent = summary.hasTiming ? '暂无有效 Decode 数据' : '旧版会话，无流式速率数据';
      el.tpsSub.title = el.tpsSub.textContent;
    }
  }

  function buildXAxisSvg(visible, left, right, slotW, H) {
    const xTicks = [];
    if (visible.length >= 1) {
      xTicks.push({ idx: 0, label: `#${visible[0].seq}`, anchor: 'start' });
    }
    if (visible.length >= 6) {
      const mid = Math.floor((visible.length - 1) / 2);
      xTicks.push({ idx: mid, label: `#${visible[mid].seq}`, anchor: 'middle' });
    }
    if (visible.length >= 2) {
      const last = visible.length - 1;
      xTicks.push({ idx: last, label: `#${visible[last].seq}`, anchor: 'end' });
    }
    return xTicks
      .map((t) => {
        const x = (t.idx === 0 ? left : t.idx === visible.length - 1 ? right : left + (t.idx + 0.5) * slotW).toFixed(1);
        return `<text x="${x}" y="${H - 4}" text-anchor="${t.anchor}"
          font-size="8.5" font-family="var(--cm-mono)" fill="var(--cm-fg-muted)">${t.label}</text>`;
      })
      .join('');
  }

  function renderChart(steps, summary) {
    const MAX_BARS = 48;
    const visible = steps.length > MAX_BARS ? steps.slice(-MAX_BARS) : steps;
    state.visibleSteps = visible;
    el.tooltip.classList.add('hidden');

    const metric = state.chartMetric;
    const countLabel = steps.length > MAX_BARS
      ? `最近 ${MAX_BARS} 步（共 ${steps.length} 步）`
      : `共 ${steps.length} 步`;

    const W = 360;
    const H = 114;
    const left = metric === 'hit' ? 28 : 34;
    const right = 354;
    const top = 10;
    const bottom = 94;
    const plotW = right - left;
    const plotH = bottom - top;

    const colorVar = {
      good: 'var(--cm-good)',
      warn: 'var(--cm-warn)',
      low: 'var(--cm-low)',
      bad: 'var(--cm-bad)',
      cold: 'var(--cm-cold)',
    };

    const drawRefLines = (specs, yAt) => specs
      .map((r) => {
        const y = yAt(r.val).toFixed(1);
        const labelSvg = r.label
          ? `<text x="${left - 4}" y="${Number(y) + 3}" text-anchor="end"
              font-size="8.5" font-family="var(--cm-mono)" fill="var(--cm-fg-muted)">${r.label}</text>`
          : '';
        return `
          <line x1="${left}" y1="${y}" x2="${right}" y2="${y}"
            stroke="${r.stroke || 'var(--cm-fg-muted)'}" stroke-opacity="${r.opacity}" stroke-width="1"
            ${r.dash ? `stroke-dasharray="${r.dash}"` : ''} />
          ${labelSvg}`;
      })
      .join('');

    const slotW = plotW / Math.max(visible.length, 1);
    const barW = Math.max(3, Math.min(18, slotW * 0.68));
    const xAxisSvg = buildXAxisSvg(visible, left, right, slotW, H);

    if (metric === 'ttft') {
      const validSecs = visible.filter((s) => s.ttftMs != null).map((s) => s.ttftMs / 1000);
      if (validSecs.length === 0) {
        el.trendMeta.textContent = `${countLabel} · 无首字延迟数据`;
        el.trendChart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="每步首字延迟趋势图">
          <text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="10.5" fill="var(--cm-fg-muted)">旧版会话，暂无首字延迟 (TTFT) 数据</text>
        </svg>`;
        return;
      }

      const maxSec = niceCeil(Math.max(...validSecs, 5));
      const yAt = (sec) => top + (1 - Math.min(sec, maxSec) / maxSec) * plotH;
      const fmtTickSec = (s) => (s === 0 ? '0s' : s >= 60 ? fmtDuration(s) : (Number.isInteger(s) ? `${s}s` : `${s.toFixed(1)}s`));

      el.trendMeta.textContent = summary?.p50TtftMs != null
        ? `${countLabel} · P50 ${fmtLatency(summary.p50TtftMs)} 参考线`
        : `${countLabel} · 首字延迟 (TTFT)`;

      const refSpecs = [
        { val: maxSec, label: fmtTickSec(maxSec), dash: '2,3', opacity: 0.25 },
        { val: maxSec / 2, label: fmtTickSec(maxSec / 2), dash: '2,3', opacity: 0.25 },
        { val: 0, label: '0s', dash: '', opacity: 0.35 },
      ];
      if (summary?.p50TtftMs != null) {
        const p50Sec = summary.p50TtftMs / 1000;
        if (p50Sec > 0 && p50Sec <= maxSec) {
          refSpecs.push({ val: p50Sec, label: '', dash: '3,3', opacity: 0.6, stroke: 'var(--cm-primary)' });
        }
      }
      const refLines = drawRefLines(refSpecs, yAt);

      const barsSvg = visible
        .map((st, idx) => {
          const xCenter = left + (idx + 0.5) * slotW;
          const x = (xCenter - barW / 2).toFixed(2);
          const slotX = (left + idx * slotW).toFixed(2);
          let barRect = '';
          if (st.ttftMs == null) {
            const h = 8;
            const y = (bottom - h).toFixed(2);
            barRect = `<rect class="bar-rect" x="${x}" y="${y}" width="${barW.toFixed(2)}" height="${h}" rx="1.5"
              fill="${colorVar.cold}" fill-opacity="0.35" stroke="${colorVar.cold}" stroke-width="1" stroke-dasharray="2,2" />`;
          } else {
            const tier = ttftTier(st.ttftMs);
            const h = Math.max(4, ((st.ttftMs / 1000) / maxSec) * plotH);
            const y = (bottom - h).toFixed(2);
            barRect = `<rect class="bar-rect" x="${x}" y="${y}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" rx="1.8"
              fill="${colorVar[tier]}" />`;
          }
          return `<g class="chart-bar-hit" data-idx="${idx}">
            <rect x="${slotX}" y="${top}" width="${slotW.toFixed(2)}" height="${plotH}" fill="transparent" />
            ${barRect}
          </g>`;
        })
        .join('');

      el.trendChart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="每步首字延迟趋势图">
        ${refLines}
        ${barsSvg}
        ${xAxisSvg}
      </svg>`;
      return;
    }

    if (metric === 'tps') {
      const isE2e = state.tpsMode === 'e2e';
      const modeLabel = isE2e ? 'E2E' : 'Decode';
      const valOf = (s) => (isE2e ? s.e2eTps : (s.isBurst ? null : s.decodeTps));
      const validTps = visible.map(valOf).filter((v) => v != null);

      if (validTps.length === 0) {
        const hasBurst = !isE2e && visible.some((s) => s.isBurst);
        el.trendMeta.textContent = `${countLabel} · ${hasBurst ? '仅单包 burst 步' : '无速率数据'}`;
        el.trendChart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="每步生成速率趋势图">
          <text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="10.5" fill="var(--cm-fg-muted)">${hasBurst ? '当前步骤均为单包 burst 返回，暂无 Decode 速率' : `旧版会话，暂无 ${modeLabel} tok/s 数据`}</text>
        </svg>`;
        return;
      }

      const maxTps = niceCeil(Math.max(...validTps, isE2e ? 80 : 120));
      const yAt = (tps) => top + (1 - Math.min(tps, maxTps) / maxTps) * plotH;
      const fmtTickTps = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(v)));
      const refTps = isE2e ? summary?.sessionE2eTps : summary?.sessionDecodeTps;

      el.trendMeta.textContent = refTps != null
        ? `${countLabel} · Σ ${fmtTps(refTps)} tok/s (${modeLabel}) 参考线`
        : `${countLabel} · ${modeLabel} tok/s`;

      const refSpecs = [
        { val: maxTps, label: fmtTickTps(maxTps), dash: '2,3', opacity: 0.25 },
        { val: maxTps / 2, label: fmtTickTps(maxTps / 2), dash: '2,3', opacity: 0.25 },
        { val: 0, label: '0', dash: '', opacity: 0.35 },
      ];
      if (refTps != null && refTps > 0 && refTps <= maxTps) {
        refSpecs.push({ val: refTps, label: '', dash: '3,3', opacity: 0.6, stroke: 'var(--cm-primary)' });
      }
      const refLines = drawRefLines(refSpecs, yAt);

      const barsSvg = visible
        .map((st, idx) => {
          const xCenter = left + (idx + 0.5) * slotW;
          const x = (xCenter - barW / 2).toFixed(2);
          const slotX = (left + idx * slotW).toFixed(2);
          const val = valOf(st);
          let barRect = '';
          if (val == null) {
            const h = 10;
            const y = (bottom - h).toFixed(2);
            barRect = `<rect class="bar-rect" x="${x}" y="${y}" width="${barW.toFixed(2)}" height="${h}" rx="1.5"
              fill="${colorVar.cold}" fill-opacity="0.35" stroke="${colorVar.cold}" stroke-width="1" stroke-dasharray="2,2" />`;
          } else {
            const tier = tpsTier(val, state.tpsMode, false);
            const h = Math.max(4, (val / maxTps) * plotH);
            const y = (bottom - h).toFixed(2);
            barRect = `<rect class="bar-rect" x="${x}" y="${y}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" rx="1.8"
              fill="${colorVar[tier]}" />`;
          }
          return `<g class="chart-bar-hit" data-idx="${idx}">
            <rect x="${slotX}" y="${top}" width="${slotW.toFixed(2)}" height="${plotH}" fill="transparent" />
            ${barRect}
          </g>`;
        })
        .join('');

      el.trendChart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="每步生成速率趋势图">
        ${refLines}
        ${barsSvg}
        ${xAxisSvg}
      </svg>`;
      return;
    }

    el.trendMeta.textContent = `${countLabel} · 80% / 50% 参考线`;
    const yAt = (pct) => top + (1 - pct / 100) * plotH;
    const refLines = drawRefLines([
      { val: 100, label: '100%', dash: '2,3', opacity: 0.25 },
      { val: 80, label: '80%', dash: '3,3', opacity: 0.48 },
      { val: 50, label: '50%', dash: '3,3', opacity: 0.48 },
      { val: 0, label: '0%', dash: '', opacity: 0.35 },
    ], yAt);

    const barsSvg = visible
      .map((st, idx) => {
        const xCenter = left + (idx + 0.5) * slotW;
        const x = (xCenter - barW / 2).toFixed(2);
        const slotX = (left + idx * slotW).toFixed(2);
        const tier = tierOf(st.hitPct, st.isCold);
        const fill = colorVar[tier];

        let barRect = '';
        if (st.isCold) {
          const h = 10;
          const y = (bottom - h).toFixed(2);
          barRect = `<rect class="bar-rect" x="${x}" y="${y}" width="${barW.toFixed(2)}" height="${h}" rx="1.5"
            fill="${fill}" fill-opacity="0.35" stroke="${fill}" stroke-width="1" stroke-dasharray="2,2" />`;
        } else if (st.hitPct === 0) {
          const h = 5;
          const y = (bottom - h).toFixed(2);
          barRect = `<rect class="bar-rect" x="${x}" y="${y}" width="${barW.toFixed(2)}" height="${h}" rx="1.5"
            fill="${fill}" />`;
        } else {
          const h = Math.max(4, (st.hitPct / 100) * plotH);
          const y = (bottom - h).toFixed(2);
          barRect = `<rect class="bar-rect" x="${x}" y="${y}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" rx="1.8"
            fill="${fill}" />`;
        }

        return `<g class="chart-bar-hit" data-idx="${idx}">
          <rect x="${slotX}" y="${top}" width="${slotW.toFixed(2)}" height="${plotH}" fill="transparent" />
          ${barRect}
        </g>`;
      })
      .join('');

    el.trendChart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="每步缓存命中率趋势图">
      ${refLines}
      ${barsSvg}
      ${xAxisSvg}
    </svg>`;
  }

  function fmtStepDurationSplit(st) {
    if (st.durationSec === null || st.durationSec === undefined) return null;
    const total = fmtDuration(st.durationSec);
    if (st.modelDurationSec !== null && st.modelDurationSec !== undefined) {
      return {
        total,
        split: `模型 ${fmtDuration(st.modelDurationSec)} · 工具 ${fmtDuration(st.toolDurationSec)}`,
      };
    }
    return { total, split: null };
  }

  el.trendChart.addEventListener('mousemove', (e) => {
    const hit = e.target.closest?.('.chart-bar-hit');
    if (!hit) {
      el.tooltip.classList.add('hidden');
      return;
    }
    const idx = Number(hit.dataset.idx);
    const st = state.visibleSteps[idx];
    if (!st) {
      el.tooltip.classList.add('hidden');
      return;
    }

    const tier = tierOf(st.hitPct, st.isCold);
    const rateLabel = st.isCold
      ? (st.coldReason === 'model_switch' ? 'cold (切模型)' : 'cold (首步)')
      : `${st.hitRate}%`;
    const dur = fmtStepDurationSplit(st);
    const durInfo = dur
      ? (dur.split ? ` · 用时 ${dur.total} (${dur.split})` : ` · 用时 ${dur.total}`)
      : '';
    const hasPerf = st.ttftMs != null || st.genMs != null || st.e2eTps != null || st.decodeTps != null || st.isBurst;
    const e2eSpan = `<span class="c-${tpsTier(st.e2eTps, 'e2e', false)}">${st.e2eTps != null ? esc(fmtTps(st.e2eTps)) : '--'}</span>`;
    const decSpan = st.isBurst
      ? '<span class="c-cold">burst</span>'
      : `<span class="c-${tpsTier(st.decodeTps, 'decode', false)}">${st.decodeTps != null ? esc(fmtTps(st.decodeTps)) : '--'}</span>`;
    const speedPart = state.tpsMode === 'e2e'
      ? `E2E ${e2eSpan} · Dec ${decSpan} tok/s`
      : `Dec ${decSpan} · E2E ${e2eSpan} tok/s`;
    const genNote = st.genMs != null ? ` (生成 ${esc(fmtLatency(st.genMs))})` : '';
    const perfLine = hasPerf
      ? `<div class="muted mono">TTFT <span class="c-${ttftTier(st.ttftMs)}">${esc(fmtLatency(st.ttftMs))}</span> · ${speedPart}${genNote}</div>`
      : '';
    const outSplit = st.thinkingTokens != null
      ? ` (思 ${esc(fmtTokens(st.thinkingTokens))} + 答 ${esc(fmtTokens(st.responseTokens))})`
      : '';

    el.tooltip.innerHTML = `
      <div><strong>Step #${esc(st.seq)}</strong> · <span class="c-${tier}">${esc(rateLabel)}</span>${st.isMiss ? ' <span class="miss-flag">⚠ Miss</span>' : ''}</div>
      ${perfLine}
      <div class="muted mono">命中 ${esc(fmtTokens(st.cacheReadTokens))} / 总 ${esc(fmtTokens(st.totalInput))} · 输出 ${esc(fmtTokens(st.outputTokens))}${outSplit}</div>
      <div class="muted mono">${esc(shortModel(st.model))} · ${esc(fmtTime(st.createdAt))}${esc(durInfo)}</div>
    `;
    el.tooltip.classList.remove('hidden');

    const wrapRect = el.trendChart.parentElement.getBoundingClientRect();
    const tipRect = el.tooltip.getBoundingClientRect();
    let x = e.clientX - wrapRect.left + 10;
    let y = e.clientY - wrapRect.top - tipRect.height - 8;
    if (x + tipRect.width > wrapRect.width - 4) {
      x = Math.max(4, e.clientX - wrapRect.left - tipRect.width - 10);
    }
    if (y < 2) {
      y = Math.min(wrapRect.height - tipRect.height - 2, e.clientY - wrapRect.top + 14);
    }
    el.tooltip.style.left = `${Math.round(x)}px`;
    el.tooltip.style.top = `${Math.round(y)}px`;
  });

  el.trendChart.addEventListener('mouseleave', () => {
    el.tooltip.classList.add('hidden');
  });

  function renderDetails(payload) {
    const steps = payload.steps || [];
    const models = payload.models || [];
    const isE2e = state.tpsMode === 'e2e';
    const modeLabel = isE2e ? 'E2E' : 'Decode';
    el.tabSteps.textContent = `步骤明细 (${steps.length})`;
    el.tabModels.textContent = `按模型汇总 (${models.length})`;

    if (state.activeTab === 'models') {
      const rows = models
        .map((m) => {
          const tier = tierOf(m.hitPct, m.steps <= 1 && m.cacheRead === 0);
          const pctText = m.steps <= 1 && m.cacheRead === 0 ? 'cold' : `${m.hitPct}%`;
          const durTitle = m.timedSteps > 0
            ? `累计 ${fmtDuration(m.totalDurationSec)}（已统计 ${m.timedSteps}/${m.steps} 步，均 ${fmtDuration(m.avgDurationSec)}/步）`
            : '旧版会话无完整结束时间戳';
          const ttftTitle = m.p50TtftMs != null
            ? `P50 ${fmtLatency(m.p50TtftMs)} · 均 ${fmtLatency(m.avgTtftMs)} · P95 ${fmtLatency(m.p95TtftMs)}`
            : '旧版会话，无 TTFT 数据';
          const tpsVal = isE2e ? m.e2eTps : m.decodeTps;
          const tpsCls = tpsTier(tpsVal, state.tpsMode, false);
          let tpsTitle = '旧版会话，无速率数据';
          if (m.e2eTps != null || m.decodeTps != null || m.burstSteps > 0) {
            const e2ePart = m.e2eTps != null
              ? `E2E ${fmtTps(m.e2eTps)} tok/s（${m.validE2eSteps}/${m.steps} 步）`
              : 'E2E --';
            const decPart = m.decodeTps != null
              ? `Decode ${fmtTps(m.decodeTps)} tok/s（有效 ${m.validTpsSteps}/${m.steps} 步${m.burstSteps ? `，${m.burstSteps} burst` : ''}）`
              : (m.burstSteps > 0 ? `Decode 仅 ${m.burstSteps} 个单包 burst 步` : 'Decode --');
            tpsTitle = `${e2ePart} · ${decPart}`;
          }
          return `<tr>
            <td class="model-name-cell mono" title="${esc(m.model)}">${esc(shortModel(m.model))}</td>
            <td class="num">${esc(m.steps)}</td>
            <td class="num">
              <span class="mini-bar-wrap">
                <span class="mini-track"><span class="mini-fill bg-${tier}" style="width:${m.hitPct}%"></span></span>
                <span class="mini-pct c-${tier}">${esc(pctText)}</span>
              </span>
            </td>
            <td class="num c-${ttftTier(m.p50TtftMs)}" title="${esc(ttftTitle)}">${esc(fmtLatency(m.p50TtftMs))}</td>
            <td class="num c-${tpsCls}" title="${esc(tpsTitle)}">${esc(fmtTps(tpsVal))}</td>
            <td class="num muted">${esc(fmtTokens(m.cacheRead))} / ${esc(fmtTokens(m.totalInput))}</td>
            <td class="num muted">${esc(fmtTokens(m.output))}</td>
            <td class="num muted" title="${esc(durTitle)}">${esc(fmtDuration(m.totalDurationSec))}</td>
          </tr>`;
        })
        .join('');

      el.detailBody.innerHTML = `<table class="detail-table">
        <thead>
          <tr>
            <th>模型</th>
            <th class="num">步数</th>
            <th class="num">命中率</th>
            <th class="num">P50 TTFT</th>
            <th class="num" title="当前口径：${esc(modeLabel)} tok/s（可在上方卡片切换）">tok/s</th>
            <th class="num">命中 / 总输入</th>
            <th class="num">输出</th>
            <th class="num">总用时</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
      return;
    }

    const rows = [...steps]
      .reverse()
      .map((st) => {
        const tier = tierOf(st.hitPct, st.isCold);
        const pctLabel = st.isCold ? 'cold' : `${st.hitPct}%`;
        const hitTitle = st.isCold
          ? (st.coldReason === 'model_switch' ? '切模型首次调用冷启动' : '首步冷启动')
          : '';
        const dur = fmtStepDurationSplit(st);
        const durTitle = dur
          ? (dur.split ? `总用时 ${dur.total}（${dur.split}）` : `总用时 ${dur.total}`)
          : '纯文本结束步，日志无结束时间戳';
        const ttftTitle = st.ttftMs != null
          ? `首字延迟 ${fmtLatency(st.ttftMs)}`
          : '旧版会话，无首字时间戳';
        const splitNote = st.thinkingTokens != null
          ? `（思考 ${st.thinkingTokens} + 回复 ${st.responseTokens}）`
          : '';
        let tpsCell;
        if (isE2e) {
          const tpsTitle = st.e2eTps != null
            ? `E2E ${fmtTps(st.e2eTps)} tok/s（总耗时 ${fmtLatency(st.modelMs)}）· Decode ${st.isBurst ? 'burst' : `${fmtTps(st.decodeTps)} tok/s`}${splitNote}`
            : '旧版会话，无速率数据';
          tpsCell = `<td class="num c-${tpsTier(st.e2eTps, 'e2e', false)}" title="${esc(tpsTitle)}">${esc(fmtTps(st.e2eTps))}</td>`;
        } else if (st.isBurst) {
          const e2eNote = st.e2eTps != null ? ` · E2E ${fmtTps(st.e2eTps)} tok/s` : '';
          tpsCell = `<td class="num c-cold" title="单包/极短流式返回 (生成 ${esc(fmtLatency(st.genMs))})${esc(e2eNote)}">burst</td>`;
        } else {
          const e2eNote = st.e2eTps != null ? ` · E2E ${fmtTps(st.e2eTps)} tok/s` : '';
          const tpsTitle = st.decodeTps != null
            ? `Decode ${fmtTps(st.decodeTps)} tok/s（生成 ${fmtLatency(st.genMs)}）${e2eNote}${splitNote}`
            : '旧版会话，无速率数据';
          tpsCell = `<td class="num c-${tpsTier(st.decodeTps, 'decode', false)}" title="${esc(tpsTitle)}">${esc(fmtTps(st.decodeTps))}</td>`;
        }
        const outTitle = st.thinkingTokens != null
          ? `思考 ${st.thinkingTokens} + 回复 ${st.responseTokens}`
          : '';
        return `<tr class="${st.isMiss ? 'row-miss' : ''}">
          <td class="step-cell mono muted">#${esc(st.seq)}</td>
          <td class="num c-${tier}"${hitTitle ? ` title="${esc(hitTitle)}"` : ''}>${esc(pctLabel)}${st.isMiss ? '<span class="miss-flag" title="Cache Miss">⚠</span>' : ''}</td>
          <td class="num c-${ttftTier(st.ttftMs)}" title="${esc(ttftTitle)}">${esc(fmtLatency(st.ttftMs))}</td>
          ${tpsCell}
          <td class="num muted">${esc(fmtTokens(st.cacheReadTokens))} / ${esc(fmtTokens(st.inputTokens))}</td>
          <td class="num muted"${outTitle ? ` title="${esc(outTitle)}"` : ''}>${esc(fmtTokens(st.outputTokens))}</td>
          <td class="num muted" title="${esc(durTitle)}">${esc(fmtDuration(st.durationSec))}</td>
          <td class="model-name-cell mono muted" title="${esc(st.model)}">${esc(shortModel(st.model))}</td>
          <td class="num muted">${esc(fmtTime(st.createdAt))}</td>
        </tr>`;
      })
      .join('');

    el.detailBody.innerHTML = `<table class="detail-table">
      <thead>
        <tr>
          <th>步</th>
          <th class="num">命中</th>
          <th class="num">TTFT</th>
          <th class="num" title="当前口径：${esc(modeLabel)} tok/s（可在上方卡片切换）">tok/s</th>
          <th class="num">读 / 新增</th>
          <th class="num">输出</th>
          <th class="num">用时</th>
          <th>模型</th>
          <th class="num">时间</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function renderDashboard(payload) {
    state.payload = payload;
    el.emptyState.classList.add('hidden');
    el.dashboard.classList.remove('hidden');

    if (payload.summary.activeModel) {
      el.modelPill.textContent = shortModel(payload.summary.activeModel);
      el.modelPill.title = payload.summary.activeModel;
      el.modelPill.classList.remove('hidden');
    } else {
      el.modelPill.classList.add('hidden');
    }

    renderKpis(payload.summary);
    renderChart(payload.steps, payload.summary);
    renderDetails(payload);
  }

  async function pollNow() {
    if (state.inFlight) return;
    state.inFlight = true;
    try {
      const conv = currentConv();
      if (conv !== state.lastConv) {
        state.lastConv = conv;
        state.lastEtag = '';
      }

      const q = new URLSearchParams();
      if (conv) q.set('conversationId', conv);
      if (state.lastEtag) q.set('etag', state.lastEtag);

      const res = await fetcher(`/api/cache?${q.toString()}`, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setLiveStatus('live', 'Live');
      if (data.etag) state.lastEtag = data.etag;

      if (data.status === 'no_conversation') {
        state.payload = null;
        showEmpty('未绑定对话', '请在对话窗口右侧边栏打开此面板，或在 URL 中传入 ?conversationId=...');
        return;
      }

      if (data.status === 'waiting') {
        state.payload = null;
        showEmpty('等待模型响应', '发送首条消息并产生模型调用后，将自动展示单步与累计缓存命中率。');
        return;
      }

      if (data.unchanged) return;

      if (data.status === 'ok' && data.summary) {
        renderDashboard(data);
      }
    } catch {
      setLiveStatus('error', 'Reconnecting');
    } finally {
      state.inFlight = false;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      setLiveStatus('paused', 'Paused');
    } else {
      setLiveStatus('live', 'Live');
      pollNow();
    }
  });

  pollNow();
  setInterval(() => {
    if (!document.hidden) {
      pollNow();
    }
  }, POLL_MS);
})();
