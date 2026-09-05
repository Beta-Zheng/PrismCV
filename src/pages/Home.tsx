import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Resume, SectionType, SourceKind } from "../types";
import { TEMPLATES } from "../types";
import { ACCEPT_EXTS, MAX_FILE_SIZE, extractFileText, structureResume, emptyResume, type SupportedExt } from "../lib/parser";
import { buildSampleResume } from "../lib/samples";
import { formatBytes, cx, timeAgo } from "../lib/utils";
import { useApp } from "../lib/store";
import { celebrateBig } from "../lib/celebrate";
import { Btn, Confirm, Modal, ModalHeader } from "../components/ui";
import { IconArrowRight, IconCheck, IconClipboard, IconFile, IconLayers, IconPlus, IconShield, IconSpark, IconTrash, IconUpload, IconAlert, IconZap } from "../components/icons";

type PipeStep = { label: string; state: "wait" | "run" | "done" | "fail" };

const PIPE_STEPS: PipeStep[] = [
  { label: "校验文件", state: "wait" },
  { label: "提取文本", state: "wait" },
  { label: "规则结构化", state: "wait" },
  { label: "生成草稿", state: "wait" },
];

/* ---------------- 仪表盘数据推导（全部来自真实 store，不编造） ---------------- */

/** 与设计稿对齐的 6 个核心模块：完成度与进度点的统一分母 */
const CORE_MODULES: { type: SectionType; label: string }[] = [
  { type: "basic_info", label: "基本信息" },
  { type: "summary", label: "个人总结" },
  { type: "work_experience", label: "工作经历" },
  { type: "project_experience", label: "项目经历" },
  { type: "education", label: "教育经历" },
  { type: "skills", label: "技能" },
];

type Section = Resume["data"]["sections"][number];

/** 与 runParse 的 hasContent 同一口径：summary 看 description、skills 看词条数，其余看块数 */
function sectionHasContent(s: Section): boolean {
  if (s.type === "summary") return s.blocks.some((b) => b.description?.trim());
  if (s.type === "skills") return s.blocks.some((b) => (b.skills?.length ?? 0) > 0);
  return s.blocks.length > 0;
}

function moduleFilled(r: Resume, type: SectionType): boolean {
  if (type === "basic_info") {
    const b = r.data.basic_info;
    return !!(b.name || b.email || b.phone);
  }
  const s = r.data.sections.find((x) => x.type === type);
  return s ? sectionHasContent(s) : false;
}

