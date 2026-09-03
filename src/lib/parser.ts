/* ------------------------------------------------------------------
 * 文档解析：文件 → 原始文本 → 规则结构化 → Resume JSON
 * Parser 接口化（canParse / parse），失败必须可降级
 * ------------------------------------------------------------------ */
import type { BasicInfo, Block, BlockType, ResumeData, Section, SectionType } from "../types";
import { uid, nowISO } from "./utils";

// pdfjs-dist 按需动态加载：不进入初始包，避免第三方解析库影响首屏启动

export type SupportedExt = "pdf" | "docx" | "md" | "txt";
export const ACCEPT_EXTS: SupportedExt[] = ["pdf", "docx", "md", "txt"];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface ParseResult {
  ok: boolean;
  text?: string;
  error?: string;
  scanner?: boolean; // PDF 无可提取文本
  maybeMultiColumn?: boolean; // 疑似多栏/分栏版式，阅读顺序可能不准确
}

/* ---------------- PDF 文本项 → 文本行 ---------------- */
/* pdfjs 的 getTextContent 已会在词间插入空格项，但仍有两类失真需要兜底：
 *   1) 同一视觉行的词可能不是按 x 递增返回（内容流顺序 ≠ 阅读顺序）；
 *   2) 紧排/微调字距时 pdfjs 不会补空格，导致 "WorkExperience" 粘连。
 * 这里按 (y 降序, x 升序) 聚行、并按横坐标间隙补空格来修正。 */

interface PageTextItem {
  str: string;
  transform: number[]; // [a,b,c,d,e,f]，e/f 为 x/y 平移
  width?: number;
  height?: number;
}

function clusterLines(items: PageTextItem[]): PageTextItem[][] {
  const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
  const lines: PageTextItem[][] = [];
  let cur: PageTextItem[] = [];
  let curY: number | null = null;
  let curSize = 12;
  for (const it of sorted) {
    const y = it.transform[5];
    const size = Math.hypot(it.transform[0], it.transform[1]) || 12;
    // 换行阈值改为相对字号（约 0.6 倍行高），避免小字号两行被误并、也避免单行被拆断
    if (curY === null || Math.abs(y - curY) <= Math.max(2, curSize * 0.6)) {
      cur.push(it);
    } else {
      lines.push(cur);
      cur = [it];
    }
    curY = y;
    curSize = size;
  }
  if (cur.length) lines.push(cur);
  for (const ln of lines) ln.sort((a, b) => a.transform[4] - b.transform[4]);
  return lines;
}

const CJK_RE = /[一-鿿㐀-䶿]/;
function isCjk(s: string): boolean {
  return CJK_RE.test(s);
}

/** 把一页文本项按「栏」切分（基于 x 坐标的栏间空档）。
 *  单栏页返回 [items]（不切分）；双栏页按最大的栏间空档切成左右两栏，
 *  每栏各自按 y 降序排列，从而保证「左栏从上到下 → 右栏从上到下」的正确阅读顺序，
 *  避免 clusterLines 把左右栏交错并成「同一视觉行」导致的顺序错乱。 */
function splitIntoColumns(items: PageTextItem[]): PageTextItem[][] {
  if (items.length < 6) return [items];
  const meta = items.map((it) => {
    const x = it.transform[4];
    const w = it.width ?? 0;
    return { x0: x, x1: x + w, xc: x + w / 2, it };
  });
  const minX = Math.min(...meta.map((m) => m.x0));
  const maxX1 = Math.max(...meta.map((m) => m.x1));
  const pageW = maxX1 - minX;
  if (pageW < 120) return [items];
  const sorted = [...meta].sort((a, b) => a.xc - b.xc);
  // 项间空档大于阈值（页宽 8% 且绝对值 > 18）才视为栏间空档；过小仅是词/字间距
  const gaps: Array<{ pos: number; size: number }> = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].x0 - sorted[i - 1].x1;
    if (gap > Math.max(18, pageW * 0.08)) gaps.push({ pos: (sorted[i - 1].x1 + sorted[i].x0) / 2, size: gap });
  }
  if (!gaps.length) return [items];
  // 取最大空档作为切分线（v1 单切分 → 两栏，覆盖绝大多数简历双栏场景）
  const split = gaps.sort((a, b) => b.size - a.size)[0].pos;
  const left = meta.filter((m) => m.xc < split).map((m) => m.it);
  const right = meta.filter((m) => m.xc >= split).map((m) => m.it);
  // 两侧都要有足够内容，否则视为单行内偶然的大间距（如拉开字距的标题），不切分
  if (left.length < 2 || right.length < 2) return [items];
  return [left, right];
}

