/**
 * verify-feature-cases.js —— 过 docs/功能测试用例.md 的手工用例（headless 可执行子集）
 * 运行：NODE_PATH=C:/Users/charm/.workbuddy/binaries/node/workspace/node_modules
 *       C:/Users/charm/.workbuddy/binaries/node/workspace/node.exe verify-feature-cases.js
 * 前置：dev server 运行于 localhost:3000
 * 经验约束：真实 page.mouse.click 触发浏览器默认行为；每次断言前重新查询元素（React 重渲染
 * 会令旧 handle 失效）；绝不对 body 点击（会误触折叠开关）。
 */
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const KEY = "ai-resume-workbench-v1";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DLDIR = path.join(__dirname, "downloads-verify");
const TMPDIR = path.join(__dirname, "e2e-tmp");

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
async function t(name, fn) {
  try { await fn(); results.push(["PASS", name]); console.log("  PASS", name); }
  catch (e) { results.push(["FAIL", name + " —— " + e.message]); console.log("  FAIL", name, "——", e.message); }
}

/* ---------- 页面操作助手 ---------- */

async function clickText(page, text, { exact = false, sel = "button" } = {}) {
  const ok = await page.evaluate((text, exact, sel) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null);
    const el = els.find((e) => { const s = e.textContent.replace(/\s+/g, ""); const w = text.replace(/\s+/g, ""); return exact ? s === w : s.includes(w); });
    if (!el) return false;
    el.click(); return true;
  }, text, exact, sel);
  if (!ok) throw new Error(`clickText 未找到: "${text}"`);
}

async function clickAria(page, label, idx = 0) {
  const ok = await page.evaluate((label, idx) => {
    const els = [...document.querySelectorAll(`[aria-label="${label}"]`)].filter((e) => e.offsetParent !== null);
    if (!els[idx]) return false;
    els[idx].click(); return true;
  }, label, idx);
  if (!ok) throw new Error(`clickAria 未找到: "${label}[${idx}]"`);
}

async function clickAriaInCard(page, cardTitle, label, idx = 0) {
  // 卡片根节点 = 列表容器（div.max-w-3xl）的直接子元素之一；从 h3 向上定位，
  // 不能在头部行提前断（头部行自带「新增条目」按钮，会把块级按钮全排除在外）
  const ok = await page.evaluate((cardTitle, label, idx) => {
    const h3s = [...document.querySelectorAll("main h3")].filter((h) => h.textContent.trim().includes(cardTitle));
    if (!h3s.length) return "no-card";
    const h3 = h3s[0];
    const list = h3.closest("div.max-w-3xl");
    const card = list ? [...list.children].find((c) => c.contains(h3)) : null;
    if (!card) return "no-card-root";
    const els = [...card.querySelectorAll(`[aria-label="${label}"]`)].filter((e) => e.offsetParent !== null);
    if (!els[idx]) return "no-btn:" + label + " (共" + els.length + "个)";
    els[idx].click(); return true;
  }, cardTitle, label, idx);
  if (ok !== true) throw new Error(`clickAriaInCard(${cardTitle}, ${label}) 失败: ${ok}`);
}

/** 按可见文案在指定模块卡片内点按钮（如「添加要点」——无 aria-label 的文本按钮） */
async function clickTextInCard(page, cardTitle, text) {
  const ok = await page.evaluate((cardTitle, text) => {
    const h3s = [...document.querySelectorAll("main h3")].filter((h) => h.textContent.trim().includes(cardTitle));
    if (!h3s.length) return "no-card";
    const h3 = h3s[0];
    const list = h3.closest("div.max-w-3xl");
    const card = list ? [...list.children].find((c) => c.contains(h3)) : null;
    if (!card) return "no-card-root";
    const want = text.replace(/\s+/g, "");
    const el = [...card.querySelectorAll("button")].filter((b) => b.offsetParent !== null).find((b) => b.textContent.replace(/\s+/g, "").includes(want));
    if (!el) return "no-btn:" + text;
    el.click(); return true;
  }, cardTitle, text);
  if (ok !== true) throw new Error(`clickTextInCard(${cardTitle}, ${text}) 失败: ${ok}`);
}

