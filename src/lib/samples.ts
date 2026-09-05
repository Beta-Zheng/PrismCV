import type { ResumeData } from "../types";
import { uid, nowISO } from "./utils";

/**
 * 示例简历 —— 仅在用户主动点击「载入示例」时使用，不会自动写入。
 *
 * 内容设定：北邮自动化本科背景、面向 AI 应用（大模型）岗位的虚构候选人。
 * 技术事实口径参考公开社区资料（RAGAS 忠实度、混合检索召回率、vLLM 多 LoRA
 * 部署等常见实践），公司与人物均为虚构，无真实个人信息。
 */

/** 随机姓名池：名字与邮箱前缀成对，每次「载入示例」随机取一位 */
const NAME_POOL = [
  { name: "沈亦航", email: "shenyihang" },
  { name: "顾清源", email: "guqingyuan" },
  { name: "陆知行", email: "luzhixing" },
  { name: "江叙白", email: "jiangxubai" },
  { name: "林晚舟", email: "linwanzhou" },
  { name: "许望舒", email: "xuwangshu" },
];

function pickIdentity() {
  const pick = NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
  const phone = `1${["38", "39", "58", "66", "77"][Math.floor(Math.random() * 5)]}-${String(1000 + Math.floor(Math.random() * 9000))}-${String(1000 + Math.floor(Math.random() * 9000))}`;
  return { ...pick, phone };
}

export function buildSampleResume(): ResumeData {
  const b = (partial: Partial<ReturnType<typeof blk>> & { type: ReturnType<typeof blk>["type"] }) => ({
    ...blk(partial.type),
    ...partial,
  });
  const who = pickIdentity();
  return {
    basic_info: {
      name: who.name,
      title: "AI 应用工程师 · 大模型方向",
      email: `${who.email}@example.com`,
      phone: who.phone,
      location: "北京",
      website: `${who.email}.example.com`,
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
              "7 年软件研发经验，近 4 年专注大模型应用落地。主导企业级 RAG 知识库问答与多 Agent 工作流从 0 到 1，覆盖 3 条业务线、日均 2 万+ 次调用；以 RAGAS 建立自动化评测闭环，答案忠实度（Faithfulness）从 71% 提升至 92%。兼具工程化与数据能力，能独立完成从数据构建、SFT/LoRA 微调到推理部署的全链路交付。",
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
              title: "云阙智能",
              subtitle: "AI 应用工程师 / LLM 应用负责人",
              start_date: "2021-03",
              end_date: "至今",
              location: "北京",
            }),
            bullets: [
              "主导企业级 RAG 知识库问答系统从 0 到 1，采用混合检索（向量 + BM25）与 Rerank 重排，检索召回率从 58% 提升至 89%，覆盖 12 万篇内部文档",
              "建立 RAGAS 自动化评测流水线，答案忠实度（Faithfulness）从 71% 提升至 92%，幻觉类客诉下降 76%",
              "基于 vLLM 部署多 LoRA 推理服务，单基座挂载 4 个业务适配器，推理成本降低约 60%，P95 首字延迟控制在 1.2s 内",
              "负责 4 人 AI 应用小组，沉淀 Prompt 管理与灰度发布规范，需求平均交付周期从 2 周缩短至 3 天",
            ],
          },
          {
            ...b({
              type: "work_experience_item",
              title: "深流科技",
              subtitle: "后端工程师",
              start_date: "2018-07",
              end_date: "2021-02",
              location: "北京",
            }),
            bullets: [
              "负责数据接入与 ETL 平台开发，日均处理 2000 万条埋点数据，链路可用性 99.95%",
              "设计高可用任务调度系统，故障自动恢复时间小于 5 分钟",
              "推动服务容器化迁移上 Kubernetes，发布效率提升 3 倍",
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
              title: "企业知识库 RAG 问答助手",
              subtitle: "发起人 / 负责人",
              start_date: "2022-05",
              end_date: "至今",
            }),
            bullets: [
              "设计「多路召回 + Query 改写 + Rerank 重排」三段检索链路，Context Recall 提升 31 个百分点",
              "实现答案引用溯源与无据拒答策略，上线后答案采纳率 87%，成为公司内部使用率最高的 AI 工具",
            ],
            skills: ["LangChain", "Milvus", "BM25", "RAGAS", "vLLM"],
            links: [],
          },
          {
            ...b({
              type: "project_experience_item",
              title: "客服领域模型 LoRA 微调",
              subtitle: "核心成员",
              start_date: "2023-03",
              end_date: "2023-11",
            }),
            bullets: [
              "清洗并构建 2.3 万条领域指令数据集，基于 LLaMA-Factory 完成 SFT + LoRA 微调",
              "领域评测集准确率从基座 74% 提升至 91%，相比全量微调训练成本降低约 85%",
            ],
            skills: ["LoRA", "SFT", "LLaMA-Factory", "DeepSpeed", "Python"],
            links: [],
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
              title: "北京邮电大学",
              subtitle: "自动化 · 本科",
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
            title: "大模型应用",
            skills: ["Prompt 工程", "RAG", "Agent 编排", "SFT/LoRA 微调", "RAGAS 评测", "模型部署"],
          },
          {
            ...blk("skill_group"),
            title: "工程与其他",
            skills: ["Python", "TypeScript", "LangChain", "vLLM", "Milvus", "FastAPI", "Docker/K8s"],
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
          { ...b({ type: "certification", title: "云阙智能年度技术之星", start_date: "2023" }) },
          { ...b({ type: "certification", title: "软考高级 · 系统架构设计师", start_date: "2021" }) },
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

export const SAMPLE_JD_TEXT = `AI 应用工程师（大模型方向）

岗位职责：
1. 负责大模型能力在业务场景的落地：RAG 知识库、智能问答与流程自动化；
2. 设计并优化 Prompt 与 Agent 工作流，建设效果评测体系；
3. 负责领域模型的 SFT/LoRA 微调、评测与推理部署优化；
4. 与产品、算法团队协作，持续提升回答质量与用户体验。

任职要求：
1. 本科及以上学历，计算机、自动化、软件工程等相关专业，3 年以上研发经验；
2. 熟悉大模型基本原理与 Prompt 工程，有 RAG 或 Agent 系统开发经验；
3. 熟悉 SFT/LoRA 等微调方法，了解 vLLM、LangChain 等框架者优先；
4. 扎实的 Python 功底，良好的工程化能力与数据敏感度；
5. 具备良好的沟通表达与跨团队协作能力。`;
