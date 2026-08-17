import type { ResumeData } from "../types";
import { uid, nowISO } from "./utils";

/** 示例简历 —— 仅在用户主动点击「载入示例」时使用，不会自动写入 */
export function buildSampleResume(): ResumeData {
  const b = (partial: Partial<ReturnType<typeof blk>> & { type: ReturnType<typeof blk>["type"] }) => ({
    ...blk(partial.type),
    ...partial,
  });
  return {
    basic_info: {
      name: "陈墨",
      title: "高级前端工程师",
      email: "chenmo.dev@example.com",
      phone: "138-0013-8000",
      location: "上海",
      website: "chenmo.dev",
    },
    sections: [
      {
        section_id: "basic_info",
        type: "basic_info",
        title: "基本信息",
        visible: true,
        order: 0,
        blocks: [],
      },
      {
        section_id: "summary",
        type: "summary",
        title: "个人总结",
        visible: true,
        order: 1,
        blocks: [
          {
            ...blk("summary"),
            description:
              "7 年前端开发经验，专注大型 Web 应用架构与性能优化。主导过日活 80 万的中台系统重构，首屏耗时从 3.2s 降至 1.1s。熟悉 React 生态与前端工程化，长期负责团队代码规范与新人培养。",
          },
        ],
      },
      {
        section_id: "work_experience",
        type: "work_experience",
        title: "工作经历",
        visible: true,
        order: 2,
        blocks: [
          {
            ...b({
              type: "work_experience_item",
              title: "星云科技",
              subtitle: "高级前端工程师 / 前端组长",
              start_date: "2021-03",
              end_date: "至今",
              location: "上海",
            }),
            bullets: [
              "主导交易中台前端重构，将 jQuery 单体迁移至 React + TypeScript，缺陷率下降 42%",
              "设计微前端落地方案，6 个子应用独立发布，发布耗时从 40 分钟缩短至 8 分钟",
              "搭建前端监控体系，覆盖性能、异常与业务指标，线上问题平均发现时间缩短至 3 分钟",
              "负责 5 人小组的技术评审与带教，推动组件库沉淀，复用率达到 70%",
            ],
          },
          {
            ...b({
              type: "work_experience_item",
              title: "蓝湖网络",
              subtitle: "前端工程师",
              start_date: "2018-07",
              end_date: "2021-02",
              location: "杭州",
            }),
            bullets: [
              "负责电商营销活动页开发，累计交付 30+ 场大促活动，零线上事故",
              "实现活动页搭建平台原型，运营配置效率提升 5 倍",
              "优化移动端首屏加载，通过资源拆分与预加载将 LCP 从 2.8s 降至 1.4s",
            ],
          },
        ],
      },
      {
        section_id: "project_experience",
        type: "project_experience",
        title: "项目经历",
        visible: true,
        order: 3,
        blocks: [
          {
            ...b({
              type: "project_experience_item",
              title: "DesignKit 组件库",
              subtitle: "发起人 / 核心维护者",
              start_date: "2022-01",
              end_date: "至今",
            }),
            bullets: [
              "从零搭建团队 React 组件库，覆盖 48 个组件，单元测试覆盖率 85%",
              "编写主题定制与暗色模式方案，支撑 3 条产品线视觉统一",
            ],
            skills: ["React", "TypeScript", "Rollup", "Storybook"],
            links: ["github.com/chenmo/designkit"],
          },
          {
            ...b({
              type: "project_experience_item",
              title: "实时协作文档",
              subtitle: "前端负责人",
              start_date: "2020-03",
              end_date: "2020-12",
            }),
            bullets: [
              "基于 CRDT 实现多人协同编辑，支持 50 人同时在线编辑不冲突",
              "设计离线缓存与增量同步策略，弱网环境下编辑丢失率降为 0",
            ],
            skills: ["WebSocket", "IndexedDB", "Yjs"],
          },
        ],
      },
      {
        section_id: "education",
        type: "education",
        title: "教育经历",
        visible: true,
        order: 4,
        blocks: [
          {
            ...b({
              type: "education_item",
              title: "华中科技大学",
              subtitle: "计算机科学与技术 · 本科",
              start_date: "2014-09",
              end_date: "2018-06",
            }),
          },
        ],
      },
      {
        section_id: "skills",
        type: "skills",
        title: "技能",
        visible: true,
        order: 5,
        blocks: [
          {
            ...blk("skill_group"),
            title: "核心技术",
            skills: ["React", "TypeScript", "Vue", "Node.js", "Webpack", "Vite"],
          },
          {
            ...blk("skill_group"),
            title: "工程与其他",
            skills: ["微前端", "性能优化", "前端监控", "CI/CD", "Docker", "MySQL"],
          },
        ],
      },
      {
        section_id: "certifications",
        type: "certifications",
        title: "证书奖项",
        visible: true,
        order: 6,
        blocks: [
          { ...b({ type: "certification", title: "公司年度技术突破奖", start_date: "2023" }) },
          { ...b({ type: "certification", title: "AWS Certified Cloud Practitioner", start_date: "2022" }) },
        ],
      },
    ],
    metadata: { source: "sample", created_at: nowISO() },
  };
}

function blk(type: import("../types").BlockType) {
  return {
    block_id: uid("blk"),
    type,
    title: "",
    subtitle: "",
    start_date: "",
    end_date: "",
    location: "",
    description: "",
    bullets: [] as string[],
    skills: [] as string[],
    links: [] as string[],
    visible: true,
    order: 0,
  };
}

export const SAMPLE_JD_TEXT = `高级前端工程师（React 方向）

岗位职责：
1. 负责核心业务中台的前端架构设计与开发；
2. 主导前端性能优化与监控体系建设；
3. 推动组件库、工程化规范落地，提升团队研发效率；
4. 参与微前端方案设计与跨团队协作。

任职要求：
1. 本科及以上学历，计算机相关专业，5 年以上前端开发经验；
2. 精通 React、TypeScript，熟悉 Hooks 与状态管理原理；
3. 熟悉 Vite、Webpack 等构建工具，有性能优化实战经验；
4. 了解 Node.js、微前端、前端监控者优先；
5. 具备良好的沟通能力和技术影响力。`;
