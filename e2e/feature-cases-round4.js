/**
 * verify-feature-cases-round4.js —— 收尾剩余手工用例：
 * HOME-08 扫描件兜底 / HOME-09 解析失败降级 / TMPL-09 隐藏模块不导出 /
 * TMPL-12 缩放线宽 DEV 断言 / EDIT-19 渲染异常兜底（错误边界）
 *
 * 运行前置：dev server @3000；puppeteer-core；python 构造的 scan.pdf / garbage.txt（e2e-tmp）
 * 注意：EDIT-19 与 TMPL-12 通过「临时改源码 → 恢复 → 哈希比对」实现，
 *       恢复失败会立即报错（工作区含用户未提交改动，绝不能破坏）。
 */
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BASE = process.env.E2E_BASE || "http://localhost:3000";
const KEY = "ai-resume-workbench-v1";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROJ = "E:/MyProject/MyCode/ai-resume";
const TMP = path.join(__dirname, "e2e-tmp");
const HOME_TSX = path.join(PROJ, "src/pages/Home.tsx");
const TMPL_TSX = path.join(PROJ, "src/components/template.tsx");

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
async function t(name, fn) {
  try { await fn(); results.push(["PASS", name]); console.log("  PASS", name); }
  catch (e) { results.push(["FAIL", name + " —— " + e.message]); console.log("  FAIL", name, "——", e.message); }
}
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

