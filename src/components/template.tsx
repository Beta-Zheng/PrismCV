/* ------------------------------------------------------------------
 * 模板渲染器：Resume JSON + Template = Rendered Resume
 * 规则：先按 section.order 排序 → block.order 排序 → 过滤 visible=false
 * 现代单栏 / 经典 ATS 共用一套条目与模块渲染（EntryBody / SectionBlock），
 * 仅通过 TStyle 风格参数区分视觉，避免两份代码分叉导致字段遗漏（如 location）。
 * ------------------------------------------------------------------ */
import type { ReactNode } from "react";
import type { Block, Resume, Section, SectionType, HeaderLayoutKey, BulletStyleKey } from "../types";
import { cx, fontStack, densityVars, isRichHtml, resolveBulletStyle, sanitizeInline } from "../lib/utils";
import { IconArrowRight, IconAward, IconBriefcase, IconFolderGit, IconGraduationCap, IconLayers, IconUser, IconWrench } from "./icons";

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

/**
 * 各模块语义图标：教育=学士帽、工作=公文包、项目=代码分支、证书=奖章、
 * 技能=扳手、总结=人像、自定义=图层。
 * 未覆盖的模块类型会回退为一个小圆点，因此新增 SectionType 时应同步补这里。
 *
 * 选图原则：优先「小尺寸可辨识」。徽章内图标实际只有 0.68em（约 11px），
 * 细节多的图形（如书本翻页、引号弯钩）缩到这个尺寸会糊成一团，
 * 所以 summary 选人像而非书本 —— 后者还与 education 的学士帽语义重叠。
 */
const SECTION_ICON: Partial<Record<SectionType, (props: { size?: number; className?: string }) => ReactNode>> = {
  education: IconGraduationCap,
  work_experience: IconBriefcase,
  project_experience: IconFolderGit,
  certifications: IconAward,
  skills: IconWrench,
  summary: IconUser,
  custom: IconLayers,
};

/** 行内富文本渲染：已是 HTML 则经白名单消毒后渲染，否则把 **关键词** 渲染为加粗 */
function InlineHtml({ html }: { html: string }) {
  return <span dangerouslySetInnerHTML={{ __html: sanitizeInline(html) }} />;
}
function renderRich(text: string): ReactNode {
  if (!text) return null;
  if (isRichHtml(text)) return <InlineHtml html={text} />;
  const segs = text.split("**");
  return segs.map((seg, i) =>
    i % 2 === 1 && seg.length > 0 ? <strong key={i}>{seg}</strong> : <span key={i}>{seg}</span>
  );
}

interface TStyle {
  color: string;
  isATS: boolean;
  bullet: "disc" | "diamond";
  bulletStyle: BulletStyleKey;
  skill: "text" | "chip";
  showLocation: boolean;
  headerLayout: HeaderLayoutKey;
}

/** 根据 bullet_style 渲染一条要点 */
function BulletList({
  bullets,
  bulletStyle,
  color,
  isATS,
}: {
  bullets: string[];
  bulletStyle: BulletStyleKey;
  color: string;
  isATS?: boolean;
}) {
  const renderItem = (bl: string, i: number) => (
    <li key={i} className="flex gap-[0.6em] break-inside-avoid text-[0.92em]" style={{ color: isATS ? "#222" : "#2b3a36" }}>
      <span className={cx("shrink-0 leading-none", bulletStyle === "ordered" ? "mt-[0.15em]" : "mt-[0.52em]")}>
        {bulletStyle === "ordered" ? (
          <span className="inline-block min-w-[1.35em] text-right font-mono text-[0.86em] font-bold tabular-nums" style={{ color: isATS ? "#111" : color }}>
            {i + 1}.
          </span>
        ) : bulletStyle === "disc" ? (
          <span className="block h-[5px] w-[5px] rounded-full" style={{ background: isATS ? "#111" : color }} />
        ) : bulletStyle === "arrow" ? (
          <IconArrowRight size={11} style={{ color: isATS ? "#111" : color }} />
        ) : (
          <span className="block h-[5px] w-[5px] rotate-45" style={{ background: isATS ? "#111" : color }} />
        )}
      </span>
      <span className="flex-1">{renderRich(bl)}</span>
    </li>
  );

  const cls = "mt-[var(--entry-gap)] flex list-none flex-col gap-[var(--bullet-gap)] pl-0";
  if (bulletStyle === "ordered") {
    return <ol className={cls}>{bullets.map((bl, i) => renderItem(bl, i))}</ol>;
  }
  return <ul className={cls}>{bullets.map((bl, i) => renderItem(bl, i))}</ul>;
}