/** 完成度环（光谱描边）：光谱在设计系统中是"AI 参与度"的语义色，完成度环是设计 §2 明确豁免的三处之一 */
function MiniRing({ pct, size = 46 }: { pct: number; size?: number }) {
  const stroke = 4.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0" title={`核心模块完成度 ${pct}%（基本信息/总结/工作/项目/教育/技能）`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#sp-grad-ring)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
          className="anim-ring-draw"
          style={{ ["--ring-c" as string]: `${c}`, transition: "stroke-dashoffset .45s cubic-bezier(.22,1,.36,1)" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-bold text-ink-800">{pct}</span>
    </span>
  );
}

/** 统计数字入场：从 0 计数到目标值（550ms ease-out；reduced-motion 直接显示终值，非纯数字如「—」不参与） */
function StatValue({ value }: { value: string }) {
  const m = value.match(/^(\d+)(%?)$/);
  const target = m ? Number(m[1]) : null;
  const suffix = m?.[2] ?? "";
  const [display, setDisplay] = useState(target === null ? value : "0" + suffix);
  useEffect(() => {
    if (target === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(target + suffix);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = 550;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setDisplay(Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return <p className="mt-1 font-mono text-[26px] font-bold leading-none tabular-nums text-ink-900">{display}</p>;
}

export default function Home() {
  const { resumes, suggestions, privacy, externalCallCount, go, createResume, deleteResume, duplicateResume, toast } = useApp();
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
      noteFirstResume();
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

  const hadResumes = useRef(resumes.length > 0);
  /** 从 0 → 1 创建首份简历：值得一个小庆祝（celebrateBig 自带 reduced-motion 降级） */
  const noteFirstResume = () => {
    if (!hadResumes.current) celebrateBig();
    hadResumes.current = true;
  };

  const openCreate = (t: "file" | "paste") => {
    setModal("create");
    setTab(t);
    setError(null);
    setPipe(null);
  };
  const createBlank = () => {
    const id = createResume(emptyResume(), "未命名简历");
    noteFirstResume();
    toast("ok", "已创建空白简历");
    go({ name: "editor", resumeId: id });
  };
  const loadSample = () => {
    const data = buildSampleResume();
    const id = createResume(data, `${data.basic_info.name}（示例）`);
    noteFirstResume();
    toast("ok", "已载入示例简历，可随意修改");
    go({ name: "editor", resumeId: id });
  };

  /* ---------- 数据带：四个真实指标（JD 分未持久化，不展示编造值） ---------- */
  const resolvedSugs = suggestions.filter((s) => s.resolution);
  const acceptedSugs = resolvedSugs.filter((s) => s.resolution === "accepted" || s.resolution === "edited_accepted");
  const acceptRate = resolvedSugs.length ? Math.round((acceptedSugs.length / resolvedSugs.length) * 100) : null;
  const pendingCount = suggestions.filter((s) => s.status === "success" && !s.resolution).length;

  const stats: { label: React.ReactNode; value: string; sub: string }[] = [
    { label: "简历总数", value: String(resumes.length), sub: resumes.length ? "全部保存在本机" : "从新建开始" },
    {
      label: (
        <span className="flex items-center gap-1.5">
          <span className="sp-dot" /> AI 建议接受率
        </span>
      ),
      value: acceptRate === null ? "—" : `${acceptRate}%`,
      sub: resolvedSugs.length ? `已处理 ${resolvedSugs.length} 条建议` : "还没有 AI 建议",
    },
    {
      label: (
        <span className="flex items-center gap-1.5">
          <span className="sp-dot" /> 待确认建议
        </span>
      ),
      value: String(pendingCount),
      sub: pendingCount ? "打开简历逐条确认" : "没有待处理项",
    },
    { label: "外部调用", value: String(externalCallCount), sub: privacy.allowExternal ? "外部模型已开启" : "数据未出本机" },
  ];

  return (
    <div
      className="relative mx-auto flex w-full max-w-6xl flex-col gap-7 px-6 pb-20 pt-10"
      onDragOver={(e) => {
        if (modal) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (modal) return;
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) {
          openCreate("file");
          handleFile(f);
        }
      }}
    >
      {/* 光谱渐变定义：完成度环共享（全站渐变只定义一次） */}
      <svg aria-hidden className="absolute h-0 w-0">
        <defs>
          <linearGradient id="sp-grad-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--color-sp-a)" }} />
            <stop offset="50%" style={{ stopColor: "var(--color-sp-b)" }} />
            <stop offset="100%" style={{ stopColor: "var(--color-sp-c)" }} />
          </linearGradient>
        </defs>
      </svg>
      {/* 页面级拖拽上传遮罩：取代旧上传大卡，入口收进问候行主按钮（评审 P1-9 方案①） */}
      {dragOver && !modal && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-page/70 backdrop-blur-sm">
          <div className="ai-ring rounded-2xl px-7 py-4 text-[14px] font-bold text-ink-800">松开鼠标，上传这份简历</div>
        </div>
      )}
      {/* 品牌氛围光：低透明度径向渐变，不参与交互 */}
      <div aria-hidden className="pointer-events-none absolute -top-10 right-0 -z-10 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />

      {/* 问候行：serif 标题 + 隐私徽章 + 新建主按钮（本页唯一实心光谱 CTA） */}
      <header className="anim-fade-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1.5 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-brand-600">
            <IconZap size={12} /> Local-first Resume Workbench
          </p>
          <h1 className="font-display text-[34px] font-black leading-tight text-ink-900">简历工作台</h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink-500">
            上传简历 → 结构化解析 → 模块编辑与拖拽排序 → JD 匹配 → AI 建议（需确认）→ PDF 导出。默认数据不出本机。
          </p>
        </div>
        <div className="flex flex-col items-end gap-2.5">
          <span className={cx("chip px-2.5 py-1 text-[11.5px] ring-1", privacy.allowExternal ? "bg-warn-bg text-warn ring-warn/30" : "bg-ok-bg text-ok ring-ok/30")}>
            <IconShield size={12} />
            {privacy.allowExternal ? "外部模型已开启" : "本地模式 · 外部模型默认关闭"}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button onClick={() => openCreate("file")} className="cta-ai flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-bold">
              <IconPlus size={14} /> 新建简历
            </button>
            <button onClick={() => openCreate("paste")} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[12.5px] font-medium text-ink-700 transition hover:border-brand-300 hover:text-brand-700">
              <IconClipboard size={13} /> 粘贴文本
            </button>
            <button onClick={createBlank} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[12.5px] font-medium text-ink-700 transition hover:border-brand-300 hover:text-brand-700">
              空白简历
            </button>
            <button onClick={loadSample} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[12.5px] font-medium text-ink-700 transition hover:border-brand-300 hover:text-brand-700">
              <IconSpark size={13} /> 载入示例
            </button>
          </div>
        </div>
      </header>

      {/* 数据带：纯数字四格（mono 数字；AI 指标带 sp-dot，看到光谱 = AI） */}
      <section className="anim-fade-up grid grid-cols-2 gap-4 sm:grid-cols-4" style={{ animationDelay: "0.05s" }}>
        {stats.map((s, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface px-5 py-4">
            <p className="text-[11px] font-medium text-ink-400">{s.label}</p>
            <StatValue value={s.value} />
            <p className="mt-1.5 text-[10.5px] text-ink-400">{s.sub}</p>
          </div>
        ))}
      </section>

      {/* 简历卡网格 */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="font-display text-[18px] font-bold text-ink-900">最近简历</h2>
          <span className="flex items-center gap-3 font-mono text-[10px] text-ink-400">
            <span className="flex items-center gap-1"><span className="h-[7px] w-[7px] rounded-full bg-brand-500" /> 已填写</span>
            <span className="flex items-center gap-1"><span className="sp-dot" /> AI 参与</span>
            <span className="flex items-center gap-1"><span className="h-[7px] w-[7px] rounded-full bg-line" /> 未开始</span>
            {resumes.length > 0 && <span className="ml-1">共 {resumes.length} 份</span>}
          </span>
        </div>

        {resumes.length === 0 ? (
          <div className="anim-fade-up flex flex-col items-center rounded-2xl border border-line bg-surface px-6 py-12 text-center">
            <span className="bg-brand-gradient shadow-brand-glow mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-white">
              <IconFile size={24} />
            </span>
            <p className="text-[15px] font-bold text-ink-800">还没有简历</p>
            <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-400">上传一份现有简历，或从示例开始体验完整流程：解析 → 编辑 → JD 匹配 → AI 建议 → 导出。</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => openCreate("file")} className="cta-ai flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold">
                <IconPlus size={14} /> 新建简历
              </button>
              <button onClick={loadSample} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] font-medium text-ink-700 transition hover:border-brand-300 hover:text-brand-700">
                <IconSpark size={13} /> 载入示例
              </button>
            </div>
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {resumes.map((r) => {
                const sugSectionIds = new Set(suggestions.filter((s) => s.resume_id === r.id && s.status === "success").map((s) => s.section_id));
                const dots = CORE_MODULES.map((m) => {
                  const ai = m.type !== "basic_info" && sugSectionIds.has(m.type);
                  const filled = moduleFilled(r, m.type);
                  return { ...m, state: (ai ? "ai" : filled ? "filled" : "empty") as "ai" | "filled" | "empty" };
                });
                const completion = Math.round((dots.filter((d) => d.state !== "empty").length / dots.length) * 100);
                const pending = suggestions.filter((s) => s.resume_id === r.id && s.status === "success" && !s.resolution).length;
                return (
                  <motion.li
                    key={r.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } }}
                    exit={{ opacity: 0, x: 40, transition: { duration: 0.18, ease: "easeIn" } }}
                    className="group flex flex-col rounded-2xl border border-line bg-surface p-4 transition-all duration-200 hover:-translate-y-[2px] hover:border-brand-200 hover:shadow-[0_6px_18px_-10px_rgba(27,28,31,.18)]"
                  >
                    <button onClick={() => go({ name: "editor", resumeId: r.id })} className="flex w-full items-start gap-3 text-left">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg font-display text-[17px] font-black" style={{ background: r.theme.primary_color + "1a", color: r.theme.primary_color }}>
                        {(r.data.basic_info.name || r.title).slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[14.5px] font-bold text-ink-900">{r.data.basic_info.name || r.title}</span>
                          {r.data.basic_info.title && <span className="hidden truncate text-[11.5px] text-ink-400 sm:inline">{r.data.basic_info.title}</span>}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-ink-400">
                          <span>{timeAgo(r.updated_at)}更新</span>
                          <span className="chip bg-subtle py-0 text-[10px] text-ink-500">{TEMPLATES.find((t) => t.template_id === r.template_id)?.name ?? "自定义"}</span>
                          <span className="chip bg-subtle py-0 text-[10px] text-ink-500">{r.data.sections.filter((s) => s.visible).length} 模块</span>
                        </span>
                      </span>
                      <MiniRing pct={completion} />
                    </button>

                    {/* 模块进度点：实=已填写 / 光谱=AI 已参与 / 空=未开始 */}
                    <div className="mt-3 flex items-center gap-1.5">
                      {dots.map((d) => (
                        <span
                          key={d.type}
                          title={`${d.label} · ${d.state === "ai" ? "AI 已参与" : d.state === "filled" ? "已填写" : "未开始"}`}
                          className={cx("h-[7px] w-[7px] rounded-full", d.state === "filled" && "bg-brand-500", d.state === "empty" && "bg-line", d.state === "ai" && "sp-dot")}
                        />
                      ))}
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                      {pending > 0 ? (
                        <span className="ai-ring inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold text-ink-800">
                          {pending} 条建议待确认
                        </span>
                      ) : (
                        <span className="text-[10.5px] text-ink-400">来源 {r.data.metadata.source}</span>
                      )}
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                        <Btn variant="primary" className="h-7 px-2.5 text-[11.5px]" onClick={() => go({ name: "editor", resumeId: r.id })}>
                          打开 <IconArrowRight size={11} />
                        </Btn>
                        <button className="tool-btn" onClick={() => duplicateResume(r.id)} title="复制" aria-label="复制简历">
                          <IconLayers size={14} />
                        </button>
                        <button className="tool-btn hover:bg-danger-100 hover:text-danger-600" onClick={() => setDelTarget(r)} title="删除" aria-label="删除简历">
                          <IconTrash size={14} />
                        </button>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </section>

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
              className={cx("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all", dragOver ? "border-flow" : "border-ink-200 bg-paper-50 hover:border-brand-400 hover:bg-white")}
            >
              <IconUpload size={26} className={cx("mb-2 transition-colors", dragOver ? "text-brand-600" : "text-ink-300")} />
              <p className="text-[13.5px] font-bold text-ink-800">拖拽文件到这里，或点击选择</p>
              <p className="mt-1 font-mono text-[11px] text-ink-300">.pdf · .docx · .md · .txt — 单个文件 ≤ 10MB</p>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.md,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
            </div>
          )}

          {tab === "paste" && (
            <div>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={9} placeholder={"粘贴简历全文，例如：\n\n沈亦航\nAI 应用工程师\nshenyihang@example.com\n\n工作经历\n云阙智能 | AI 应用工程师 2021.03 - 至今\n- 主导企业级 RAG 知识库问答系统…"} className="field-input resize-none leading-relaxed" />
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