function joinColumnLines(lines: PageTextItem[][]): string {
  const out: string[] = [];
  for (const ln of lines) {
    let line = "";
    let lastX: number | null = null;
    let lastW = 0;
    let lastSize = 12;
    for (const it of ln) {
      const str = it.str ?? "";
      if (!str) continue;
      const x = it.transform[4];
      const size = Math.hypot(it.transform[0], it.transform[1]) || 12;
      const w = it.width ?? 0;
      const gap = lastX !== null ? x - (lastX + lastW) : 0;
      // 仅在非 CJK 且横坐标存在明显间隙时补空格；pdfjs 已插入的空格项原样保留
      const needsSpace =
        lastX !== null && gap > lastSize * 0.18 && !isCjk(str[0] ?? "") && !isCjk(line.slice(-1)) && !/^\s/.test(str);
      line += (needsSpace ? " " : "") + str;
      lastX = x;
      lastW = w;
      lastSize = size;
    }
    if (line.trim()) out.push(line.trim());
  }
  return out.join("\n");
}

export function joinPageItems(items: PageTextItem[]): string {
  const columns = splitIntoColumns(items);
  if (columns.length <= 1) return joinColumnLines(clusterLines(items));
  // 多栏：每栏内部按 y 降序（上→下），栏与栏之间用空行隔开，保证阅读顺序正确
  return columns.map((col) => joinColumnLines(clusterLines(col))).join("\n\n");
}

/* 多栏探测：clusterLines 会把同一 y 的左右栏并到「同一视觉行」，所以双栏的真实特征是
 * 单行内部 x 坐标呈双峰（中间有明显空档）。命中后由 UI 提示用户核对/改用粘贴，
 * 而非默默产出错乱的阅读顺序（完整栏块分割属独立工程，暂不做）。 */
export function detectMultiColumn(items: PageTextItem[]): boolean {
  const lines = clusterLines(items);
  if (lines.length < 3) return false;
  for (const ln of lines) {
    if (ln.length < 3) continue;
    const xs = ln
      .map((it) => it.transform[4] + (it.width ?? 0) / 2)
      .sort((a, b) => a - b);
    const lineW = xs[xs.length - 1] - xs[0];
    if (lineW < 200) continue; // 单行不够宽，不是双栏特征
    let maxGap = 0;
    for (let i = 1; i < xs.length; i++) maxGap = Math.max(maxGap, xs[i] - xs[i - 1]);
    // 行内出现明显空档（> 行宽 25%）即判定为双栏
    if (maxGap > lineW * 0.25) return true;
  }
  return false;
}

/* ---------------- 文本提取（按文件类型分发） ---------------- */

async function extractPdf(file: File): Promise<ParseResult> {
  try {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const parts: string[] = [];
    let maybeMultiColumn = false;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      if (detectMultiColumn(tc.items as PageTextItem[])) maybeMultiColumn = true;
      parts.push(joinPageItems(tc.items as PageTextItem[]));
    }
    await doc.destroy();
    const text = parts.map((l) => l.trim()).filter(Boolean).join("\n");
    if (text.replace(/\s/g, "").length < 20) {
      return { ok: false, scanner: true, error: "该 PDF 未包含可提取文本（可能是扫描件），请改用「粘贴文本」方式创建" };
    }
    return { ok: true, text, maybeMultiColumn };
  } catch (e) {
    return { ok: false, error: `PDF 解析失败：${e instanceof Error ? e.message : "未知错误"}` };
  }
}

async function extractDocx(file: File): Promise<ParseResult> {
  try {
    const mammoth = await import("mammoth");
    const buf = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    const text = (res.value || "").trim();
    if (!text) return { ok: false, error: "DOCX 内容为空或无法读取" };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: `DOCX 解析失败：${e instanceof Error ? e.message : "未知错误"}` };
  }
}

