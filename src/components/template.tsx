/* ------------------------------------------------------------------
 * 模板渲染器：Resume JSON + Template = Rendered Resume
 * 规则：先按 section.order 排序 → block.order 排序 → 过滤 visible=false
 * 现代单栏 / 经典 ATS 共用一套条目与模块渲染（EntryBody / SectionBlock），
 * 仅通过 TStyle 风格参数区分视觉，避免两份代码分叉导致字段遗漏（如 location）。
 * ------------------------------------------------------------------ */
import type { ReactNode } from "react";
import type { Block, Resume, Section } from "../types";
import { cx } from "../lib/utils";

function orderedVisible(data: Resume["data"]): Section[] {
  return [...data.sections].filter((s) => s.visible).sort((a, b) => a.order - b.order);
}

function visibleBlocks(s: Section): Block[] {
  return [...s.blocks].filter((b) => b.visible).sort((a, b) => a.order - b.order);
}

function dateRange(b: Block): string {
  if (!b.start_date && !b.end_date) return "";
  const s = b.start_date || "";
  const e = b.end_date || "";
  if (s && e) return `${s} – ${e}`;
  return s || e; // 仅 start 或仅 end 时直接返回，避免前导 " – " 横线
}

/** 解析行内 **关键词** 为加粗（Markdown 风格）。仅处理 **，不解析其他 HTML，避免 XSS。 */
function renderRich(text: string): ReactNode {
  if (!text) return null;
  const segs = text.split("**");
  return segs.map((seg, i) =>
    i % 2 === 1 && seg.length > 0 ? <strong key={i}>{seg}</strong> : <span key={i}>{seg}</span>
  );
}

interface TStyle {
  color: string;
  isATS: boolean;
  bullet: "disc" | "diamond";
  date: "plain" | "chip";
  skill: "text" | "chip";
  showLocation: boolean;
}

