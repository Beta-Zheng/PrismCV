import { describe, it, expect } from "vitest";
import { structureResume, emptyResume, joinPageItems, detectMultiColumn } from "../parser";

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

describe("joinPageItems：PDF 文本项 → 文本行（修复：阅读顺序 + 补空格）", () => {
  // transform = [fontSize,0,0,fontSize,x,y]
  const item = (str: string, x: number, y: number, size = 12) => ({ str, transform: [size, 0, 0, size, x, y], width: str.length * size * 0.5 });

  it("同行词按 x 升序排列，并在存在横坐标间隙时补空格", () => {
    const text = joinPageItems([item("Wei", 60, 800), item("Zhang", 120, 800)]);
    expect(text).toBe("Wei Zhang");
  });

  it("内容流乱序（x 递减）也能还原为正确阅读顺序", () => {
    const text = joinPageItems([item("Zhang", 120, 800), item("Wei", 60, 800)]);
    expect(text).toBe("Wei Zhang");
  });

  it("不同 y 的行被正确换行（不再用固定 3 单位阈值）", () => {
    const text = joinPageItems([item("Line A", 60, 800), item("Line B", 60, 760)]);
    expect(text.split("\n")).toEqual(["Line A", "Line B"]);
  });

  it("相邻 CJK 字符不补空格", () => {
    const text = joinPageItems([item("张", 60, 800), item("伟", 84, 800)]);
    expect(text).toBe("张伟");
  });
});

describe("detectMultiColumn：多栏探测（命中后由 UI 提示核对）", () => {
  const item = (str: string, x: number, y: number, size = 12) => ({ str, transform: [size, 0, 0, size, x, y], width: str.length * size * 0.5 });

  it("单栏（y 不重叠或 x 连续）判定为非多栏", () => {
    // 左对齐单栏，11 行从上到下
    const lines = Array.from({ length: 11 }, (_, i) => item(`Line ${i}`, 60, 800 - i * 20));
    expect(detectMultiColumn(lines)).toBe(false);
  });

  it("左右两栏（行内 x 双峰、中间空档）判定为多栏", () => {
    const items: ReturnType<typeof item>[] = [];
    // 每行：左栏 2 个词(x≈60,150) + 右栏 1 个词(x≈320)，y 范围重叠
    for (let i = 0; i < 6; i++) {
      items.push(item(`LeftA ${i}`, 60, 800 - i * 20));
      items.push(item(`LeftB ${i}`, 150, 800 - i * 20));
      items.push(item(`Right ${i}`, 320, 800 - i * 20));
    }
    expect(detectMultiColumn(items)).toBe(true);
  });
});

describe("structureResume：真实版式兼容性（修复回归）", () => {
  it("日期单独成行：正确拆出 2 条经历，公司/职位/日期不丢失、无幽灵条目", () => {
    const text = `张伟
高级后端工程师
zhangwei@example.com

工作经历
字节流科技
高级后端工程师
2020.03 - 2023.06
- 负责订单系统设计与开发
蓝山网络
后端工程师
2017.07 - 2020.02
- 参与支付网关核心模块开发`;
    const data = structureResume(text, "pasted_text");
    const work = data.sections.find((s) => s.type === "work_experience")!;
    expect(work.blocks.length).toBe(2);
    const [a, b] = work.blocks;
    expect(a.title).toBe("字节流科技");
    expect(a.subtitle).toBe("高级后端工程师");
    expect(a.start_date).toBe("2020-03");
    expect(a.end_date).toBe("2023-06");
    expect(a.bullets[0]).toContain("订单系统");
    expect(b.title).toBe("蓝山网络");
    expect(b.subtitle).toBe("后端工程师");
    expect(b.start_date).toBe("2017-07");
  });

  it("英文长标题（>16 字符）能被识别为对应模块，而非落入正文", () => {
    const text = `Wei Zhang
Senior Backend Engineer
wei.zhang@example.com

Technical Skills & Tools
Java, Spring Boot, MySQL
React, TypeScript`;
    const data = structureResume(text, "pasted_text");
    const skills = data.sections.find((s) => s.type === "skills")!;
    expect(skills.blocks.length).toBeGreaterThan(0);
    const all = skills.blocks.flatMap((bl) => bl.skills);
    expect(all).toContain("Java");
    expect(all).toContain("React");
  });
});
