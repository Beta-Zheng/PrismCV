/* ------------------------------------------------------------------
 * 结构化数据模型 —— 与需求文档 §10 / §11 对齐
 * 简历内容一律保存为结构化 JSON，而不是富文本
 * ------------------------------------------------------------------ */

export type SourceKind = "file" | "pasted_text" | "empty" | "sample";

export type SectionType =
  | "basic_info"
  | "summary"
  | "work_experience"
  | "project_experience"
  | "education"
  | "skills"
  | "certifications"
  | "custom";

export type BlockType =
  | "summary"
  | "work_experience_item"
  | "project_experience_item"
  | "education_item"
  | "skill_group"
  | "certification"
  | "custom_text";

export interface BasicInfo {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  website: string;
}

/** 通用 Block 结构（§11.3） */
export interface Block {
  block_id: string;
  type: BlockType;
  title: string;
  subtitle: string;
  start_date: string;
  end_date: string;
  location: string;
  description: string;
  bullets: string[];
  skills: string[];
  links: string[];
  visible: boolean;
  order: number;
}

export interface Section {
  section_id: string;
  type: SectionType;
  title: string;
  visible: boolean;
  order: number;
  blocks: Block[];
}

export interface ResumeData {
  basic_info: BasicInfo;
  sections: Section[]; // 渲染按 order 升序，再过滤 visible=false
  metadata: { source: SourceKind; source_name?: string; created_at: string };
  /** 个人头像（base64 或外链），仅部分模板展示 */
  avatar_url?: string;
  /** 学校/机构徽标（base64 或外链），仅部分模板展示 */
  school_badge_url?: string;
}

export type FontKey = "sans" | "serif" | "system" | "kai";
export type DensityKey = "compact" | "medium" | "loose";
export type HeaderLayoutKey = "row" | "stack";

export interface Resume {
  id: string;
  title: string;
  data: ResumeData;
  template_id: string;
  theme: {
    primary_color: string;
    font_size: number;
    /** 全文字体：sans=思源黑体 / serif=思源宋体 / system=系统默认 / kai=楷体 */
    font_family?: FontKey;
    /** 布局紧凑度：紧凑 / 中等 / 宽松，用于一页简历的篇幅调节 */
    density?: DensityKey;
    /** 条目头布局：row=标题居左·日期居右；stack=标题居上·信息居下 */
    header_layout?: HeaderLayoutKey;
  };
  created_at: string;
  updated_at: string;
}

/* ---------------- JD（§6 FR-06） ---------------- */

export interface JDStructured {
  job_title: string;
  responsibilities: string[];
  requirements: string[];
  skills: string[];
  keywords: string[];
  education: string;
  experience_years: number | null;
}

export interface JD {
  jd_id: string;
  resume_id: string;
  raw_text: string;
  structured: JDStructured;
  created_at: string;
}

export interface MatchReport {
  overall_score: number;
  skill_match_score: number;
  keyword_coverage_score: number;
  experience_relevance_score: number;
  writing_quality_score: number;
  missing_skills: string[];
  missing_keywords: string[];
  suggestions: string[];
  computed_at: string;
}

/* ---------------- 模型（§FR-09） ---------------- */

export type ModelType = "local" | "external" | "private";
export type ModelProtocol = "ollama" | "openai_compatible";
export type RouteStrategy = "local_first" | "local_only" | "ask_before_external";

export interface ModelProvider {
  id: string;
  name: string;
  type: ModelType;
  protocol: ModelProtocol;
  base_url: string;
  api_key: string; // 界面不明文展示
  model_name: string;
  temperature: number;
  max_tokens: number;
  timeout_ms: number;
  enabled: boolean;
  created_at: string;
}

/* ---------------- AI 建议（§FR-08） ---------------- */

export type AIAction =
  | "polish"
  | "rewrite"
  | "quantify"
  | "shorten"
  | "expand"
  | "jd_match"
  | "ats_optimize";

export type SuggestionStatus = "generating" | "success" | "failed";
export type SuggestionResolution = "accepted" | "rejected" | "edited_accepted";

export interface Suggestion {
  id: string;
  resume_id: string;
  section_id: string;
  block_id: string;
  action: AIAction;
  engine: "llm" | "rules";
  provider_name: string;
  status: SuggestionStatus;
  original: Block;
  suggested?: Block;
  explanation?: string;
  matched_keywords: string[];
  warnings: string[];
  error?: string;
  resolution?: SuggestionResolution;
  created_at: string;
}

/* ---------------- 模板（§FR-05） ---------------- */

export interface TemplateConfig {
  template_id: string;
  name: string;
  layout: "single_column" | "ats" | "photo_header";
  description: string;
}

export const TEMPLATES: TemplateConfig[] = [
  {
    template_id: "modern_single_column",
    name: "现代单栏",
    layout: "single_column",
    description: "衬线姓名 + 主题色模块线，适合多数岗位",
  },
  {
    template_id: "classic_ats",
    name: "经典 ATS",
    layout: "ats",
    description: "纯黑白、标准标题、无表格，过筛率优先",
  },
  {
    template_id: "academic_photo",
    name: "学术双栏",
    layout: "photo_header",
    description: "头像 + 校徽头区 + 图标模块标题，适合应届/学术简历",
  },
];

export const ACTION_LABELS: Record<AIAction, { label: string; hint: string }> = {
  polish: { label: "润色", hint: "保留事实，让表达更专业、结果导向" },
  rewrite: { label: "改写", hint: "重组句式：动词开头 + 内容 + 成果" },
  quantify: { label: "量化建议", hint: "指出可以补充数字指标的位置" },
  shorten: { label: "缩短", hint: "删冗词，单句控制在一行内" },
  expand: { label: "扩写", hint: "按 背景/方案/结果 补充结构提示" },
  jd_match: { label: "JD 对齐", hint: "向目标岗位关键词靠拢（不编造）" },
  ats_optimize: { label: "ATS 优化", hint: "标准动词开头、去符号、关键词前置" },
};

export const SECTION_LABELS: Record<SectionType, string> = {
  basic_info: "基本信息",
  summary: "个人总结",
  work_experience: "工作经历",
  project_experience: "项目经历",
  education: "教育经历",
  skills: "技能",
  certifications: "证书奖项",
  custom: "自定义模块",
};