async function extractText(file: File): Promise<ParseResult> {
  const text = (await file.text()).trim();
  if (!text) return { ok: false, error: "文件内容为空" };
  return { ok: true, text };
}

export async function extractFileText(file: File, ext: SupportedExt): Promise<ParseResult> {
  if (ext === "pdf") return extractPdf(file);
  if (ext === "docx") return extractDocx(file);
  return extractText(file);
}

/* ---------------- 规则结构化：纯文本 → Resume JSON ---------------- */

const HEADING_MAP: Array<{ type: SectionType; re: RegExp }> = [
  { type: "summary", re: /^(个人总结|个人简介|自我评价|自我总结|职业总结|summary|profile|about\s*me|objective)/i },
  { type: "work_experience", re: /^(工作经历|工作经验|职业经历|任职经历|work\s*experience|experience|employment)/i },
  { type: "project_experience", re: /^(核心)?项目(?:经历|经验|实践)|projects?|project\s*experience/i },
  { type: "education", re: /^(教育经历|教育背景|学习经历|education)/i },
  { type: "skills", re: /^(专业技能|技能清单|技术栈|技能特长|技能|technical\s*skills|skills|technologies)/i },
  { type: "certifications", re: /^(证书奖项|荣誉证书|获奖情况|资格证书|证书|荣誉|奖项|certifications?|awards?|honors?)/i },
];

const DATE_RANGE_RE =
  /((?:19|20)\d{2})\s*[.\-/年]\s*(1[0-2]|0?[1-9])?\s*月?\s*(?:[-–—~至到]+\s*((?:19|20)\d{2})\s*[.\-/年]?\s*(1[0-2]|0?[1-9])?\s*月?|[-–—~至到]+\s*(至今|今|现在|present|now))/i;
const DATE_SINGLE_RE = /((?:19|20)\d{2})\s*[.\-/年]\s*(1[0-2]|0?[1-9])?\s*月?/;
const EMAIL_RE = /[^\s@]+@[\w-]+(?:\.[\w-]+)/;
const PHONE_RE = /(?:\+?86[-\s]?)?1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}|\d{3}[-.\s]\d{4}[-.\s]\d{4}/;
const URL_RE = /(?:https?:\/\/)?(?:www\.)?[\w-]+\.(?:com|cn|io|dev|me|net|org|top)(?:\/\S*)?/i;

function cleanLine(l: string): string {
  return l.replace(/^#{1,4}\s*/, "").replace(/[_`>]/g, "").trim();
}

/** 剥离标题行的「包装」字符：emoji / 序号 / 括号说明 / 首尾标点，
 *  仅保留可锚定 HEADING_MAP 的核心标题文本。例：
 *  「💼 工作经历」→「工作经历」、「🚀 核心项目经历（选填，用于补充重大战役）」→「核心项目经历」。 */
function stripHeadingWrapper(line: string): string {
  let c = line.trim();
  c = c.replace(/[（(][^）)]*[）)]\s*$/, ""); // 尾部括号说明，如（选填…）
  c = c.replace(/^[^\u4e00-\u9fa5a-zA-Z0-9]+/, ""); // 首部非中英文数字（emoji、符号）
  c = c.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]+$/, ""); // 尾部非中英文数字
  c = c.replace(/^[【《\[（]\s*/, ""); // 左书名号/方括号
  c = c.replace(/\s*[】》\]）]\s*$/, ""); // 右书名号/方括号
  const hasDate = DATE_RANGE_RE.test(c) || DATE_SINGLE_RE.test(c);
  if (!hasDate) {
    c = c.replace(/^[一二三四五六七八九十百]+\s*[、.．)）]\s*/, ""); // 中文序号
    c = c.replace(/^\d{1,2}\s*[.．)）]\s*/, ""); // 数字序号
  }
  c = c.replace(/^[\s]*[■●◆▎▪▫●○◇◆□■▪]\s*/, ""); // 项目符号
  return c.trim();
}

function isHeadingLine(l: string): SectionType | null {
  const c = stripHeadingWrapper(cleanLine(l)).replace(/[:：\s]+$/, "");
  // 长度上限放宽到 30，避免 "Technical Skills & Tools" 这类英文长标题被误判为非标题，
  // 同时仍排除明显是正文的超长句（标题通常由 HEADING_MAP 的已知模式锚定开头）
  if (c.length > 30) return null;
  for (const h of HEADING_MAP) if (h.re.test(c)) return h.type;
  return null;
}

