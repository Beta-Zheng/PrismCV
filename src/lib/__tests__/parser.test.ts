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

describe("structureResume：master 原改动回归（整合 stash）", () => {
  it("日期单独一行在公司名下方（中文年月）时，条目仍能正确解析", () => {
    const text = `陈墨
高级前端工程师
chenmo@example.com

工作经历
星云科技有限公司 | 高级前端工程师
2021年3月 - 至今
- 主导交易中台重构，将首屏加载从 3s 降至 800ms
- 搭建组件库，覆盖 30+ 业务组件

ABC 互联网 | 前端工程师
2019年6月 - 2021年2月
- 负责营销活动页面开发，日均 PV 50w+`;
    const data = structureResume(text, "pasted_text");
    const work = data.sections.find((s) => s.type === "work_experience")!;
    expect(work.blocks.length).toBe(2);
    const [first, second] = work.blocks;
    expect(first.title).toContain("星云科技");
    expect(first.subtitle).toContain("高级前端工程师");
    expect(first.start_date).toBe("2021-03");
    expect(first.end_date).toBe("至今");
    expect(first.bullets.length).toBeGreaterThan(0);
    expect(first.bullets[0]).toContain("交易中台");
    expect(second.title).toContain("ABC 互联网");
    expect(second.start_date).toBe("2019-06");
    expect(second.end_date).toBe("2021-02");
  });

  it("【工作经历】带括号包装的标题能正确识别", () => {
    const text = `李明
全栈工程师

【工作经历】
XYZ 科技 | 全栈工程师 2020.01 - 至今
- 负责核心业务系统开发

【教育经历】
北京大学 | 计算机科学 2016.09 - 2020.06`;
    const data = structureResume(text, "pasted_text");
    const work = data.sections.find((s) => s.type === "work_experience")!;
    expect(work.blocks.length).toBeGreaterThan(0);
    expect(work.blocks[0].title).toContain("XYZ");
    const edu = data.sections.find((s) => s.type === "education")!;
    expect(edu.blocks.length).toBeGreaterThan(0);
    expect(edu.blocks[0].title).toContain("北京大学");
  });

  it("无 | 分隔符时，标题包含整行作为兜底", () => {
    const text = `王芳
产品经理

工作经历
星云科技有限公司 高级产品经理
2020年1月 - 至今
- 主导 3 个核心产品规划

教育经历
XX 大学 市场营销
2016年9月 - 2020年6月`;
    const data = structureResume(text, "pasted_text");
    const work = data.sections.find((s) => s.type === "work_experience")!;
    expect(work.blocks.length).toBe(1);
    expect(work.blocks[0].title).toContain("星云科技");
    expect(work.blocks[0].start_date).toBe("2020-01");
    expect(work.blocks[0].end_date).toBe("至今");
    expect(work.blocks[0].bullets.length).toBeGreaterThan(0);
  });

  it("星号 * 作为 bullet 标记时内容不丢失", () => {
    const text = `赵强
后端工程师

工作经历
DEF 公司 | 后端工程师 2021.06 - 至今
* 设计高并发系统，QPS 提升 5 倍
* 优化数据库查询，响应时间降低 60%`;
    const data = structureResume(text, "pasted_text");
    const work = data.sections.find((s) => s.type === "work_experience")!;
    expect(work.blocks.length).toBe(1);
    expect(work.blocks[0].bullets.length).toBe(2);
    expect(work.blocks[0].bullets[0]).toContain("高并发");
    expect(work.blocks[0].bullets[1]).toContain("数据库");
  });

  it("典型中文简历：多条目多模块完整解析", () => {
    const text = `李明
高级前端工程师
liming@example.com
138-0000-0000

工作经历
星云科技有限公司 | 高级前端工程师
2021年3月 - 至今
- 主导交易中台重构，将首屏加载从 3s 降至 800ms
- 搭建组件库，覆盖 30+ 业务组件

ABC 互联网 | 前端工程师
2019年6月 - 2021年2月
- 负责营销活动页面开发，日均 PV 50w+
- 参与 H5 活动页框架搭建

教育经历
北京大学 | 计算机科学与技术
2016年9月 - 2020年6月

技能
核心技能: JavaScript, TypeScript, React, Vue
熟悉: Node.js, Webpack, Vite

证书奖项
AWS Certified Solutions Architect 2022
英语六级 2018`;
    const data = structureResume(text, "pasted_text");

    const work = data.sections.find((s) => s.type === "work_experience")!;
    expect(work.blocks.length).toBe(2);
    expect(work.blocks[0].title).toContain("星云科技");
    expect(work.blocks[0].subtitle).toContain("高级前端工程师");
    expect(work.blocks[0].start_date).toBe("2021-03");
    expect(work.blocks[0].end_date).toBe("至今");
    expect(work.blocks[0].bullets.length).toBe(2);
    expect(work.blocks[1].title).toContain("ABC");
    expect(work.blocks[1].start_date).toBe("2019-06");
    expect(work.blocks[1].end_date).toBe("2021-02");
    expect(work.blocks[1].bullets.length).toBe(2);

    const edu = data.sections.find((s) => s.type === "education")!;
    expect(edu.blocks.length).toBe(1);
    expect(edu.blocks[0].title).toContain("北京大学");
    expect(edu.blocks[0].subtitle).toContain("计算机");
    expect(edu.blocks[0].start_date).toBe("2016-09");
    expect(edu.blocks[0].end_date).toBe("2020-06");

    const skills = data.sections.find((s) => s.type === "skills")!;
    expect(skills.blocks.length).toBeGreaterThan(0);
    const allSkills = skills.blocks.flatMap((b) => b.skills);
    expect(allSkills.length).toBeGreaterThan(0);

    const certs = data.sections.find((s) => s.type === "certifications")!;
    expect(certs.blocks.length).toBe(2);

    expect(data.basic_info.name).toBe("李明");
    expect(data.basic_info.email).toContain("liming@");
  });

  it("用户实际简历文本：完整解析（emoji 标题 / 多行纯文本描述 / 非 ASCII 邮箱）", () => {
    const text = `林某某
📱 138-1234-5678 | ✉️ lin某某@email.com | 🏠 现居：杭州
🎯 求职意向：高级数据产品经理 / 商业分析专家
💡 个人总结 / 核心优势
3年B端SaaS数据产品经验，主导过商业化数据看板、用户增长模型及数据中台从0到1的搭建，具备扎实的商业分析（BA）思维与业务落地能力。
数据驱动业务增长：曾主导"高潜客户流失预警模型"落地，赋能一线团队使核心客户续费率（NDR）提升8%，挽回年度经常性收入（ARR）超500万。
技术与业务双修：精通SQL/Python，能独立完成亿级数据清洗与特征工程；熟练使用Axure/Figma，擅长将复杂的数据逻辑转化为极简的前端产品交互。
🛠 专业技能
数据工具：精通 SQL (Hive/MySQL)，熟练使用 Python (Pandas/Scikit-learn) 进行数据清洗与基础建模。
产品工具：精通 Axure、Figma、Tableau、神策数据、帆软FineBI。
业务方法论：深刻理解 AARRR、RFM、LTV/CAC 等增长模型，熟悉 A/B Test 实验设计与归因分析。
💼 工作经历
2023.07 - 至今 | 杭州某头部SaaS科技有限公司 | 数据产品经理（2025年晋升为高级）
核心职责：负责电商SaaS产品线的数据指标体系搭建、BI看板规划及数据赋能业务策略的落地。
搭建经营决策看板（提效）：主导开发"CEO/业务线一号位"核心经营看板，打通ERP与CRM多源数据。将核心指标获取时间从 T+1 缩短至准实时（分钟级），覆盖全国300+城市运营团队，日均活跃用户（DAU）超800人，极大降低了跨部门要数据的沟通成本。
构建流失预警模型（增收）：联合算法团队搭建"高潜客户流失预警模型"。通过提取客户登录频次、核心功能使用深度等20+维特征，输出高优干预名单。赋能客户成功团队进行定向挽留，使核心客户续费率（NDR）提升8个百分点，直接挽回ARR约500万元。
规范数据资产与埋点（基建）：作为数据中台业务接口人，重塑前端埋点审批流程，沉淀《SaaS产品线数据字典V2.0》，使研发与数据的返工率降低30%，保障了底层数据口径的100%一致性。
2022.06 - 2022.12 | 字节跳动 | 商业分析/数据产品实习生
(注：将研三高质量实习并入工作时间轴，弱化学生标签，强调职业起点)
大促数据复盘与策略优化：参与抖音电商某垂类大促的数据复盘。独立编写复杂SQL提取亿级用户行为日志，输出3份深度漏斗归因报告。
业务赋能：精准定位"加购-支付"环节的流失异常点，推动业务线优化发券UI与倒计时策略，A/B测试结果显示实验组支付转化率提升4.5%，整体ROI提升15%。
🚀 核心项目经历（选填，用于补充重大战役）
项目名称：全链路智能营销CDP系统从0到1建设 | 核心骨干 | 2024.03 - 2024.10
项目背景：过去业务线发券/营销依赖人工经验，缺乏精准的人群圈选能力，营销费用浪费严重。
我的行动：
调研Salesforce等头部竞品，输出近50页的CDP（客户数据平台）产品PRD。
设计"标签工厂"模块，支持业务人员通过拖拽式UI，基于RFM模型自定义生成人群包。
打通企微接口，实现营销任务的自动化触发（SOP）。
项目成果：系统上线后，营销活动的人群精准度提升40%，单客获客成本（CAC）下降22%，该系统当年获评公司级"年度最佳技术创新项目"。
🎓 教育背景
2021.09 - 2023.06 | 浙江大学 | 应用统计学 | 硕士
2017.09 - 2021.06 | 电子科技大学 | 统计学 | 学士`;
    const data = structureResume(text, "pasted_text");

    expect(data.basic_info.name).toBe("林某某");
    expect(data.basic_info.email).toContain("lin");
    expect(data.basic_info.phone).toBeTruthy();
    expect(data.basic_info.location).toContain("杭州");

    const summary = data.sections.find((s) => s.type === "summary")!;
    expect(summary.blocks.length).toBeGreaterThan(0);
    expect(summary.blocks[0].description.length).toBeGreaterThan(10);

    const work = data.sections.find((s) => s.type === "work_experience")!;
    expect(work.blocks.length).toBe(2);
    expect(work.blocks[0].title).toContain("SaaS");
    expect(work.blocks[0].start_date).toBe("2023-07");
    expect(work.blocks[0].end_date).toBe("至今");
    expect(work.blocks[0].description.length).toBeGreaterThan(10);
    expect(work.blocks[1].title).toContain("字节跳动");
    expect(work.blocks[1].start_date).toBe("2022-06");

    const proj = data.sections.find((s) => s.type === "project_experience")!;
    expect(proj.blocks.length).toBe(1);
    expect(proj.blocks[0].title).toContain("CDP");
    expect(proj.blocks[0].start_date).toBe("2024-03");

    const edu = data.sections.find((s) => s.type === "education")!;
    expect(edu.blocks.length).toBe(2);
    expect(edu.blocks[0].title).toContain("浙江大学");
    expect(edu.blocks[1].title).toContain("电子科技大学");

    const skills = data.sections.find((s) => s.type === "skills")!;
    expect(skills.blocks.length).toBeGreaterThan(0);
    const allSkills = skills.blocks.flatMap((b) => b.skills);
    expect(allSkills.length).toBeGreaterThan(3);
  });
});
