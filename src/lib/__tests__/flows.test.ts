import { describe, it, expect } from "vitest";
import { structureResume, joinPageItems, detectMultiColumn } from "../parser";

/* 复刻 Home.runParse 里判定「是否有内容」的逻辑，用于在单测里复现 UI 行为。
 * 与修复后的实现保持一致：summary 看 description 是否非空、skills 看 skills 是否非空、
 * 其余 entry section 看有无块，且基本信息抓取到位也算有效。 */
function hasContentLikeUI(data: ReturnType<typeof structureResume>): boolean {
  return (
    data.sections.some((s) => {
      if (s.type === "summary") return s.blocks.some((b) => b.description?.trim());
      if (s.type === "skills") return s.blocks.some((b) => (b.skills?.length ?? 0) > 0);
      return s.blocks.length > 0;
    }) || !!(data.basic_info.name || data.basic_info.email || data.basic_info.phone)
  );
}

describe("流程复现：粘贴文本 —— 正常带标题简历", () => {
  it("应能结构化、section 有块，hasContent=true（流程应成功）", () => {
    const text = `李娜
产品经理
lina@example.com

工作经历
星云科技 | 产品经理 2021.03 - 至今
- 主导 XX 项目

技能
需求分析, 原型设计`;
    const data = structureResume(text, "pasted_text");
    expect(data.basic_info.name).toBe("李娜");
    expect(data.sections.find((s) => s.type === "work_experience")!.blocks.length).toBe(1);
    expect(hasContentLikeUI(data)).toBe(true); // 流程会成功
  });
});

describe("流程复现：粘贴文本 —— 只有基本信息的极简简历（修复后不应被丢弃）", () => {
  const text = `陈墨
chenmo@example.com
13800138000`;
  const data = structureResume(text, "pasted_text");

  it("结构器确实抓到了姓名与邮箱", () => {
    expect(data.basic_info.name).toBe("陈墨");
    expect(data.basic_info.email).toBe("chenmo@example.com");
    expect(data.basic_info.phone).toContain("13800138000");
  });

  it("修复后：基本信息已抓取 → hasContent=true，流程成功（不再误判「无内容」丢弃）", () => {
    expect(hasContentLikeUI(data)).toBe(true);
  });
});

describe("流程复现：粘贴文本 —— 纯垃圾文本应触发「未能识别」失败分支（修复前该分支是死代码）", () => {
  it("无法提取任何模块块与基本信息 → hasContent=false，流程弹失败提示", () => {
    // 每行 >10 字中文且不含标题/城市关键词，避免被姓名启发式（2-10 字行）误抓
    const text = "本段文字纯属测试用途无法被解析为任何简历字段内容\n第二段同样冗长且没有标题也没有任何有效联系方式信息";
    const data = structureResume(text, "pasted_text");
    expect(data.basic_info.name).toBe("");
    expect(data.basic_info.email).toBe("");
    expect(data.basic_info.phone).toBe("");
    expect(hasContentLikeUI(data)).toBe(false);
  });
});

describe("流程复现：PDF 提取 —— 多栏探测对「宽单栏」是否误报", () => {
  const item = (str: string, x: number, y: number, size = 12) => ({
    str,
    transform: [size, 0, 0, size, x, y],
    width: str.length * size * 0.5,
  });

  it("宽单栏（整行由左到右连贯、行内无大空档）不应误判为多栏", () => {
    const line: ReturnType<typeof item>[] = [];
    const words = ["Senior", "Backend", "Engineer", "with", "strong", "experience", "in", "distributed", "systems"];
    let x = 60;
    for (const w of words) {
      line.push(item(w, x, 800));
      x += w.length * 6 + 12;
    }
    expect(detectMultiColumn(line)).toBe(false);
  });

  it("带大空档的居中单行（如分隔标题）不误判为多栏", () => {
    const line = [item("PROJECTS", 200, 800), item("EXPERIENCE", 360, 800)];
    expect(detectMultiColumn(line)).toBe(false); // 仅 2 个 item，ln.length<3 跳过
  });
});
