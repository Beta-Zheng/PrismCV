import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AIAction, Resume, Section } from "../types";
import { TEMPLATES } from "../types";
import { cx, fmtDateCompact, nowISO } from "../lib/utils";
import { useApp, useResume } from "../lib/store";
import { SectionCard } from "../components/blocks";
import { AIPanel, JDPanel, OutlinePanel } from "../components/panels";
import { A4Sheet, MIN_ZOOM } from "../components/template";
import { Btn, Modal, ModalHeader, SaveIndicator } from "../components/ui";
import { IconCheck, IconChevronDown, IconChevronLeft, IconGrip, IconLayout, IconPalette, IconPlus, IconPrinter, IconSpark, IconTarget, IconX } from "../components/icons";

const THEME_COLORS = ["#4F46E5", "#1d4ed8", "#9f1239", "#b45309", "#334155"];

/** 工具栏下拉菜单：点击展开，点击外部 / 按 Esc 关闭。带图标 + 功能副标签 + 面板说明，让新用户一眼看懂这组设置管什么 */
function ToolbarMenu({
  label,
  hint,
  desc,
  icon: Icon,
  children,
}: {
  label: string;
  hint: string;
  desc: string;
  icon: (p: { size?: number; className?: string; style?: CSSProperties }) => ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={desc}
        className={cx(
          "flex items-center gap-2 rounded-lg bg-white px-2.5 py-1 text-left shadow-sm shadow-ink-950/5 ring-1 ring-ink-100 transition hover:ring-ink-200",
          open ? "text-brand-700 ring-brand-200" : "text-ink-600"
        )}
      >
        <Icon size={15} className={cx("shrink-0", open ? "text-brand-500" : "text-ink-400")} />
        <span className="flex flex-col leading-tight">
          <span className="text-[12px] font-semibold">{label}</span>
          <span className="text-[10px] text-ink-400">{hint}</span>
        </span>
        <IconChevronDown size={13} className={cx("shrink-0 text-ink-300 transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+7px)] z-30 w-60 rounded-2xl border border-ink-200 bg-white p-3 shadow-xl shadow-ink-950/15"
        >
          <p className="mb-2.5 border-b border-ink-100 pb-2 text-[11px] leading-snug text-ink-400">{desc}</p>
          {children}
        </div>
      )}
    </div>
  );
}

/** 下拉菜单内的分组小标题 + 内容 */
function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-ink-400">{title}</p>
      {children}
    </div>
  );
}

function SortableSection({ resume, section, onRequestAI }: { resume: Resume; section: Section; onRequestAI: (s: string, b: string, a: AIAction) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.section_id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx(isDragging && "z-20 opacity-90 shadow-2xl shadow-brand-900/20 rounded-xl")}>
      <SectionCard
        resume={resume}
        section={section}
        onRequestAI={onRequestAI}
        dragHandle={
          <button {...attributes} {...listeners} className="cursor-grab touch-none rounded p-1 text-ink-300 transition hover:bg-paper-200 hover:text-ink-600 active:cursor-grabbing" aria-label="拖动调整模块顺序" title="拖动调整模块顺序">
            <IconGrip size={15} />
          </button>
        }
      />
    </div>
  );
}

/**
 * 预览弹窗的缩放档位。最小值与 template.tsx 的 MIN_ZOOM 是一对耦合常量：
 * 分隔线要满足「线宽 × 最小缩放 ≥ 2px」才不会在光栅化时因相位差而粗细不一
 * （原理见 template.tsx 中 RULE_PX_FADE 的注释）。改动任一侧都要同步另一侧：
 *   新增更小的档位 → 需按 2 / 新最小缩放 调大线宽；
 *   调小线宽 → 需确认 线宽 × 最小缩放 仍 ≥ 2。
 */
const ZOOM_LEVELS = [MIN_ZOOM, 0.95, 1.0] as const;

