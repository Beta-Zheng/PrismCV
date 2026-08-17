/* ------------------------------------------------------------------
 * 模板渲染器：Resume JSON + Template = Rendered Resume
 * 规则：先按 section.order 排序 → block.order 排序 → 过滤 visible=false
 * ------------------------------------------------------------------ */
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
  return `${b.start_date || ""}${b.start_date || b.end_date ? (b.end_date ? ` – ${b.end_date}` : "") : ""}`;
}

export function ResumeSheet({ resume, forPrint }: { resume: Resume; forPrint?: boolean }) {
  const isATS = resume.template_id === "classic_ats";
  const color = isATS ? "#111111" : resume.theme.primary_color;
  const fs = resume.theme.font_size;
  const sections = orderedVisible(resume.data).filter((s) => s.type !== "basic_info" || true);
  const basicVisible = resume.data.sections.find((s) => s.type === "basic_info")?.visible ?? true;
  const info = resume.data.basic_info;
  const contacts = [info.email, info.phone, info.location, info.website].filter(Boolean);

  if (isATS) {
    return (
      <div className={cx("resume-sheet bg-white text-[#111]", !forPrint && "shadow-xl shadow-ink-950/15")} style={{ fontSize: `${fs}px`, lineHeight: 1.5, fontFamily: '"Noto Sans SC", sans-serif' }}>
        <header className="border-b-2 border-[#111] pb-3 text-center">
          <h1 className="text-[2.1em] font-bold leading-tight tracking-wide">{info.name || "未命名"}</h1>
          {info.title && <p className="mt-0.5 text-[1.05em] font-medium">{info.title}</p>}
          {basicVisible && contacts.length > 0 && <p className="mt-1.5 text-[0.85em] text-[#333]">{contacts.join("  |  ")}</p>}
        </header>
        <main className="pt-3">
          {sections.filter((s) => s.type !== "basic_info").map((s) => {
            const blocks = visibleBlocks(s);
            if (s.type === "summary" && !blocks.some((b) => b.description)) return null;
            if (blocks.length === 0 && s.type !== "summary") return null;
            return (
              <section key={s.section_id} className="mb-3">
                <h2 className="mb-1.5 border-b border-[#111] pb-0.5 text-[1.05em] font-bold uppercase tracking-[0.08em]">{s.title}</h2>
                {blocks.map((b) => (
                  <div key={b.block_id} className="mb-2 break-inside-avoid">
                    {(b.title || b.subtitle) && (
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-[1em] font-bold">
                          {b.title}
                          {b.subtitle && <span className="font-normal"> · {b.subtitle}</span>}
                        </p>
                        {dateRange(b) && <p className="shrink-0 text-[0.85em] text-[#333]">{dateRange(b)}</p>}
                      </div>
                    )}
                    {b.description && <p className="mt-0.5 whitespace-pre-line text-[0.92em]">{b.description}</p>}
                    {b.bullets.filter(Boolean).length > 0 && (
                      <ul className="mt-0.5 list-disc pl-5">
                        {b.bullets.filter(Boolean).map((bl, i) => (
                          <li key={i} className="text-[0.92em]">{bl}</li>
                        ))}
                      </ul>
                    )}
                    {b.skills.length > 0 && <p className="mt-0.5 text-[0.9em]">{b.skills.join("  ·  ")}</p>}
                  </div>
                ))}
              </section>
            );
          })}
        </main>
      </div>
    );
  }

  /* ---- 现代单栏模板 ---- */
  return (
    <div className={cx("resume-sheet bg-white text-ink-900", !forPrint && "shadow-xl shadow-ink-950/15")} style={{ fontSize: `${fs}px`, lineHeight: 1.6, fontFamily: '"Noto Sans SC", sans-serif' }}>
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
        {basicVisible && contacts.length > 0 && (
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

      <main className="pt-4">
        {sections.filter((s) => s.type !== "basic_info").map((s) => {
          const blocks = visibleBlocks(s);
          if (s.type === "summary" && !blocks.some((b) => b.description)) return null;
          if (blocks.length === 0 && s.type !== "summary") return null;
          return (
            <section key={s.section_id} className="mb-4 break-inside-avoid-page">
              <h2 className="mb-2 flex items-center gap-2 text-[1.02em] font-bold tracking-wide" style={{ color }}>
                <span className="inline-block h-[0.95em] w-[3.5px] rounded-full" style={{ background: color }} />
                {s.title}
                <span className="h-px flex-1" style={{ background: `${color}26` }} />
              </h2>
              {blocks.map((b) => (
                <div key={b.block_id} className="mb-2.5 break-inside-avoid">
                  {(b.title || b.subtitle) && (
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[1em] font-bold text-ink-900">
                        {b.title}
                        {b.subtitle && <span className="ml-1.5 font-normal text-ink-500">{b.subtitle}</span>}
                      </p>
                      {dateRange(b) && (
                        <p className="shrink-0 rounded px-1.5 py-px font-mono text-[0.75em]" style={{ background: `${color}14`, color }}>
                          {dateRange(b)}
                        </p>
                      )}
                    </div>
                  )}
                  {b.location && <p className="text-[0.82em] text-ink-400">{b.location}</p>}
                  {b.description && <p className="mt-1 whitespace-pre-line text-[0.92em] leading-relaxed text-ink-700">{b.description}</p>}
                  {b.bullets.filter(Boolean).length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {b.bullets.filter(Boolean).map((bl, i) => (
                        <li key={i} className="flex gap-2 text-[0.92em] text-ink-700">
                          <span className="mt-[0.55em] h-[5px] w-[5px] shrink-0 rotate-45" style={{ background: color }} />
                          <span>{bl}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {b.skills.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {b.skills.map((sk) => (
                        <span key={sk} className="rounded px-1.5 py-px text-[0.78em] font-medium" style={{ background: `${color}14`, color }}>
                          {sk}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </section>
          );
        })}
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
