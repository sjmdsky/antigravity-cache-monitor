(() => {
  'use strict';

  const POLL_MS = 1500;
  const COMPACT_STORAGE_KEY = 'cache-monitor.compact';
  const METRIC_STORAGE_KEY = 'cache-monitor.chartMetric';
  const TPS_MODE_STORAGE_KEY = 'cache-monitor.tpsMode';
  const LANG_STORAGE_KEY = 'cache-monitor.lang';
  const params = new URLSearchParams(window.location.search);

  const el = {
    app: document.getElementById('app'),
    modelPill: document.getElementById('model-pill'),
    btnLang: document.getElementById('btn-lang'),
    btnCompact: document.getElementById('btn-compact'),
    livePill: document.getElementById('live-pill'),
    liveText: document.getElementById('live-text'),
    emptyState: document.getElementById('empty-state'),
    emptyTitle: document.getElementById('empty-title'),
    emptyDesc: document.getElementById('empty-desc'),
    dashboard: document.getElementById('dashboard'),
    kpiGrid: document.getElementById('kpi-grid'),
    stepLabel: document.getElementById('step-label'),
    stepBadge: document.getElementById('step-badge'),
    stepPct: document.getElementById('step-pct'),
    stepBar: document.getElementById('step-bar'),
    stepSub: document.getElementById('step-sub'),
    totalLabel: document.getElementById('total-label'),
    totalBadge: document.getElementById('total-badge'),
    totalPct: document.getElementById('total-pct'),
    totalBar: document.getElementById('total-bar'),
    totalSub: document.getElementById('total-sub'),
    ttftLabel: document.getElementById('ttft-label'),
    ttftBadge: document.getElementById('ttft-badge'),
    ttftVal: document.getElementById('ttft-val'),
    ttftSub: document.getElementById('ttft-sub'),
    tpsSwitch: document.getElementById('tps-switch'),
    tpsModeE2e: document.getElementById('tps-mode-e2e'),
    tpsModeDecode: document.getElementById('tps-mode-decode'),
    tpsBadge: document.getElementById('tps-badge'),
    tpsVal: document.getElementById('tps-val'),
    tpsUnit: document.getElementById('tps-unit'),
    tpsSub: document.getElementById('tps-sub'),
    metricSwitch: document.getElementById('metric-switch'),
    metricHit: document.getElementById('metric-hit'),
    metricTtft: document.getElementById('metric-ttft'),
    metricTps: document.getElementById('metric-tps'),
    trendMeta: document.getElementById('trend-meta'),
    trendChart: document.getElementById('trend-chart'),
    tooltip: document.getElementById('chart-tooltip'),
    tabsBar: document.getElementById('tabs-bar'),
    tabSteps: document.getElementById('tab-steps'),
    tabModels: document.getElementById('tab-models'),
    detailBody: document.getElementById('detail-body'),
  };

  const state = {
    lang: 'en',
    activeTab: 'steps',
    chartMetric: 'hit',
    tpsMode: 'e2e',
    compact: false,
    emptyKey: 'initial',
    lastConv: '',
    lastEtag: '',
    payload: null,
    visibleSteps: [],
    inFlight: false,
  };

  const I18N = {
    en: {
      static: {
        langBtn: '中文',
        langBtnTitle: 'Switch to Chinese (简体中文)',
        compactBtn: 'Compact',
        compactTitle: 'Toggle compact view (keep KPI cards only)',
        liveTitle: 'Auto-checks for updates every 1.5s',
        kpiGridAria: 'Core metrics',
        totalLabel: 'Total · Σ Session',
        ttftLabelPlaceholder: 'TTFT · First Token',
        tpsSwitchAria: 'Throughput mode',
        tpsE2eTitle: 'End-to-end throughput: output tokens ÷ total model duration (TTFT + generation)',
        tpsDecodeTitle: 'Pure decode speed: output tokens ÷ streaming generation duration (short packets marked burst)',
        metricSwitchAria: 'Trend metric',
        metricHit: 'Hit Rate',
        tabsBarAria: 'Detail views',
        stepLabelPlaceholder: 'Step #0',
        tpsSubPlaceholder: 'Session --',
        trendMetaPlaceholder: '80% · 50% ref',
      },
      empty: {
        initial: {
          title: 'Waiting for session',
          desc: 'Send a message and wait for a model response to view per-step and session cache hit rates.',
        },
        no_conversation: {
          title: 'No active conversation',
          desc: 'Open this panel from the right sidebar of a conversation, or pass ?conversationId=... in the URL.',
        },
        waiting: {
          title: 'Waiting for model response',
          desc: 'Send the first message and wait for a model call to display per-step and session cache hit rates.',
        },
      },
      kpi: {
        stepLabel: (seq) => `Step #${seq}`,
        stepSub: (hit, total, uncached, dur) => `Hit ${hit} / ${total} · New ${uncached}${dur ? ` · ${dur}` : ''}`,
        coldModelSwitch: 'Model switch',
        coldFirstStep: 'Cold start',
        totalSub: (hit, total, out, dur) => `Hit ${hit} / ${total} · Out ${out}${dur ? ` · ${dur}` : ''}`,
        ttftSub: (p50, p95) => `Session P50 ${p50} · P95 ${p95}`,
        ttftTitle: (p50, avg, p95) => `Session P50 ${p50} · Avg ${avg} · P95 ${p95}`,
        ttftLegacy: 'Legacy session, no TTFT timestamps',
        splitTitle: (th, res) => ` · Think ${th} + Reply ${res}`,
        e2eSub: (sess, totalMs) => `Session ${sess} · Total ${totalMs}`,
        e2eNoData: 'No valid E2E data yet',
        speedLegacy: 'Legacy session, no speed data',
        burstBadge: 'Single packet',
        burstSub: (sess, genMs) => `Session ${sess} · Burst ${genMs}`,
        burstTitle: (genMs, e2eNote) => `Single-packet / ultra-short stream (gen ${genMs})${e2eNote}`,
        decodeSub: (sess, genMs) => `Session ${sess} · Gen ${genMs}`,
        decodeNoData: 'No valid Decode data yet',
        streamSpeedLegacy: 'Legacy session, no stream speed data',
      },
      chart: {
        countLast: (max, total) => `Last ${max} of ${total} steps`,
        countAll: (total) => `${total} ${total === 1 ? 'step' : 'steps'}`,
        ttftNoDataMeta: 'No TTFT data',
        ttftNoDataChart: 'Legacy session, no TTFT data',
        ttftAria: 'Per-step TTFT trend chart',
        ttftRefMeta: (p50) => `P50 ${p50} ref`,
        ttftMeta: 'Time to First Token (TTFT)',
        tpsBurstOnlyMeta: 'Single-packet burst steps only',
        tpsNoDataMeta: 'No speed data',
        tpsBurstOnlyChart: 'All steps are single-packet bursts; no Decode speed available',
        tpsNoDataChart: (modeLabel) => `Legacy session, no ${modeLabel} tok/s data`,
        tpsAria: 'Per-step generation speed trend chart',
        tpsRefMeta: (tps, modeLabel) => `Σ ${tps} tok/s (${modeLabel}) ref`,
        hitRefMeta: '80% / 50% ref',
        hitAria: 'Per-step cache hit rate trend chart',
      },
      tooltip: {
        durSplit: (m, t) => `Model ${m} · Tools ${t}`,
        coldModelSwitch: 'cold (model switch)',
        coldFirstStep: 'cold (1st step)',
        durTotal: (total, split) => (split ? ` · Dur ${total} (${split})` : ` · Dur ${total}`),
        genNote: (ms) => ` (gen ${ms})`,
        outSplit: (th, res) => ` (Think ${th} + Reply ${res})`,
        hitLine: (hit, total, out, outSplit) => `Hit ${hit} / ${total} · Out ${out}${outSplit}`,
      },
      tables: {
        tabSteps: (n) => `Steps (${n})`,
        tabModels: (n) => `By Model (${n})`,
        tpsHeaderTitle: (modeLabel) => `Current mode: ${modeLabel} tok/s (switch in top card)`,
        modelDurTitle: (total, timed, totalSteps, avg) =>
          `Total ${total} (${timed}/${totalSteps} timed steps, avg ${avg}/step)`,
        modelDurLegacy: 'Legacy session, missing end timestamps',
        modelTtftTitle: (p50, avg, p95) => `P50 ${p50} · Avg ${avg} · P95 ${p95}`,
        modelTtftLegacy: 'Legacy session, no TTFT data',
        modelTpsLegacy: 'Legacy session, no speed data',
        modelE2ePart: (tps, valid, total) => `E2E ${tps} tok/s (${valid}/${total} steps)`,
        modelDecPart: (tps, valid, total, burst) =>
          `Decode ${tps} tok/s (${valid}/${total} valid${burst ? `, ${burst} burst` : ''})`,
        modelDecBurstOnly: (burst) => `Decode only (${burst} single-packet burst)`,
        modelHeaders: ['Model', 'Steps', 'Hit Rate', 'P50 TTFT', 'tok/s', 'Hit / Total', 'Out', 'Time'],
        stepHitModelSwitch: 'Cold start on model switch',
        stepHitFirst: 'First-step cold start',
        stepDurTitle: (total, split) => (split ? `Total ${total} (${split})` : `Total ${total}`),
        stepDurLegacy: 'Plain-text final step, no end timestamp in log',
        stepTtftTitle: (ms) => `TTFT ${ms}`,
        stepTtftLegacy: 'Legacy session, no first-token timestamp',
        stepSplitNote: (th, res) => ` (Think ${th} + Reply ${res})`,
        stepE2eTitle: (e2e, modelMs, decStr, splitNote) =>
          `E2E ${e2e} tok/s (total ${modelMs}) · Decode ${decStr}${splitNote}`,
        stepTpsLegacy: 'Legacy session, no speed data',
        stepBurstTitle: (genMs, e2eNote) => `Single-packet / ultra-short stream (gen ${genMs})${e2eNote}`,
        stepDecTitle: (dec, genMs, e2eNote, splitNote) =>
          `Decode ${dec} tok/s (gen ${genMs})${e2eNote}${splitNote}`,
        stepOutTitle: (th, res) => `Think ${th} + Reply ${res}`,
        stepHeaders: ['Step', 'Hit', 'TTFT', 'tok/s', 'Read / New', 'Out', 'Dur', 'Model', 'Time'],
      },
    },
    zh: {
      static: {
        langBtn: 'EN',
        langBtnTitle: '切换为英文 (English)',
        compactBtn: '紧凑',
        compactTitle: '切换紧凑视图（仅保留核心指标卡片）',
        liveTitle: '每 1.5 秒自动检查更新',
        kpiGridAria: '核心监控指标',
        totalLabel: '累计 · Σ Session',
        ttftLabelPlaceholder: 'TTFT · 首字延迟',
        tpsSwitchAria: '速率口径',
        tpsE2eTitle: '端到端吞吐：输出 token ÷ 总模型耗时 (TTFT + 生成)',
        tpsDecodeTitle: '纯解码速率：输出 token ÷ 流式生成时长（短包标 burst）',
        metricSwitchAria: '趋势指标',
        metricHit: '命中率',
        tabsBarAria: '缓存详情视图',
        stepLabelPlaceholder: '单步 · Step #0',
        tpsSubPlaceholder: '会话 --',
        trendMetaPlaceholder: '80% · 50% 参考线',
      },
      empty: {
        initial: {
          title: '等待会话开始',
          desc: '发送首条消息并收到模型响应后，将自动显示单步与累计缓存命中率。',
        },
        no_conversation: {
          title: '未绑定对话',
          desc: '请在对话窗口右侧边栏打开此面板，或在 URL 中传入 ?conversationId=...',
        },
        waiting: {
          title: '等待模型响应',
          desc: '发送首条消息并产生模型调用后，将自动展示单步与累计缓存命中率。',
        },
      },
      kpi: {
        stepLabel: (seq) => `单步 · Step #${seq}`,
        stepSub: (hit, total, uncached, dur) => `命中 ${hit} / ${total} · 新增 ${uncached}${dur ? ` · 用时 ${dur}` : ''}`,
        coldModelSwitch: '切模型冷启动',
        coldFirstStep: '首步冷启动',
        totalSub: (hit, total, out, dur) => `已命中 ${hit} / ${total} · 输出 ${out}${dur ? ` · 用时 ${dur}` : ''}`,
        ttftSub: (p50, p95) => `会话 P50 ${p50} · P95 ${p95}`,
        ttftTitle: (p50, avg, p95) => `会话 P50 ${p50} · 均 ${avg} · P95 ${p95}`,
        ttftLegacy: '旧版会话，无首字时间戳',
        splitTitle: (th, res) => ` · 思 ${th} + 答 ${res}`,
        e2eSub: (sess, totalMs) => `会话 ${sess} · 总耗时 ${totalMs}`,
        e2eNoData: '暂无有效 E2E 数据',
        speedLegacy: '旧版会话，无速率数据',
        burstBadge: '单包返回',
        burstSub: (sess, genMs) => `会话 ${sess} · 单包 ${genMs}`,
        burstTitle: (genMs, e2eNote) => `单包/极短流式返回 (生成 ${genMs})${e2eNote}`,
        decodeSub: (sess, genMs) => `会话 ${sess} · 生成 ${genMs}`,
        decodeNoData: '暂无有效 Decode 数据',
        streamSpeedLegacy: '旧版会话，无流式速率数据',
      },
      chart: {
        countLast: (max, total) => `最近 ${max} 步（共 ${total} 步）`,
        countAll: (total) => `共 ${total} 步`,
        ttftNoDataMeta: '无首字延迟数据',
        ttftNoDataChart: '旧版会话，暂无首字延迟 (TTFT) 数据',
        ttftAria: '每步首字延迟趋势图',
        ttftRefMeta: (p50) => `P50 ${p50} 参考线`,
        ttftMeta: '首字延迟 (TTFT)',
        tpsBurstOnlyMeta: '仅单包 burst 步',
        tpsNoDataMeta: '无速率数据',
        tpsBurstOnlyChart: '当前步骤均为单包 burst 返回，暂无 Decode 速率',
        tpsNoDataChart: (modeLabel) => `旧版会话，暂无 ${modeLabel} tok/s 数据`,
        tpsAria: '每步生成速率趋势图',
        tpsRefMeta: (tps, modeLabel) => `Σ ${tps} tok/s (${modeLabel}) 参考线`,
        hitRefMeta: '80% / 50% 参考线',
        hitAria: '每步缓存命中率趋势图',
      },
      tooltip: {
        durSplit: (m, t) => `模型 ${m} · 工具 ${t}`,
        coldModelSwitch: 'cold (切模型)',
        coldFirstStep: 'cold (首步)',
        durTotal: (total, split) => (split ? ` · 用时 ${total} (${split})` : ` · 用时 ${total}`),
        genNote: (ms) => ` (生成 ${ms})`,
        outSplit: (th, res) => ` (思 ${th} + 答 ${res})`,
        hitLine: (hit, total, out, outSplit) => `命中 ${hit} / 总 ${total} · 输出 ${out}${outSplit}`,
      },
      tables: {
        tabSteps: (n) => `步骤明细 (${n})`,
        tabModels: (n) => `按模型汇总 (${n})`,
        tpsHeaderTitle: (modeLabel) => `当前口径：${modeLabel} tok/s（可在上方卡片切换）`,
        modelDurTitle: (total, timed, totalSteps, avg) =>
          `累计 ${total}（已统计 ${timed}/${totalSteps} 步，均 ${avg}/步）`,
        modelDurLegacy: '旧版会话无完整结束时间戳',
        modelTtftTitle: (p50, avg, p95) => `P50 ${p50} · 均 ${avg} · P95 ${p95}`,
        modelTtftLegacy: '旧版会话，无 TTFT 数据',
        modelTpsLegacy: '旧版会话，无速率数据',
        modelE2ePart: (tps, valid, total) => `E2E ${tps} tok/s（${valid}/${total} 步）`,
        modelDecPart: (tps, valid, total, burst) =>
          `Decode ${tps} tok/s（有效 ${valid}/${total} 步${burst ? `，${burst} burst` : ''}）`,
        modelDecBurstOnly: (burst) => `Decode 仅 ${burst} 个单包 burst 步`,
        modelHeaders: ['模型', '步数', '命中率', 'P50 TTFT', 'tok/s', '命中 / 总输入', '输出', '总用时'],
        stepHitModelSwitch: '切模型首次调用冷启动',
        stepHitFirst: '首步冷启动',
        stepDurTitle: (total, split) => (split ? `总用时 ${total}（${split}）` : `总用时 ${total}`),
        stepDurLegacy: '纯文本结束步，日志无结束时间戳',
        stepTtftTitle: (ms) => `首字延迟 ${ms}`,
        stepTtftLegacy: '旧版会话，无首字时间戳',
        stepSplitNote: (th, res) => `（思考 ${th} + 回复 ${res}）`,
        stepE2eTitle: (e2e, modelMs, decStr, splitNote) =>
          `E2E ${e2e} tok/s（总耗时 ${modelMs}）· Decode ${decStr}${splitNote}`,
        stepTpsLegacy: '旧版会话，无速率数据',
        stepBurstTitle: (genMs, e2eNote) => `单包/极短流式返回 (生成 ${genMs})${e2eNote}`,
        stepDecTitle: (dec, genMs, e2eNote, splitNote) =>
          `Decode ${dec} tok/s（生成 ${genMs}）${e2eNote}${splitNote}`,
        stepOutTitle: (th, res) => `思考 ${th} + 回复 ${res}`,
        stepHeaders: ['步', '命中', 'TTFT', 'tok/s', '读 / 新增', '输出', '用时', '模型', '时间'],
      },
    },
  };

  const tr = () => I18N[state.lang] || I18N.en;

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

  function applyStaticI18n() {
    const t = tr();
    const s = t.static;
    el.btnLang.textContent = s.langBtn;
    el.btnLang.title = s.langBtnTitle;
    el.btnCompact.textContent = s.compactBtn;
    el.btnCompact.title = s.compactTitle;
    el.livePill.title = s.liveTitle;
    el.kpiGrid.setAttribute('aria-label', s.kpiGridAria);
    el.totalLabel.textContent = s.totalLabel;
    el.tpsSwitch.setAttribute('aria-label', s.tpsSwitchAria);
    el.tpsModeE2e.title = s.tpsE2eTitle;
    el.tpsModeDecode.title = s.tpsDecodeTitle;
    el.metricSwitch.setAttribute('aria-label', s.metricSwitchAria);
    el.metricHit.textContent = s.metricHit;
    el.tabsBar.setAttribute('aria-label', s.tabsBarAria);

    if (!state.payload) {
      el.stepLabel.textContent = s.stepLabelPlaceholder;
      el.ttftLabel.textContent = s.ttftLabelPlaceholder;
      el.tpsSub.textContent = s.tpsSubPlaceholder;
      el.trendMeta.textContent = s.trendMetaPlaceholder;
      el.tabSteps.textContent = t.tables.tabSteps(0);
      el.tabModels.textContent = t.tables.tabModels(0);
    }
  }

  function setLang(next, { persist = true, rerender = true } = {}) {
    const valid = next === 'zh' ? 'zh' : 'en';
    state.lang = valid;
    document.documentElement.lang = valid === 'zh' ? 'zh-CN' : 'en';
    if (persist) {
      try {
        localStorage.setItem(LANG_STORAGE_KEY, valid);
      } catch {
        // Sandboxed iframe origin may restrict storage.
      }
    }
    applyStaticI18n();
    if (rerender) {
      if (state.payload?.status === 'ok') {
        renderDashboard(state.payload);
      } else if (state.emptyKey) {
        showEmpty(state.emptyKey);
      }
    }
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
    const savedLang = localStorage.getItem(LANG_STORAGE_KEY);
    setLang(savedLang === 'zh' ? 'zh' : 'en', { persist: false, rerender: true });
  } catch {
    setLang('en', { persist: false, rerender: false });
  }

  el.btnLang.addEventListener('click', () => setLang(state.lang === 'en' ? 'zh' : 'en'));
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

  function showEmpty(key) {
    const emptyTexts = tr().empty[key] || tr().empty.initial;
    state.emptyKey = key;
    el.modelPill.classList.add('hidden');
    el.dashboard.classList.add('hidden');
    el.emptyState.classList.remove('hidden');
    el.emptyTitle.textContent = emptyTexts.title;
    el.emptyDesc.textContent = emptyTexts.desc;
  }

  function renderKpis(summary) {
    const k = tr().kpi;
    const step = summary.latestStep;
    const stepTier = tierOf(step.hitPct, step.isCold);
    el.stepLabel.textContent = k.stepLabel(step.seq);
    el.stepPct.className = `kpi-pct c-${stepTier}`;
    el.stepPct.textContent = step.isCold ? 'cold' : `${step.hitPct}%`;
    el.stepBar.className = `bar-fill bg-${stepTier}`;
    el.stepBar.style.width = `${step.isCold ? 0 : Math.max(step.hitPct, step.hitPct > 0 ? 2 : 0)}%`;
    const stepDur = (step.durationSec !== null && step.durationSec !== undefined)
      ? fmtDuration(step.durationSec)
      : '';
    el.stepSub.textContent = k.stepSub(
      fmtTokens(step.cacheReadTokens),
      fmtTokens(step.totalInput),
      fmtTokens(step.inputTokens),
      stepDur
    );
    el.stepSub.title = el.stepSub.textContent;

    if (step.isCold) {
      el.stepBadge.className = 'kpi-badge';
      el.stepBadge.textContent = step.coldReason === 'model_switch' ? k.coldModelSwitch : k.coldFirstStep;
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
    const totalDur = (summary.totalDurationSec !== null && summary.totalDurationSec !== undefined)
      ? fmtDuration(summary.totalDurationSec)
      : '';
    el.totalSub.textContent = k.totalSub(
      fmtTokens(summary.totalCacheRead),
      fmtTokens(summary.totalInput),
      fmtTokens(summary.totalOutput),
      totalDur
    );
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
      const p50 = fmtLatency(summary.p50TtftMs);
      const p95 = fmtLatency(summary.p95TtftMs);
      const avg = fmtLatency(summary.avgTtftMs);
      el.ttftSub.textContent = k.ttftSub(p50, p95);
      el.ttftSub.title = k.ttftTitle(p50, avg, p95);
    } else {
      el.ttftSub.textContent = k.ttftLegacy;
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
      ? k.splitTitle(fmtTokens(step.thinkingTokens), fmtTokens(step.responseTokens))
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
        el.tpsSub.textContent = k.e2eSub(sessText, fmtLatency(step.modelMs));
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
        el.tpsSub.textContent = summary.hasTiming ? k.e2eNoData : k.speedLegacy;
        el.tpsSub.title = el.tpsSub.textContent;
      }
    } else if (step.isBurst) {
      el.tpsVal.className = 'kpi-pct c-cold';
      el.tpsVal.textContent = 'burst';
      el.tpsUnit.classList.add('hidden');
      el.tpsBadge.className = 'kpi-badge';
      el.tpsBadge.textContent = summary.sessionDecodeTps != null
        ? `Σ ${fmtTps(summary.sessionDecodeTps)}`
        : k.burstBadge;
      const sessText = summary.sessionDecodeTps != null
        ? `${fmtTps(summary.sessionDecodeTps)} tok/s`
        : '--';
      el.tpsSub.textContent = k.burstSub(sessText, fmtLatency(step.genMs));
      const e2eNote = step.e2eTps != null ? ` · E2E ${fmtTps(step.e2eTps)} tok/s` : '';
      el.tpsSub.title = k.burstTitle(fmtLatency(step.genMs), e2eNote);
    } else if (step.decodeTps !== null && step.decodeTps !== undefined) {
      el.tpsVal.className = `kpi-pct c-${tpsTier(step.decodeTps, 'decode', false)}`;
      el.tpsVal.textContent = fmtTps(step.decodeTps);
      el.tpsUnit.classList.remove('hidden');
      setTpsBadge(summary.deltaDecodeTps, summary.sessionDecodeTps);
      const sessText = summary.sessionDecodeTps != null
        ? `${fmtTps(summary.sessionDecodeTps)} tok/s`
        : '--';
      el.tpsSub.textContent = k.decodeSub(sessText, fmtLatency(step.genMs));
      const e2eNote = step.e2eTps != null ? ` · E2E ${fmtTps(step.e2eTps)} tok/s` : '';
      el.tpsSub.title = `${el.tpsSub.textContent}${e2eNote}${splitTitle}`;
    } else {
      el.tpsVal.className = 'kpi-pct c-cold';
      el.tpsVal.textContent = '--';
      el.tpsUnit.classList.add('hidden');
      el.tpsBadge.className = 'kpi-badge';
      el.tpsBadge.textContent = '--';
      el.tpsSub.textContent = summary.hasTiming ? k.decodeNoData : k.streamSpeedLegacy;
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
    const c = tr().chart;
    const MAX_BARS = 48;
    const visible = steps.length > MAX_BARS ? steps.slice(-MAX_BARS) : steps;
    state.visibleSteps = visible;
    el.tooltip.classList.add('hidden');

    const metric = state.chartMetric;
    const countLabel = steps.length > MAX_BARS
      ? c.countLast(MAX_BARS, steps.length)
      : c.countAll(steps.length);

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
        el.trendMeta.textContent = `${countLabel} · ${c.ttftNoDataMeta}`;
        el.trendChart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="${esc(c.ttftAria)}">
          <text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="10.5" fill="var(--cm-fg-muted)">${esc(c.ttftNoDataChart)}</text>
        </svg>`;
        return;
      }

      const maxSec = niceCeil(Math.max(...validSecs, 5));
      const yAt = (sec) => top + (1 - Math.min(sec, maxSec) / maxSec) * plotH;
      const fmtTickSec = (s) => (s === 0 ? '0s' : s >= 60 ? fmtDuration(s) : (Number.isInteger(s) ? `${s}s` : `${s.toFixed(1)}s`));

      el.trendMeta.textContent = summary?.p50TtftMs != null
        ? `${countLabel} · ${c.ttftRefMeta(fmtLatency(summary.p50TtftMs))}`
        : `${countLabel} · ${c.ttftMeta}`;

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

      el.trendChart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="${esc(c.ttftAria)}">
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
        el.trendMeta.textContent = `${countLabel} · ${hasBurst ? c.tpsBurstOnlyMeta : c.tpsNoDataMeta}`;
        el.trendChart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="${esc(c.tpsAria)}">
          <text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="10.5" fill="var(--cm-fg-muted)">${esc(hasBurst ? c.tpsBurstOnlyChart : c.tpsNoDataChart(modeLabel))}</text>
        </svg>`;
        return;
      }

      const maxTps = niceCeil(Math.max(...validTps, isE2e ? 80 : 120));
      const yAt = (tps) => top + (1 - Math.min(tps, maxTps) / maxTps) * plotH;
      const fmtTickTps = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(v)));
      const refTps = isE2e ? summary?.sessionE2eTps : summary?.sessionDecodeTps;

      el.trendMeta.textContent = refTps != null
        ? `${countLabel} · ${c.tpsRefMeta(fmtTps(refTps), modeLabel)}`
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

      el.trendChart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="${esc(c.tpsAria)}">
        ${refLines}
        ${barsSvg}
        ${xAxisSvg}
      </svg>`;
      return;
    }

    el.trendMeta.textContent = `${countLabel} · ${c.hitRefMeta}`;
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

    el.trendChart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="${esc(c.hitAria)}">
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
        split: tr().tooltip.durSplit(fmtDuration(st.modelDurationSec), fmtDuration(st.toolDurationSec)),
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

    const tt = tr().tooltip;
    const tier = tierOf(st.hitPct, st.isCold);
    const rateLabel = st.isCold
      ? (st.coldReason === 'model_switch' ? tt.coldModelSwitch : tt.coldFirstStep)
      : `${st.hitRate}%`;
    const dur = fmtStepDurationSplit(st);
    const durInfo = dur ? tt.durTotal(dur.total, dur.split) : '';
    const hasPerf = st.ttftMs != null || st.genMs != null || st.e2eTps != null || st.decodeTps != null || st.isBurst;
    const e2eSpan = `<span class="c-${tpsTier(st.e2eTps, 'e2e', false)}">${st.e2eTps != null ? esc(fmtTps(st.e2eTps)) : '--'}</span>`;
    const decSpan = st.isBurst
      ? '<span class="c-cold">burst</span>'
      : `<span class="c-${tpsTier(st.decodeTps, 'decode', false)}">${st.decodeTps != null ? esc(fmtTps(st.decodeTps)) : '--'}</span>`;
    const speedPart = state.tpsMode === 'e2e'
      ? `E2E ${e2eSpan} · Dec ${decSpan} tok/s`
      : `Dec ${decSpan} · E2E ${e2eSpan} tok/s`;
    const genNote = st.genMs != null ? tt.genNote(esc(fmtLatency(st.genMs))) : '';
    const perfLine = hasPerf
      ? `<div class="muted mono">TTFT <span class="c-${ttftTier(st.ttftMs)}">${esc(fmtLatency(st.ttftMs))}</span> · ${speedPart}${genNote}</div>`
      : '';
    const outSplit = st.thinkingTokens != null
      ? tt.outSplit(esc(fmtTokens(st.thinkingTokens)), esc(fmtTokens(st.responseTokens)))
      : '';

    el.tooltip.innerHTML = `
      <div><strong>Step #${esc(st.seq)}</strong> · <span class="c-${tier}">${esc(rateLabel)}</span>${st.isMiss ? ' <span class="miss-flag">⚠ Miss</span>' : ''}</div>
      ${perfLine}
      <div class="muted mono">${tt.hitLine(esc(fmtTokens(st.cacheReadTokens)), esc(fmtTokens(st.totalInput)), esc(fmtTokens(st.outputTokens)), outSplit)}</div>
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
    const tb = tr().tables;
    const steps = payload.steps || [];
    const models = payload.models || [];
    const isE2e = state.tpsMode === 'e2e';
    const modeLabel = isE2e ? 'E2E' : 'Decode';
    el.tabSteps.textContent = tb.tabSteps(steps.length);
    el.tabModels.textContent = tb.tabModels(models.length);

    if (state.activeTab === 'models') {
      const mh = tb.modelHeaders;
      const rows = models
        .map((m) => {
          const tier = tierOf(m.hitPct, m.steps <= 1 && m.cacheRead === 0);
          const pctText = m.steps <= 1 && m.cacheRead === 0 ? 'cold' : `${m.hitPct}%`;
          const durTitle = m.timedSteps > 0
            ? tb.modelDurTitle(fmtDuration(m.totalDurationSec), m.timedSteps, m.steps, fmtDuration(m.avgDurationSec))
            : tb.modelDurLegacy;
          const ttftTitle = m.p50TtftMs != null
            ? tb.modelTtftTitle(fmtLatency(m.p50TtftMs), fmtLatency(m.avgTtftMs), fmtLatency(m.p95TtftMs))
            : tb.modelTtftLegacy;
          const tpsVal = isE2e ? m.e2eTps : m.decodeTps;
          const tpsCls = tpsTier(tpsVal, state.tpsMode, false);
          let tpsTitle = tb.modelTpsLegacy;
          if (m.e2eTps != null || m.decodeTps != null || m.burstSteps > 0) {
            const e2ePart = m.e2eTps != null
              ? tb.modelE2ePart(fmtTps(m.e2eTps), m.validE2eSteps, m.steps)
              : 'E2E --';
            const decPart = m.decodeTps != null
              ? tb.modelDecPart(fmtTps(m.decodeTps), m.validTpsSteps, m.steps, m.burstSteps)
              : (m.burstSteps > 0 ? tb.modelDecBurstOnly(m.burstSteps) : 'Decode --');
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
            <th>${esc(mh[0])}</th>
            <th class="num">${esc(mh[1])}</th>
            <th class="num">${esc(mh[2])}</th>
            <th class="num">${esc(mh[3])}</th>
            <th class="num" title="${esc(tb.tpsHeaderTitle(modeLabel))}">${esc(mh[4])}</th>
            <th class="num">${esc(mh[5])}</th>
            <th class="num">${esc(mh[6])}</th>
            <th class="num">${esc(mh[7])}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
      return;
    }

    const sh = tb.stepHeaders;
    const rows = [...steps]
      .reverse()
      .map((st) => {
        const tier = tierOf(st.hitPct, st.isCold);
        const pctLabel = st.isCold ? 'cold' : `${st.hitPct}%`;
        const hitTitle = st.isCold
          ? (st.coldReason === 'model_switch' ? tb.stepHitModelSwitch : tb.stepHitFirst)
          : '';
        const dur = fmtStepDurationSplit(st);
        const durTitle = dur
          ? tb.stepDurTitle(dur.total, dur.split)
          : tb.stepDurLegacy;
        const ttftTitle = st.ttftMs != null
          ? tb.stepTtftTitle(fmtLatency(st.ttftMs))
          : tb.stepTtftLegacy;
        const splitNote = st.thinkingTokens != null
          ? tb.stepSplitNote(st.thinkingTokens, st.responseTokens)
          : '';
        let tpsCell;
        if (isE2e) {
          const decStr = st.isBurst ? 'burst' : `${fmtTps(st.decodeTps)} tok/s`;
          const tpsTitle = st.e2eTps != null
            ? tb.stepE2eTitle(fmtTps(st.e2eTps), fmtLatency(st.modelMs), decStr, splitNote)
            : tb.stepTpsLegacy;
          tpsCell = `<td class="num c-${tpsTier(st.e2eTps, 'e2e', false)}" title="${esc(tpsTitle)}">${esc(fmtTps(st.e2eTps))}</td>`;
        } else if (st.isBurst) {
          const e2eNote = st.e2eTps != null ? ` · E2E ${fmtTps(st.e2eTps)} tok/s` : '';
          tpsCell = `<td class="num c-cold" title="${esc(tb.stepBurstTitle(fmtLatency(st.genMs), e2eNote))}">burst</td>`;
        } else {
          const e2eNote = st.e2eTps != null ? ` · E2E ${fmtTps(st.e2eTps)} tok/s` : '';
          const tpsTitle = st.decodeTps != null
            ? tb.stepDecTitle(fmtTps(st.decodeTps), fmtLatency(st.genMs), e2eNote, splitNote)
            : tb.stepTpsLegacy;
          tpsCell = `<td class="num c-${tpsTier(st.decodeTps, 'decode', false)}" title="${esc(tpsTitle)}">${esc(fmtTps(st.decodeTps))}</td>`;
        }
        const outTitle = st.thinkingTokens != null
          ? tb.stepOutTitle(st.thinkingTokens, st.responseTokens)
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
          <th>${esc(sh[0])}</th>
          <th class="num">${esc(sh[1])}</th>
          <th class="num">${esc(sh[2])}</th>
          <th class="num" title="${esc(tb.tpsHeaderTitle(modeLabel))}">${esc(sh[3])}</th>
          <th class="num">${esc(sh[4])}</th>
          <th class="num">${esc(sh[5])}</th>
          <th class="num">${esc(sh[6])}</th>
          <th>${esc(sh[7])}</th>
          <th class="num">${esc(sh[8])}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function renderDashboard(payload) {
    state.payload = payload;
    state.emptyKey = null;
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
        showEmpty('no_conversation');
        return;
      }

      if (data.status === 'waiting') {
        state.payload = null;
        showEmpty('waiting');
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
