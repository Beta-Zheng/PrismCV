import { useCallback, useRef, useState } from "react";
import type { Resume, SourceKind } from "../types";
import { TEMPLATES } from "../types";
import { ACCEPT_EXTS, MAX_FILE_SIZE, extractFileText, structureResume, emptyResume, type SupportedExt } from "../lib/parser";
import { buildSampleResume } from "../lib/samples";
import { formatBytes, cx, timeAgo } from "../lib/utils";
import { useApp } from "../lib/store";
import { Btn, Confirm, Modal, ModalHeader } from "../components/ui";
import { IconArrowRight, IconCheck, IconClipboard, IconFile, IconLayers, IconPlus, IconShield, IconSpark, IconTrash, IconUpload, IconAlert, IconZap } from "../components/icons";

type PipeStep = { label: string; state: "wait" | "run" | "done" | "fail" };

const PIPE_STEPS: PipeStep[] = [
  { label: "校验文件", state: "wait" },
  { label: "提取文本", state: "wait" },
  { label: "规则结构化", state: "wait" },
  { label: "生成草稿", state: "wait" },
];

export default function Home() {
  const { resumes, models, privacy, externalCallCount, go, createResume, deleteResume, duplicateResume, toast } = useApp();
  const [modal, setModal] = useState<"create" | null>(null);
  const [tab, setTab] = useState<"file" | "paste">("file");
  const [pipe, setPipe] = useState<PipeStep[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [delTarget, setDelTarget] = useState<Resume | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const runningRef = useRef(false);

  const setStep = (i: number, state: PipeStep["state"]) => setPipe((p) => (p ? p.map((s, idx) => (idx === i ? { ...s, state } : idx > i && state === "run" ? s : s)) : p));

  const finishTo = useCallback(
    (data: ReturnType<typeof structureResume>, title: string) => {
      const id = createResume(data, title);
      setModal(null);
      setPipe(null);
      setError(null);
      toast("ok", "简历草稿已创建，请进入编辑器确认内容");
      go({ name: "editor", resumeId: id });
    },
    [createResume, go, toast]
  );

  const runParse = useCallback(
    async (text: string, source: SourceKind, sourceName?: string, keepPipe = false) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setParsing(true);
      setError(null);
      if (!keepPipe) {
        setPipe(PIPE_STEPS.map((s) => ({ ...s })));
        setStep(0, "run");
        await new Promise((r) => setTimeout(r, 260));
        setStep(0, "done");
        setStep(1, "run");
        await new Promise((r) => setTimeout(r, 220));
        setStep(1, "done");
      }
      setStep(2, "run");
      const data = structureResume(text, source, sourceName);
      await new Promise((r) => setTimeout(r, 340));
      // 有意义内容 = 任意「真实」模块含实质块，或基本信息已抓到姓名/邮箱/电话。
      // 注意：summary/skills 两栏永远各塞一个空占位块，所以必须按「description/skills 是否非空」判断，
      // 否则 hasContent 恒为 true、失败分支（未能识别）永远走不到（原代码即此死代码）。
      const hasContent =
        data.sections.some((s) => {
          if (s.type === "summary") return s.blocks.some((b) => b.description?.trim());
          if (s.type === "skills") return s.blocks.some((b) => (b.skills?.length ?? 0) > 0);
          return s.blocks.length > 0;
        }) || !!(data.basic_info.name || data.basic_info.email || data.basic_info.phone);
      setStep(2, hasContent ? "done" : "fail");
      if (!hasContent) {
        setStep(3, "fail");
        setError("未能从文本中识别出结构化内容。你可以直接点击下方按钮创建空白草稿，再手动填写各模块。");
        runningRef.current = false;
        setParsing(false);
        return;
      }
      setStep(3, "run");
      await new Promise((r) => setTimeout(r, 220));
      setStep(3, "done");
      runningRef.current = false;
      setParsing(false);
      setTimeout(() => finishTo(data, data.basic_info.name || sourceName?.replace(/\.\w+$/, "") || "未命名简历"), 300);
    },
    [finishTo]
  );

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setParsing(true);
      const ext = (file.name.split(".").pop() || "").toLowerCase() as SupportedExt;
      if (!ACCEPT_EXTS.includes(ext)) {
        setError(`仅支持 PDF、DOCX、MD、TXT 文件（收到 .${ext || "未知"}）`);
        setParsing(false);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`文件大小超过限制（${formatBytes(file.size)} > 10MB）`);
        setParsing(false);
        return;
      }
      setTab("file");
      setPipe(PIPE_STEPS.map((s) => ({ ...s })));
      setStep(0, "run");
      await new Promise((r) => setTimeout(r, 240));
      setStep(0, "done");
      setStep(1, "run");
      const res = await extractFileText(file, ext);
      if (!res.ok || !res.text) {
        setStep(1, "fail");
        setError(res.error || "文件读取失败");
        setParsing(false);
        return;
      }
      setStep(1, "done");
      if (res.maybeMultiColumn) {
        toast("warn", "检测到疑似多栏 / 分栏版式，解析的阅读顺序可能不准确，请在编辑器中核对，或改用「粘贴文本」");
      }
      runningRef.current = false;
      await runParse(res.text, "file", file.name, true);
    },
    [runParse]
  );

  const localModels = models.filter((m) => m.enabled && m.type !== "external").length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pb-16 pt-8">
      {/* 顶部：工作台标题 + 隐私状态 */}
      <header className="anim-fade-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1.5 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-brand-600">
            <IconZap size={12} /> Local-first Resume Workbench
          </p>
          <h1 className="font-display text-[34px] font-black leading-tight text-ink-900">
            简历工作台
            <span className="ml-3 align-middle font-mono text-[12px] font-medium text-ink-300">v1.1 MVP</span>
          </h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink-500">
            上传简历 → 结构化解析 → 模块编辑与拖拽排序 → JD 匹配 → AI 建议（需确认）→ PDF 导出。默认数据不出本机。
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={cx("chip px-2.5 py-1 text-[11.5px] ring-1", privacy.allowExternal ? "bg-seal-100 text-seal-700 ring-seal-500/30" : "bg-brand-50 text-brand-700 ring-brand-200")}>
            <IconShield size={12} />
            {privacy.allowExternal ? "外部模型已开启" : "本地模式 · 外部模型默认关闭"}
          </span>
          <div className="flex gap-4 font-mono text-[11px] text-ink-400">
            <span><b className="text-ink-800">{resumes.length}</b> 份简历</span>
            <span><b className="text-ink-800">{localModels}</b> 个本地模型</span>
            <span><b className="text-ink-800">{externalCallCount}</b> 次外部调用</span>
          </div>
        </div>
      </header>

      {/* 创建区：非对称工作台 */}
      <div className="grid gap-3 md:grid-cols-[1.35fr_1fr]">
        <button
          onClick={() => { setModal("create"); setTab("file"); setError(null); setPipe(null); }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) { setModal("create"); handleFile(f); }
          }}
          className={cx(
            "anim-fade-up group relative flex min-h-[190px] flex-col justify-between overflow-hidden rounded-2xl border-2 border-dashed p-5 text-left transition-all duration-200",
            dragOver ? "border-brand-500 bg-brand-50 shadow-lg shadow-brand-900/10" : "border-ink-200 bg-paper-25 hover:border-brand-400 hover:bg-white hover:shadow-md hover:shadow-ink-950/5"
          )}
          style={{ animationDelay: "0.05s" }}
        >
          <div className="flex items-start justify-between">
            <span className={cx("flex h-11 w-11 items-center justify-center rounded-xl transition-colors", dragOver ? "bg-brand-600 text-white" : "bg-ink-900 text-paper-50 group-hover:bg-brand-600")}>
              <IconUpload size={20} />
            </span>
            <span className="chip bg-paper-200 font-mono text-[10px] text-ink-500">≤ 10MB</span>
          </div>
          <div>
            <p className="text-[16px] font-bold text-ink-900">上传简历文件</p>
            <p className="mt-1 text-[12px] text-ink-400">拖拽到此处，或点击选择文件</p>
            <div className="mt-2.5 flex gap-1.5">
              {[".pdf", ".docx", ".md", ".txt"].map((t) => (
                <span key={t} className="chip bg-paper-200 font-mono text-[10.5px] text-ink-600 transition group-hover:bg-brand-50 group-hover:text-brand-700">{t}</span>
              ))}
            </div>
          </div>
          <span className="pointer-events-none absolute -right-5 -top-5 h-24 w-24 rounded-full bg-brand-100/70 blur-2xl transition-opacity opacity-0 group-hover:opacity-100" />
        </button>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => { setModal("create"); setTab("paste"); setError(null); setPipe(null); }}
            className="anim-fade-up group flex flex-1 items-center gap-3 rounded-2xl border border-ink-200 bg-paper-25 px-4 py-3.5 text-left transition-all duration-200 hover:border-brand-400 hover:bg-white hover:shadow-md hover:shadow-ink-950/5"
            style={{ animationDelay: "0.1s" }}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
              <IconClipboard size={17} />
            </span>
            <span>
              <span className="block text-[14px] font-bold text-ink-900">粘贴简历文本</span>
              <span className="block text-[11.5px] text-ink-400">无文件时的兜底入口，直接解析纯文本</span>
            </span>
            <IconArrowRight size={15} className="ml-auto text-ink-200 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => {
                const id = createResume(emptyResume(), "未命名简历");
                toast("ok", "已创建空白简历");
                go({ name: "editor", resumeId: id });
              }}
              className="anim-fade-up group flex flex-1 items-center justify-center gap-2 rounded-2xl border border-ink-200 bg-paper-25 px-3 py-3 text-[13px] font-bold text-ink-700 transition-all duration-200 hover:border-ink-400 hover:bg-ink-900 hover:text-paper-50"
              style={{ animationDelay: "0.15s" }}
            >
              <IconPlus size={14} /> 空白简历
            </button>
            <button
              onClick={() => {
                const id = createResume(buildSampleResume(), "陈墨（示例）");
                toast("ok", "已载入示例简历，可随意修改");
                go({ name: "editor", resumeId: id });
              }}
              className="anim-fade-up group flex flex-1 items-center justify-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 px-3 py-3 text-[13px] font-bold text-brand-700 transition-all duration-200 hover:bg-brand-600 hover:text-white"
              style={{ animationDelay: "0.2s" }}
            >
              <IconSpark size={14} /> 载入示例
            </button>
          </div>
        </div>
      </div>

      {/* 最近简历 */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="font-display text-[18px] font-bold text-ink-900">最近简历</h2>
          <span className="font-mono text-[11px] text-ink-300">{resumes.length ? `共 ${resumes.length} 份 · 保存在本机` : "数据保存在本机 localStorage"}</span>
        </div>

        {resumes.length === 0 ? (
          <div className="anim-fade-up flex flex-col items-center rounded-2xl border border-ink-200 bg-paper-25 px-6 py-12 text-center">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-900 text-paper-50">
              <IconFile size={24} />
            </span>
            <p className="text-[15px] font-bold text-ink-800">还没有简历</p>
            <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-400">上传一份现有简历，或从示例开始体验完整流程：解析 → 编辑 → JD 匹配 → AI 建议 → 导出。</p>
          </div>
        ) : (
          <ul className="stagger flex flex-col gap-2">
            {resumes.map((r) => (
              <li key={r.id} className="group flex items-center gap-4 rounded-xl border border-ink-200 bg-paper-25 px-4 py-3 transition-all duration-150 hover:border-brand-300 hover:bg-white hover:shadow-md hover:shadow-ink-950/5">
                <button onClick={() => go({ name: "editor", resumeId: r.id })} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg font-display text-[17px] font-black" style={{ background: r.theme.primary_color + "1a", color: r.theme.primary_color }}>
                    {(r.data.basic_info.name || r.title).slice(0, 1)}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-bold text-ink-900">{r.data.basic_info.name || r.title}</span>
                      {r.data.basic_info.title && <span className="hidden truncate text-[12px] text-ink-400 sm:inline">{r.data.basic_info.title}</span>}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] text-ink-300">
                      <span>{timeAgo(r.updated_at)}更新</span>
                      <span className="chip bg-paper-200 py-0 text-[10px]">{TEMPLATES.find((t) => t.template_id === r.template_id)?.name ?? "自定义"}</span>
                      <span className="chip bg-paper-200 py-0 text-[10px]">{r.data.sections.filter((s) => s.visible).length} 个模块</span>
                      <span className="chip bg-paper-200 py-0 text-[10px]">来源 {r.data.metadata.source}</span>
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <Btn variant="primary" className="h-8 px-3 text-[12px]" onClick={() => go({ name: "editor", resumeId: r.id })}>
                    打开 <IconArrowRight size={12} />
                  </Btn>
                  <button className="tool-btn" onClick={() => duplicateResume(r.id)} title="复制" aria-label="复制简历">
                    <IconLayers size={15} />
                  </button>
                  <button className="tool-btn hover:bg-danger-100 hover:text-danger-600" onClick={() => setDelTarget(r)} title="删除" aria-label="删除简历">
                    <IconTrash size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 流程说明条 */}
      <div className="anim-fade-up mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-ink-200 bg-ink-900 px-5 py-3.5" style={{ animationDelay: "0.25s" }}>
        {["上传 / 粘贴", "结构化解析", "编辑 + 拖拽排序", "JD 匹配 & AI 建议", "模板预览", "PDF 导出"].map((s, i) => (
          <span key={s} className="flex items-center gap-2 text-[11.5px] font-medium text-paper-200">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 font-mono text-[10px] font-bold text-white">{i + 1}</span>
            {s}
            {i < 5 && <IconArrowRight size={11} className="ml-3 text-ink-600" />}
          </span>
        ))}
      </div>

      {/* 创建弹窗 */}
      <Modal open={modal === "create"} onClose={() => { if (!runningRef.current) { setModal(null); setPipe(null); setError(null); setParsing(false); } }} width="max-w-xl">
        <ModalHeader title="创建简历" sub="支持 PDF / DOCX / MD / TXT，或粘贴纯文本；解析失败可随时切换到粘贴兜底" onClose={() => { if (!runningRef.current) { setModal(null); setPipe(null); setError(null); setParsing(false); } }} />
        <div className="px-5 pb-5">
          <div className="mb-4 mt-1 flex rounded-lg bg-paper-200 p-0.5">
            {([["file", "上传文件"], ["paste", "粘贴文本"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => { if (!runningRef.current) { setTab(k); setError(null); } }} className={cx("flex-1 rounded-md py-1.5 text-[12.5px] font-bold transition", tab === k ? "bg-white text-ink-900 shadow-sm" : "text-ink-400 hover:text-ink-700")}>
                {label}
              </button>
            ))}
          </div>

          {tab === "file" && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              className={cx("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all", dragOver ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-paper-50 hover:border-brand-400 hover:bg-white")}
            >
              <IconUpload size={26} className={cx("mb-2 transition-colors", dragOver ? "text-brand-600" : "text-ink-300")} />
              <p className="text-[13.5px] font-bold text-ink-800">拖拽文件到这里，或点击选择</p>
              <p className="mt-1 font-mono text-[11px] text-ink-300">.pdf · .docx · .md · .txt — 单个文件 ≤ 10MB</p>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.md,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
            </div>
          )}

          {tab === "paste" && (
            <div>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={9} placeholder={"粘贴简历全文，例如：\n\n陈墨\n高级前端工程师\nchenmo@example.com\n\n工作经历\n星云科技 | 高级前端工程师 2021.03 - 至今\n- 主导交易中台重构…"} className="field-input resize-none leading-relaxed" />
              <div className="mt-2.5 flex justify-end gap-2">
                <Btn variant="ghost" onClick={() => setPasteText("")}>清空</Btn>
                <Btn variant="primary" disabled={!pasteText.trim() || parsing} onClick={() => { if (!pasteText.trim()) { toast("warn", "请输入简历内容"); return; } runParse(pasteText, "pasted_text"); }}>
                  <IconSpark size={13} /> 解析文本
                </Btn>
              </div>
            </div>
          )}

          {/* 解析流水线 */}
          {pipe && (
            <div className="anim-fade-up mt-4 rounded-xl border border-ink-200 bg-paper-50 p-3.5">
              <p className="mb-2 font-mono text-[10.5px] uppercase tracking-widest text-ink-400">解析流水线</p>
              <div className="grid grid-cols-4 gap-2">
                {pipe.map((s, i) => (
                  <div key={s.label} className={cx("rounded-lg border px-2 py-2 text-center transition-all duration-300", s.state === "done" && "border-brand-200 bg-brand-50", s.state === "run" && "border-seal-500/40 bg-seal-100", s.state === "fail" && "border-danger-600/30 bg-danger-100", s.state === "wait" && "border-ink-100 bg-white opacity-60")}>
                    <span className={cx("mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full", s.state === "done" ? "bg-brand-600 text-white" : s.state === "run" ? "bg-seal-500 text-white" : s.state === "fail" ? "bg-danger-600 text-white" : "bg-paper-200 text-ink-300")}>
                      {s.state === "done" ? <IconCheck size={11} /> : s.state === "fail" ? <IconAlert size={11} /> : <span className={cx("font-mono text-[9.5px] font-bold", s.state === "run" && "anim-pulse-dot")}>{i + 1}</span>}
                    </span>
                    <span className={cx("text-[10.5px] font-medium", s.state === "fail" ? "text-danger-700" : s.state === "wait" ? "text-ink-300" : "text-ink-700")}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="anim-fade-up mt-4 flex items-start gap-2.5 rounded-xl border border-danger-600/25 bg-danger-100/70 px-3.5 py-3">
              <IconAlert size={15} className="mt-0.5 shrink-0 text-danger-600" />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-bold text-danger-700">{error}</p>
                <div className="mt-2 flex gap-2">
                  <Btn variant="danger" className="h-7 px-2.5 text-[12px]" onClick={() => { setTab("paste"); setError(null); }}>
                    <IconClipboard size={12} /> 改为粘贴文本
                  </Btn>
                  {pipe && pipe[2].state === "fail" && (
                    <Btn variant="outline" className="h-7 px-2.5 text-[12px]" onClick={() => { const id = createResume(emptyResume(), "未命名简历"); setModal(null); setPipe(null); go({ name: "editor", resumeId: id }); }}>
                      创建空白草稿
                    </Btn>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Confirm
        open={!!delTarget}
        danger
        title={`删除「${delTarget?.title}」？`}
        desc="该简历及其相关 Block、AI 建议记录、JD 将一并删除，此操作不可撤销。"
        confirmText="删除简历"
        onConfirm={() => { if (delTarget) { deleteResume(delTarget.id); toast("ok", "简历已删除"); } setDelTarget(null); }}
        onCancel={() => setDelTarget(null)}
      />
    </div>
  );
}