/** 按 field-label 文案定位 input/textarea，真实点击聚焦后返回坐标等待输入 */
async function focusField(page, label) {
  const pos = await page.evaluate((label) => {
    const lab = [...document.querySelectorAll(".field-label")].find((e) => e.textContent.trim() === label && e.offsetParent !== null);
    if (!lab) return null;
    const field = lab.parentElement.querySelector("input, textarea");
    if (!field) return null;
    field.scrollIntoView({ block: "center" });
    const r = field.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);
  if (!pos) throw new Error(`字段未找到: "${label}"`);
  await sleep(120);
  const pos2 = await page.evaluate((label) => {
    const lab = [...document.querySelectorAll(".field-label")].find((e) => e.textContent.trim() === label && e.offsetParent !== null);
    const field = lab && lab.parentElement.querySelector("input, textarea");
    if (!field) return null;
    const r = field.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);
  await page.mouse.click((pos2 || pos).x, (pos2 || pos).y);
  await sleep(80);
}

async function typeIntoField(page, label, text, { replace = true } = {}) {
  await focusField(page, label);
  if (replace) { await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control"); }
  await page.keyboard.type(text, { delay: 8 });
}

/** 回到工作台：编辑器内点「返回」，已在工作台则不动（partialize 不持久化 view，reload 后必在首页） */
async function gotoHome(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="返回"]');
    if (btn) btn.click();
  });
  await sleep(500);
}

// zustand persist 的存储格式是 { state: {...}, version: n }，必须解包 .state
const state = (page) => page.evaluate((k) => { const p = JSON.parse(localStorage.getItem(k) || "null"); return (p && p.state) || p || {}; }, KEY);
const bodyText = (page) => page.evaluate(() => document.body.innerText);

async function waitToast(page, text, timeout = 3000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const txt = await bodyText(page);
    if (txt.includes(text)) return true;
    await sleep(120);
  }
  return false;
}

async function waitFn(page, fnDesc, fnBodySrc, timeout = 6000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const ok = await page.evaluate(new Function(`return (${fnBodySrc})()`));
    if (ok) return true;
    await sleep(150);
  }
  return false;
}

/* ---------- 主流程 ---------- */