function EntryBody({ block, style }: { block: Block; style: TStyle }) {
  const { color, isATS, bullet, date, skill, showLocation } = style;
  const bullets = block.bullets.filter(Boolean);
  const hasContent =
    block.title || block.subtitle || block.description || bullets.length > 0 || block.skills.length > 0 || (showLocation && block.location);
  if (!hasContent) return null;
  return (
    <div className="mb-2.5 break-inside-avoid">
      {(block.title || block.subtitle) && (
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[1em] font-bold text-ink-900">
            {renderRich(block.title)}
            {block.subtitle && (
              <span className="font-normal text-ink-500">
                {isATS ? ` · ${renderRich(block.subtitle)}` : <span className="ml-1.5">{renderRich(block.subtitle)}</span>}
              </span>
            )}
          </p>
          {dateRange(block) &&
            (date === "chip" ? (
              <p className="shrink-0 rounded px-1.5 py-px font-mono text-[0.75em]" style={{ background: `${color}14`, color }}>
                {dateRange(block)}
              </p>
            ) : (
              <p className="shrink-0 text-[0.85em]" style={{ color: "#333" }}>
                {dateRange(block)}
              </p>
            ))}
        </div>
      )}
      {showLocation && block.location && (
        <p className={cx("text-[0.82em]", !isATS && "text-ink-400")} style={isATS ? { color: "#333" } : undefined}>
          {block.location}
        </p>
      )}
      {block.description && (
        <p className={cx("mt-1 whitespace-pre-line text-[0.92em] leading-relaxed", isATS ? "text-[#222]" : "text-ink-700")}>{block.description}</p>
      )}
      {bullets.length > 0 &&
        (bullet === "disc" ? (
          <ul className="mt-0.5 list-disc pl-5">
            {bullets.map((bl, i) => (
              <li key={i} className="text-[0.92em]" style={{ color: isATS ? "#222" : undefined }}>
                {bl}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-1 flex flex-col gap-0.5">
            {bullets.map((bl, i) => (
              <li key={i} className="flex gap-2 text-[0.92em]" style={{ color: isATS ? "#222" : undefined }}>
                <span className="mt-[0.55em] h-[5px] w-[5px] shrink-0 rotate-45" style={{ background: color }} />
                <span>{bl}</span>
              </li>
            ))}
          </ul>
        ))}
      {block.skills.length > 0 &&
        (skill === "text" ? (
          <p className="mt-0.5 text-[0.9em]" style={{ color: isATS ? "#333" : undefined }}>
            {block.skills.join("  ·  ")}
          </p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {block.skills.map((sk) => (
              <span key={sk} className="rounded px-1.5 py-px text-[0.78em] font-medium" style={{ background: `${color}14`, color }}>
                {sk}
              </span>
            ))}
          </div>
        ))}
    </div>
  );
}

function SectionBlock({ section, style }: { section: Section; style: TStyle }) {
  const blocks = visibleBlocks(section);
  if (section.type === "summary" && !blocks.some((b) => b.description)) return null;
  if (blocks.length === 0 && section.type !== "summary") return null;
  const { color, isATS } = style;
  return (
    <section className="mb-4 break-inside-avoid">
      <h2
        className={cx("mb-2 text-[1.02em] font-bold tracking-wide", !isATS && "flex items-center gap-2")}
        style={
          isATS
            ? { borderBottom: "1px solid #111", paddingBottom: "0.2em", color: "#111", textTransform: "uppercase", letterSpacing: "0.08em" }
            : { color }
        }
      >
        {!isATS && <span className="inline-block h-[0.95em] w-[3.5px] rounded-full" style={{ background: color }} />}
        {section.title}
        {!isATS && <span className="h-px flex-1" style={{ background: `${color}26` }} />}
      </h2>
      {blocks.map((b) => (
        <EntryBody key={b.block_id} block={b} style={style} />
      ))}
    </section>
  );
}

export function ResumeSheet({ resume, forPrint }: { resume: Resume; forPrint?: boolean }) {
  const isATS = resume.template_id === "classic_ats";
  const color = isATS ? "#111111" : resume.theme.primary_color;
  const fs = resume.theme.font_size;

  // 基本信息模块：visible=false 时整个 header（姓名/职位/联系）不渲染，语义一致
  const basicSection = resume.data.sections.find((s) => s.type === "basic_info");
  const basicVisible = basicSection?.visible ?? true;
  const info = resume.data.basic_info;
  const contacts = [info.email, info.phone, info.location, info.website].filter(Boolean);

  const style: TStyle = isATS
    ? { color: "#111111", isATS: true, bullet: "disc", date: "plain", skill: "text", showLocation: true }
    : { color, isATS: false, bullet: "diamond", date: "chip", skill: "chip", showLocation: true };

  const bodySections = orderedVisible(resume.data).filter((s) => s.type !== "basic_info");

  const headerEl =
    basicVisible && (info.name || info.title || contacts.length > 0) ? (
      isATS ? (
        <header className="border-b-2 border-[#111] pb-3 text-center">
          <h1 className="text-[2.1em] font-bold leading-tight tracking-wide">{info.name || "未命名"}</h1>
          {info.title && <p className="mt-0.5 text-[1.05em] font-medium">{info.title}</p>}
          {contacts.length > 0 && <p className="mt-1.5 text-[0.85em] text-[#333]">{contacts.join("  |  ")}</p>}
        </header>
      ) : (
        <header className="border-b pb-4" style={{ borderColor: `${color}33` }}>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="font-[700] leading-tight" style={{ fontFamily: '"Noto Serif SC", serif', fontSize: "2.3em", color: "#101817" }}>
                {info.name || "未命名"}
              </h1>
              {info.title && (
                <p className="mt-1 text-[1.1em] font-medium" style={{ color }}>
                  {info.title}
                </p>
              )}
            </div>
            <div className="mb-1 h-10 w-10 shrink-0 rounded-md" style={{ background: color, opacity: 0.9 }}>
              <div className="flex h-full items-center justify-center font-bold text-white" style={{ fontFamily: '"Noto Serif SC", serif', fontSize: "1.3em" }}>
                {(info.name || "?").slice(0, 1)}
              </div>
            </div>
          </div>
          {contacts.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.85em] text-ink-500">
              {contacts.map((c) => (
                <span key={c} className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-1 w-1 rounded-full" style={{ background: color }} />
                  {c}
                </span>
              ))}
            </div>
          )}
        </header>
      )
    ) : null;

  return (
    <div
      className={cx("resume-sheet bg-white", !forPrint && "shadow-xl shadow-ink-950/15")}
      style={{ fontSize: `${fs}px`, lineHeight: isATS ? 1.5 : 1.6, fontFamily: '"Noto Sans SC", sans-serif' }}
    >
      {headerEl}
      <main className={isATS ? "pt-3" : "pt-4"}>
        {bodySections.map((s) => (
          <SectionBlock key={s.section_id} section={s} style={style} />
        ))}
      </main>
    </div>
  );
}

/** A4 尺寸容器：794 x 1123 px @96dpi */
export function A4Sheet({ resume, forPrint }: { resume: Resume; forPrint?: boolean }) {
  return (
    <div className="resume-sheet-wrap bg-white" style={{ width: 794, minHeight: 1123 }}>
      <div className="px-12 py-11" style={{ minHeight: 1123 }}>
        <ResumeSheet resume={resume} forPrint={forPrint} />
      </div>
    </div>
  );
}