function fmtDate(y: string, m?: string): string {
  if (!y) return "";
  return m ? `${y}-${String(m).padStart(2, "0")}` : y;
}

function parseDates(line: string): { start: string; end: string; rest: string } {
  const range = line.match(DATE_RANGE_RE);
  if (range) {
    const start = fmtDate(range[1], range[2]);
    const end = range[5] ? "至今" : fmtDate(range[3], range[4]);
    return { start, end, rest: line.replace(range[0], "").replace(/[|｜·•,，\s]+$/, "").replace(/^[|｜·•,，\s]+/, "") };
  }
  const single = line.match(DATE_SINGLE_RE);
  if (single) {
    return { start: fmtDate(single[1], single[2]), end: "", rest: line.replace(single[0], "").replace(/[|｜·•,，\s]+$/, "").replace(/^[|｜·•,，\s]+/, "") };
  }
  // 兜底：独立年份（如「AWS Solutions Architect 2021」），满足「日期尽量转为 YYYY」
  const yearOnly = line.match(/\b((?:19|20)\d{2})\b|((?:19|20)\d{2})$/);
  if (yearOnly) {
    const y = yearOnly[1] || yearOnly[2];
    return { start: y, end: "", rest: line.replace(y, "").replace(/[|｜·•,，\s]+$/, "").replace(/^[|｜·•,，\s]+/, "").trim() || line };
  }
  return { start: "", end: "", rest: line };
}

function mkBlock(type: BlockType, partial: Partial<Block> = {}): Block {
  return {
    block_id: uid("blk"),
    type,
    title: "",
    subtitle: "",
    start_date: "",
    end_date: "",
    location: "",
    description: "",
    bullets: [],
    skills: [],
    links: [],
    visible: true,
    order: 0,
    ...partial,
  };
}

function splitTitleLine(line: string): { title: string; subtitle: string } {
  const seps = [" | ", "｜", " - ", " — ", " · ", "·", "|"];
  for (const s of seps) {
    const idx = line.indexOf(s);
    if (idx > 0 && idx < line.length - 1) {
      return { title: line.slice(0, idx).trim(), subtitle: line.slice(idx + s.length).trim() };
    }
  }
  return { title: line.trim(), subtitle: "" };
}

/** 将一段 section 内的行切分为若干条目。
 *  条目起点：含「公司 | 职位」分隔符、含行内日期、或「标题 - 副标题」形态的行；
 *  上一段已闭合（出现过日期/子弹点）后的新行也视为新条目起点，从而支持
 *  「日期单独成行」「公司 / 职位分行」等常见版式，避免生成「日期幽灵条目」。 */
function isBulletLine(l: string): boolean {
  return /^[-•·▪◦*]\s/.test(l) || /^\d+[.、)]\s/.test(l);
}
function isDateLine(l: string): boolean {
  return DATE_RANGE_RE.test(l) || DATE_SINGLE_RE.test(l);
}
function isEntryHeader(l: string): boolean {
  if (/[|｜]/.test(l)) return true; // 含「公司 | 职位」分隔符
  if (isDateLine(l)) return false; // 纯日期行不是条目头（避免 "2020.03 - 2023.06" 被误判）
  return /^.{1,40}[—–-]\s*.{1,40}$/.test(l); // 仅非日期的「标题 - 副标题」形态
}
// 含日期且日期之后仍有实质内容（公司/职位）的行，视为新条目起点，
// 例如「2023.07 - 至今 | 某公司 | 职位」；纯日期行（如「2020.03 - 2023.06」）不算。
function isDateWithContent(l: string): boolean {
  const d = parseDates(l);
  return !!d.start && d.rest.trim().length >= 2;
}