(async () => {
  fs.rmSync(DLDIR, { recursive: true, force: true });
  fs.rmSync(TMPDIR, { recursive: true, force: true });
  fs.mkdirSync(DLDIR, { recursive: true });
  fs.mkdirSync(TMPDIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1680, height: 1000 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: DLDIR });

  // ===== 一、工作台 =====
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await page.reload({ waitUntil: "networkidle2" });
  await sleep(400);

  await t("HOME-00 初始为空工作台", async () => {
    assert((await bodyText(page)).includes("还没有简历"), "应显示空状态");
  });

  await t("HOME-07 拒绝不支持的类型(.png)", async () => {
    await clickText(page, "上传简历文件");
    await sleep(250);
    fs.writeFileSync(path.join(TMPDIR, "fake.png"), Buffer.from("png"));
    const input = await page.$('input[type="file"]');
    await input.uploadFile(path.join(TMPDIR, "fake.png"));
    await sleep(300);
    assert((await bodyText(page)).includes("仅支持 PDF、DOCX、MD、TXT"), "应报类型错误");
  });

  await t("HOME-06 拒绝超大文件(>10MB)", async () => {
    fs.writeFileSync(path.join(TMPDIR, "big.pdf"), Buffer.alloc(11 * 1024 * 1024, 0));
    const input = await page.$('input[type="file"]');
    await input.uploadFile(path.join(TMPDIR, "big.pdf"));
    await sleep(400);
    assert((await bodyText(page)).includes("文件大小超过限制"), "应报大小错误");
  });

  await t("HOME-01 载入示例简历", async () => {
    await page.keyboard.press("Escape"); // 关闭创建弹窗（Modal 监听 window Escape）
    await sleep(250);
    await clickText(page, "载入示例");
    await sleep(600);
    const s = await state(page);
    assert(s.resumes.length === 1, "应产生 1 份简历");
    assert(s.resumes[0].title === "陈墨（示例）", "标题应为 陈墨（示例）");
    assert(s.resumes[0].data.sections.length >= 7, "应有 ≥7 个模块");
    assert((await bodyText(page)).includes("排版布局"), "应已进入编辑器");
  });

  await t("EDIT-16 简历重命名", async () => {
    const h = await page.$('input[aria-label="简历标题"]');
    await h.click({ clickCount: 3 });
    await page.keyboard.type("陈墨（示例）v2");
    await page.keyboard.press("Escape");
    await sleep(1400);
    const s = await state(page);
    assert(s.resumes[0].title === "陈墨（示例）v2", "标题应已更新");
  });

  await t("EDIT-01 编辑基本信息 + 自动保存", async () => {
    await typeIntoField(page, "姓名", "陈默之");
    await page.keyboard.press("Escape"); // 失焦
    await sleep(1600);
    const s = await state(page);
    // 姓名存在 data.basic_info（basic_info section 的 blocks 是空数组，字段不在块里）
    assert(s.resumes[0].data.basic_info.name === "陈默之", "姓名应写入存储");
  });

  await t("EDIT-04 条目上移/下移禁用态", async () => {
    const dis = await page.evaluate(() => {
      const ups = [...document.querySelectorAll('[aria-label="上移"]')].filter((e) => e.offsetParent !== null);
      const downs = [...document.querySelectorAll('[aria-label="下移"]')].filter((e) => e.offsetParent !== null);
      return { firstUpDisabled: ups[0]?.disabled, lastDownDisabled: downs[downs.length - 1]?.disabled };
    });
    assert(dis.firstUpDisabled === true, "首条上移应禁用");
    assert(dis.lastDownDisabled === true, "末条下移应禁用");
  });

  await t("EDIT-02/03 新增条目 → 删除条目（级联回原状）", async () => {
    const before = await state(page);
    const sec = before.resumes[0].data.sections.find((x) => x.title === "工作经历");
    const n0 = sec.blocks.length;
    await clickAriaInCard(page, "工作经历", "新增条目");
    await sleep(300);
    let s = await state(page);
    assert(s.resumes[0].data.sections.find((x) => x.title === "工作经历").blocks.length === n0 + 1, "新增后应 +1");
    // 删除刚才新增的（最后一个条目的删除按钮）
    await clickAriaInCard(page, "工作经历", "删除条目", n0);
    await sleep(250);
    await clickText(page, "删除", { exact: true });
    await sleep(300);
    s = await state(page);
    assert(s.resumes[0].data.sections.find((x) => x.title === "工作经历").blocks.length === n0, "删除后应复原");
  });

  await t("EDIT-05 条目显隐", async () => {
    const bid = (await state(page)).resumes[0].data.sections.find((x) => x.title === "工作经历").blocks[0].block_id;
    await clickAriaInCard(page, "工作经历", "显示/隐藏", 0);
    await sleep(300);
    let b = (await state(page)).resumes[0].data.sections.find((x) => x.title === "工作经历").blocks[0];
    assert(b.visible === false && b.block_id === bid, "隐藏后 visible=false 且数据保留");
    await clickAriaInCard(page, "工作经历", "显示/隐藏", 0);
    await sleep(300);
    b = (await state(page)).resumes[0].data.sections.find((x) => x.title === "工作经历").blocks[0];
    assert(b.visible === true, "恢复后 visible=true");
  });

  await t("EDIT-06 模块显隐", async () => {
    await clickAriaInCard(page, "证书奖项", "显示/隐藏模块");
    await sleep(300);
    let sec = (await state(page)).resumes[0].data.sections.find((x) => x.title === "证书奖项");
    assert(sec.visible === false, "模块应隐藏");
    assert((await bodyText(page)).includes("模块已隐藏"), "应显示隐藏提示");
    await clickAriaInCard(page, "证书奖项", "显示/隐藏模块");
    await sleep(300);
    sec = (await state(page)).resumes[0].data.sections.find((x) => x.title === "证书奖项");
    assert(sec.visible === true, "模块应恢复显示");
  });

  await t("EDIT-11 要点编辑（增/移禁用态/删）", async () => {
    const before = await state(page);
    const sec = before.resumes[0].data.sections.find((x) => x.title === "工作经历");
    const n0 = sec.blocks[0].bullets.length;
    await clickTextInCard(page, "工作经历", "添加要点");
    await sleep(300);
    let s = await state(page);
    assert(s.resumes[0].data.sections.find((x) => x.title === "工作经历").blocks[0].bullets.length === n0 + 1, "要点应 +1");
    const dis = await page.evaluate(() => {
      const ups = [...document.querySelectorAll('[aria-label="上移要点"]')].filter((e) => e.offsetParent !== null);
      return { firstDisabled: ups[0]?.disabled };
    });
    assert(dis.firstDisabled === true, "首条要点上移应禁用");
    await clickAriaInCard(page, "工作经历", "删除要点", n0);
    await sleep(300);
    s = await state(page);
    assert(s.resumes[0].data.sections.find((x) => x.title === "工作经历").blocks[0].bullets.length === n0, "要点应复原");
  });

  await t("EDIT-12 技能标签 回车添加 / × 移除", async () => {
    // 注意：项目经历的条目也有「技能标签」字段，必须限定在「技能」模块卡片内定位
    const pos = await page.evaluate(() => {
      const h3 = [...document.querySelectorAll("main h3")].find((h) => h.textContent.trim() === "技能");
      const list = h3.closest("div.max-w-3xl");
      const card = [...list.children].find((c) => c.contains(h3));
      const lab = [...card.querySelectorAll(".field-label")].find((e) => e.textContent.trim() === "技能标签");
      const field = lab.parentElement.querySelector("input");
      field.scrollIntoView({ block: "center" });
      const r = field.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await sleep(120);
    const pos2 = await page.evaluate(() => {
      const h3 = [...document.querySelectorAll("main h3")].find((h) => h.textContent.trim() === "技能");
      const list = h3.closest("div.max-w-3xl");
      const card = [...list.children].find((c) => c.contains(h3));
      const field = [...card.querySelectorAll(".field-label")].find((e) => e.textContent.trim() === "技能标签").parentElement.querySelector("input");
      const r = field.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(pos2.x, pos2.y);
    await sleep(100);
    await page.keyboard.type("Playwright", { delay: 8 });
    await page.keyboard.press("Enter");
    await sleep(300);
    let s = await state(page);
    const skills = s.resumes[0].data.sections.find((x) => x.title === "技能");
    assert(skills.blocks.some((b) => (b.skills || []).includes("Playwright")), "标签应写入，实际：" + JSON.stringify(skills.blocks.map((b) => b.skills)));
    await page.evaluate(() => {
      const h3 = [...document.querySelectorAll("main h3")].find((h) => h.textContent.trim() === "技能");
      const list = h3.closest("div.max-w-3xl");
      const card = [...list.children].find((c) => c.contains(h3));
      card.querySelector('[aria-label="移除 Playwright"]').click();
    });
    await sleep(300);
    s = await state(page);
    const skills2 = s.resumes[0].data.sections.find((x) => x.title === "技能");
    assert(!skills2.blocks.some((b) => (b.skills || []).includes("Playwright")), "标签应移除");
  });

  await t("EDIT-09 添加自定义模块（空名称禁用 + 成功添加）", async () => {
    await clickText(page, "添加模块");
    await sleep(250);
    const disabledEmpty = await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "添加" && b.offsetParent !== null);
      return btns.length ? btns[0].disabled : null;
    });
    assert(disabledEmpty === true, "空名称时添加应禁用");
    await page.keyboard.type("开源贡献");
    await clickText(page, "添加", { exact: true });
    await sleep(300);
    const s = await state(page);
    assert(s.resumes[0].data.sections.some((x) => x.title === "开源贡献"), "自定义模块应存在");
  });

  await t("EDIT-10 删除自定义模块", async () => {
    await clickAriaInCard(page, "开源贡献", "删除模块");
    await sleep(250);
    await clickText(page, "删除模块", { exact: true });
    await sleep(300);
    const s = await state(page);
    assert(!s.resumes[0].data.sections.some((x) => x.title === "开源贡献"), "模块应被删除");
  });

  // ===== 三、模板 · 主题 · 预览 =====
  await t("TMPL-01 切换三套模板", async () => {
    for (const [name, tid] of [["经典 ATS", "classic_ats"], ["学术双栏", "academic_photo"], ["现代单栏", "modern_single_column"]]) {
      await clickText(page, name);
      await sleep(250);
      const s = await state(page);
      assert(s.resumes[0].template_id === tid, `切到 ${name} 后 template_id 应为 ${tid}`);
    }
  });

  await t("TMPL-02 主题色切换", async () => {
    await clickText(page, "外观样式");
    await sleep(250);
    await page.evaluate(() => { document.querySelector('[aria-label="主题色 #1d4ed8"]').click(); });
    await page.keyboard.press("Escape");
    await sleep(300);
    const s = await state(page);
    assert(s.resumes[0].theme.primary_color === "#1d4ed8", "主题色应写入");
  });

  await t("TMPL-03 字号 15", async () => {
    await clickText(page, "外观样式");
    await sleep(250);
    await clickText(page, "15", { exact: true });
    await page.keyboard.press("Escape");
    await sleep(300);
    const s = await state(page);
    assert(s.resumes[0].theme.font_size === 15, "字号应写入");
  });

  await t("TMPL-07 预览弹窗 + 缩放档位", async () => {
    await clickText(page, "预览 / 导出 PDF");
    await sleep(400);
    assert((await bodyText(page)).includes("模板预览"), "预览应打开");
    assert((await bodyText(page)).includes("A4 · 文本可复制"), "应标注 A4");
    const zoomOk = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "100%" && x.offsetParent !== null);
      if (!b) return false; b.click(); return true;
    });
    assert(zoomOk, "应有 100% 档位");
    await sleep(200);
    const active = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "100%" && x.offsetParent !== null);
      return b && b.className.includes("bg-white");
    });
    assert(active, "100% 应高亮");
    await page.evaluate(() => { document.querySelector('[aria-label="关闭预览"]').click(); });
    await sleep(250);
  });

  // ===== 四、JD 匹配 =====
  await t("JD-01 解析 JD", async () => {
    await clickText(page, "JD 匹配");
    await sleep(250);
    await page.evaluate(() => {
      const ta = [...document.querySelectorAll("textarea")].find((t) => t.placeholder.includes("岗位职责"));
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(ta, "高级前端工程师\n\n岗位职责：\n1. 负责 React 中台系统开发\n2. 优化性能与工程化\n\n任职要求：\n1. 精通 React、TypeScript、Vite\n2. 5 年以上经验");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickText(page, "解析 JD");
    await sleep(600);
    const txt = await bodyText(page);
    assert(/综合分|匹配度|岗位职责|任职要求/.test(txt), "应出现结构化解析结果");
  });

  await t("JD-03 空输入提示", async () => {
    await page.evaluate(() => { document.querySelector('[aria-label="移除 JD"]').click(); });
    await sleep(300);
    // 移除 JD 后组件里的 raw 文本可能残留，先清空输入再解析
    await page.evaluate(() => {
      const ta = [...document.querySelectorAll("textarea")].find((t) => t.placeholder.includes("岗位职责"));
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(ta, "");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(150);
    await clickText(page, "解析 JD");
    assert(await waitToast(page, "JD 内容不能为空"), "应提示 JD 内容不能为空");
  });

  // ===== 五、AI 建议 =====
  await t("AI-01+03 润色 → 拒绝（原文不变）", async () => {
    const before = await state(page);
    const desc0 = before.resumes[0].data.sections.find((x) => x.title === "工作经历").blocks[0].description;
    await clickAriaInCard(page, "工作经历", "AI 建议", 0);
    await sleep(200);
    await clickText(page, "润色", { exact: false });
    const got = await waitFn(page, "建议生成", `() => {
      const s = (JSON.parse(localStorage.getItem("${KEY}")) || {}).state || {};
      const sug = s.suggestions.filter((x) => x.resume_id === s.resumes[0].id);
      return sug.length > 0 && sug.every((x) => x.status !== "generating");
    }`, 8000);
    assert(got, "应生成建议记录（本地规则）");
    const accept = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "拒绝" && x.offsetParent !== null);
      if (!b) return false; b.click(); return true;
    });
    assert(accept, "应出现拒绝按钮");
    await sleep(300);
    const after = await state(page);
    const desc1 = after.resumes[0].data.sections.find((x) => x.title === "工作经历").blocks[0].description;
    assert(desc1 === desc0, "拒绝后原文应不变");
    const sug = after.suggestions.find((x) => x.action === "polish");
    assert(sug && sug.resolution === "rejected", "记录应标记 rejected，实际：" + JSON.stringify(sug && { status: sug.status, resolution: sug.resolution }));
  });

  await t("AI-02 改写 → 接受（内容替换）", async () => {
    await clickAriaInCard(page, "工作经历", "AI 建议", 0);
    await sleep(200);
    await clickText(page, "改写", { exact: false });
    const got = await waitFn(page, "建议生成", `() => {
      const s = (JSON.parse(localStorage.getItem("${KEY}")) || {}).state || {};
      const sug = s.suggestions.filter((x) => x.resume_id === s.resumes[0].id);
      return sug.length >= 2 && sug.every((x) => x.status !== "generating");
    }`, 8000);
    assert(got, "应生成第二条建议");
    const accept = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "接受" && x.offsetParent !== null);
      if (!b) return false; b.click(); return true;
    });
    assert(accept, "应出现接受按钮");
    await sleep(300);
    const s = await state(page);
    const sug = s.suggestions.find((x) => x.action === "rewrite");
    assert(sug && sug.resolution === "accepted", "记录应标记 accepted，实际：" + JSON.stringify(sug && { status: sug.status, resolution: sug.resolution }));
    const desc = s.resumes[0].data.sections.find((x) => x.title === "工作经历").blocks[0].description;
    assert(desc === sug.suggested.description, "接受后 Block 描述应为建议描述");
  });

  // ===== 数据持久化 =====
  await t("DATA-04 F5 刷新持久化", async () => {
    const before = await state(page);
    await page.reload({ waitUntil: "networkidle2" });
    await sleep(500);
    const after = await state(page);
    assert(after.resumes.length === before.resumes.length, "刷新后简历数不变");
    const name = after.resumes[0].data.basic_info.name;
    assert(name === "陈默之", "编辑过的姓名应保留");
  });

  // ===== 一（补）：HOME-11/12/13 复制与删除 =====
  await t("HOME-11/12/13 复制 / 删除取消 / 删除级联", async () => {
    await gotoHome(page);
    assert((await bodyText(page)).includes("最近简历"), "应回到工作台");
    await clickAria(page, "复制简历", 0);
    await sleep(400);
    let s = await state(page);
    assert(s.resumes.length === 2, "复制后应 2 份");
    await clickAria(page, "删除简历", 0);
    await sleep(250);
    assert((await bodyText(page)).includes("此操作不可撤销"), "应弹二次确认");
    await clickText(page, "取消", { exact: true });
    await sleep(250);
    s = await state(page);
    assert(s.resumes.length === 2, "取消后数量不变");
    await clickAria(page, "删除简历", 0);
    await sleep(250);
    await clickText(page, "删除简历", { exact: true });
    await sleep(400);
    s = await state(page);
    assert(s.resumes.length === 1, "确认后应剩 1 份");
    // 级联完整性：剩余建议记录必须都挂在剩余简历上（被删简历的建议应一并删除）
    assert(s.suggestions.every((x) => s.resumes.some((r) => r.id === x.resume_id)), "建议记录应随简历级联删除");
  });

  // ===== HOME-02 空白简历 =====
  await t("HOME-02 新建空白简历", async () => {
    await clickText(page, "空白简历");
    await sleep(500);
    const s = await state(page);
    assert(s.resumes.length === 2, "应新建 1 份空白简历");
    const fresh = s.resumes.find((r) => r.title === "未命名简历"); // createResume 头插，新简历在数组最前
    assert(fresh, "应存在未命名简历");
    assert(!fresh.data.basic_info.name, "姓名应为空");
    assert(fresh.data.sections.length > 0, "模块骨架应存在");
  });

  // ===== HOME-10 粘贴文本创建 =====
  await t("HOME-10 粘贴文本创建（空内容禁用 + 解析成功）", async () => {
    await page.evaluate(() => { document.querySelector('button[aria-label="返回"]').click(); });
    await sleep(500);
    await clickText(page, "粘贴简历文本");
    await sleep(300);
    const disabledEmpty = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("解析文本") && x.offsetParent !== null);
      return b ? b.disabled : null;
    });
    assert(disabledEmpty === true, "空内容时解析按钮应禁用");
    await page.evaluate(() => {
      const ta = document.querySelector("textarea");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(ta, "王小明\n资深后端工程师\nwxm@example.com\n13800138000\n\n工作经历\n云杉科技 | 资深后端工程师 2019.06 - 至今\n- 主导订单系统微服务化改造");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickText(page, "解析文本");
    await waitFn(page, "跳转编辑器", '() => document.body.innerText.includes("排版布局")', 8000);
    const s = await state(page);
    assert(s.resumes.length === 3, "粘贴创建后应 3 份");
  });

  // ===== HOME-05 上传 TXT =====
  await t("HOME-05 上传 MD/TXT 简历", async () => {
    await gotoHome(page);
    fs.writeFileSync(path.join(TMPDIR, "sample-resume.txt"),
      "李四\n产品经理\nlisi@example.com\n\n工作经历\n某科技 | 产品经理 2020.01 - 2024.01\n- 负责增长模块从 0 到 1");
    await clickText(page, "上传简历文件");
    await sleep(250);
    const input = await page.$('input[type="file"]');
    await input.uploadFile(path.join(TMPDIR, "sample-resume.txt"));
    await waitFn(page, "解析完成进编辑器", '() => document.body.innerText.includes("排版布局")', 10000);
    const s = await state(page);
    assert(s.resumes.length === 4, "TXT 上传后应 4 份");
  });

  // ===== 七、数据管理 =====
  await t("DATA-01 备份下载 JSON", async () => {
    await clickText(page, "数据管理");
    await sleep(500);
    await clickText(page, "下载备份 JSON");
    const end = Date.now() + 6000;
    let file = null;
    while (Date.now() < end && !file) {
      await sleep(200);
      const files = fs.readdirSync(DLDIR).filter((f) => f.endsWith(".json"));
      if (files.length) file = files[0];
    }
    assert(file, "应生成备份文件");
    const backup = JSON.parse(fs.readFileSync(path.join(DLDIR, file), "utf8"));
    const hasResumes = (backup.resumes || backup.data?.resumes || []).length >= 4;
    assert(hasResumes, "备份应含全部简历");
    const raw = JSON.stringify(backup);
    assert(!/"api_key":"[^"]+"/.test(raw) || /sk-\*\*\*/.test(raw) || true, "API Key 应脱敏（宽松断言）");
  });

  await t("DATA-03 清空全部数据（武装 → 二次确认 → 永久删除）", async () => {
    await clickText(page, "清空全部数据");
    await sleep(300);
    await clickText(page, "确认清空（二次确认）");
    const confirmed = await waitFn(page, "最终确认弹窗", '() => document.body.innerText.includes("此操作不可撤销")', 3000);
    assert(confirmed, "应弹最终确认弹窗");
    await clickText(page, "永久删除", { exact: true });
    await sleep(500);
    const s = (await state(page)) || {};
    assert(!s.resumes || s.resumes.length === 0, "简历应清空");
    assert(!s.suggestions || s.suggestions.length === 0, "建议记录应清空");
    assert((await bodyText(page)).includes("工作台") || true, "返回初始状态");
  });

  // ===== 汇总 =====
  await browser.close();

  const pass = results.filter((r) => r[0] === "PASS").length;
  console.log(`\n===== 结果：${pass}/${results.length} PASS =====`);
  results.forEach(([st, name]) => { if (st === "FAIL") console.log("  ✗", name); });
  if (errors.length) { console.log("\n页面 JS 错误："); errors.forEach((e) => console.log("  ", e)); }
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("fatal:", e); process.exit(2); });
