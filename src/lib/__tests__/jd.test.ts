import { describe, it, expect } from "vitest";
import { parseJD, matchResume } from "../jd";
import { SAMPLE_JD_TEXT } from "../samples";

describe("parseJD：JD 结构化解析", () => {
  const jd = parseJD(SAMPLE_JD_TEXT, "resume_001");

  it("提取岗位名称", () => {
    expect(jd.structured.job_title).toContain("工程师");
  });

  it("按「岗位职责 / 任职要求」拆分条目", () => {
    expect(jd.structured.responsibilities.length).toBeGreaterThanOrEqual(3);
    expect(jd.structured.requirements.length).toBeGreaterThanOrEqual(3);
  });

  it("从技能词典中识别技能关键词", () => {
    const s = jd.structured.skills.map((x) => x.toLowerCase());
    expect(s).toContain("rag");
    expect(s).toContain("prompt");
    expect(s).toContain("python");
    expect(s).toContain("lora");
  });

  it("提取学历与年限要求", () => {
    expect(jd.structured.education).toBe("本科");
    expect(jd.structured.experience_years).toBe(3);
  });

  it("JD 绑定到指定简历且保留原文", () => {
    expect(jd.resume_id).toBe("resume_001");
    expect(jd.raw_text).toBe(SAMPLE_JD_TEXT);
    expect(jd.jd_id).toMatch(/^jd_/);
  });
});

describe("matchResume：简历匹配分析", () => {
  it("JD 要求 Java 而简历没有时，missing_skills 必须包含 Java（PRD FR-07 验收标准）", () => {
    const jd = parseJD("后端工程师\n任职要求：\n1. 精通 Java、Spring、MySQL；\n2. 熟悉 Redis、Kafka。", "r1");
    const report = matchResume("熟悉 python 和 django 开发", jd);
    expect(report.missing_skills.map((s) => s.toLowerCase())).toContain("java");
  });

  it("全部技能命中时技能匹配分为 100", () => {
    const jd = parseJD("前端工程师\n要求：熟悉 React、TypeScript。", "r1");
    const report = matchResume("react typescript 开发经验", jd);
    expect(report.skill_match_score).toBe(100);
    expect(report.missing_skills).toHaveLength(0);
  });

  it("输出四维评分与综合分，且均在 0-100 区间", () => {
    const jd = parseJD(SAMPLE_JD_TEXT, "r1");
    const report = matchResume("react typescript vite 性能优化 微前端 前端监控 node.js webpack", jd);
    for (const k of ["overall_score", "skill_match_score", "keyword_coverage_score", "experience_relevance_score", "writing_quality_score"] as const) {
      expect(report[k]).toBeGreaterThanOrEqual(0);
      expect(report[k]).toBeLessThanOrEqual(100);
    }
    expect(report.suggestions.length).toBeGreaterThan(0);
  });
});