function splitItems(lines: string[]): string[][] {
  const items: string[][] = [];
  let cur: string[] = [];
  for (const raw of lines) {
    const l = raw;
    if (isBulletLine(l)) {
      cur.push(l);
      continue;
    }
    if (isDateLine(l)) {
      // 纯日期行归属到当前条目；含日期+内容的行（如「日期 | 公司 | 职位」）另起一条；
      // 「公司 | 职位 日期」这类同时是条目标题的行也另起一条
      if (cur.length === 0) cur = [l];
      else if (isEntryHeader(l) || isDateWithContent(l)) { items.push(cur); cur = [l]; }
      else cur.push(l);
      continue;
    }
    // 普通行（公司 / 职位 / 描述）
    if (cur.length === 0) {
      cur = [l];
      continue;
    }
    const prevClosed = cur.some(isDateLine) || cur.some(isBulletLine);
    // 上一条目已闭合（出现过日期/子弹点）后，遇到「短标题行」（≤24 字且无分隔符）视为新条目起点，
    // 从而支持「公司 / 职位 / 日期分行」等版式；但长描述行视为续行，避免把多行纯文本描述拆散成幽灵条目。
    const isEntryStart = isEntryHeader(l) || (prevClosed && l.trim().length <= 24 && !/[|｜—–\-：:]/.test(l));
    if (isEntryStart) {
      items.push(cur);
      cur = [l];
    } else {
      cur.push(l);
    }
  }
  if (cur.length) items.push(cur);
  return items.filter((it) => it.some((l) => l.trim()));
}

function buildEntryBlocks(lines: string[], type: BlockType): Block[] {
  const items = splitItems(lines);
  return items.map((item) => {
    // 找到条目内的日期行（优先非首行，支持「日期单独成行」；首行含日期时由 parseDates 直接处理）
    let dateIdx = -1;
    for (let i = 1; i < item.length; i++) {
      if (isDateLine(cleanLine(item[i]))) {
        dateIdx = i;
        break;
      }
    }
    const first = cleanLine(item[0]);
    const { start: fs, end: fe, rest: frest } = parseDates(first);
    let start = fs;
    let end = fe;
    let work = item;
    if (dateIdx >= 0) {
      const d = parseDates(cleanLine(item[dateIdx]));
      if (!start) start = d.start;
      if (!end) end = d.end;
      work = item.filter((_, i) => i !== dateIdx);
    }
    const { title, subtitle } = splitTitleLine(frest || first);

    const bullets: string[] = [];
    const descParts: string[] = [];
    for (const raw of work.slice(1)) {
      const l = cleanLine(raw);
      if (!l) continue;
      const bm = l.match(/^[-•·▪◦*]\s*(.+)$/) || l.match(/^\d+[.、)]\s*(.+)$/);
      if (bm) bullets.push(bm[1].trim());
      else descParts.push(l);
    }
    // 副标题兜底：若标题行未拆出副标题，且存在一行较短的描述，则视为副标题（如「公司」「职位」分行）
    let sub = subtitle;
    if (!sub && descParts.length && descParts[0].length <= 40) {
      sub = descParts.shift()!;
    }
    return mkBlock(type, {
      title: title.slice(0, 80),
      subtitle: sub.slice(0, 80),
      start_date: start,
      end_date: end,
      bullets: bullets.slice(0, 12),
      description: descParts.slice(0, 6).join("\n"),
    });
  });
}

function parseSkillsLines(lines: string[]): Block[] {
  const groups: Block[] = [];
  const flat: string[] = [];
  for (const raw of lines) {
    const l = cleanLine(raw).replace(/^[-•·*]\s*/, "");
    if (!l) continue;
    const kv = l.match(/^(.{1,12})[:：]\s*(.+)$/);
    if (kv) {
      groups.push(
        mkBlock("skill_group", {
          title: kv[1].trim(),
          skills: kv[2].split(/[,，、/|;；\s]+/).map((s) => s.trim()).filter(Boolean).slice(0, 20),
        })
      );
    } else {
      flat.push(...l.split(/[,，、/|;；]+/).map((s) => s.trim()).filter(Boolean));
    }
  }
  if (flat.length) groups.push(mkBlock("skill_group", { title: "技能", skills: flat.slice(0, 30) }));
  if (!groups.length) groups.push(mkBlock("skill_group", { title: "技能", skills: [] }));
  return groups;
}

