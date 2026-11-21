(() => {
  'use strict';

  const POLL_MS = 1500;
  const COMPACT_STORAGE_KEY = 'cache-monitor.compact';
  const METRIC_STORAGE_KEY = 'cache-monitor.chartMetric';
  const TPS_MODE_STORAGE_KEY = 'cache-monitor.tpsMode';
  const LANG_STORAGE_KEY = 'cache-monitor.lang';
  const CONTEXT_OPEN_STORAGE_KEY = 'cache-monitor.contextOpen';
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
    contextCard: document.getElementById('context-card'),
    btnContextToggle: document.getElementById('btn-context-toggle'),
    contextLabel: document.getElementById('context-label'),
    contextCompactBadge: document.getElementById('context-compact-badge'),
    contextUsage: document.getElementById('context-usage'),
    contextPctBadge: document.getElementById('context-pct-badge'),
    contextBar: document.getElementById('context-bar'),
    contextLegend: document.getElementById('context-legend'),
    contextBreakdown: document.getElementById('context-breakdown'),
    contextCatPills: document.getElementById('context-cat-pills'),
    contextItems: document.getElementById('context-items'),
    metricSwitch: document.getElementById('metric-switch'),
    metricHit: document.getElementById('metric-hit'),
    metricTtft: document.getElementById('metric-ttft'),
    metricTps: document.getElementById('metric-tps'),
    metricCtx: document.getElementById('metric-ctx'),
    trendMeta: document.getElementById('trend-meta'),
    trendChart: document.getElementById('trend-chart'),
    tooltip: document.getElementById('chart-tooltip'),
    tabsBar: document.getElementById('tabs-bar'),
    tabSteps: document.getElementById('tab-steps'),
    tabModels: document.getElementById('tab-models'),
    tabTools: document.getElementById('tab-tools'),
    detailBody: document.getElementById('detail-body'),
  };

  const state = {
    lang: 'en',
    activeTab: 'steps',
    chartMetric: 'hit',
    tpsMode: 'e2e',
    compact: false,
    contextOpen: false,
    contextCategory: 'all',
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
        contextLabel: 'Context Window',
        contextAria: 'Context window',
        contextCatAria: 'Context category',
        metricSwitchAria: 'Trend metric',
        metricHit: 'Hit Rate',
        metricCtx: 'Ctx',
        tabsBarAria: 'Detail views',
        stepLabelPlaceholder: 'Step #0',
        tpsSubPlaceholder: 'Session --',
        trendMetaPlaceholder: '80% · 50% ref',
      },
      context: {
        all: 'All',
        catLabel: (key) => ({
          'System Prompt': 'System Prompt',
          'Tools': 'Tools',
          'Chat Messages': 'Chat History',
          'Mcp Tools': 'MCP Tools',
          'Subagents': 'Subagents',
          'Skills': 'Skills',
          'Plugins': 'Plugins',
          'Unspecified': 'Other',
        }[key] || key),
        compactBadge: (n) => `✂ ${n} compact`,
        itemsCount: (shown, total) => (total > shown ? `Top ${shown} of ${total}` : `${shown} items`),
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
        ctxAria: 'Per-step context usage trend chart',
        ctxNoDataMeta: 'No context data',
        ctxNoDataChart: 'Legacy session, no context window data',
        ctxMeta: (limitStr) => `Window ${limitStr}`,
        compactEventNote: (n) => `✂ ${n}`,
        retryEventNote: (n) => `↻ ${n}`,
      },
      tooltip: {
        durSplit: (m, t) => `Model ${m} · Tools ${t}`,
        coldModelSwitch: 'cold (model switch)',
        coldFirstStep: 'cold (1st step)',
        durTotal: (total, split) => (split ? ` · Dur ${total} (${split})` : ` · Dur ${total}`),
        genNote: (ms) => ` (gen ${ms})`,
        outSplit: (th, res) => ` (Think ${th} + Reply ${res})`,
        hitLine: (hit, total, out, outSplit) => `Hit ${hit} / ${total} · Out ${out}${outSplit}`,
        ctxLine: (used, limit, pct) => `Ctx ${used} / ${limit} (${pct}%)`,
        compactedEvent: (prev, curr, saved) => `✂ Compacted: ${prev} → ${curr} (-${saved})`,
        compactedSimple: '✂ Context compacted before this step',
        retryEvent: (n, err) => `↻ ${n} API ${n === 1 ? 'retry' : 'retries'}${err ? `: ${err}` : ''}`,
        interruptedEvent: (err) => `↻ Stream interrupted${err ? `: ${err}` : ''}`,
      },
      tables: {
        tabSteps: (n) => `Steps (${n})`,
        tabModels: (n) => `By Model (${n})`,
        tabTools: (n) => `Tools (${n})`,
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
        stepCompactTitle: (prev, curr) => (prev ? `Context compacted (${prev} → ${curr})` : 'Context compacted before this step'),
        stepRetryTitle: (n, err, interrupted) => `${interrupted ? 'Stream interrupted' : `${n} API ${n === 1 ? 'retry' : 'retries'}`}${err ? `: ${err}` : ''}`,
        stepHeaders: ['Step', 'Hit', 'TTFT', 'tok/s', 'Read / New', 'Out', 'Dur', 'Model', 'Time'],
        toolHeaders: ['Tool', 'Calls', 'Fail', 'Total', 'Avg', 'Max'],
        toolsEmpty: 'No tool calls recorded in this conversation yet.',
        toolsSplitModel: (dur, pct) => `Model ${dur} (${pct}%)`,
        toolsSplitTool: (dur, pct) => `Tools ${dur} (${pct}%)`,
        toolsCallsSummary: (total, failed, failRate) =>
          `${total} ${total === 1 ? 'call' : 'calls'}${failed > 0 ? ` · ${failed} fail (${failRate}%)` : ' · 0 fail'}`,
        toolsSplitTitle: (wall, cum, calls) => `Wall time ${wall} · Cumulative ${cum} across ${calls} calls`,
        toolAvgTitle: (p50, avg, max) => `P50 ${p50} · Avg ${avg} · Max ${max}`,
        toolFailTitle: (failed, canceled, running) => `${failed} failed · ${canceled} canceled · ${running} running`,
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
        contextLabel: '上下文窗口',
        contextAria: '上下文窗口',
        contextCatAria: '上下文分类',
        metricSwitchAria: '趋势指标',
        metricHit: '命中率',
        metricCtx: '上下文',
        tabsBarAria: '缓存详情视图',
        stepLabelPlaceholder: '单步 · Step #0',
        tpsSubPlaceholder: '会话 --',
        trendMetaPlaceholder: '80% · 50% 参考线',
      },
      context: {
        all: '全部',
        catLabel: (key) => ({
          'System Prompt': '系统提示词',
          'Tools': '工具定义',
          'Chat Messages': '对话历史',
          'Mcp Tools': 'MCP 工具',
          'Subagents': '子 Agent',
          'Skills': '技能',
          'Plugins': '插件',
          'Unspecified': '其他',
        }[key] || key),
        compactBadge: (n) => `✂ ${n} 次压缩`,
        itemsCount: (shown, total) => (total > shown ? `前 ${shown} / 共 ${total} 项` : `共 ${shown} 项`),
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
        ctxAria: '每步上下文占用趋势图',
        ctxNoDataMeta: '无上下文数据',
        ctxNoDataChart: '旧版会话，暂无上下文窗口数据',
        ctxMeta: (limitStr) => `窗口上限 ${limitStr}`,
        compactEventNote: (n) => `✂ ${n}`,
        retryEventNote: (n) => `↻ ${n}`,
      },
      tooltip: {
        durSplit: (m, t) => `模型 ${m} · 工具 ${t}`,
        coldModelSwitch: 'cold (切模型)',
        coldFirstStep: 'cold (首步)',
        durTotal: (total, split) => (split ? ` · 用时 ${total} (${split})` : ` · 用时 ${total}`),
        genNote: (ms) => ` (生成 ${ms})`,
        outSplit: (th, res) => ` (思 ${th} + 答 ${res})`,
        hitLine: (hit, total, out, outSplit) => `命中 ${hit} / 总 ${total} · 输出 ${out}${outSplit}`,
        ctxLine: (used, limit, pct) => `上下文 ${used} / ${limit} (${pct}%)`,
        compactedEvent: (prev, curr, saved) => `✂ 上下文压缩：${prev} → ${curr} (-${saved})`,
        compactedSimple: '✂ 此步前触发了上下文压缩',
        retryEvent: (n, err) => `↻ API 重试 ${n} 次${err ? `：${err}` : ''}`,
        interruptedEvent: (err) => `↻ 流式中断${err ? `：${err}` : ''}`,
      },
      tables: {
        tabSteps: (n) => `步骤明细 (${n})`,
        tabModels: (n) => `按模型汇总 (${n})`,
        tabTools: (n) => `工具 (${n})`,
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
        stepCompactTitle: (prev, curr) => (prev ? `上下文压缩 (${prev} → ${curr})` : '此步前触发了上下文压缩'),
        stepRetryTitle: (n, err, interrupted) => `${interrupted ? '流式中断' : `API 重试 ${n} 次`}${err ? `：${err}` : ''}`,
        stepHeaders: ['步', '命中', 'TTFT', 'tok/s', '读 / 新增', '输出', '用时', '模型', '时间'],
        toolHeaders: ['工具', '次数', '失败', '总耗时', '均耗时', '最大'],
        toolsEmpty: '当前会话暂无工具调用记录。',
        toolsSplitModel: (dur, pct) => `模型 ${dur} (${pct}%)`,
        toolsSplitTool: (dur, pct) => `工具 ${dur} (${pct}%)`,
        toolsCallsSummary: (total, failed, failRate) =>
          `共 ${total} 次调用${failed > 0 ? ` · 失败 ${failed} (${failRate}%)` : ' · 0 失败'}`,
        toolsSplitTitle: (wall, cum, calls) => `墙钟耗时 ${wall} · ${calls} 次累计耗时 ${cum}`,
        toolAvgTitle: (p50, avg, max) => `P50 ${p50} · 均 ${avg} · 最大 ${max}`,
        toolFailTitle: (failed, canceled, running) => `失败 ${failed} · 取消 ${canceled} · 运行中 ${running}`,
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

  function ctxTier(pct) {
    if (pct === null || pct === undefined || !Number.isFinite(pct)) return 'cold';
    if (pct < 50) return 'good';
    if (pct < 75) return 'warn';
    if (pct < 90) return 'low';
    return 'bad';
  }

  function ctxColorVar(catKey) {
    if (catKey === 'System Prompt') return 'var(--cm-ctx-sys)';
    if (catKey === 'Tools' || catKey === 'Mcp Tools' || catKey === 'Skills' || catKey === 'Plugins' || catKey === 'Subagents') {
      return 'var(--cm-ctx-tools)';
    }
    if (catKey === 'Chat Messages') return 'var(--cm-ctx-chat)';
    return 'var(--cm-ctx-other)';
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
    el.contextCard.setAttribute('aria-label', s.contextAria);
    el.contextLabel.textContent = s.contextLabel;
    el.contextCatPills.setAttribute('aria-label', s.contextCatAria);
    el.metricSwitch.setAttribute('aria-label', s.metricSwitchAria);
    el.metricHit.textContent = s.metricHit;
    el.metricCtx.textContent = s.metricCtx;
    el.tabsBar.setAttribute('aria-label', s.tabsBarAria);

    if (!state.payload) {
      el.stepLabel.textContent = s.stepLabelPlaceholder;
      el.ttftLabel.textContent = s.ttftLabelPlaceholder;
      el.tpsSub.textContent = s.tpsSubPlaceholder;
      el.trendMeta.textContent = s.trendMetaPlaceholder;
      el.tabSteps.textContent = t.tables.tabSteps(0);
      el.tabModels.textContent = t.tables.tabModels(0);
      el.tabTools.textContent = t.tables.tabTools(0);
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

  function setContextOpen(next, { persist = true, rerender = true } = {}) {
    state.contextOpen = Boolean(next);
    el.btnContextToggle.setAttribute('aria-expanded', state.contextOpen ? 'true' : 'false');
    el.contextBreakdown.classList.toggle('hidden', !state.contextOpen);
    if (persist) {
      try {
        localStorage.setItem(CONTEXT_OPEN_STORAGE_KEY, state.contextOpen ? '1' : '0');
      } catch {
        // Sandboxed iframe origin may restrict storage.
      }
    }
    if (rerender && state.payload?.status === 'ok' && state.payload.context) {
      renderContextBreakdown(state.payload.context);
    }
  }

  function setChartMetric(next, { persist = true, rerender = true } = {}) {
    const valid = next === 'ttft' || next === 'tps' || next === 'ctx' ? next : 'hit';
    state.chartMetric = valid;
    for (const btn of [el.metricHit, el.metricTtft, el.metricTps, el.metricCtx]) {
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
      renderChart(state.payload.steps, state.payload.summary, state.payload.context);
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
        renderChart(state.payload.steps, state.payload.summary, state.payload.context);
      }
      renderDetails(state.payload);
    }
  }

  try {
    if (localStorage.getItem(COMPACT_STORAGE_KEY) === '1') {
      setCompact(true);
    }
    if (localStorage.getItem(CONTEXT_OPEN_STORAGE_KEY) === '1') {
      setContextOpen(true, { persist: false, rerender: false });
    }
    const savedMetric = localStorage.getItem(METRIC_STORAGE_KEY);
    if (savedMetric === 'hit' || savedMetric === 'ttft' || savedMetric === 'tps' || savedMetric === 'ctx') {
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
  el.btnContextToggle.addEventListener('click', () => setContextOpen(!state.contextOpen));

  el.contextCatPills.addEventListener('click', (e) => {
    const pill = e.target.closest?.('.ctx-cat-pill');
    const next = pill?.dataset?.cat;
    if (!next || next === state.contextCategory) return;
    state.contextCategory = next;
    if (state.payload?.status === 'ok' && state.payload.context) {
      renderContextBreakdown(state.payload.context);
    }
  });

  for (const btn of [el.metricHit, el.metricTtft, el.metricTps, el.metricCtx]) {
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

  for (const btn of [el.tabSteps, el.tabModels, el.tabTools]) {
    btn.addEventListener('click', () => {
      const next = btn.dataset.tab;
      if (!next || next === state.activeTab) return;
      state.activeTab = next;
      for (const tabBtn of [el.tabSteps, el.tabModels, el.tabTools]) {
        const active = tabBtn.dataset.tab === next;
        tabBtn.classList.toggle('active', active);
        tabBtn.setAttribute('aria-selected', active ? 'true' : 'false');
      }
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

  function renderContextBreakdown(context) {
    const cx = tr().context;
    const cats = (context?.breakdown?.categories || []).filter((c) => c.items && c.items.length > 0);
    if (cats.length === 0) {
      el.contextCatPills.innerHTML = '';
      el.contextItems.innerHTML = '';
      return;
    }

    if (state.contextCategory !== 'all' && !cats.some((c) => c.key === state.contextCategory)) {
      state.contextCategory = 'all';
    }

    const pills = [
      `<button type="button" class="ctx-cat-pill${state.contextCategory === 'all' ? ' active' : ''}" role="tab" aria-selected="${state.contextCategory === 'all' ? 'true' : 'false'}" data-cat="all">${esc(cx.all)}</button>`,
      ...cats.map((cat) => {
        const active = state.contextCategory === cat.key;
        return `<button type="button" class="ctx-cat-pill${active ? ' active' : ''}" role="tab" aria-selected="${active ? 'true' : 'false'}" data-cat="${esc(cat.key)}">${esc(cx.catLabel(cat.key))} · ${esc(fmtTokens(cat.tokens))}</button>`;
      }),
    ];
    el.contextCatPills.innerHTML = pills.join('');

    let items = [];
    if (state.contextCategory === 'all') {
      items = cats
        .flatMap((cat) => cat.items.map((it) => ({ ...it, catKey: cat.key })))
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, 15);
    } else {
      const selected = cats.find((c) => c.key === state.contextCategory);
      if (selected) {
        items = selected.items.map((it) => ({ ...it, catKey: selected.key }));
      }
    }

    const maxTokens = items[0]?.tokens || 1;
    el.contextItems.innerHTML = items
      .map((item) => {
        const widthPct = Math.max(2, Math.round((item.tokens * 100) / maxTokens));
        const dotColor = ctxColorVar(item.catKey);
        return `<div class="ctx-item-row">
          <div class="ctx-item-name" title="${esc(item.name)}">
            <span class="ctx-dot" style="background:${dotColor}"></span>
            <span class="mono">${esc(item.name)}</span>
          </div>
          <div class="ctx-item-bar"><div class="ctx-item-fill" style="width:${widthPct}%;background:${dotColor}"></div></div>
          <div class="ctx-item-val">${esc(fmtTokens(item.tokens))} · ${esc(item.pct)}%</div>
        </div>`;
      })
      .join('');
  }

  function renderContextCard(context) {
    if (!context || !context.limit) {
      el.contextCard.classList.add('hidden');
      el.metricCtx.classList.add('hidden');
      if (state.chartMetric === 'ctx') {
        setChartMetric('hit', { persist: false, rerender: false });
      }
      return;
    }

    el.contextCard.classList.remove('hidden');
    el.metricCtx.classList.remove('hidden');

    const cx = tr().context;
    const tier = ctxTier(context.pct);
    el.contextUsage.textContent = `${fmtTokens(context.used)} / ${fmtTokens(context.limit)}`;
    el.contextUsage.title = `${context.used.toLocaleString()} / ${context.limit.toLocaleString()}`;
    el.contextPctBadge.className = `kpi-badge c-${tier}`;
    el.contextPctBadge.textContent = `${context.pct}%`;

    if (context.compactionCount > 0) {
      el.contextCompactBadge.textContent = cx.compactBadge(context.compactionCount);
      el.contextCompactBadge.classList.remove('hidden');
    } else {
      el.contextCompactBadge.classList.add('hidden');
    }

    const cats = context.breakdown?.categories || [];
    if (cats.length > 0) {
      const denom = Math.max(context.limit, context.breakdown.totalTokens || 0);
      el.contextBar.innerHTML = cats
        .map((cat) => {
          const w = Math.max(0.4, (cat.tokens * 100) / denom).toFixed(2);
          const color = ctxColorVar(cat.key);
          const label = cx.catLabel(cat.key);
          return `<div class="ctx-bar-seg" style="width:${w}%;background:${color}" title="${esc(label)}: ${esc(fmtTokens(cat.tokens))} (${esc(cat.pct)}%)"></div>`;
        })
        .join('');

      el.contextLegend.innerHTML = cats
        .map((cat) => {
          const color = ctxColorVar(cat.key);
          const label = cx.catLabel(cat.key);
          return `<span class="ctx-legend-item" title="${esc(label)}: ${esc(cat.tokens.toLocaleString())} (${esc(cat.pct)}%)">
            <span class="ctx-dot" style="background:${color}"></span>
            <span>${esc(label)}</span>
            <span class="mono">${esc(fmtTokens(cat.tokens))} (${Math.round(cat.pct)}%)</span>
          </span>`;
        })
        .join('');
    } else {
      el.contextBar.innerHTML = `<div class="ctx-bar-seg bg-${tier}" style="width:${Math.min(100, context.pct)}%"></div>`;
      el.contextLegend.innerHTML = '';
    }

    if (state.contextOpen) {
      renderContextBreakdown(context);
    }
  }

  function renderEventMarkersSvg(visible, left, top, bottom, slotW) {
    const parts = [];
    for (let idx = 0; idx < visible.length; idx++) {
      const st = visible[idx];
      if (st.compacted) {
        const x = Number((left + idx * slotW).toFixed(2));
        parts.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}"
          stroke="var(--cm-event-compact)" stroke-opacity="0.75" stroke-width="1.2" stroke-dasharray="2,2" />`);
        parts.push(`<polygon points="${x},${top + 0.5} ${x + 3},${top + 3.5} ${x},${top + 6.5} ${x - 3},${top + 3.5}"
          fill="var(--cm-event-compact)" />`);
      }
      if (st.retryCount > 0) {
        const xc = Number((left + (idx + 0.5) * slotW).toFixed(2));
        const fill = st.interrupted ? 'var(--cm-bad)' : 'var(--cm-low)';
        parts.push(`<polygon points="${xc},${top + 0.5} ${xc + 3},${top + 5.5} ${xc - 3},${top + 5.5}"
          fill="${fill}" />`);
      }
    }
    if (parts.length === 0) return '';
    return `<g pointer-events="none">${parts.join('')}</g>`;
  }

  function renderChart(steps, summary, context) {
    const c = tr().chart;
    const MAX_BARS = 48;
    const visible = steps.length > MAX_BARS ? steps.slice(-MAX_BARS) : steps;
    state.visibleSteps = visible;
    el.tooltip.classList.add('hidden');

    const metric = state.chartMetric;
    const countLabel = steps.length > MAX_BARS
      ? c.countLast(MAX_BARS, steps.length)
      : c.countAll(steps.length);

    const visCompacts = visible.filter((s) => s.compacted).length;
    const visRetries = visible.reduce((acc, s) => acc + (s.retryCount || 0), 0);
    const evParts = [];
    if (visCompacts > 0) evParts.push(c.compactEventNote(visCompacts));
    if (visRetries > 0) evParts.push(c.retryEventNote(visRetries));
    const evSuffix = evParts.length > 0 ? ` · ${evParts.join(' · ')}` : '';

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
    const markersSvg = renderEventMarkersSvg(visible, left, top, bottom, slotW);

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

      el.trendMeta.textContent = (summary?.p50TtftMs != null
        ? `${countLabel} · ${c.ttftRefMeta(fmtLatency(summary.p50TtftMs))}`
        : `${countLabel} · ${c.ttftMeta}`) + evSuffix;

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
        ${markersSvg}
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

      el.trendMeta.textContent = (refTps != null
        ? `${countLabel} · ${c.tpsRefMeta(fmtTps(refTps), modeLabel)}`
        : `${countLabel} · ${modeLabel} tok/s`) + evSuffix;

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
        ${markersSvg}
        ${xAxisSvg}
      </svg>`;
      return;
    }

    if (metric === 'ctx') {
      const validCtx = visible.filter((s) => s.contextTokens != null).map((s) => s.contextTokens);
      if (validCtx.length === 0) {
        el.trendMeta.textContent = `${countLabel} · ${c.ctxNoDataMeta}`;
        el.trendChart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="${esc(c.ctxAria)}">
          <text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="10.5" fill="var(--cm-fg-muted)">${esc(c.ctxNoDataChart)}</text>
        </svg>`;
        return;
      }

      const limit = context?.limit || Math.max(...visible.map((s) => s.contextLimit || 0), 0);
      const maxVal = Math.max(...validCtx, 1000);
      let yMax;
      if (limit > 0 && maxVal > limit * 0.6 && maxVal <= limit) {
        yMax = limit;
      } else {
        const rawCeil = limit > 0
          ? Math.max(maxVal * 1.15, limit * 0.25)
          : maxVal * 1.15;
        yMax = niceCeil(rawCeil);
        if (limit > 0 && maxVal <= limit && yMax > limit) yMax = limit;
      }
      const yAt = (v) => top + (1 - Math.min(v, yMax) / yMax) * plotH;
      const fmtTickCtx = (v) => (v === 0 ? '0' : fmtTokens(Math.round(v)).replace(/\.0([kM])$/, '$1'));

      el.trendMeta.textContent = (limit > 0
        ? `${countLabel} · ${c.ctxMeta(fmtTickCtx(limit))}`
        : `${countLabel} · ${c.ctxNoDataMeta}`) + evSuffix;

      const refSpecs = [
        { val: yMax, label: fmtTickCtx(yMax), dash: '2,3', opacity: 0.25 },
        { val: yMax / 2, label: fmtTickCtx(yMax / 2), dash: '2,3', opacity: 0.25 },
        { val: 0, label: '0', dash: '', opacity: 0.35 },
      ];
      if (limit > 0 && limit * 0.75 <= yMax) {
        refSpecs.push({ val: limit * 0.75, label: '', dash: '3,3', opacity: 0.45, stroke: 'var(--cm-warn)' });
      }
      if (limit > 0 && limit <= yMax) {
        refSpecs.push({ val: limit, label: '', dash: '3,3', opacity: 0.55, stroke: 'var(--cm-bad)' });
      }
      const refLines = drawRefLines(refSpecs, yAt);

      const barsSvg = visible
        .map((st, idx) => {
          const xCenter = left + (idx + 0.5) * slotW;
          const x = (xCenter - barW / 2).toFixed(2);
          const slotX = (left + idx * slotW).toFixed(2);
          let barRect = '';
          if (st.contextTokens == null) {
            const h = 8;
            const y = (bottom - h).toFixed(2);
            barRect = `<rect class="bar-rect" x="${x}" y="${y}" width="${barW.toFixed(2)}" height="${h}" rx="1.5"
              fill="${colorVar.cold}" fill-opacity="0.35" stroke="${colorVar.cold}" stroke-width="1" stroke-dasharray="2,2" />`;
          } else {
            const pct = st.contextPct ?? (limit > 0 ? (st.contextTokens * 100) / limit : 0);
            const tier = ctxTier(pct);
            const h = Math.max(4, Math.min(1, st.contextTokens / yMax) * plotH);
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

      el.trendChart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="${esc(c.ctxAria)}">
        ${refLines}
        ${barsSvg}
        ${markersSvg}
        ${xAxisSvg}
      </svg>`;
      return;
    }

    el.trendMeta.textContent = `${countLabel} · ${c.hitRefMeta}${evSuffix}`;
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
      ${markersSvg}
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
    const ctxLine = st.contextTokens != null
      ? `<div class="muted mono">${esc(tt.ctxLine(fmtTokens(st.contextTokens), fmtTokens(st.contextLimit || 0), st.contextPct ?? 0))}</div>`
      : '';
    let compactLine = '';
    if (st.compacted) {
      const msg = (st.prevContextTokens != null && st.contextTokens != null && st.prevContextTokens > st.contextTokens)
        ? tt.compactedEvent(fmtTokens(st.prevContextTokens), fmtTokens(st.contextTokens), fmtTokens(st.prevContextTokens - st.contextTokens))
        : tt.compactedSimple;
      compactLine = `<div class="tooltip-ev" style="color:var(--cm-event-compact)">${esc(msg)}</div>`;
    }
    let retryLine = '';
    if (st.retryCount > 0) {
      const msg = st.interrupted
        ? tt.interruptedEvent(st.retryError)
        : tt.retryEvent(st.retryCount, st.retryError);
      retryLine = `<div class="tooltip-ev ${st.interrupted ? 'c-bad' : 'c-low'}">${esc(msg)}</div>`;
    }

    el.tooltip.innerHTML = `
      <div><strong>Step #${esc(st.seq)}</strong> · <span class="c-${tier}">${esc(rateLabel)}</span>${st.isMiss ? ' <span class="miss-flag">⚠ Miss</span>' : ''}</div>
      ${perfLine}
      <div class="muted mono">${tt.hitLine(esc(fmtTokens(st.cacheReadTokens)), esc(fmtTokens(st.totalInput)), esc(fmtTokens(st.outputTokens)), outSplit)}</div>
      ${ctxLine}
      <div class="muted mono">${esc(shortModel(st.model))} · ${esc(fmtTime(st.createdAt))}${esc(durInfo)}</div>
      ${compactLine}
      ${retryLine}
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
    el.tabTools.textContent = tb.tabTools(payload.tools?.summary?.totalCalls || 0);

    if (state.activeTab === 'tools') {
      const toolsData = payload.tools;
      if (!toolsData || !toolsData.items || toolsData.items.length === 0) {
        el.detailBody.innerHTML = `<div class="tools-empty">${esc(tb.toolsEmpty)}</div>`;
        return;
      }

      const ts = toolsData.summary;
      const modelMs = ts.totalModelMs || 0;
      const toolWallMs = ts.wallToolMs || 0;
      const combinedMs = modelMs + toolWallMs;
      let splitHtml = '';
      if (combinedMs > 0) {
        const modelPct = Math.round((modelMs * 100) / combinedMs);
        const toolPct = 100 - modelPct;
        splitHtml = `
          <div class="tools-split-bar" aria-hidden="true">
            <div class="split-model" style="width:${modelPct}%"></div>
            <div class="split-tools" style="width:${toolPct}%"></div>
          </div>
          <div class="tools-split-meta">
            <span class="ctx-legend-item">
              <span class="ctx-dot" style="background:var(--cm-ctx-sys)"></span>
              <span>${esc(tb.toolsSplitModel(fmtLatency(modelMs), modelPct))}</span>
            </span>
            <span class="ctx-legend-item" title="${esc(tb.toolsSplitTitle(fmtLatency(toolWallMs), fmtLatency(ts.totalExecMs), ts.totalCalls))}">
              <span class="ctx-dot" style="background:var(--cm-ctx-tools)"></span>
              <span>${esc(tb.toolsSplitTool(fmtLatency(toolWallMs), toolPct))}</span>
            </span>
            <span class="${ts.failedCalls > 0 ? 'c-bad' : 'muted'}">${esc(tb.toolsCallsSummary(ts.totalCalls, ts.failedCalls, ts.failRatePct))}</span>
          </div>`;
      } else {
        splitHtml = `<div class="tools-split-meta">
          <span class="${ts.failedCalls > 0 ? 'c-bad' : 'muted'}">${esc(tb.toolsCallsSummary(ts.totalCalls, ts.failedCalls, ts.failRatePct))}</span>
        </div>`;
      }

      const th = tb.toolHeaders;
      const maxItemTotal = Math.max(...toolsData.items.map((x) => x.totalMs || 0), 1);
      const rows = toolsData.items
        .map((item) => {
          const shareW = item.timedCalls > 0 ? Math.max(4, Math.round((item.totalMs * 100) / maxItemTotal)) : 0;
          const failText = item.failed > 0 ? `${item.failed} (${item.failRatePct}%)` : '0';
          const failTitle = tb.toolFailTitle(item.failed, item.canceled, item.running);
          const avgTitle = item.timedCalls > 0
            ? tb.toolAvgTitle(fmtLatency(item.p50Ms), fmtLatency(item.avgMs), fmtLatency(item.maxMs))
            : '';
          return `<tr>
            <td class="tool-name-cell mono" title="${esc(item.name)}">${esc(item.name)}</td>
            <td class="num">${esc(item.calls)}</td>
            <td class="num ${item.failed > 0 ? 'c-bad' : 'muted'}" title="${esc(failTitle)}">${esc(failText)}</td>
            <td class="num">
              <span class="mini-bar-wrap">
                <span class="mini-track"><span class="mini-fill" style="width:${shareW}%;background:var(--cm-ctx-tools)"></span></span>
                <span>${esc(item.timedCalls > 0 ? fmtLatency(item.totalMs) : '--')}</span>
              </span>
            </td>
            <td class="num muted"${avgTitle ? ` title="${esc(avgTitle)}"` : ''}>${esc(fmtLatency(item.avgMs))}</td>
            <td class="num muted">${esc(fmtLatency(item.maxMs))}</td>
          </tr>`;
        })
        .join('');

      el.detailBody.innerHTML = `<div class="tools-summary">${splitHtml}</div>
        <table class="detail-table">
          <thead>
            <tr>
              <th>${esc(th[0])}</th>
              <th class="num">${esc(th[1])}</th>
              <th class="num">${esc(th[2])}</th>
              <th class="num">${esc(th[3])}</th>
              <th class="num">${esc(th[4])}</th>
              <th class="num">${esc(th[5])}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
      return;
    }

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
        const compactTag = st.compacted
          ? `<span class="ev-tag ev-compact" title="${esc(tb.stepCompactTitle(st.prevContextTokens != null ? fmtTokens(st.prevContextTokens) : '', st.contextTokens != null ? fmtTokens(st.contextTokens) : ''))}">✂</span>`
          : '';
        const retryTag = st.retryCount > 0
          ? `<span class="ev-tag ev-retry" title="${esc(tb.stepRetryTitle(st.retryCount, st.retryError, st.interrupted))}">↻${st.retryCount > 1 ? esc(st.retryCount) : ''}</span>`
          : '';
        return `<tr class="${st.isMiss ? 'row-miss' : ''}">
          <td class="step-cell mono muted">#${esc(st.seq)}${compactTag}${retryTag}</td>
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
    renderContextCard(payload.context);
    renderChart(payload.steps, payload.summary, payload.context);
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