export default function Editor({ resumeId }: { resumeId: string }) {
  const resume = useResume(resumeId);
  const app = useApp();
  const [panelTab, setPanelTab] = useState<"ai" | "jd">("ai");
  const [activeTarget, setActiveTarget] = useState<{ sectionId: string; blockId: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // 默认值必须取自 ZOOM_LEVELS：此前写死 0.78，既不在档位内（打开时无按钮高亮），
  // 又低于最小档位，等于让分隔线的线宽约束在最常见的一屏里直接失效
  const [zoom, setZoom] = useState<number>(ZOOM_LEVELS[0]);
  const [addSecOpen, setAddSecOpen] = useState(false);
  const [newSecTitle, setNewSecTitle] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const sections = useMemo(() => (resume ? [...resume.data.sections].sort((a, b) => a.order - b.order) : []), [resume]);

  if (!resume) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-[14px] text-ink-400">简历不存在或已被删除</p>
        <Btn variant="primary" onClick={() => app.go({ name: "home" })}>返回工作台</Btn>
      </div>
    );
  }

  const onRequestAI = (sectionId: string, blockId: string, action: AIAction) => {
    setActiveTarget({ sectionId, blockId });
    setPanelTab("ai");
    app.requestSuggestion(resumeId, sectionId, blockId, action);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = sections.findIndex((s) => s.section_id === active.id);
    const newIdx = sections.findIndex((s) => s.section_id === over.id);
    app.reorderSections(resumeId, arrayMove(sections, oldIdx, newIdx).map((s) => s.section_id));
    app.toast("ok", `模块顺序已更新并自动保存`);
  };

  const exportName = `resume_${resume.data.basic_info.name || "untitled"}_${fmtDateCompact(nowISO())}.pdf`;

  return (
    <div className="flex h-full flex-col">
      {/* 顶部工具栏：按功能分组，减少视觉混乱 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 bg-paper-25 px-3 py-2">
        {/* 文档组 */}
        <div className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 shadow-sm shadow-ink-950/5 ring-1 ring-ink-100">
          <button onClick={() => app.go({ name: "home" })} className="tool-btn h-7 w-7" aria-label="返回">
            <IconChevronLeft size={16} />
          </button>
          <input
            value={resume.title}
            onChange={(e) => app.renameResume(resumeId, e.target.value)}
            className="w-40 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-display text-[15px] font-bold text-ink-900 outline-none transition hover:border-ink-200 focus:border-brand-500 focus:bg-white"
            aria-label="简历标题"
          />
          <SaveIndicator />
        </div>

        {/* 模板组 */}
        <div className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 shadow-sm shadow-ink-950/5 ring-1 ring-ink-100">
          <span className="hidden pr-1 text-[10px] font-bold uppercase tracking-wider text-ink-300 lg:inline">模板</span>
          <div className="flex rounded-md bg-paper-100 p-0.5">
            {TEMPLATES.map((t) => (
              <button
                key={t.template_id}
                onClick={() => app.setTemplate(resumeId, t.template_id)}
                className={cx(
                  "rounded-md px-2.5 py-1 text-[11px] font-bold transition",
                  resume.template_id === t.template_id ? "bg-ink-900 text-paper-50 shadow-sm" : "text-ink-500 hover:bg-paper-200 hover:text-ink-800"
                )}
                title={t.description}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* 外观下拉：主题色（仅非 ATS） + 字号 + 字体 */}
        <ToolbarMenu label="外观样式" hint="颜色 · 字体 · 字号" desc="调整整份简历的配色、正文字号与字体，对所有模块统一生效。" icon={IconPalette}>
          {resume.template_id !== "classic_ats" && (
            <MenuSection title="主题色">
              <div className="flex items-center gap-1.5 px-1">
                {THEME_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => app.setTheme(resumeId, { primary_color: c })}
                    className={cx(
                      "relative flex h-[22px] w-[22px] items-center justify-center rounded-full transition hover:scale-110",
                      resume.theme.primary_color === c ? "ring-2 ring-offset-1 ring-ink-900" : "ring-1 ring-ink-200 hover:ring-ink-400"
                    )}
                    style={{ background: c }}
                    aria-label={`主题色 ${c}`}
                  >
                    {resume.theme.primary_color === c && <IconCheck size={12} className="text-white" />}
                  </button>
                ))}
                <label
                  className="relative flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-full ring-1 ring-ink-200 transition hover:ring-ink-400"
                  title="自定义主题色"
                >
                  <input
                    type="color"
                    value={resume.theme.primary_color}
                    onChange={(e) => app.setTheme(resumeId, { primary_color: e.target.value })}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="自定义主题色"
                  />
                  <div className="h-3 w-3 rounded-full bg-gradient-to-br from-red-400 via-green-400 to-blue-400" />
                </label>
              </div>
            </MenuSection>
          )}

          <MenuSection title="字号">
            <div className="flex gap-1 rounded-lg bg-paper-100 p-0.5">
              {[13, 14, 15].map((n) => (
                <button
                  key={n}
                  onClick={() => app.setTheme(resumeId, { font_size: n })}
                  className={cx(
                    "flex-1 rounded-md px-2 py-1 font-mono text-[11px] font-bold transition",
                    resume.theme.font_size === n ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:bg-paper-200 hover:text-ink-800"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </MenuSection>

          <MenuSection title="字体">
            <div className="grid grid-cols-3 gap-1">
              {([
                ["sans", "黑体"],
                ["serif", "宋体"],
                ["system", "系统"],
                ["kai", "楷体"],
                ["mono", "等宽"],
                ["fangsong", "仿宋"],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => app.setTheme(resumeId, { font_family: k })}
                  className={cx(
                    "rounded-md px-1.5 py-1 text-[11px] font-medium transition",
                    (resume.theme.font_family ?? "sans") === k ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200" : "bg-paper-100 text-ink-500 hover:bg-paper-200 hover:text-ink-800"
                  )}
                  title={`字体：${label}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </MenuSection>
        </ToolbarMenu>

        {/* 布局下拉：密度 + 条头（条头仅非 ATS） */}
        <ToolbarMenu label="排版布局" hint="间距 · 疏密 · 一页篇幅" desc="调整整份简历的行距与模块间距：内容偏多选紧凑，偏少选宽松，让简历恰好一页。" icon={IconLayout}>
          <MenuSection title="密度（内容多选紧凑）">
            <div className="flex gap-1 rounded-lg bg-paper-100 p-0.5">
              {([["compact", "紧凑"], ["medium", "中等"], ["loose", "宽松"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => app.setTheme(resumeId, { density: k })}
                  className={cx(
                    "flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition",
                    (resume.theme.density ?? "medium") === k ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200" : "text-ink-500 hover:bg-paper-200 hover:text-ink-800"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </MenuSection>
          {resume.template_id !== "classic_ats" && (
            <MenuSection title="条目标题排布">
              <div className="flex gap-1 rounded-lg bg-paper-100 p-0.5">
                {([["row", "标题 · 日期同行"], ["stack", "日期另起一行"]] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => app.setTheme(resumeId, { header_layout: k })}
                    className={cx(
                      "flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition",
                      (resume.theme.header_layout ?? "row") === k ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200" : "text-ink-500 hover:bg-paper-200 hover:text-ink-800"
                    )}
                    title={k === "row" ? "标题居左，日期居右" : "标题居上，日期与地点居下"}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </MenuSection>
          )}

          {resume.template_id !== "classic_ats" && (
            <MenuSection title="头像大小">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={resume.theme.avatar_scale ?? 1}
                  onChange={(e) => app.setTheme(resumeId, { avatar_scale: Number(e.target.value) })}
                  className="h-1 min-w-0 flex-1 accent-brand-600"
                  aria-label="头像显示比例"
                />
                <span className="w-10 shrink-0 text-right font-mono text-[11px] text-ink-500">{(resume.theme.avatar_scale ?? 1).toFixed(1)}×</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-ink-400">基于 1 寸照（25×35mm）基准按比例缩放，0.5×–2.0×；未上传头像时无效。</p>
            </MenuSection>
          )}

          <MenuSection title="要点列表">
            <p className="rounded-lg bg-paper-100 px-2 py-1.5 text-[11px] leading-snug text-ink-500">
              已改为<strong className="font-semibold text-ink-700">按模块设置</strong>：在中间栏各模块的「要点」编辑区右上角切换（菱形 / 圆点 / 方块 / 空心圆 / 箭头 / 对勾 / 有序），每条要点可点行首符号单独开关。
            </p>
          </MenuSection>
        </ToolbarMenu>

        {/* 操作组 */}
        <div className="ml-auto flex items-center gap-2">
          <Btn variant="outline" className="h-8 text-[12px]" onClick={() => setAddSecOpen(true)}>
            <IconPlus size={13} /> 添加模块
          </Btn>
          <Btn variant="primary" className="h-8 text-[12px]" onClick={() => setPreviewOpen(true)}>
            <IconPrinter size={13} /> 预览 / 导出 PDF
          </Btn>
        </div>
      </div>

      {/* 三栏 */}
      <div className="grid min-h-0 flex-1 grid-cols-[218px_minmax(0,1fr)_352px]">
        <aside className="min-h-0 overflow-y-auto border-r border-ink-200 bg-paper-50">
          <OutlinePanel resume={resume} />
        </aside>

        <main className="min-h-0 overflow-y-auto bg-paper-100 px-4 py-4">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={sections.map((s) => s.section_id)} strategy={verticalListSortingStrategy}>
              <div className="mx-auto flex max-w-3xl flex-col gap-3 pb-8">
                {sections.map((s) => (
                  <SortableSection key={s.section_id} resume={resume} section={s} onRequestAI={onRequestAI} />
                ))}
                <button onClick={() => setAddSecOpen(true)} className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 py-4 text-[13px] font-medium text-ink-400 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700">
                  <IconPlus size={14} /> 添加自定义模块（可参与拖拽排序）
                </button>
              </div>
            </SortableContext>
          </DndContext>
        </main>

        <aside className="flex min-h-0 flex-col border-l border-ink-200 bg-paper-50">
          <div className="flex border-b border-ink-200">
            {(
              [
                ["ai", "AI 建议", <IconSpark key="a" size={13} />],
                ["jd", "JD 匹配", <IconTarget key="j" size={13} />],
              ] as const
            ).map(([k, label, icon]) => (
              <button key={k} onClick={() => setPanelTab(k)} className={cx("relative flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[12.5px] font-bold transition", panelTab === k ? "text-brand-700" : "text-ink-400 hover:text-ink-700")}>
                {icon} {label}
                {panelTab === k && <motion.span layoutId="editor-panel-tab-underline" transition={{ type: "spring", stiffness: 420, damping: 34 }} className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-brand-600" />}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {panelTab === "ai" ? <AIPanel resume={resume} activeTarget={activeTarget} /> : <JDPanel resume={resume} />}
          </div>
        </aside>
      </div>

      {/* 添加自定义模块 */}
      <Modal open={addSecOpen} onClose={() => setAddSecOpen(false)} width="max-w-sm">
        <ModalHeader title="添加自定义模块" sub="自定义模块可重命名、拖拽排序，并参与预览与导出" onClose={() => setAddSecOpen(false)} />
        <div className="px-5 pb-5">
          <input autoFocus className="field-input" placeholder="如：开源贡献 / 发表作品 / 语言能力" value={newSecTitle} onChange={(e) => setNewSecTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newSecTitle.trim()) { app.addSection(resumeId, newSecTitle.trim()); setNewSecTitle(""); setAddSecOpen(false); app.toast("ok", "模块已添加"); } }} />
          <div className="mt-3 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setAddSecOpen(false)}>取消</Btn>
            <Btn variant="primary" disabled={!newSecTitle.trim()} onClick={() => { app.addSection(resumeId, newSecTitle.trim()); setNewSecTitle(""); setAddSecOpen(false); app.toast("ok", "模块已添加"); }}>添加</Btn>
          </div>
        </div>
      </Modal>

      {/* 预览 / 导出 */}
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} width="max-w-4xl" bare>
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[15px] font-bold text-ink-900">模板预览</h3>
            <span className="chip bg-paper-200 font-mono text-[10px] text-ink-500">{TEMPLATES.find((t) => t.template_id === resume.template_id)?.name}</span>
            <span className="chip bg-brand-50 font-mono text-[10px] text-brand-700 ring-1 ring-brand-200">A4 · 文本可复制</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex rounded-lg bg-paper-200 p-0.5">
              {ZOOM_LEVELS.map((z) => (
                <button key={z} onClick={() => setZoom(z)} className={cx("rounded-md px-2 py-0.5 font-mono text-[10.5px] font-bold transition", zoom === z ? "bg-white text-ink-900 shadow-sm" : "text-ink-400")}>
                  {Math.round(z * 100)}%
                </button>
              ))}
            </div>
            <button className="tool-btn" onClick={() => setPreviewOpen(false)} aria-label="关闭预览">
              <IconX size={15} />
            </button>
          </div>
        </div>
        <div className="overflow-auto bg-ink-100/60 px-4 py-5" style={{ maxHeight: "70vh" }}>
          <div className="mx-auto origin-top transition-transform duration-200" style={{ width: 794 * zoom, height: 1123 * zoom }}>
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: 794 }}>
              <A4Sheet resume={resume} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 bg-paper-25 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-[11.5px] font-medium text-ink-700">{exportName}</p>
            <p className="text-[10.5px] text-ink-400">点击「打印 / 另存为 PDF」后在系统对话框选择「另存为 PDF」· 按当前模块顺序与显示状态导出</p>
          </div>
          <Btn variant="primary" className="h-9 px-4" onClick={() => window.print()}>
            <IconPrinter size={14} /> 打印 / 另存为 PDF
          </Btn>
        </div>
      </Modal>

      {/* 打印专用节点：portal 到 body，避免随 #app-root 一起被隐藏；仅 @media print 时可见 */}
      {previewOpen &&
        createPortal(
          <div className="print-only">
            <A4Sheet resume={resume} forPrint />
          </div>,
          document.body
        )}
    </div>
  );
}
