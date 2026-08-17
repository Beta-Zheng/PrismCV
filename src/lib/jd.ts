/* ------------------------------------------------------------------
 * JD 解析与匹配：MVP 采用规则策略（技能匹配 / 关键词覆盖 / 表达质量）
 * 不依赖大模型即可完成全部判断
 * ------------------------------------------------------------------ */
import type { JD, JDStructured, MatchReport } from "../types";
import { uid, nowISO, resumeToText, clamp } from "./utils";

const SKILL_DICT = [
  "react", "vue", "angular", "svelte", "next.js", "nextjs", "nuxt", "typescript", "javascript", "es6",
  "node.js", "nodejs", "deno", "bun", "webpack", "vite", "rollup", "esbuild", "babel", "tailwind", "tailwindcss",
  "sass", "less", "css", "html", "html5", "jquery", "redux", "zustand", "mobx", "pinia", "graphql", "apollo",
  "微前端", "qiankun", "monorepo", "pnpm", "npm", "yarn", "ci/cd", "git", "github", "gitlab", "docker", "k8s", "kubernetes",
  "nginx", "linux", "java", "spring", "springboot", "spring boot", "mybatis", "maven", "gradle", "kotlin", "scala",
  "python", "django", "flask", "fastapi", "pandas", "numpy", "pytorch", "tensorflow", "go", "golang", "gin",
  "c++", "c#", ".net", "rust", "php", "laravel", "ruby", "rails", "swift", "objective-c", "flutter", "dart",
  "react native", "小程序", "微信小程序", "uniapp", "uni-app", "electron", "taro", "websocket", "grpc", "rabbitmq",
  "kafka", "rocketmq", "mysql", "postgresql", "postgres", "mongodb", "redis", "elasticsearch", "es", "clickhouse",
  "hive", "spark", "flink", "hadoop", "数据仓库", "etl", "llm", "rag", "prompt", "langchain", "aigc", "机器学习",
  "深度学习", "nlp", "计算机视觉", "算法", "前端监控", "性能优化", "ssr", "服务端渲染", "自动化测试", "单元测试",
  "jest", "vitest", "cypress", "playwright", "storybook", "figma", "sketch", "产品设计", "需求分析", "项目管理",
  "敏捷", "scrum", "架构设计", "分布式", "高并发", "高可用", "微服务", "中台", "devops", "sre", "aws", "阿里云",
  "腾讯云", "serverless", "低代码", "可视化", "echarts", "d3", "three.js", "webgl", "canvas", "svg", "音视频", "webrtc",
];

const STOPWORDS = new Set([
  "我们", "你们", "他们", "可以", "需要", "熟悉", "了解", "精通", "掌握", "优先", "具有", "具备", "相关",
  "经验", "能力", "工作", "岗位", "职责", "任职", "要求", "本科", "硕士", "及以上", "以上", "学历", "专业",
  "公司", "团队", "项目", "系统", "平台", "使用", "采用", "进行", "以及", "或者", "并且", "能够", "良好",
  "较强", "丰富", "年以上", "年以", "热爱", "责任心", "沟通", "协作", "精神", "意识", "the", "and", "with",
  "for", "you", "will", "are", "our", "have", "has", "a", "an", "of", "to", "in", "on", "is",
]);

