import { describe, it, expect } from "vitest";
import { structureResume, emptyResume } from "../parser";

const SAMPLE = `张伟
高级后端工程师
邮箱: zhangwei@example.com  电话: 13812345678

## 工作经历
字节流科技 | 高级后端工程师 2020.03-2023.06
- 负责订单系统设计与开发，日均峰值 QPS 12 万
- 主导微服务拆分，接口平均耗时下降 38%

蓝山网络 | 后端工程师 2017.07-2020.02
- 参与支付网关核心模块开发

## 教育经历
华中科技大学 | 计算机科学与技术 2013.09-2017.06

## 技能
后端: Java, Spring Boot, MySQL, Redis
前端: React, TypeScript

## 证书奖项
AWS Solutions Architect 2021`;

describe("structureResume：文本 → 结构化简历", () => {
  const data = structureResume(SAMPLE, "pasted_text", "测试.txt");

  it("提取基本信息（姓名 / 职位 / 邮箱 / 电话），缺失字段为空而非报错", () => {
    expect(data.basic_info.name).toBe("张伟");
    expect(data.basic_info.title).toBe("高级后端工程师");
    expect(data.basic_info.email).toBe("zhangwei@example.com");
    expect(data.basic_info.phone.replace(/[\s-]/g, "")).toContain("13812345678");
    expect(data.basic_info.location).toBe("");
  });

  it("生成 7 个标准模块且 order 连续递增", () => {
    const types = data.sections.map((s) => s.type);
    expect(types).toEqual(["basic_info", "summary", "work_experience", "project_experience", "education", "skills", "certifications"]);
    data.sections.forEach((s, i) => expect(s.order).toBe(i));
  });

  it("工作经历解析出条目、日期区间与 bullets", () => {
    const work = data.sections.find((s) => s.type === "work_experience")!;
    expect(work.blocks.length).toBe(2);
    const [first] = work.blocks;
    expect(first.title).toBe("字节流科技");
    expect(first.subtitle).toBe("高级后端工程师");
    expect(first.start_date).toBe("2020-03");
    expect(first.end_date).toBe("2023-06");
    expect(first.bullets).toHaveLength(2);
    expect(first.bullets[0]).toContain("订单系统");
  });

  it("技能按「分组: 列表」解析为 skill_group", () => {
    const skills = data.sections.find((s) => s.type === "skills")!;
    expect(skills.blocks.length).toBe(2);
    const backend = skills.blocks.find((b) => b.title === "后端")!;
    expect(backend.skills).toContain("Java");
    expect(backend.skills).toContain("MySQL");
  });

  it("证书奖项解析年份", () => {
    const cert = data.sections.find((s) => s.type === "certifications")!;
    expect(cert.blocks[0].title).toContain("AWS");
    expect(cert.blocks[0].start_date).toBe("2021");
  });

  it("metadata 记录来源", () => {
    expect(data.metadata.source).toBe("pasted_text");
    expect(data.metadata.source_name).toBe("测试.txt");
  });
});

describe("structureResume：健壮性", () => {
  it("空文本生成完整骨架，所有字段为空值", () => {
    const data = structureResume("", "empty");
    expect(data.sections.length).toBe(7);
    expect(data.basic_info.name).toBe("");
    data.sections.forEach((s) => expect(s.visible).toBe(true));
  });

  it("无法识别的标题不会导致崩溃，落入兜底段", () => {
    const data = structureResume("随便一段没有标题的文字\n第二行", "pasted_text");
    expect(data.sections.length).toBe(7);
  });

  it("emptyResume 工厂可直接用于创建空白简历", () => {
    const data = emptyResume();
    expect(data.metadata.source).toBe("empty");
    expect(data.sections.find((s) => s.type === "summary")!.blocks[0].type).toBe("summary");
  });
});