/* ---------- 页面助手（沿用前三轮经验：每次重新查元素、不点 body） ---------- */
async function clickText(page, text, { exact = false, sel = "button" } = {}) {
  const ok = await page.evaluate((text, exact, sel) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null);
    const el = els.find((e) => { const s = e.textContent.replace(/\s+/g, ""); const w = text.replace(/\s+/g, ""); return exact ? s === w : s.includes(w); });
    if (!el) return false;
    el.click(); return true;
  }, text, exact, sel);
  if (!ok) throw new Error(`clickText 未找到: "${text}"`);
}
async function clickAriaInCard(page, cardTitle, label) {
  const ok = await page.evaluate((cardTitle, label) => {
    const h3s = [...document.querySelectorAll("main h3")].filter((h) => h.textContent.trim().includes(cardTitle));
    if (!h3s.length) return "no-card";
    const h3 = h3s[0];
    const list = h3.closest("div.max-w-3xl");
    const card = list ? [...list.children].find((c) => c.contains(h3)) : null;
    if (!card) return "no-card-root";
    const el = [...card.querySelectorAll(`[aria-label="${label}"]`)].find((e) => e.offsetParent !== null);
    if (!el) return "no-btn:" + label;
    el.click(); return true;
  }, cardTitle, label);
  if (ok !== true) throw new Error(`clickAriaInCard(${cardTitle}, ${label}) 失败: ${ok}`);
}
const state = (page) => page.evaluate((k) => {
  const p = JSON.parse(localStorage.getItem(k) || "null");
  const st = (p && p.state) || p || {};
  return { resumes: st.resumes || [], jds: st.jds || {}, suggestions: st.suggestions || [], models: st.models || [] };
}, KEY);
const bodyText = (page) => page.evaluate(() => document.body.innerText);
async function waitFn(page, fnBodySrc, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await page.evaluate(new Function(`return (${fnBodySrc})()`))) return true;
    await sleep(150);
  }
  return false;
}
async function gotoHome(page) {
  await page.evaluate(() => { const b = document.querySelector('button[aria-label="返回"]'); if (b) b.click(); });
  await sleep(500);
}
async function openFirstResume(page) {
  await clickText(page, "打开");
  await waitFn(page, '() => document.body.innerText.includes("排版布局")', 8000);
}
/** 在 pdfjs-dist（项目 node_modules）中提取 PDF 全文 */
async function pdfText(p) {
  const pdfjs = await import("file:///E:/MyProject/MyCode/ai-resume/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(p));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false, isEvalSupported: false }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const tc = await pg.getTextContent();
    out += tc.items.map((it) => it.str || "").join(" ") + "\n";
  }
  await doc.destroy();
  return out;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await sleep(600);

  /* ---------- HOME-08 扫描件兜底 ---------- */
  await t("HOME-08 扫描件 PDF 兜底提示", async () => {
    await gotoHome(page);
    await clickText(page, "上传简历文件");
    await sleep(250);
    const input = await page.$('input[type="file"]');
    await input.uploadFile(path.join(TMP, "scan.pdf"));
    const shown = await waitFn(page, '() => document.body.innerText.includes("扫描件")', 10000);
    assert(shown, "应提示「扫描件」");
    const txt = await bodyText(page);
    assert(txt.includes("粘贴文本"), "应引导改用粘贴方式");
    const s = await state(page);
    assert(!s.resumes.some((r) => r.title && r.title.includes("scan")), "不应创建简历");
    // 关闭创建弹窗（Escape），避免影响后续用例
    await page.keyboard.press("Escape");
    await sleep(400);
  });

  /* ---------- HOME-09 解析失败降级到粘贴 ---------- */
  await t("HOME-09 解析失败 → 改为粘贴文本", async () => {
    await clickText(page, "上传简历文件");
    await sleep(250);
    const input = await page.$('input[type="file"]');
    await input.uploadFile(path.join(TMP, "garbage.txt"));
    const shown = await waitFn(page, '() => document.body.innerText.includes("未能从文本中识别出结构化内容")', 12000);
    assert(shown, "应提示结构化失败");
    await clickText(page, "改为粘贴文本");
    await sleep(300);
    const pasteVisible = await page.evaluate(() => !![...document.querySelectorAll("textarea")].find((e) => e.offsetParent !== null && e.placeholder.includes("粘贴简历全文")));
    assert(pasteVisible, "应切换到「粘贴简历文本」页签");
    await page.keyboard.press("Escape");
    await sleep(400);
  });

  /* ---------- TMPL-09 隐藏模块不导出 ---------- */
  await t("TMPL-09 隐藏「技能」模块后导出 PDF 无该模块", async () => {
    await gotoHome(page);
    // 确保示例简历存在（陈墨），并打开它
    const s0 = await state(page);
    if (!s0.resumes.some((r) => r.title.includes("陈墨"))) {
      await clickText(page, "载入示例");
      await waitFn(page, '() => document.body.innerText.includes("陈墨")', 6000);
      await sleep(500);
    }
    // 载入示例会直接进编辑器；若已在编辑器则不再点「打开」
    if (!(await bodyText(page)).includes("排版布局")) await openFirstResume(page);
    // 隐藏「技能」模块（保留排序位置，不参与预览/导出）
    await clickAriaInCard(page, "技能", "显示/隐藏模块");
    await sleep(500);
    // 打开预览并导出 PDF
    await clickText(page, "预览 / 导出 PDF");
    await waitFn(page, '() => !!document.querySelector(".fixed.inset-0.z-50")', 6000);
    await sleep(800);
    const out = path.join(TMP, "tmpl09-out.pdf");
    await page.pdf({ path: out, printBackground: true, preferCSSPageSize: true });
    await page.keyboard.press("Escape");
    await sleep(400);
    // Chromium 导出的 PDF 是字形级切分（"工作经|历"），必须去空白后再匹配
    const norm = (await pdfText(out)).replace(/\s+/g, "");
    assert(norm.includes("工作经历"), "导出 PDF 应包含未隐藏模块（工作经历）");
    // 注意：微前端 同时出现在工作经历要点正文里，不能作为技能模块的特征词
    assert(!norm.includes("技能") && !norm.includes("核心技术") && !norm.includes("Webpack"),
      "导出 PDF 不应包含隐藏的「技能」模块（标题/技能组/标签均不应出现）");
    // 恢复：重新显示技能模块
    await clickAriaInCard(page, "技能", "显示/隐藏模块");
    await sleep(400);
    const s = await state(page);
    const sec = s.resumes.find((r) => r.title.includes("陈墨")).data.sections.find((x) => x.title === "技能");
    assert(sec && sec.visible !== false, "恢复后技能模块应重新可见");
  });

  /* ---------- TMPL-12 缩放线宽 DEV 断言（临时改源码 → 恢复） ---------- */
  await t("TMPL-12 RULE_PX_SOLID×MIN_ZOOM<2 触发 DEV 控制台警告", async () => {
    const before = sha(TMPL_TSX);
    fs.writeFileSync(TMPL_TSX + ".e2e-bak", fs.readFileSync(TMPL_TSX));
    let src = fs.readFileSync(TMPL_TSX, "utf-8");
    assert(src.includes("const RULE_PX_SOLID = 2.4;"), "锚点缺失：RULE_PX_SOLID");
    fs.writeFileSync(TMPL_TSX, src.replace("const RULE_PX_SOLID = 2.4;", "const RULE_PX_SOLID = 1.0;"));
    try {
      await page.evaluateOnNewDocument(() => {
        window.__warns = [];
        const ow = console.warn;
        console.warn = (...a) => { window.__warns.push(a.map(String).join(" ")); ow(...a); };
      });
      await page.reload({ waitUntil: "networkidle2" });
      await sleep(1200);
      const warns = await page.evaluate(() => window.__warns || []);
      const hit = warns.find((w) => w.includes("RULE_PX_SOLID"));
      assert(hit, "控制台应出现 RULE_PX_SOLID 警告，实际 warns: " + JSON.stringify(warns.slice(0, 5)));
    } finally {
      fs.writeFileSync(TMPL_TSX, fs.readFileSync(TMPL_TSX + ".e2e-bak"));
      fs.unlinkSync(TMPL_TSX + ".e2e-bak");
      assert(sha(TMPL_TSX) === before, "template.tsx 恢复失败（哈希不一致）！");
    }
  });

  /* ---------- EDIT-19 渲染异常兜底（注入 throw → 恢复） ---------- */
  await t("EDIT-19 渲染错误边界 + 本地数据不丢", async () => {
    const before = sha(HOME_TSX);
    fs.writeFileSync(HOME_TSX + ".e2e-bak", fs.readFileSync(HOME_TSX));
    let src = fs.readFileSync(HOME_TSX, "utf-8");
    const anchor = "export default function Home() {";
    assert(src.includes(anchor), "锚点缺失：Home 函数");
    fs.writeFileSync(HOME_TSX, src.replace(anchor, anchor + '\n  throw new Error("boom-e2e-EDIT-19");'));
    try {
      const s0 = await state(page);
      const count0 = s0.resumes.length;
      await page.reload({ waitUntil: "domcontentloaded" });
      await sleep(1000);
      const txt = await bodyText(page);
      assert(txt.includes("页面渲染出错了"), "应出现错误边界卡片");
      assert(txt.includes("重新加载应用"), "「重新加载应用」按钮应可用");
      assert(txt.includes("本地数据不会丢失") || txt.includes("boom-e2e-EDIT-19"), "应展示错误信息或数据安全提示");
      const s1 = await state(page);
      assert(s1.resumes.length === count0, "本地数据不应丢失");
      // 点击「重新加载应用」→ 仍然报错（错误仍在），但页面可交互不白屏
      await clickText(page, "重新加载应用");
      await sleep(1000);
      assert((await bodyText(page)).includes("页面渲染出错了"), "重载后错误边界仍应生效（错误未移除时）");
    } finally {
      fs.writeFileSync(HOME_TSX, fs.readFileSync(HOME_TSX + ".e2e-bak"));
      fs.unlinkSync(HOME_TSX + ".e2e-bak");
      assert(sha(HOME_TSX) === before, "Home.tsx 恢复失败（哈希不一致）！");
    }
    // 恢复源码后重载，应用应回到正常渲染
    await page.reload({ waitUntil: "networkidle2" });
    await sleep(1000);
    assert((await bodyText(page)).includes("简历工作台"), "恢复后应用应正常渲染");
  });

  await browser.close();
  const pass = results.filter((r) => r[0] === "PASS").length;
  console.log(`\n===== round4: ${pass}/${results.length} PASS =====`);
  results.filter((r) => r[0] === "FAIL").forEach((r) => console.log("  " + r[1]));
  process.exit(pass === results.length ? 0 : 1);
})();
