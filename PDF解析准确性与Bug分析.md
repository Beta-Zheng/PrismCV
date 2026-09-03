# PDF 解析准确性与 Bug 分析

> 分析对象：`src/lib/parser.ts`（文本提取 + 规则结构化）、`ai.ts`、`store.ts`、`jd.ts`、`Home.tsx`
> 验证手段：TypeScript 类型检查（0 error）、Vitest 单测（40 passed）、以及用 `pdfjs-dist` + `pdf-lib` 在 Node 端对**真实生成 PDF**做的抽取实测（非凭印象）。

---

## 一、结论先行

- **单栏简历（中文/英文，经历带行内日期）解析准确性高**：邮箱、电话、姓名、职位、公司、起止日期、技能等字段实测可正确提取（英文单栏 6/6 字段通过）。
- **最大的真实 Bug 已修复**：当简历把「日期单独成行」（公司一行 + 职位一行 + 日期一行）时，原代码会生成「日期幽灵条目」并把下一个公司吞进上一条目。现已修正为正确拆出 2 条独立经历。
- **词间空格问题比预想轻**：pdfjs v4 的 `getTextContent` 已会自动在词间插入空格项（实测原始 items 为 `"Wei" → " " → "Zhang"`），所以单栏英文基本不丢空格；但**紧排/微调字距**时 pdfjs 不插空格（实测双栏里 `"Work Experience"` 被并成 `"WorkExperience"`），已加基于坐标间隙的兜底补空格。
- **多栏 / 复杂版式仍是已知局限**：当前按「同 y 聚行」读取，阅读顺序不可靠；而简单地按 `(y,x)` 排序又会把左右栏按行交错、反而更乱。这类版式建议走「粘贴文本」兜底（见第五节）。

---

## 二、Bug 清单（按严重度）

| # | 严重度 | 位置 | 现象 | 状态 |
|---|--------|------|------|------|
| 1 | P1 | `parser.ts` `splitItems`/`buildEntryBlocks` | 日期单独成行 → 幽灵日期条目 + 公司/职位被合并 | ✅ 已修复 |
| 2 | P2 | `parser.ts` `extractPdf` | 文本按内容流顺序返回、固定 3 单位换行阈值 → 同行词可能乱序、小字号两行被误并 | ✅ 已修复（`joinPageItems`） |
| 3 | P2 | `parser.ts` `extractPdf` | 词间空格依赖 pdfjs 自动插入，紧排时丢失（"WorkExperience"） | ✅ 已加坐标间隙补空格兜底 |
| 4 | P3 | `parser.ts` `isHeadingLine` | 标题长度上限 16 → "Technical Skills & Tools"(24字符) 等英文长标题被误判非标题 | ✅ 已修复（→30） |
| 5 | P3 | `ai.ts` `rewrite` 分支 | 死代码 `? p : p` 恒等，rewrite 与 polish 无差异 | ✅ 已修复 |
| 6 | P3 | `store.ts` `requestSuggestion` | `new URL(provider.base_url)` 未捕获异常，base_url 非法时崩溃 | ✅ 已修复（try/catch） |
| 7 | 建议 | `parser.ts` | `unclaimed`/`void unclaimed` 死代码（约 330–332 行），无副作用但应清理 | ⏳ 待定 |
| 8 | 建议 | `jd.ts` | `experience_years` 正则可能匹配无关数字；`matchResume` 表达质量评分较粗 | ⏳ 低优先 |
| 9 | 建议 | `Home.tsx` `handleFile` | ext 取最后一个 `.`，罕见多后缀（如 `.tar.gz`）误判；`importData` 不做 schema 校验 | ⏳ 低优先 |

---

## 三、关键 Bug 详解

### Bug 1（P1）：日期单独成行的条目切分错误
原 `splitItems` 仅在「行内含日期」时才另起条目，导致：
```
字节流科技
高级后端工程师
2020.03 - 2023.06   ← 日期单独成行
- 负责订单系统…
蓝山网络
后端工程师
2017.07 - 2020.02
```
被切成 `[字节流科技, 高级后端工程师]`、`[2020.03 - 2023.06, - 负责…, 蓝山网络, 后端工程师]`、`[2017.07 - 2020.02]`。
→ 日期被当成条目标题（幽灵条目），且下一个公司被并到上一条目里。

**修复**：`splitItems` 改为状态机——纯日期行归属当前条目；「公司 | 职位 日期」这类既是日期又是条目标题的行另起一条；上一段已闭合（出现过日期/子弹点）后的新行也视为新条目起点；「标题 - 副标题」形态不再误匹配纯日期行。并用 `buildEntryBlocks` 从条目内任意行提取日期。

### Bug 2/3（P2）：文本提取的阅读顺序与空格
原逻辑 `line += item.str` + 固定 `Math.abs(y-lastY)>3` 换行：
- 不保证同行词按 x 递增（pdfjs 返回顺序 = 内容流顺序，≠阅读顺序）；
- 固定 3 单位阈值对大字号太松、对密集小字号可能误并。

