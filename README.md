# AI Resume · 本地 AI 简历工作台

> 本地优先 · 隐私默认保护 · 用户可控 · AI 辅助而非自动覆盖 · 结构化数据驱动

一个运行在本机的 AI 辅助简历编辑工具：上传简历自动解析为结构化数据，按模块编辑、拖拽排序，粘贴 JD 获取匹配分析，针对单个模块获取 AI 优化建议（确认后才应用），双模板预览并导出 A4 PDF。**默认数据不出本机，外部模型需显式开启。**

---

## 快速开始

```bash
# 方式一：一键启动脚本
./start.sh            # macOS / Linux
start.bat             # Windows

# 方式二：手动
npm install
npm run dev           # 开发模式 → http://localhost:3000
npm run build         # 生产构建 → dist/（可直接静态托管 dist/index.html）

# 运行单元测试（核心解析 / 匹配 / AI 引擎）
npx vitest run
```

要求：Node.js ≥ 18。可选：本地安装 [Ollama](https://ollama.com) 以启用本地大模型建议。

---

## 与设计文档（PRD）的交付对照

### MVP 功能（§4.1，全部实现）

| 编号 | 模块 | 状态 | 实现位置 |
|---|---|---|---|
| FR-01 | 文件上传（PDF/DOCX/MD/TXT，≤10MB，拖拽或点击，类型/大小校验） | ✅ | `pages/Home.tsx`、`lib/parser.ts` |
| FR-02 | 文档解析为结构化 Resume JSON（状态机 pending→success/failed，失败可降级） | ✅ | `lib/parser.ts`（pdfjs / mammoth / 规则引擎） |
| FR-03 | 手动粘贴兜底（解析失败自动给入口，空内容提示） | ✅ | `pages/Home.tsx` |
| FR-04 | 简历编辑器（8 类模块、Block 全字段编辑、增删移动、显隐、1s 自动保存） | ✅ | `pages/Editor.tsx`、`components/blocks.tsx` |
| FR-05 | 模板预览（现代单栏 + 经典 ATS、主题色、字号、模块显隐与排序联动） | ✅ | `components/template.tsx` |
| FR-06 | JD 粘贴输入与结构化解析（岗位/职责/要求/技能/关键词/学历/年限） | ✅ | `lib/jd.ts`、`components/panels.tsx` |
| FR-07 | JD 匹配（技能/关键词/经历相关性/表达质量四维评分 + 缺失项 + 建议） | ✅ | `lib/jd.ts` |
| FR-08 | AI 单块建议（润色/改写/量化/缩短/扩写/JD对齐/ATS优化，7 种动作） | ✅ | `lib/ai.ts`、`lib/store.ts` |
| FR-09 | AI 建议确认（Diff 对比、接受/拒绝/编辑后接受，绝不直接覆盖） | ✅ | `components/panels.tsx` |
| FR-10 | 模型管理（Ollama + OpenAI Compatible，测试连接，路由策略，外部默认关闭） | ✅ | `pages/Models.tsx`、`lib/ai.ts` |
| FR-11 | PDF 导出（当前模板/顺序/显隐，中文正常，文本可复制，A4） | ✅ | `pages/Editor.tsx`（打印管线） |
| FR-12 | 本地存储（持久化，刷新不丢） | ✅ | `lib/store.ts`（zustand persist） |
| FR-13 | 数据删除（删简历级联清理、清空全部、备份/恢复） | ✅ | `pages/Settings.tsx` |
| FR-14 | 模块顺序拖拽（左侧大纲 + 编辑区双入口，实时保存，导出一致） | ✅ | `pages/Editor.tsx`（dnd-kit） |

### 最终交付物（§24）

| 交付物 | 状态 | 说明 |
|---|---|---|
| 可运行前端 | ✅ | `npm run dev` / `npm run build` |
| 可运行后端 | ⚠️ 形态适配 | 见下方「架构适配说明」：后端职责由浏览器内服务层承担 |
| 本地数据 | ⚠️ 形态适配 | SQLite → 浏览器 localStorage（键 `ai-resume-workbench-v1`），结构等价 |
| 本地文件目录 | ⚠️ 形态适配 | `~/.ai-resume/` → 浏览器存储；设置页提供目录映射说明 |
| 模型配置页 | ✅ | 「模型与隐私」页 |
| ≥2 套简历模板 | ✅ | 现代单栏 / 经典 ATS |
| 模块拖拽排序 | ✅ | Section 级，`order` 持久化 |
| PDF 导出 | ✅ | 系统打印管线（A4，中文，文本可选中复制） |
| 单元测试 | ✅ | `src/lib/__tests__/`（parser / jd / ai / utils），`npx vitest run` |
| 本地启动脚本 | ✅ | `start.sh` / `start.bat` |
| README 使用说明 | ✅ | 本文档 |

### 架构适配说明

PRD 原设计为 Next.js + FastAPI 双端架构。本项目交付为**纯前端本地应用**（单页、可离线静态托管），这是为「本地部署 / 单机私有化」目标做的等价下沉，所有后端职责在浏览器内完成：

| PRD 设计 | 本实现 | 等价性 |
|---|---|---|
| FastAPI 服务 | 浏览器内服务层（`lib/parser.ts`、`lib/jd.ts`、`lib/ai.ts`、`lib/store.ts`） | 接口化的 Parser / LLM Provider / 模板渲染，逻辑一致 |
| SQLite + 文件目录 | localStorage（结构化 JSON，zustand persist） | 同样本地、可备份、可清空 |
| PyMuPDF / python-docx | pdfjs-dist / mammoth（WASM/JS 实现） | 同为文本提取，失败可降级 |
| Playwright 导出 PDF | 浏览器打印管线（A4 @media print，打印节点 portal 挂载） | 文本可复制、中文正常、按用户顺序 |
| `~/.ai-resume/` | 浏览器存储 + JSON 备份文件 | 设置页一键备份 / 恢复 / 清空 |

该适配反而强化了隐私目标：**零服务端进程、零默认网络请求**，除用户显式配置的模型端点外不发起任何外部调用。

---

## 使用指南

### 1. 创建简历（三种方式）

- **上传文件**：拖拽或点击选择 `.pdf / .docx / .md / .txt`（≤10MB）。系统按「校验 → 提取文本 → 规则结构化 → 生成草稿」四步流水线解析；
- **粘贴文本**：解析失败时自动切换到此页签，也可直接粘贴简历全文；
- **空白/示例**：完全手动，或载入内置示例简历体验全流程（示例仅在主动点击时写入，不会自动生成假数据）。

> 扫描件 PDF 无可提取文本时会明确提示，并引导改用粘贴方式（PRD §6.2.1）。

### 2. 编辑器

- **左栏 · 模块大纲**：拖拽调整模块顺序、开关显隐、添加自定义模块；
- **中栏 · 编辑区**：每个模块卡片支持整卡拖拽排序、Block 增删、上移/下移、显隐；所有字段（标题/副标题/起止时间/描述/bullets/技能标签）即时编辑；
- **右栏 · AI 与 JD 面板**：见下两节；
- **自动保存**：停止输入约 1 秒后写入本地，顶栏显示保存时间戳。

### 3. 模块拖拽排序（FR-14）

左侧大纲与编辑区拖拽手柄均可调整 Section 顺序，松手即按 `order` 升序持久化；隐藏模块保留位置；重新打开、切换模板、导出 PDF 均与编辑器顺序一致。

### 4. JD 匹配

右侧面板粘贴 JD → 「解析 JD」提取岗位名/职责/要求/技能/关键词 → 「分析匹配度」输出：

- 综合分 + 四维评分（技能匹配 / 关键词覆盖 / 经历相关性 / 表达质量）；
- `missing_skills`、`missing_keywords` 清单；
- 逐条优化建议。匹配完全由本地规则引擎完成，不依赖大模型。

### 5. AI 单块建议

在任一 Block 的工具栏选择动作（润色 / 改写 / 量化 / 缩短 / 扩写 / JD 对齐 / ATS 优化）：

- 建议以**原文 vs 建议 Diff** 展示，可接受、拒绝或编辑后接受，原内容永远不会被直接覆盖；
- 模型不可达时**自动降级为本地规则引擎**并明确标注；
- 所有输出经 JSON Schema 校验，非法输出自动重试一次，仍失败则报错保留原文（PRD §6.2.3）。

### 6. 配置模型

「模型与隐私」页预置本地 Ollama 配置：

```
协议：ollama    Base URL：http://localhost:11434    模型：qwen2.5:7b
```

- 启动 Ollama 并 `ollama pull qwen2.5:7b` 后点「测试」即可验证；
- 也可新增 OpenAI Compatible 外部模型（`/v1/chat/completions` 协议）；
- 路由策略：`local_first`（默认）/ `ask_before_external` / `local_only`；
- **外部模型默认关闭**；开启后每次外部调用前弹窗确认，界面始终提示正在使用的外部主机。

### 7. 导出 PDF

编辑器「预览 / 导出」→ 选择缩放浏览 A4 效果 → 「打印 / 导出 PDF」调用系统打印面板，目标选「另存为 PDF」。导出严格遵循当前模板、主题色、字号、模块顺序与显隐状态；推荐文件名 `resume_{姓名}_{日期}.pdf`。

### 8. 数据管理

「数据管理」页：查看本地数据概览与目录映射、下载 JSON 备份、从备份恢复、清空全部数据（二次确认）。

---

## 隐私与安全

- 默认不上传任何数据、不发遥测、不请求外部服务；
- 外部模型必须显式开启，调用前逐次确认；
- API Key 界面掩码展示，不写入日志；
- 解析失败、AI 失败、导出失败均有兜底，不丢失用户已编辑内容。

---

## 技术栈

React 18 · TypeScript · Vite 6 · Tailwind CSS 4 · Zustand（persist 本地持久化）· dnd-kit（拖拽）· pdfjs-dist（PDF 提取）· mammoth（DOCX 提取）· Vitest（单元测试）

## 项目结构

```
src/
├── pages/            工作台 / 编辑器 / 模型与隐私 / 数据管理
├── components/       Block 编辑器 · 面板（大纲/AI/JD）· 模板渲染 · UI 原子 · 图标
├── lib/
│   ├── parser.ts     文档解析（Parser 接口化 + 规则结构化）
│   ├── jd.ts         JD 解析与匹配（本地规则）
│   ├── ai.ts         LLM Gateway（Ollama / OpenAI Compatible / 路由 / 校验 / 规则兜底）
│   ├── store.ts      全局状态与本地持久化
│   └── __tests__/    单元测试
└── types.ts          与 PRD §10/§11 对齐的数据模型
```