/** 核心：文本 → ResumeData。任何字段缺失都为空值，不报错 */
export function structureResume(rawText: string, source: ResumeData["metadata"]["source"], sourceName?: string): ResumeData {
  const lines = rawText.split(/\r?\n/).map((l) => l.replace(/\s+$/g, "")).filter((l) => l.trim() !== "");

  const basic: BasicInfo = { name: "", title: "", email: "", phone: "", location: "", website: "" };
  const emailM = rawText.match(EMAIL_RE);
  if (emailM) basic.email = emailM[0];
  const phoneM = rawText.match(PHONE_RE);
  if (phoneM) basic.phone = phoneM[0].trim();
  const urlM = rawText.match(URL_RE);
  if (urlM && (!basic.email || !basic.email.includes(urlM[0]))) basic.website = urlM[0];
  const locM = rawText.match(/(?:现居|所在地|居住|城市|地址)\s*[:：]\s*([\u4e00-\u9fa5A-Za-z]{2,10})/);
  if (locM) basic.location = locM[1];

  // 姓名：优先「姓名：xxx」，否则取首个短行
  const nameKv = rawText.match(/姓\s*名[:：]\s*([\u4e00-\u9fa5A-Za-z·]{2,12})/);
  if (nameKv) basic.name = nameKv[1];

  // 按标题切段
  const segments: Array<{ type: SectionType | "head"; lines: string[] }> = [];
  let cur: { type: SectionType | "head"; lines: string[] } = { type: "head", lines: [] };
  for (const l of lines) {
    const t = isHeadingLine(l);
    if (t && t !== cur.type) {
      segments.push(cur);
      cur = { type: t, lines: [] };
    } else if (t === cur.type) {
      // 重复标题忽略
    } else {
      cur.lines.push(l);
    }
  }
  segments.push(cur);

  const head = segments.find((s) => s.type === "head")?.lines ?? [];
  // 从头部提取姓名与职位
  for (const raw of head) {
    const l = cleanLine(raw);
    if (!l || EMAIL_RE.test(l) || PHONE_RE.test(l) || URL_RE.test(l) || DATE_RANGE_RE.test(l)) continue;
    if (!basic.name && /^[\u4e00-\u9fa5A-Za-z·]{2,10}$/.test(l)) {
      basic.name = l;
      continue;
    }
    if (!basic.title && l.length <= 24 && /(工程师|设计师|产品|运营|经理|专家|架构|开发|顾问|总监|实习|engineer|developer|designer|manager)/i.test(l)) {
      basic.title = l;
      continue;
    }
    if (!basic.location && /^[\u4e00-\u9fa5]{2,8}$/.test(l) && /(市|省|区|北京|上海|广州|深圳|杭州|成都|南京|武汉)/.test(l)) {
      basic.location = l;
    }
  }

  const segOf = (t: SectionType) => segments.filter((s) => s.type === t).flatMap((s) => s.lines);

  const sections: Section[] = [];
  let order = 0;
  const push = (type: SectionType, title: string, blocks: Block[]) => {
    sections.push({
      section_id: type === "custom" ? uid("sec") : type,
      type,
      title,
      visible: true,
      order: order++,
      blocks: blocks.map((b, i) => ({ ...b, order: i })),
    });
  };

  push("basic_info", "基本信息", []);

  const summaryLines = segOf("summary").map(cleanLine).filter(Boolean);
  push("summary", "个人总结", [mkBlock("summary", { description: summaryLines.join("\n") })]);

  push("work_experience", "工作经历", buildEntryBlocks(segOf("work_experience"), "work_experience_item"));
  push("project_experience", "项目经历", buildEntryBlocks(segOf("project_experience"), "project_experience_item"));
  push("education", "教育经历", buildEntryBlocks(segOf("education"), "education_item"));
  push("skills", "技能", parseSkillsLines(segOf("skills")));

  const certLines = segOf("certifications").map(cleanLine).filter(Boolean);
  push(
    "certifications",
    "证书奖项",
    certLines.map((l) => {
      const { start, end, rest } = parseDates(l);
      return mkBlock("certification", { title: rest || l, start_date: start || end });
    })
  );

  // 无法识别的行：如果工作经历为空且存在大量带日期行，归入工作经历兜底
  const unclaimed = cur.type === "head" ? [] : [];
  void unclaimed;

  return { basic_info: basic, sections, metadata: { source, source_name: sourceName, created_at: nowISO() } };
}

/** 空简历工厂 */
export function emptyResume(): ResumeData {
  return structureResume("", "empty");
}
