# Cache Monitor (`v1.1.0`)

Antigravity App 侧边栏实时缓存与推理性能监控插件（Sidecar UI），实时展示当前会话的提示词缓存命中率、**TTFT（首字延迟）**与 **E2E / Decode tok/s（生成速率）**。

## 安装方式

### 环境要求
- Antigravity App（桌面端）
- Node.js `>= 22.5`（使用内置 `node:sqlite` 读取只读数据库，零外部 npm 依赖；若运行时不支持 `node:sqlite` 或遇到旧版无 `.db` 的会话，将自动优雅降级为纯缓存命中率监控）

### 克隆到插件目录

**macOS / Linux：**
```bash
git clone https://github.com/sjmdsky/antigravity-cache-monitor.git ~/.gemini/config/plugins/cache-monitor
```

**Windows (PowerShell)：**
```powershell
git clone https://github.com/sjmdsky/antigravity-cache-monitor.git "$HOME\.gemini\config\plugins\cache-monitor"
```

### 启用与打开
1. 在 Antigravity App 的 **Customizations / Plugins** 中确认启用 **Cache Monitor**（如已开启，更新代码后请关闭再重新打开一次以重载 Sidecar）。
2. 在对话右上角 **Overview → Extensions → Cache Monitor** 打开，或点击右侧边栏 **+** 选择 **Cache Monitor**。
3. 在标签页上右键选择 **Pin Tab** 即可常驻右侧边栏，切换对话时自动跟随当前会话。

## 核心指标与颜色分级

### 1. 缓存命中率（Step & Σ Session）
- **单步命中率（Step）**：最近一次模型调用的 `cache_read_tokens / (input_tokens + cache_read_tokens + cache_creation_tokens)`，并显示与上一步的涨跌对比。
- **按模型冷启动判定（`cold`）**：每个模型在当前会话中**首次出现且 `cache_read_tokens == 0`** 时均视为冷启动（区分 **首步冷启动** 与 **切模型冷启动**，如 Plan/Execute 或 Orchestrator 协作切换到新模型），不再误报为 `⚠ Miss`；同一模型后续调用若再次掉到 `0%` 才触发 `⚠ Miss`。
- **累计命中率（Σ Session）**：整场会话所有 `PLANNER_RESPONSE` 步骤累计缓存读取占比与总步数。
- **颜色分级**：`≥ 80%` 绿 · `50% ~ 79%` 黄 · `20% ~ 49%` 橙 · `< 20%` 红 · 冷启动灰 (`cold`)。

### 2. TTFT（首字延迟）
- 读取会话只读 SQLite WAL (`conversations/<convId>.db`) 中每步 `first_token_at - created_at` 纳秒级时间戳，精度毫秒级。
- 卡片主值显示最新步 TTFT 与上一步差值，副文展示整场会话的 **P50 / P95**（悬停显示均值），避免长尾排队拉偏观感。
- **颜色分级**：`< 5s` 绿 · `5s ~ 10s` 黄 · `10s ~ 20s` 橙 · `≥ 20s` 红。

### 3. 速率（E2E / Decode tok/s，默认 E2E）
- 支持在速率卡片左上角切换 **E2E** 与 **Decode** 口径（状态持久化于 `localStorage`，同步联动卡片、趋势图与两张明细表）：
  - **E2E tok/s（默认）**：`output_tokens / (completed_at - created_at)`，将首字等待（TTFT）也计入分母，反映单步端到端真实体感吞吐；色阶为 `≥ 80` 绿 · `40 ~ 79` 黄 · `15 ~ 39` 橙 · `< 15` 红。
  - **Decode tok/s**：`output_tokens / (completed_at - first_token_at)`，纯解码吐字速率；流式时长 `< 500ms` 的单包返回标记为 `burst`（灰色）并从加权平均中排除，避免短包产生虚假尖峰；色阶为 `≥ 120` 绿 · `60 ~ 119` 黄 · `30 ~ 59` 橙 · `< 30` 红 · `burst` 灰。
- 会话与模型汇总均采用**加权平均**（有效步总输出 ÷ 有效步总耗时）。

## 视图与交互

- **2×2 核心指标卡**：上方缓存（单步 + 累计），下方性能（TTFT + E2E/Decode tok/s 切换）。
- **紧凑模式**：点击右上角 **紧凑** 按钮可折叠趋势图与明细，仅保留顶部 2×2 四张核心指标卡片。
- **三指标趋势图**：支持在 **命中率 / TTFT / tok/s** 间切换（超 48 步自动聚焦最近 48 步），悬停同时显示命中率、TTFT、E2E 与 Decode tok/s、思考/回复 token 拆分及耗时细节。
- **双 Tab 明细**：
  - **步骤明细**：列顺序为 `步 | 命中 | TTFT | tok/s | 读 / 新增 | 输出 | 用时 | 模型 | 时间`。
  - **按模型汇总**：按模型聚合展示步数、命中率、P50 TTFT、当前口径 tok/s、输入输出 token 与总用时。

## 原理与数据源

- **双源只读采集**：结合 `<appData>/brain/<convId>/.system_generated/logs/transcript.jsonl` 与只读 SQLite WAL `<appData>/conversations/<convId>.db`（仅读取 `steps` 表 `step_type = 15` 的 `metadata` 轻量 Protobuf），并内置零依赖 Protobuf Wire 解码器，同时补全纯文本尾步的精确耗时。
- **WAL 感知 ETag**：基于 `transcript.jsonl + .db + .db-wal` 的联合 mtime/size 生成 ETag，无变化时前端 1.5 秒轮询直接返回 `unchanged: true`，开销极低。

## License

[MIT](./LICENSE)