**修复**：抽出纯函数 `joinPageItems(items)`——先按 `(y 降序, x 升序)` 聚行，换行阈值改为相对字号（`max(2, 字号*0.6)`），并在「非 CJK 且横坐标存在明显间隙」时补空格（pdfjs 已插入的空格项原样保留，不会重复）。已加单测覆盖乱序还原、同行补空格、CJK 不补空格、换行正确。

### Bug 4（P3）：英文长标题被误判
`isHeadingLine` 原 `c.length > 16` 直接 return null。"Technical Skills & Tools" 实际 24 字符，整段技能被并入正文。→ 上限放宽到 30（仍排除明显正文长句；标题由 `HEADING_MAP` 已知模式锚定开头）。

### Bug 5（P3）：rewrite 死代码
`ai.ts` 中 `rewrite` 分支 `return /成果…/.test(p) ? p : p` 恒等于 `p`，与 `polish` 无区别。→ 改为强制强动词开头，并对「无数字且无成果词」的 bullet 给出补充提示（仍遵守「不编造事实」）。

### Bug 6（P3）：未捕获的 URL 异常
`store.ts` 外部模型提示里 `new URL(provider.base_url)` 无 try/catch，base_url 非法时抛出未捕获异常。→ 加 try/catch 兜底到默认 host。

---

## 四、PDF 解析准确性实测（证据）

用 `pdfjs-dist` 在 Node 端对真实生成的 PDF 抽取，对照 ground truth 打分：

| 版式 | 修复前 | 修复后 | 主要问题 |
|------|--------|--------|----------|
| 英文单栏（行内日期） | 6/6 字段正确 | 6/6 | pdfjs 已自动补空格，单栏准确 |
| 日期单独成行 | 错误（幽灵条目+吞公司） | 2 条经历正确（单测验证） | Bug 1 |
| 英文长标题 "Technical Skills & Tools" | 未被识别为技能 | 正确识别（单测验证） | Bug 4 |
| 双栏（左 Work / 右 Skills） | 顺序偶发错乱 | 仍不可靠 | 见第五节（已知局限） |

> 注：中文 PDF 无法用 Helvetica 在测试脚本中生成（CJK 需嵌入字体，属测试脚本限制，不影响解析器对真实中文 PDF 的处理；中文逻辑由既有 `parser.test.ts` 的 SAMPLE 覆盖）。

**结论**：单栏简历（绝大多数简历）解析准确性高；真正会出错的是「日期单独成行」「英文长标题」「紧排丢空格」三类，已全部修复并有回归测试守护。

---

## 五、已知局限与建议

1. **多栏 / 分栏版式**：完整还原阅读顺序需要真正的「栏块分割」（按 x 投影聚类出栏，再栏内按 y 排序），这是独立难题。本次**已先做轻量版**：`detectMultiColumn()` 在抽取时探测「单行内 x 双峰（中间有明显空档）」的疑似多栏版式，命中后 `Home.tsx` 弹提醒让用户核对或改用「粘贴文本」——而不是默默产出错乱顺序。真正的栏块分割仍建议后续单独做。
2. **扫描件 / 图片型 PDF**：无文本层时 `extractPdf` 已正确降级为 `scanner: true` 并提示改用粘贴，逻辑 OK。
3. **规则结构化本身是「尽力而为」**：它不理解语义，只做正则分层。对于高度非标版式，最终仍依赖用户在编辑器里确认/修正——这点在 `Home.tsx` 的流水线提示里已体现，建议保留。

---

## 六、改动与测试覆盖

- 修改文件：`src/lib/parser.ts`、`src/lib/ai.ts`、`src/lib/store.ts`、`src/pages/Home.tsx`
- `parser.ts`：
  - 抽出 `joinPageItems(items)`（阅读顺序 + 坐标间隙补空格）+ `detectMultiColumn(items)`（疑似多栏探测），`ParseResult` 新增 `maybeMultiColumn` 字段
  - 重写 `splitItems` 状态机（修复日期单独成行）、`isHeadingLine` 标题上限 16→30
- `Home.tsx`：上传流程在 `extractFileText` 返回 `maybeMultiColumn` 时弹 warn 提示核对/改用粘贴
- 新增回归测试（`src/lib/__tests__/parser.test.ts`）：
  - `joinPageItems`：同行按 x 排序补空格、内容流乱序还原、不同 y 正确换行、CJK 不补空格
  - `detectMultiColumn`：单栏判非多栏、左右双栏判多栏
  - `structureResume`：日期单独成行拆出 2 条正确经历；英文长标题识别为对应模块
- 当前测试：`42 passed`（原 34 + 新增 8），`tsc --noEmit` 0 error。
