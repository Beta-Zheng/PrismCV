import { useState, type ReactNode } from "react";
import type { AIAction, Block, Resume, Section } from "../types";
import { ACTION_LABELS, SECTION_LABELS } from "../types";
import { cx } from "../lib/utils";
import { useApp } from "../lib/store";
import { IconChevronDown, IconChevronUp, IconEye, IconEyeOff, IconPlus, IconSpark, IconTrash, IconX } from "./icons";
import { Confirm } from "./ui";

/* ---------------- 基础表单件 ---------------- */

function F({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block min-w-0", className)}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function TagInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const t = draft.trim().replace(/[,，、]+$/, "");
    if (t && !values.includes(t)) onChange([...values, t]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-ink-200 bg-white/80 px-2 py-1.5 transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/25">
      {values.map((v) => (
        <span key={v} className="chip bg-brand-50 text-brand-800 ring-1 ring-brand-200">
          {v}
          <button onClick={() => onChange(values.filter((x) => x !== v))} className="opacity-60 transition hover:opacity-100" aria-label={`移除 ${v}`}>
            <IconX size={10} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={values.length ? "" : placeholder || "输入后回车添加"}
        className="min-w-[110px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-300"
      />
    </div>
  );
}

function BulletsEdit({ value, onChange, label = "要点（每行一条）" }: { value: string[]; onChange: (v: string[]) => void; label?: string }) {
  return (
    <F label={label} className="col-span-2">
      <textarea
        value={value.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n"))}
        rows={Math.max(3, value.length + 1)}
        placeholder={"主导 XX 系统开发，将耗时从 3s 降至 1s\n每行一条，建议「动词 + 内容 + 成果」"}
        className="field-input resize-y leading-relaxed"
      />
    </F>
  );
}

/* ---------------- AI 动作菜单 ---------------- */

export function AIActionMenu({ onAction, hasJD }: { onAction: (a: AIAction) => void; hasJD: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cx(
          "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[12px] font-medium transition active:scale-95",
          open ? "border-brand-500 bg-brand-600 text-white" : "border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-400 hover:bg-brand-100"
        )}
        aria-label="AI 建议"
      >
        <IconSpark size={13} />
        AI
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="anim-scale-in absolute right-0 top-8 z-30 w-60 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-xl shadow-ink-950/15">
            <p className="border-b border-ink-100 bg-paper-50 px-3 py-1.5 text-[10.5px] font-medium tracking-wide text-ink-400">选择 AI 动作 · 建议需确认后生效</p>
            {(Object.keys(ACTION_LABELS) as AIAction[]).map((a) => (
              <button
                key={a}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onAction(a);
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-brand-50"
              >
                <span className="mt-0.5 w-14 shrink-0 text-[12px] font-bold text-ink-800">{ACTION_LABELS[a].label}</span>
                <span className="text-[11px] leading-snug text-ink-400">
                  {ACTION_LABELS[a].hint}
                  {a === "jd_match" && !hasJD && <em className="ml-1 not-italic text-seal-600">（未绑定 JD）</em>}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- 单个 Block 编辑器 ---------------- */

const TYPE_LABEL: Record<Block["type"], string> = {
  summary: "总结",
  work_experience_item: "工作经历",
  project_experience_item: "项目",
  education_item: "教育",
  skill_group: "技能组",
  certification: "证书/奖项",
  custom_text: "自定义",
};

export function BlockCard({
  resume,
  section,
  block,
  index,
  total,
  onRequestAI,
}: {
  resume: Resume;
  section: Section;
  block: Block;
  index: number;
  total: number;
  onRequestAI: (sectionId: string, blockId: string, action: AIAction) => void;
}) {
  const { patchBlock, deleteBlock, moveBlock } = useApp();
  const [open, setOpen] = useState(true);
  const [confirmDel, setConfirmDel] = useState(false);
  const jd = useApp((s) => s.jds[resume.id]);
  const isEntry = ["work_experience_item", "project_experience_item", "education_item"].includes(block.type);
  const preview = block.title || block.description.slice(0, 28) || block.bullets[0]?.slice(0, 28) || "（空白条目）";

  return (
    <div className={cx("group rounded-lg border bg-white/70 transition-all duration-200", open ? "border-ink-200 shadow-sm shadow-ink-950/5" : "border-ink-100 hover:border-ink-200")}>
      <div className="flex cursor-pointer items-center gap-2 px-3 py-2" onClick={() => setOpen((v) => !v)}>
        <button className="tool-btn h-6 w-6" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} aria-label={open ? "折叠" : "展开"}>
          {open ? <IconChevronDown size={14} /> : <IconChevronUp size={14} className="rotate-180" />}
        </button>
        <span className="chip shrink-0 bg-paper-200 font-mono text-ink-500">{TYPE_LABEL[block.type]}</span>
        <span className={cx("min-w-0 flex-1 truncate text-[13px]", block.title ? "font-medium text-ink-800" : "text-ink-300")}>{preview}</span>
        {block.start_date && <span className="shrink-0 font-mono text-[11px] text-ink-300">{block.start_date}{block.end_date ? ` – ${block.end_date}` : ""}</span>}
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          <AIActionMenu hasJD={!!jd} onAction={(a) => onRequestAI(section.section_id, block.block_id, a)} />
          <button className="tool-btn" onClick={() => moveBlock(resume.id, section.section_id, block.block_id, "up")} disabled={index === 0} aria-label="上移">
            <IconChevronUp size={14} />
          </button>
          <button className="tool-btn" onClick={() => moveBlock(resume.id, section.section_id, block.block_id, "down")} disabled={index === total - 1} aria-label="下移">
            <IconChevronDown size={14} />
          </button>
          <button className="tool-btn" onClick={() => patchBlock(resume.id, section.section_id, block.block_id, { visible: !block.visible })} aria-label="显示/隐藏">
            {block.visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}
          </button>
          <button className="tool-btn hover:bg-danger-100 hover:text-danger-600" onClick={() => setConfirmDel(true)} aria-label="删除条目">
            <IconTrash size={14} />
          </button>
        </div>
      </div>

      {open && (
        <div className={cx("grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-ink-100 px-3 py-3", !block.visible && "opacity-50")}>
          {(isEntry || block.type === "certification" || block.type === "custom_text") && (
            <F label={block.type === "education_item" ? "学校" : block.type === "certification" ? "名称" : "标题"}>
              <input className="field-input" value={block.title} placeholder={block.type === "education_item" ? "XX 大学" : "公司 / 项目名"} onChange={(e) => patchBlock(resume.id, section.section_id, block.block_id, { title: e.target.value })} />
            </F>
          )}
          {(isEntry || block.type === "custom_text") && (
            <F label="副标题">
              <input className="field-input" value={block.subtitle} placeholder={block.type === "education_item" ? "专业 · 学历" : "职位 / 角色"} onChange={(e) => patchBlock(resume.id, section.section_id, block.block_id, { subtitle: e.target.value })} />
            </F>
          )}
          {isEntry && (
            <>
              <F label="开始时间">
                <input className="field-input font-mono" value={block.start_date} placeholder="2021-03" onChange={(e) => patchBlock(resume.id, section.section_id, block.block_id, { start_date: e.target.value })} />
              </F>
              <F label="结束时间">
                <input className="field-input font-mono" value={block.end_date} placeholder="至今 / 2024-06" onChange={(e) => patchBlock(resume.id, section.section_id, block.block_id, { end_date: e.target.value })} />
              </F>
            </>
          )}
          {block.type === "certification" && (
            <F label="时间">
              <input className="field-input font-mono" value={block.start_date} placeholder="2023" onChange={(e) => patchBlock(resume.id, section.section_id, block.block_id, { start_date: e.target.value })} />
            </F>
          )}

          {block.type === "summary" || block.type === "custom_text" ? (
            <F label="描述" className="col-span-2">
              <textarea className="field-input resize-y leading-relaxed" rows={4} value={block.description} placeholder="用 2–4 句话概括亮点，突出可度量的成果" onChange={(e) => patchBlock(resume.id, section.section_id, block.block_id, { description: e.target.value })} />
            </F>
          ) : null}

          {block.type === "skill_group" && (
            <F label="组名" className="col-span-2">
              <input className="field-input" value={block.title} placeholder="如：核心技术" onChange={(e) => patchBlock(resume.id, section.section_id, block.block_id, { title: e.target.value })} />
            </F>
          )}
          {(block.type === "skill_group" || block.type === "project_experience_item") && (
            <F label="技能标签" className="col-span-2">
              <TagInput values={block.skills} onChange={(v) => patchBlock(resume.id, section.section_id, block.block_id, { skills: v })} placeholder="React、TypeScript…" />
            </F>
          )}

          {(isEntry || block.type === "custom_text") && (
            <BulletsEdit value={block.bullets} onChange={(v) => patchBlock(resume.id, section.section_id, block.block_id, { bullets: v })} />
          )}
        </div>
      )}

      <Confirm
        open={confirmDel}
        danger
        title="删除该条目？"
        desc={`「${preview}」将从简历中移除，此操作不可撤销。`}
        confirmText="删除"
        onConfirm={() => {
          deleteBlock(resume.id, section.section_id, block.block_id);
          setConfirmDel(false);
        }}
        onCancel={() => setConfirmDel(false)}
      />
    </div>
  );
}

/* ---------------- Section 卡片 ---------------- */

export function SectionCard({
  resume,
  section,
  onRequestAI,
  dragHandle,
}: {
  resume: Resume;
  section: Section;
  onRequestAI: (sectionId: string, blockId: string, action: AIAction) => void;
  dragHandle?: ReactNode;
}) {
  const { addBlock, toggleSection, deleteSection, renameSection } = useApp();
  const [confirmDel, setConfirmDel] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const visibleBlocks = section.blocks;

  return (
    <section className={cx("rounded-xl border bg-paper-25/80 transition-all duration-200", section.visible ? "border-ink-200 shadow-sm shadow-ink-950/5" : "border-dashed border-ink-200 opacity-70")}>
      <header className="flex items-center gap-2 border-b border-ink-100 px-3 py-2.5">
        {dragHandle}
        {editingTitle ? (
          <input
            autoFocus
            defaultValue={section.title}
            onBlur={(e) => {
              renameSection(resume.id, section.section_id, e.target.value.trim() || section.title);
              setEditingTitle(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="field-input max-w-[180px] py-0.5 font-display text-[15px] font-bold"
          />
        ) : (
          <h3 className="cursor-text font-display text-[16px] font-bold text-ink-900" onClick={() => section.type === "custom" && setEditingTitle(true)} title={section.type === "custom" ? "点击重命名" : undefined}>
            {section.title}
            {section.type === "custom" && <span className="ml-1.5 align-middle text-[10px] font-normal text-ink-300">自定义</span>}
          </h3>
        )}
        <span className="chip bg-paper-200 font-mono text-ink-400">{visibleBlocks.length} 条</span>
        <span className="chip hidden bg-paper-200 font-mono text-ink-300 sm:inline-flex">order {section.order}</span>
        <div className="ml-auto flex items-center gap-1">
          {section.type !== "basic_info" && (
            <button className="tool-btn text-brand-600 hover:bg-brand-50" onClick={() => addBlock(resume.id, section.section_id)} aria-label="新增条目">
              <IconPlus size={15} />
            </button>
          )}
          <button className="tool-btn" onClick={() => toggleSection(resume.id, section.section_id)} aria-label="显示/隐藏模块" title={section.visible ? "隐藏模块（保留排序位置，不参与预览/导出）" : "显示模块"}>
            {section.visible ? <IconEye size={15} /> : <IconEyeOff size={15} />}
          </button>
          {section.type === "custom" && (
            <button className="tool-btn hover:bg-danger-100 hover:text-danger-600" onClick={() => setConfirmDel(true)} aria-label="删除模块">
              <IconTrash size={15} />
            </button>
          )}
        </div>
      </header>

      {!section.visible ? (
        <p className="px-4 py-3 text-[12px] text-ink-400">模块已隐藏 —— 仍保留排序位置，不会出现在预览与 PDF 导出中。</p>
      ) : section.type === "basic_info" ? (
        <BasicInfoEditor resume={resume} />
      ) : visibleBlocks.length === 0 ? (
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-[12px] text-ink-300">暂无条目</p>
          <button onClick={() => addBlock(resume.id, section.section_id)} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 transition hover:text-brand-700">
            <IconPlus size={13} /> 新增{SECTION_LABELS[section.type]}条目
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 p-2.5">
          {visibleBlocks.map((b, i) => (
            <BlockCard key={b.block_id} resume={resume} section={section} block={b} index={i} total={visibleBlocks.length} onRequestAI={onRequestAI} />
          ))}
          <button onClick={() => addBlock(resume.id, section.section_id)} className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink-200 py-2 text-[12px] font-medium text-ink-400 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700">
            <IconPlus size={13} /> 新增条目
          </button>
        </div>
      )}

      <Confirm
        open={confirmDel}
        danger
        title="删除整个模块？"
        desc={`「${section.title}」及其 ${section.blocks.length} 个条目将被移除。`}
        confirmText="删除模块"
        onConfirm={() => {
          deleteSection(resume.id, section.section_id);
          setConfirmDel(false);
        }}
        onCancel={() => setConfirmDel(false)}
      />
    </section>
  );
}

function BasicInfoEditor({ resume }: { resume: Resume }) {
  const { patchBasic } = useApp();
  const b = resume.data.basic_info;
  const fields: Array<{ key: keyof typeof b; label: string; ph: string }> = [
    { key: "name", label: "姓名", ph: "张三" },
    { key: "title", label: "求职意向 / 职位", ph: "高级前端工程师" },
    { key: "email", label: "邮箱", ph: "you@example.com" },
    { key: "phone", label: "电话", ph: "138-0000-0000" },
    { key: "location", label: "所在城市", ph: "上海" },
    { key: "website", label: "主页 / GitHub", ph: "github.com/you" },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-3 py-3">
      {fields.map((f) => (
        <F key={f.key} label={f.label}>
          <input className="field-input" value={b[f.key]} placeholder={f.ph} onChange={(e) => patchBasic(resume.id, { [f.key]: e.target.value })} />
        </F>
      ))}
    </div>
  );
}
