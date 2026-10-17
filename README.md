# Google Antigravity Status & Quota Monitor 🚀

> 专为 **Google Antigravity**（反重力）打造的高性能 VS Code 状态监控、配额预警与高颜值 Token 仪表盘伴侣插件。

[![VS Code Extension](https://img.shields.io/badge/VS%20Code-v1.80.0+-007acc.svg?logo=visualstudiocode)](https://marketplace.visualstudio.com/)
[![Version](https://img.shields.io/badge/version-1.5.2-blue.svg)](https://github.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-3178c6.svg?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## 💡 核心功能亮点

### 1. 状态栏精准掌控 5小时配额与周配额（官方原生同源）
- **直接对接 Antigravity 本地核心引擎**：毫秒级直连本地 `agy.exe` Hub，无需安装任何第三方外部守护程序，100% 还原官方原生「View Usage」配额数据。
- **状态栏常驻展示**：`✨ 反重力: 81% (5h) | 周 94% | 今日 58.8M`（5小时限额在前，周限额在后，与官方数据完全一致）。
- **低额度智能告警**：当 5小时限额 ≤ 20% 时状态栏变黄预警；≤ 5% 时变红告警。
- **悬停浮窗 (Rich Tooltip)**：悬停即见当前登录邮箱、Gemini 与 Claude/GPT 模型的 5h / 周周期限额明细表格、重置倒计时（如 `3小时30分后`）、今日/近7天 Token 消耗分解（输入、输出、缓存节省量）及生成性能。

### 2. 本地原生 Token 实时统计引擎
- 直接解析 Antigravity 原生转录日志（`brain/*/transcript.jsonl`），对话步骤完成即秒级自动刷新。
- 精准统计今日总 Token、输入 Token、输出 Token、缓存节省量（可达 96%+ 缓存命中率）与请求次数。

### 2. 高颜值赛博朋克深色仪表盘 (Cyberpunk Dashboard)
- 点击状态栏一键呼出独立的高级监控仪表盘：
  - **10 大核心 KPI 卡片**：今日总 Token、输入/输出 Token、缓存节省比例、调用次数、估算费用（自动读取 `api_pricing.json` 计算）、吞吐速度、首字延迟、当前账号等。
  - **24 小时整点柱状图**：清晰展示今日各小时段的 Token 生成热力分布。
  - **模型占比环形图**：直观展示不同模型的 Token 消耗分布。
  - **模型级别明细表格**：模型名、费用、输入/输出详细分解。
  - **顶部快捷操作**：
    - `⚡ 热重启插件`：秒级平滑重启扩展宿主，恢复会话。
    - `🔌 冷重启核心`：强行结束并冷拉起 `agy.exe` 核心进程。
    - `🔄 刷新数据`：联动本地与云端实时拉取最新配额。

### 3. 网络代理自适应与自定义代理支持
- **彻底去除旧版本硬编码代理（如 7897 端口）**，避免无代理环境下出现网络连接挂死或超时问题。
- 支持在设置中显式配置自定义代理服务器地址（`antigravityStatus.proxyUrl`），留空时自动遵循系统环境变量或直连。

---

## ⚙️ 配置项说明 (Configuration)

在 VS Code 设置中搜索 `antigravityStatus`，可进行个性化定制：

| 配置键名 | 类型 | 默认值 | 说明 |
| :--- | :---: | :---: | :--- |
| `antigravityStatus.proxyUrl` | `string` | `""` | 自定义代理服务器地址 (例如 `http://127.0.0.1:7890`)。留空则自动继承系统环境变量或直连，绝不强制指定端口 |
| `antigravityStatus.statusBarClickAction` | `string` | `"dashboard"` | 点击状态栏时的行为：`"dashboard"`（打开仪表盘）或 `"menu"`（弹出快捷菜单） |
| `antigravityStatus.displayFormat` | `string` | `"standard"` | 状态栏显示格式：`standard`（5h配额 + 周配额 + 今日Token）、`5h-only`、`compact`、`full` |
| `antigravityStatus.refreshIntervalSeconds` | `number` | `5` | 自动刷新间隔（秒），极低 CPU 开销（0.1ms 读取本地缓存） |
| `antigravityStatus.autoSyncOnlineOnTurn` | `boolean` | `true` | 当对话轮次完成时，是否在后台自动向 Google Cloud 校验最新配额 |
| `antigravityStatus.agySwitchPath` | `string` | `""` | `agy-switch` 可执行文件自定义路径。留空则自动检测主流安装位置 |

---

## 🚀 安装与构建

### 方式一：直接安装打包好的 VSIX（推荐）

1. 从项目根目录下载生成的 `antigravity-status-bar-1.5.2.vsix`；
2. 打开 VS Code，按下 `Ctrl + Shift + P`（macOS: `Cmd + Shift + P`）；
3. 输入并选择 **`Extensions: Install from VSIX...`**；
4. 选择 `antigravity-status-bar-1.5.2.vsix` 文件完成安装；
5. 右下角将立刻显示反重力状态栏！

### 方式二：源码构建

```bash
# 1. 安装依赖
npm install

# 2. 编译 TypeScript
npm run compile

# 3. 打包为 VSIX 安装包
npx vsce package --no-git-tag-version --allow-missing-repository
```

---

## 📄 开源许可 (License)

本项目基于 MIT License 许可开源。
