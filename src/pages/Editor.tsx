import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AIAction, Resume, Section } from "../types";
import { TEMPLATES } from "../types";
import { cx, fmtDateCompact, nowISO } from "../lib/utils";
import { useApp, useResume } from "../lib/store";
import { SectionCard } from "../components/blocks";
import { AIPanel, JDPanel, OutlinePanel } from "../components/panels";
import { A4Sheet } from "../components/template";
import { Btn, Modal, ModalHeader, SaveIndicator } from "../components/ui";
import { IconChevronLeft, IconGrip, IconPlus, IconPrinter, IconSpark, IconTarget, IconX } from "../components/icons";

const THEME_COLORS = ["#0e7a6c", "#1d4ed8", "#9f1239", "#b45309", "#334155"];

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

export default function Editor({ resumeId }: { resumeId: string }) {
  const resume = useResume(resumeId);
  const app = useApp();
  const [panelTab, setPanelTab] = useState<"ai" | "jd">("ai");
  const [activeTarget, setActiveTarget] = useState<{ sectionId: string; blockId: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [zoom, setZoom] = useState(0.78);
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
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ink-200 bg-paper-25 px-4 py-2.5">
        <button onClick={() => app.go({ name: "home" })} className="tool-btn h-8 w-8 border border-ink-200 bg-white" aria-label="返回">
          <IconChevronLeft size={16} />
        </button>
        <input
          value={resume.title}
          onChange={(e) => app.renameResume(resumeId, e.target.value)}
          className="w-44 rounded-md border border-transparent bg-transparent px-2 py-1 font-display text-[16px] font-bold text-ink-900 outline-none transition hover:border-ink-200 focus:border-brand-500 focus:bg-white"
          aria-label="简历标题"
        />
        <SaveIndicator />

        <div className="mx-1 hidden h-6 w-px bg-ink-200 sm:block" />

        {/* 模板切换 */}
        <div className="flex rounded-lg bg-paper-200 p-0.5">
          {TEMPLATES.map((t) => (
            <button key={t.template_id} onClick={() => app.setTemplate(resumeId, t.template_id)} className={cx("rounded-md px-2.5 py-1 text-[12px] font-bold transition", resume.template_id === t.template_id ? "bg-ink-900 text-paper-50 shadow-sm" : "text-ink-400 hover:text-ink-800")}>
              {t.name}
            </button>
          ))}
        </div>

        {/* 主题色 */}
        {resume.template_id !== "classic_ats" && (
          <div className="flex items-center gap-1.5">
            {THEME_COLORS.map((c) => (
              <button key={c} onClick={() => app.setTheme(resumeId, { primary_color: c })} className={cx("h-5 w-5 rounded-full border-2 transition-transform hover:scale-110", resume.theme.primary_color === c ? "border-ink-900 scale-110" : "border-white shadow")} style={{ background: c }} aria-label={`主题色 ${c}`} />
            ))}
          </div>
        )}

        {/* 字号 */}
        <div className="flex rounded-lg bg-paper-200 p-0.5">
          {[13, 14, 15].map((n) => (
            <button key={n} onClick={() => app.setTheme(resumeId, { font_size: n })} className={cx("rounded-md px-2 py-1 font-mono text-[11px] font-bold transition", resume.theme.font_size === n ? "bg-white text-ink-900 shadow-sm" : "text-ink-400 hover:text-ink-800")}>
              {n}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Btn variant="outline" className="h-8 text-[12px]" onClick={() => setAddSecOpen(true)}>
            <IconPlus size={13} /> 添加模块
          </Btn>
          <Btn variant="dark" className="h-8 text-[12px]" onClick={() => setPreviewOpen(true)}>
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
                {panelTab === k && <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-brand-600" />}
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
              {[0.62, 0.78, 0.92].map((z) => (
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
