import type { FontKey, DensityKey, BulletStyleKey } from "../types";

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDateCompact(iso: string): string {
  return fmtDate(iso).replace(/-/g, "");
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return fmtDate(iso);
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function downloadText(filename: string, content: string, mime = "application/json") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 将图片文件读取为 base64 Data URL；超过 maxBytes 时拒绝 */
export function fileToDataUrl(file: File, maxBytes = 2 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("请选择图片文件"));
      return;
    }
    if (file.size > maxBytes) {
      reject(new Error(`图片大小不能超过 ${formatBytes(maxBytes)}`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

/* ---------------- 行级 LCS Diff（AI 建议对比用） ---------------- */

export type DiffOp = { kind: "same" | "add" | "del"; text: string };

export function diffLines(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "del", text: a[i] });
      i++;
    } else {
      out.push({ kind: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ kind: "del", text: a[i++] });
  while (j < m) out.push({ kind: "add", text: b[j++] });
  return out;
}

/** 将简历内容压平为纯文本，用于 JD 匹配 */
export function resumeToText(data: {
  basic_info: { name: string; title: string };
  sections: Array<{ title: string; blocks: Array<{ title: string; subtitle: string; description: string; bullets: string[]; skills: string[] }> }>;
}): string {
  const parts: string[] = [data.basic_info.name, data.basic_info.title];
  for (const s of data.sections) {
    for (const b of s.blocks) {
      parts.push(b.title, b.subtitle, stripHtml(b.description), ...b.bullets.map(stripHtml), ...b.skills);
    }
  }
  return parts.filter(Boolean).join("\n").toLowerCase();
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ---------------- 字体 / 布局密度（模板全局选项） ---------------- */

/** 可选字体 → CSS font-family 栈 */
export const FONT_STACKS: Record<FontKey, string> = {
  sans: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: '"Noto Serif SC", "Songti SC", "SimSun", serif',
  system: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
  kai: '"Kaiti SC", "KaiTi", "楷体", serif',
  mono: '"JetBrains Mono", "SF Mono", "Fira Code", "Consolas", "Noto Sans SC", monospace',
  fangsong: '"FangSong SC", "FangSong", "仿宋", serif',
};

export function fontStack(key?: FontKey): string {
  return FONT_STACKS[key ?? "sans"];
}

/** 三种密度对应的 CSS 变量（间距 + 行高 + 页边距），便于一页简历调节篇幅 */
export const DENSITY_VARS: Record<DensityKey, Record<string, string>> = {
  compact: { "--sec-gap": "0.6rem", "--entry-gap": "0.3rem", "--bullet-gap": "0.14rem", "--lh": "1.42", "--head-gap": "0.4rem", "--page-pad-x": "2.6rem", "--page-pad-y": "2.2rem" },
  medium: { "--sec-gap": "1rem", "--entry-gap": "0.55rem", "--bullet-gap": "0.28rem", "--lh": "1.6", "--head-gap": "0.7rem", "--page-pad-x": "3rem", "--page-pad-y": "2.75rem" },
  loose: { "--sec-gap": "1.5rem", "--entry-gap": "0.9rem", "--bullet-gap": "0.45rem", "--lh": "1.78", "--head-gap": "1rem", "--page-pad-x": "3.4rem", "--page-pad-y": "3.2rem" },
};

export function densityVars(key?: DensityKey): Record<string, string> {
  return DENSITY_VARS[key ?? "medium"];
}

/** 解析某模块实际生效的要点列表样式：模块级设置 > 全局默认 > 菱形。
 *  编辑器与预览共用，保证「所见即所得」。 */
export function resolveBulletStyle(sectionStyle?: BulletStyleKey, themeDefault?: BulletStyleKey): BulletStyleKey {
  return sectionStyle ?? themeDefault ?? "diamond";
}

/* ---------------- 行内富文本（要点 / 描述） ---------------- */

/** 判断字符串是否已是富文本 HTML（而非 ** 标记或纯文本） */
export function isRichHtml(s: string): boolean {
  return /<(b|strong|i|em|u|br|span|div|p)\b/i.test(s);
}

/** 去除所有 HTML 标签，保留纯文本（用于卡片预览 / JD 匹配） */
export function stripHtml(s: string): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, "");
}

/** 仅保留白名单内的行内标签，剥离全部属性，防止富文本注入破坏文档 */
export function sanitizeInline(html: string): string {
  if (typeof document === "undefined") return html;
  const allowed = /^(b|strong|i|em|u|br|span)$/i;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const walk = (node: Element) => {
    [...node.children].forEach((child) => {
      if (!allowed.test(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
      } else {
        [...child.attributes].forEach((a) => child.removeAttribute(a.name));
        walk(child);
      }
    });
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

/** 把存储值转成编辑器初始 HTML：已是 HTML 则原样，否则把 **加粗** 转成 <strong> */
export function prepEditorHtml(value: string): string {
  if (isRichHtml(value)) return value;
  return value
    .split("**")
    .map((seg, i) => (i % 2 === 1 && seg.length > 0 ? `<strong>${seg}</strong>` : seg))
    .join("");
}
