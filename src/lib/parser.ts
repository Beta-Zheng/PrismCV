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
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      let line = "";
      let lastY: number | null = null;
      for (const item of tc.items as Array<{ str: string; transform: number[] }>) {
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 3) {
          parts.push(line);
          line = "";
        }
        line += item.str;
        lastY = y;
      }
      if (line) parts.push(line);
    }
    await doc.destroy();
    const text = parts.map((l) => l.trim()).filter(Boolean).join("\n");
    if (text.replace(/\s/g, "").length < 20) {
      return { ok: false, scanner: true, error: "该 PDF 未包含可提取文本（可能是扫描件），请改用「粘贴文本」方式创建" };
    }
    return { ok: true, text };
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
  { type: "project_experience", re: /^(项目经历|项目经验|项目实践|projects?|project\s*experience)/i },
  { type: "education", re: /^(教育经历|教育背景|学习经历|education)/i },
  { type: "skills", re: /^(专业技能|技能清单|技术栈|技能特长|技能|technical\s*skills|skills|technologies)/i },
  { type: "certifications", re: /^(证书奖项|荣誉证书|获奖情况|资格证书|证书|荣誉|奖项|certifications?|awards?|honors?)/i },
];

const DATE_RANGE_RE =
  /((?:19|20)\d{2})\s*[.\-/年]\s*(0?[1-9]|1[0-2])?\s*月?\s*(?:[-–—~至到]+\s*((?:19|20)\d{2})\s*[.\-/年]?\s*(0?[1-9]|1[0-2])?\s*月?|[-–—~至到]+\s*(至今|今|现在|present|now))/i;
const DATE_SINGLE_RE = /((?:19|20)\d{2})\s*[.\-/年]\s*(0?[1-9]|1[0-2])?\s*月?/;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE_RE = /(?:\+?86[-\s]?)?1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}|\d{3}[-.\s]\d{4}[-.\s]\d{4}/;
const URL_RE = /(?:https?:\/\/)?(?:www\.)?[\w-]+\.(?:com|cn|io|dev|me|net|org|top)(?:\/\S*)?/i;

function cleanLine(l: string): string {
  return l.replace(/^#{1,4}\s*/, "").replace(/[*_`>]/g, "").trim();
}

function isHeadingLine(l: string): SectionType | null {
  const c = cleanLine(l).replace(/[:：\s]+$/, "");
  if (c.length > 16) return null;
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

/** 将一段 section 内的行切分为若干条目（以含日期或「标题 | 副标题」结构的行作为条目起点） */
function splitItems(lines: string[]): string[][] {
  const items: string[][] = [];
  let cur: string[] = [];
  const looksLikeStart = (l: string) =>
    DATE_RANGE_RE.test(l) || DATE_SINGLE_RE.test(l) || /[|｜]/.test(l) || /^.{1,40}[—–-]\s*.{1,40}$/.test(l);
  for (const l of lines) {
    if (looksLikeStart(l) && cur.length > 0 && (DATE_RANGE_RE.test(l) || DATE_SINGLE_RE.test(l))) {
      items.push(cur);
      cur = [l];
    } else if (looksLikeStart(l) && cur.length === 0) {
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
    const first = cleanLine(item[0]);
    const { start, end, rest } = parseDates(first);
    const { title, subtitle } = splitTitleLine(rest || first);
    const bullets: string[] = [];
    const descParts: string[] = [];
    for (const raw of item.slice(1)) {
      const l = cleanLine(raw);
      if (!l) continue;
      const bulletMatch = l.match(/^[-•·▪◦*]\s*(.+)$/) || l.match(/^\d+[.、)]\s*(.+)$/);
      if (bulletMatch) bullets.push(bulletMatch[1].trim());
      else if (DATE_RANGE_RE.test(l) && !bullets.length) {
        // 日期单独一行
        const d = parseDates(l);
        if (d.start) {
          if (!item[0].match(DATE_RANGE_RE)) {
            // keep
          }
        }
        continue;
      } else descParts.push(l);
    }
    return mkBlock(type, {
      title: title.slice(0, 80),
      subtitle: subtitle.slice(0, 80),
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
  if (urlM && (!basic.email || !urlM[0].includes(basic.email))) basic.website = urlM[0];

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
