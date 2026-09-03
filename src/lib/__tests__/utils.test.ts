import { describe, it, expect } from "vitest";
import { diffLines, resumeToText, clamp, fmtDateCompact, resolveBulletStyle, densityVars } from "../utils";

describe("diffLines：AI 建议对比（LCS）", () => {
  it("识别相同 / 新增 / 删除行", () => {
    const ops = diffLines(["负责订单系统", "参与评审"], ["负责订单系统重构", "参与评审", "新增监控体系"]);
    expect(ops[0]).toEqual({ kind: "del", text: "负责订单系统" });
    expect(ops.some((o) => o.kind === "add" && o.text === "负责订单系统重构")).toBe(true);
    expect(ops.some((o) => o.kind === "same" && o.text === "参与评审")).toBe(true);
    expect(ops.some((o) => o.kind === "add" && o.text === "新增监控体系")).toBe(true);
  });

  it("空数组边界不报错", () => {
    expect(diffLines([], [])).toEqual([]);
    expect(diffLines([], ["x"])).toEqual([{ kind: "add", text: "x" }]);
  });
});

describe("resumeToText：简历压平为可检索文本", () => {
  it("包含姓名与各模块文本，且为小写", () => {
    const text = resumeToText({
      basic_info: { name: "陈墨", title: "前端工程师" },
      sections: [
        {
          title: "工作经历",
          blocks: [{ title: "星云科技", subtitle: "高级前端", description: "React 重构", bullets: ["性能提升 40%"], skills: ["TypeScript"] }],
        },
      ],
    });
    expect(text).toContain("陈墨");
    expect(text).toContain("react 重构");
    expect(text).toContain("typescript");
  });
});

describe("基础工具", () => {
  it("clamp 收敛到区间", () => {
    expect(clamp(120, 0, 100)).toBe(100);
    expect(clamp(-3, 0, 100)).toBe(0);
  });

  it("日期紧凑格式用于导出文件名", () => {
    expect(fmtDateCompact("2026-01-01T10:00:00Z").length).toBe(8);
  });
});

describe("resolveBulletStyle：模块级要点样式继承", () => {
  it("模块级设置优先于全局默认", () => {
    expect(resolveBulletStyle("ordered", "diamond")).toBe("ordered");
  });

  it("模块未设置时继承全局默认", () => {
    expect(resolveBulletStyle(undefined, "arrow")).toBe("arrow");
  });

  it("两者都缺省时回落为菱形（与旧数据行为一致）", () => {
    expect(resolveBulletStyle(undefined, undefined)).toBe("diamond");
  });
});

describe("densityVars：三档密度均提供要点行距变量", () => {
  it("compact / medium / loose 都含 --bullet-gap 且递增", () => {
    const g = (k: "compact" | "medium" | "loose") => parseFloat(densityVars(k)["--bullet-gap"]);
    expect(g("compact")).toBeLessThan(g("medium"));
    expect(g("medium")).toBeLessThan(g("loose"));
  });
});
