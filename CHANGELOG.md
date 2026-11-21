# Changelog

All notable changes to this project will be documented in this file.

## [1.3.0] - 2026-11-21

### Added
- **Context Window Dashboard & Composition Breakdown**: Reads `gen_metadata` (`f1.f9.f10`) to display live context usage vs. model window limit, a stacked category bar (`System Prompt`, `Tools`, `Chat History`, `MCP Tools`, `Skills`, `Plugins`, `Subagents`), and a collapsible top-item token breakdown with category filter pills (`localStorage`-persisted).
- **Context Compaction & API Retry Annotations**: Detects context compaction checkpoints and API retries / stream interruptions from `gen_metadata` (`f9.f1`, `f10.f2`, `f14`, `f17`), rendering chart markers (`✂` / `↻`), tooltip deltas & error summaries, and inline tags in the Steps table.
- **Tool Execution Latency & Failure Analytics**: Parses `steps` (`step_type = 132`) to aggregate per-tool call counts, failure rates (`status = 4/7` or `error_details`), and nanosecond-precision durations (`Total`, `Avg`, `P50`, `Max`), plus a deduplicated wall-clock **Model vs. Tools** time split bar in a new **Tools** tab.
- **4th Chart Metric (`Ctx`)**: Tracks per-step context window growth alongside `Hit Rate`, `TTFT`, and `tok/s`, with 75% / 100% window reference lines.

### Changed
- **Historical Model Backfill**: Falls back to `gen_metadata` model slug/display name when older (`< 2026-11-20`) `transcript.jsonl` entries lack a `model` field, eliminating `unknown` labels and enabling accurate per-model cold-start detection.
- **Fast Zero-Copy Protobuf Traversal**: Skips large prompt/history fields in `gen_metadata` so parsing multi-megabyte SQLite WAL databases completes in milliseconds while preserving `.pb` and Node `< 22.5` graceful degradation.

## [1.2.0] - 2026-11-21

### Added
- **中英文双语 UI（默认英文）**：Sidecar 监控面板默认展示英文界面，并在顶栏右侧新增 `中文 / EN` 一键切换按钮（偏好持久化于 `localStorage`），全量覆盖空状态、2×2 KPI 卡片、三指标趋势图、悬停 Tooltip 与双 Tab 明细表（#2）。
- **双语 README 文档**：默认提供英文版 `README.md` 并新增简体中文版 `README.zh-CN.md`，顶部支持一键互切（#1）。

### Changed
- **README 视觉与信息架构重构**：新增居中 Hero（含项目图标与同色系徽章）、2×3 特性网格、结构化快速开始与 GitHub Alert、核心指标与色阶统一矩阵、Mermaid 架构数据流图、可折叠目录树与 FAQ（#1）。

## [1.1.0] - 2026-11-21

### Added
- **TTFT（首字延迟）与 E2E / Decode tok/s 监控**：通过只读模式打开 `conversations/<convId>.db`（Node 内置 `node:sqlite` + 零依赖 Protobuf Wire 解码器），读取纳秒级 `created_at`、`first_token_at`、`completed_at` 与 `thinking_tokens` / `response_tokens` 拆分。
- **E2E / Decode tok/s 切换器**：默认以 **E2E tok/s** 展示端到端吞吐，支持在速率卡片左上角一键切换至 **Decode tok/s**（持久化至 `localStorage`，同步联动趋势图与双 Tab 明细表）。
- **短包 `burst` 保护**：在 Decode 口径下对流式时长 `< 500ms` 的单包返回步骤标为 `burst` 并从加权平均中排除，避免速率虚高。
- **2×2 KPI 卡片与三指标趋势图**：新增 TTFT（主值 + 涨跌 + 会话 P50/P95）与速率卡片，趋势图支持 `命中率 | TTFT | tok/s` 三视图切换及增强型悬停 Tooltip。
- **按模型冷启动判定**：每个模型在当前会话中首次出现且 `cache_read_tokens == 0` 时标为 `cold`（区分 `首步冷启动` 与 `切模型冷启动`），不再误报为 `⚠ Miss`。

### Changed
- **步骤明细列顺序**：将 `用时` 列移动至 `模型` 列之前（`步 | 命中 | TTFT | tok/s | 读 / 新增 | 输出 | 用时 | 模型 | 时间`）。
- **WAL 感知缓存与尾步耗时修复**：`/api/cache` 使用 `transcript.jsonl + .db + .db-wal` 联合 ETag，并利用 `.db` 精确耗时补全纯文本结束步的用时显示。
- 缺少 `.db` 或不支持 `node:sqlite` 时自动优雅降级为纯缓存监控模式。

## [1.0.0] - 2026-11-20

### Added
- 初始版本：Antigravity App 侧边栏实时提示词缓存命中率监控（Sidecar UI）。
- 支持单步与累计命中率 KPI 卡片、内联 SVG 命中率趋势图、步骤明细与按模型汇总双 Tab、紧凑模式及宿主明暗主题自动同步。