function EntryBody({ block, style }: { block: Block; style: TStyle }) {
  const { color, isATS, skill, showLocation, headerLayout, bulletStyle } = style;
  const bullets = block.bullets.filter(Boolean);
  const hasContent =
    block.title || block.subtitle || block.description || bullets.length > 0 || block.skills.length > 0 || (showLocation && block.location);
  if (!hasContent) return null;
  return (
    <div className="mb-[var(--entry-gap)] break-inside-avoid">
      {(block.title || block.subtitle) &&
        (headerLayout === "stack" ? (
          <p className="text-[1em] font-bold text-ink-900">
            {renderRich(block.title)}
            {block.subtitle && <span className="ml-1.5 font-normal text-ink-500">{renderRich(block.subtitle)}</span>}
          </p>
        ) : (
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[1.02em] font-bold leading-snug text-ink-900">
              {renderRich(block.title)}
              {block.subtitle && (
                <span className="font-normal text-ink-500">
                  <span className="mx-1.5 text-ink-300">·</span>
                  {renderRich(block.subtitle)}
                </span>
              )}
            </p>
            {dateRange(block) && (
              <p className="shrink-0 text-[0.82em] font-medium tabular-nums" style={{ color: isATS ? "#222" : "#64716c" }}>
                {dateRange(block)}
              </p>
            )}
          </div>
        ))}
      {showLocation && block.location && headerLayout !== "stack" && (
        <p className={cx("text-[0.82em]", !isATS && "text-ink-400")} style={isATS ? { color: "#333" } : undefined}>
          {block.location}
        </p>
      )}
      {headerLayout === "stack" && (dateRange(block) || (showLocation && block.location)) && (
        <p className="mt-0.5 text-[0.8em] text-ink-400">
          {dateRange(block)}
          {showLocation && block.location && <span className="ml-2">{block.location}</span>}
        </p>
      )}
      {block.description && (
        <p className={cx("mt-[var(--entry-gap)] whitespace-pre-line text-[0.92em] leading-relaxed", isATS ? "text-[#222]" : "text-ink-700")}>{renderRich(block.description)}</p>
      )}
      {bullets.length > 0 && <BulletList bullets={bullets} bulletStyle={bulletStyle} color={color} isATS={isATS} />}
      {block.skills.length > 0 &&
        (skill === "text" ? (
          <p className="mt-[var(--entry-gap)] text-[0.9em]" style={{ color: isATS ? "#333" : undefined }}>
            {block.skills.join("  ·  ")}
          </p>
        ) : (
          <div className="mt-[var(--entry-gap)] flex flex-wrap gap-1">
            {block.skills.map((sk) => (
              <span
                key={sk}
                className="rounded-[3px] px-1.5 py-[0.12em] text-[0.78em] font-medium"
                style={{ background: `${color}17`, color, boxShadow: `inset 0 0 0 1px ${color}30` }}
              >
                {sk}
              </span>
            ))}
          </div>
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 模块标题的视觉元素：图标徽章 + 羽化分隔带
 * ------------------------------------------------------------------ */

/**
 * 预览弹窗对整页套了 transform: scale(zoom)，这里是缩放档位的最小值。
 * Editor.tsx 的 ZOOM_LEVELS 直接引用它，构成单一真源 —— 想加更小的档位，
 * 只能改这一个数字，且会立刻被下面的 DEV 断言拦下。
 */
export const MIN_ZOOM = 0.85;

/**
 * 为什么不再用「1～2px 的细实线」做分隔线：
 *
 * 光栅化时，元素高度是逻辑值（可以是小数），最终必须落到整数物理像素行上。
 * 一条高 H、起点 y 的横线，跨越的像素行数只可能是 floor(H)+1 或 floor(H)+2
 * —— 取决于 y 的小数部分（相位）。而每条分隔线的 y 是前置内容高度累加出来的，
 * rem/em 计算得到的非整数各不相同，于是同一页里：
 *   - 相位靠前的线跨 2 行、每行墨多 → 看起来「细而实」
 *   - 相位靠后的线跨 3 行、墨被摊薄 → 看起来「粗而淡」
 * 两者总面积相同，但人眼感知到的粗细/深浅不同，这就是「相位差」。
 *
 * H 越小，+1/+2 行的相对差异越大（H=1.8 时是 2 行 vs 3 行，相差 50%）；
 * H 越大差异越小，且始终存在满覆盖的「实心核」把视觉锚定住。
 * 因此要保证 H × MIN_ZOOM ≥ 2px（跨 3～4 行，相对差 ≤ 33%，视觉不可辨）。
 */
const RULE_PX_FADE = 3; // 羽化分隔带高度：3 × 0.85 = 2.55px ✓
const RULE_PX_SOLID = 2.4; // ATS 实线下边框：2.4 × 0.85 = 2.04px ✓

/**
 * 把上面这条「H × MIN_ZOOM ≥ 2px」的约束从注释升级成护栏。
 * 前几轮的教训：推导写在注释里，但缩放档位和线宽分散在两个文件，
 * 改了一边忘了另一边就悄悄失效（默认 zoom 还曾写死成档位外的 0.78）。
 * 现在改任一侧，开发模式启动时会立刻在控制台报警。生产构建无副作用。
 */
if (import.meta.env.DEV) {
  for (const [name, px] of [["RULE_PX_FADE", RULE_PX_FADE], ["RULE_PX_SOLID", RULE_PX_SOLID]] as const) {
    const scaled = px * MIN_ZOOM;
    if (scaled < 2) {
      console.warn(
        `[template] ${name}=${px}px × MIN_ZOOM=${MIN_ZOOM} = ${scaled.toFixed(2)}px < 2px。` +
          `预览缩放下分隔线会因光栅化相位差呈现粗细不一，请调大线宽或调大 MIN_ZOOM。`
      );
    }
  }
}

/**
 * 模块标题右侧的羽化渐隐分隔带（替代原先的等宽细实线）。
 *
 * 三层设计，每层都在解决上一版的缺陷：
 * 1. 高度 3px —— 见 RULE_PX_FADE，让缩放后仍 ≥ 2px，消除相位差；
 * 2. 横向渐变（近标题端较实 → 右端完全透明）—— 细实线一旦加粗到 3px 会显得
 *    笨重，渐隐把「线」变成「一道向右消隐的光」，视觉重量反而比原来的
 *    2px 实线更轻，同时天然弱化了两端形态。注意人眼对渐变线的感知重量主要由
 *    最实的一端决定，所以起点给到 36% 保证存在感，不能按平均透明度估算；
 * 3. 圆角固定 2px 而非 rounded-full —— 圆角半径大于线高一半时会把线削成
 *    纺锤形，标题越长削得越明显；2px 圆角在 3px 高度下只做柔和收边。
 */
function SectionRule({ color }: { color: string }) {
  return (
    <span
      className="flex-1"
      style={{
        height: RULE_PX_FADE,
        borderRadius: 2,
        background: `linear-gradient(to right, ${color}5c 0%, ${color}2e 45%, ${color}00 100%)`,
      }}
    />
  );
}

/**
 * 模块标题的图标徽章。两个非 ATS 模板共用结构（保证切换模板时观感不跳变），
 * 用形状区分调性：现代单栏=圆角方块（干练），学术双栏=圆形（柔和）。
 * 尺寸全部走 em，随字号与密度联动；图标固定 0.68em（约占徽章 54%，
 * 落在 50%～60% 的舒适区，比原先写死 12px 在大字号下偏小的问题更稳）。
 */
function SectionBadge({ section, color, shape }: { section: Section; color: string; shape: "squircle" | "circle" }) {
  const Icon = SECTION_ICON[section.type];
  return (
    <span
      className="flex h-[1.25em] w-[1.25em] shrink-0 items-center justify-center"
      style={{ background: color, borderRadius: shape === "circle" ? "9999px" : "0.3em" }}
    >
      {Icon ? (
        <Icon className="h-[0.68em] w-[0.68em] text-white" />
      ) : (
        <span className="h-[0.3em] w-[0.3em] rounded-full bg-white" />
      )}
    </span>
  );
}

function SectionBlock({ section, style }: { section: Section; style: TStyle }) {
  const blocks = visibleBlocks(section);
  if (section.type === "summary" && !blocks.some((b) => b.description)) return null;
  if (blocks.length === 0 && section.type !== "summary") return null;
  const { color, isATS } = style;
  // 模块级要点样式优先，未设置时继承全局默认
  const secStyle: TStyle = { ...style, bulletStyle: resolveBulletStyle(section.bullet_style, style.bulletStyle) };
  return (
    <section className="mb-[var(--sec-gap)]">
      <h2
        className={cx("mb-[var(--head-gap)] text-[1.12em] font-bold", !isATS && "flex items-center gap-[0.5em]")}
        style={
          isATS
            ? { borderBottom: `${RULE_PX_SOLID}px solid #111`, paddingBottom: "0.26em", color: "#111", textTransform: "uppercase", letterSpacing: "0.08em", breakAfter: "avoid" }
            : { color, letterSpacing: "0.02em", breakAfter: "avoid" }
        }
      >
        {!isATS && <SectionBadge section={section} color={color} shape="squircle" />}
        {section.title}
        {!isATS && <SectionRule color={color} />}
      </h2>
      {blocks.map((b) => (
        <EntryBody key={b.block_id} block={b} style={secStyle} />
      ))}
    </section>
  );
}

function AcademicSectionBlock({ section, color, headerLayout, bulletStyle }: { section: Section; color: string; headerLayout: HeaderLayoutKey; bulletStyle: BulletStyleKey }) {
  const blocks = visibleBlocks(section);
  if (section.type === "summary" && !blocks.some((b) => b.description)) return null;
  if (blocks.length === 0 && section.type !== "summary") return null;
  // 模块级要点样式优先，未设置时继承全局默认
  const bs = resolveBulletStyle(section.bullet_style, bulletStyle);
  return (
    <section className="mb-[var(--sec-gap)]">
      <h2 className="mb-[var(--head-gap)] flex items-center gap-[0.5em] text-[1.12em] font-bold" style={{ color, letterSpacing: "0.02em", breakAfter: "avoid" }}>
        <SectionBadge section={section} color={color} shape="circle" />
        {section.title}
        <SectionRule color={color} />
      </h2>
      {blocks.map((b) => (
        <div key={b.block_id} className="mb-[var(--entry-gap)] break-inside-avoid">
          {(b.title || b.subtitle) &&
            (headerLayout === "stack" ? (
              <p className="text-[1em] font-bold text-ink-900">
                {renderRich(b.title)}
                {b.subtitle && <span className="ml-1.5 font-normal text-ink-500">{renderRich(b.subtitle)}</span>}
              </p>
            ) : (
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[1.02em] font-bold leading-snug text-ink-900">
                  {renderRich(b.title)}
                  {b.subtitle && (
                    <span className="font-normal text-ink-500">
                      <span className="mx-1.5 text-ink-300">·</span>
                      {renderRich(b.subtitle)}
                    </span>
                  )}
                </p>
                <div className="shrink-0 text-right text-[0.82em] font-medium tabular-nums" style={{ color: "#64716c" }}>
                  {dateRange(b) && <span>{dateRange(b)}</span>}
                  {b.location && <span className="ml-2 text-ink-400">{b.location}</span>}
                </div>
              </div>
            ))}
          {headerLayout === "stack" && (dateRange(b) || b.location) && (
            <p className="mt-0.5 text-[0.8em] text-ink-400">
              {dateRange(b)}
              {b.location && <span className="ml-2">{b.location}</span>}
            </p>
          )}
          {b.description && (
            <p className="mt-[var(--entry-gap)] whitespace-pre-line text-[0.92em] leading-relaxed text-ink-700">{renderRich(b.description)}</p>
          )}
          {b.bullets.filter(Boolean).length > 0 && <BulletList bullets={b.bullets.filter(Boolean)} bulletStyle={bs} color={color} />}
          {b.skills.length > 0 && (
            <div className="mt-[var(--entry-gap)] flex flex-wrap gap-1">
              {b.skills.map((sk) => (
                <span
                  key={sk}
                  className="rounded-[3px] px-1.5 py-[0.12em] text-[0.78em] font-medium"
                  style={{ background: `${color}17`, color, boxShadow: `inset 0 0 0 1px ${color}30` }}
                >
                  {sk}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function AcademicPhotoSheet({ resume, forPrint }: { resume: Resume; forPrint?: boolean }) {
  const color = resume.theme.primary_color;
  const fs = resume.theme.font_size;
  const info = resume.data.basic_info;
  const contacts = [info.email, info.phone, info.location, info.website].filter(Boolean);
  const basicSection = resume.data.sections.find((s) => s.type === "basic_info");
  const basicVisible = basicSection?.visible ?? true;
  const bodySections = orderedVisible(resume.data).filter((s) => s.type !== "basic_info");
  const headerLayout = resume.theme.header_layout ?? "row";

  return (
    <div
      className={cx("resume-sheet bg-white", !forPrint && "shadow-xl shadow-ink-950/15")}
      style={{ fontSize: `${fs}px`, lineHeight: "var(--lh)", fontFamily: fontStack(resume.theme.font_family), color: "#222", ...densityVars(resume.theme.density) }}
    >
      {basicVisible && (
        <header className="mb-[var(--sec-gap)] flex items-center gap-5">
          {/* 头像：矩形无边框，约 1 寸（25×35mm）照片比例；缺省时不占位，姓名/联系自然左铺 */}
          {resume.data.avatar_url && (
            <div className="h-[126px] w-[90px] shrink-0 overflow-hidden rounded-sm bg-paper-100">
              <img src={resume.data.avatar_url} alt="头像" className="h-full w-full object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-[700] leading-tight" style={{ fontSize: "2.2em", color: "#101817", letterSpacing: "-0.01em" }}>
              {info.name || "未命名"}
            </h1>
            {info.title && (
              <p className="mt-1 font-medium" style={{ color }}>
                {info.title}
              </p>
            )}
            {contacts.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-y-1 text-[0.85em] text-ink-500">
                {contacts.map((c, idx) => (
                  <span key={c} className="inline-flex items-center">
                    <span>{c}</span>
                    {idx < contacts.length - 1 && <span className="mx-3 text-ink-300" aria-hidden="true">|</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
          {/* 校徽：圆形无边框，比例合理；缺省时不占位 */}
          {resume.data.school_badge_url && (
            <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
              <img src={resume.data.school_badge_url} alt="校徽" className="h-full w-full object-contain" />
            </div>
          )}
        </header>
      )}
      <main>
        {bodySections.map((s) => (
          <AcademicSectionBlock key={s.section_id} section={s} color={color} headerLayout={headerLayout} bulletStyle={resume.theme.bullet_style ?? "diamond"} />
        ))}
      </main>
    </div>
  );
}

export function ResumeSheet({ resume, forPrint }: { resume: Resume; forPrint?: boolean }) {
  if (resume.template_id === "academic_photo") {
    return <AcademicPhotoSheet resume={resume} forPrint={forPrint} />;
  }

  const isATS = resume.template_id === "classic_ats";
  const color = isATS ? "#111111" : resume.theme.primary_color;
  const fs = resume.theme.font_size;

  // 基本信息模块：visible=false 时整个 header（姓名/职位/联系）不渲染，语义一致
  const basicSection = resume.data.sections.find((s) => s.type === "basic_info");
  const basicVisible = basicSection?.visible ?? true;
  const info = resume.data.basic_info;
  const contacts = [info.email, info.phone, info.location, info.website].filter(Boolean);

  const style: TStyle = isATS
    ? { color: "#111111", isATS: true, bullet: "disc", bulletStyle: resume.theme.bullet_style ?? "disc", skill: "text", showLocation: true, headerLayout: resume.theme.header_layout ?? "row" }
    : { color, isATS: false, bullet: "diamond", bulletStyle: resume.theme.bullet_style ?? "diamond", skill: "chip", showLocation: true, headerLayout: resume.theme.header_layout ?? "row" };

  const bodySections = orderedVisible(resume.data).filter((s) => s.type !== "basic_info");

  const headerEl =
    basicVisible && (info.name || info.title || contacts.length > 0) ? (
      isATS ? (
        <header className="mb-[var(--sec-gap)] text-center">
          <h1 className="text-[2.1em] font-bold leading-tight tracking-wide">{info.name || "未命名"}</h1>
          {info.title && <p className="mt-0.5 text-[1.05em] font-medium">{info.title}</p>}
          {contacts.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center justify-center gap-y-1 text-[0.85em] text-[#333]">
              {contacts.map((c, idx) => (
                <span key={c} className="inline-flex items-center">
                  <span>{c}</span>
                  {idx < contacts.length - 1 && <span className="mx-3 text-ink-300" aria-hidden="true">|</span>}
                </span>
              ))}
            </p>
          )}
        </header>
      ) : (
        <header className="mb-[var(--sec-gap)]">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="font-[700] leading-tight" style={{ fontSize: "2.3em", color: "#101817", letterSpacing: "-0.01em" }}>
                {info.name || "未命名"}
              </h1>
              {info.title && (
                <p className="mt-1 text-[1.1em] font-medium" style={{ color }}>
                  {info.title}
                </p>
              )}
            </div>
            {/* 已上传头像时直接使用头像，否则用姓名首字母色块，保持右上角视觉锚点 */}
            {resume.data.avatar_url ? (
              <div className="mb-1 h-[58px] w-[42px] shrink-0 overflow-hidden rounded-md bg-paper-100">
                <img src={resume.data.avatar_url} alt="头像" className="h-full w-full object-cover" />
              </div>
            ) : (
              <div
                className="mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `linear-gradient(135deg, ${color}, ${color}bf)` }}
              >
                <span className="font-bold text-white" style={{ fontSize: "1.35em" }}>
                  {(info.name || "?").slice(0, 1)}
                </span>
              </div>
            )}
          </div>
          {contacts.length > 0 && (
            <div className="mt-[var(--head-gap)] flex flex-wrap items-center gap-y-1 text-[0.85em] text-ink-500">
              {contacts.map((c, idx) => (
                <span key={c} className="inline-flex items-center">
                  <span>{c}</span>
                  {idx < contacts.length - 1 && <span className="mx-3 text-ink-300" aria-hidden="true">|</span>}
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
      style={{ fontSize: `${fs}px`, lineHeight: "var(--lh)", fontFamily: fontStack(resume.theme.font_family), ...densityVars(resume.theme.density) }}
    >
      {headerEl}
      <main>
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
    <div className="resume-sheet-wrap bg-white" style={{ width: 794, minHeight: 1123, ...densityVars(resume.theme.density) }}>
      <div style={{ minHeight: 1123, padding: "var(--page-pad-y) var(--page-pad-x)" }}>
        <ResumeSheet resume={resume} forPrint={forPrint} />
      </div>
    </div>
  );
}