function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[\u4e00-\u9fa5]{2,6}|[a-z][a-z0-9+#./-]{1,18}/g) || [];
  return matches.filter((t) => !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function detectSkills(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const found: string[] = [];
  for (const s of SKILL_DICT) {
    const needle = s.toLowerCase();
    const re = new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}($|[^a-z0-9])`, "i");
    if (re.test(lower) && !found.includes(s)) found.push(s);
  }
  return found;
}

/** 解析 JD：岗位名 / 职责 / 要求 / 技能 / 关键词 / 学历 / 年限 */
export function parseJD(rawText: string, resumeId: string): JD {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const lower = rawText.toLowerCase();

  // 岗位名：首个含岗位词的行，否则第一行
  const titleLine =
    lines.find((l) => l.length <= 40 && /(工程师|经理|专家|架构|开发|设计|运营|分析师|顾问|总监|实习|研究员|engineer|manager|developer|designer|analyst)/i.test(l)) ||
    lines[0] ||
    "";
  const job_title = titleLine.replace(/^[#\-*•·\d.、)\s]+/, "").slice(0, 40);

  const responsibilities: string[] = [];
  const requirements: string[] = [];
  let mode: "none" | "resp" | "req" = "none";
  for (const l of lines) {
    if (/(岗位职责|工作职责|工作内容|你的工作|responsibilities)/i.test(l)) { mode = "resp"; continue; }
    if (/(任职要求|岗位要求|职位要求|我们希望你|任职资格|qualifications|requirements)/i.test(l)) { mode = "req"; continue; }
    const isItem = /^(\d+[.、)]|[-•·*])\s*/.test(l);
    const stripped = l.replace(/^(\d+[.、)]|[-•·*])\s*/, "");
    if (mode === "resp" && isItem) responsibilities.push(stripped);
    else if (mode === "req" && isItem) requirements.push(stripped);
  }
  if (!requirements.length) {
    for (const l of lines) {
      if (/(优先|经验|熟悉|精通|了解|掌握|本科|硕士|学历)/.test(l) && l !== titleLine) requirements.push(l.replace(/^(\d+[.、)]|[-•·*])\s*/, ""));
    }
  }

  const skills = detectSkills(rawText);

  // 关键词：技能优先 + 高频领域词
  const freq = new Map<string, number>();
  for (const t of tokenize(rawText)) freq.set(t, (freq.get(t) || 0) + 1);
  const hot = [...freq.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const keywords = [...skills, ...hot.filter((h) => !skills.includes(h))].slice(0, 24);

  const eduM = lower.match(/(博士|硕士|研究生|本科|大专|bachelor|master|phd)/);
  const yearM = rawText.match(/(\d{1,2})\s*年[以+]?[上]?/);

  const structured: JDStructured = {
    job_title,
    responsibilities: responsibilities.slice(0, 12),
    requirements: requirements.slice(0, 12),
    skills,
    keywords,
    education: eduM ? eduM[0] : "",
    experience_years: yearM ? Number(yearM[1]) : null,
  };

  return { jd_id: uid("jd"), resume_id: resumeId, raw_text: rawText, structured, created_at: nowISO() };
}

/* ---------------- 匹配分析 ---------------- */

function pct(matched: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((matched / total) * 100);
}

export function matchResume(resumeText: string, jd: JD): MatchReport {
  const skills = jd.structured.skills;
  const kws = jd.structured.keywords;

  const matchedSkills = skills.filter((s) => resumeText.includes(s.toLowerCase()));
  const matchedKws = kws.filter((k) => resumeText.includes(k.toLowerCase()));

  const skill_match_score = skills.length ? pct(matchedSkills.length, skills.length) : pct(matchedKws.length, Math.max(1, kws.length));
  const keyword_coverage_score = pct(matchedKws.length, Math.max(1, kws.length));

  // 经历相关性：任职要求行的词元在简历中的命中比例
  const reqLines = jd.structured.requirements.length ? jd.structured.requirements : jd.structured.responsibilities;
  let expSum = 0;
  let expN = 0;
  for (const line of reqLines.slice(0, 10)) {
    const toks = tokenize(line).slice(0, 8);
    if (!toks.length) continue;
    const hit = toks.filter((t) => resumeText.includes(t)).length;
    expSum += hit / toks.length;
    expN++;
  }
  const experience_relevance_score = expN ? Math.round((expSum / expN) * 100) : 50;

  // 表达质量：量化数据 / 动词开头 / 句长适中
  const bullets = (resumeText.match(/^[^\n]+$/gm) || []).filter((l) => l.length > 6);
  let q = 55;
  const withNum = bullets.filter((b) => /\d/.test(b)).length;
  q += clamp(Math.round((withNum / Math.max(1, bullets.length)) * 40), 0, 25);
  const goodLen = bullets.filter((b) => b.length >= 10 && b.length <= 60).length;
  q += clamp(Math.round((goodLen / Math.max(1, bullets.length)) * 20), 0, 20);
  const writing_quality_score = clamp(q, 0, 100);

  const overall_score = Math.round(
    skill_match_score * 0.35 + keyword_coverage_score * 0.25 + experience_relevance_score * 0.25 + writing_quality_score * 0.15
  );

  const missing_skills = skills.filter((s) => !resumeText.includes(s.toLowerCase())).slice(0, 10);
  const missing_keywords = kws.filter((k) => !resumeText.includes(k.toLowerCase()) && !missing_skills.includes(k)).slice(0, 12);

  const suggestions: string[] = [];
  if (missing_skills.length)
    suggestions.push(`技能缺口：JD 要求 ${jd.structured.skills.length} 项技能，简历缺少 ${missing_skills.slice(0, 5).join("、")}，建议仅补充真实掌握的部分到「技能」模块`);
  if (missing_keywords.length)
    suggestions.push(`关键词覆盖不足：可在项目/工作描述的 bullets 中自然融入「${missing_keywords.slice(0, 4).join("、")}」等词`);
  if (experience_relevance_score < 60)
    suggestions.push("经历相关性偏低：建议调整工作经历 bullets 的表述顺序，把与目标岗位职责重叠的内容前置");
  if (writing_quality_score < 70)
    suggestions.push(`表达质量：有 ${bullets.length - withNum} 条描述缺少量化数据，可对核心成果补充比例、规模或耗时`);
  if (jd.structured.experience_years)
    suggestions.push(`JD 要求 ${jd.structured.experience_years} 年经验，请确认个人总结中的年限表述与之匹配`);
  if (!suggestions.length) suggestions.push("匹配度良好：保持当前结构，可针对不同公司微调岗位关键词");

  return {
    overall_score: clamp(overall_score, 0, 100),
    skill_match_score,
    keyword_coverage_score,
    experience_relevance_score,
    writing_quality_score,
    missing_skills,
    missing_keywords,
    suggestions,
    computed_at: nowISO(),
  };
}

/** 便捷入口：基于结构化简历数据计算 */
export function matchResumeData(
  data: Parameters<typeof resumeToText>[0],
  jd: JD
): MatchReport {
  return matchResume(resumeToText(data), jd);
}
