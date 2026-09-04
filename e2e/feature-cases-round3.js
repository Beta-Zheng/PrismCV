/**
 * verify-feature-cases-round3.js —— 三项新功能验证
 * FEAT-01 基本信息自定义信息项（新增/部分填写不显示/删除/模板渲染）
 * FEAT-02 头像按比例显示（avatar_scale 0.5–2 滑杆 → 模板头像盒子尺寸）
 * FEAT-03 条目可追加多个副标题（subtitles 渲染为 标题·副标题1·副标题2，可删除）
 * 前置：npm run dev (3000) + e2e-tmp/avatar.png（由 e2e/make-fixtures.py 生成）
 */
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const KEY = "ai-resume-workbench-v1";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const TMP = path.join(__dirname, "e2e-tmp");

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
async function t(name, fn) {
  try { await fn(); results.push(["PASS", name]); console.log("  PASS", name); }
  catch (e) { results.push(["FAIL", name + " —— " + e.message]); console.log("  FAIL", name, "——", e.message); }
}

const state = (page) => page.evaluate((k) => { const p = JSON.parse(localStorage.getItem(k) || "null"); return (p && p.state) || p || {}; }, KEY);
const bodyText = (page) => page.evaluate(() => document.body.innerText);

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
  if (!ok) throw new Error(`clickAria 未找到: "${label}"`);
}

async function clickAriaInCard(page, cardTitle, label, idx = 0) {
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

/** React 受控 input：native setter 赋值 + input 事件 */
async function setInputValue(page, selector, value) {
  await page.evaluate((selector, value) => {
    const el = [...document.querySelectorAll(selector)].find((e) => e.offsetParent !== null);
    if (!el) throw new Error("setInputValue 未找到: " + selector);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, selector, value);
}

/** 真实键盘输入：聚焦后逐字敲 */
async function typeByAria(page, label, text) {
  await page.evaluate((label) => {
    const el = [...document.querySelectorAll(`[aria-label="${label}"]`)].find((e) => e.offsetParent !== null);
    if (!el) throw new Error("typeByAria 未找到: " + label);
    el.scrollIntoView({ block: "center" });
    el.focus();
  }, label);
  await sleep(120);
  await page.keyboard.type(text, { delay: 8 });
}

async function typeByPlaceholder(page, ph, text, idx = 0) {
  await page.evaluate((ph, idx) => {
    const els = [...document.querySelectorAll(`input[placeholder^="${ph}"]`)].filter((e) => e.offsetParent !== null);
    if (!els[idx]) throw new Error("typeByPlaceholder 未找到: " + ph);
    els[idx].scrollIntoView({ block: "center" });
    els[idx].focus();
  }, ph, idx);
  await sleep(120);
  await page.keyboard.type(text, { delay: 8 });
}

/** 头像盒子（img[alt=头像] 的父容器）实际渲染宽度 */
const avatarBoxW = (page) => page.evaluate(() => {
  const img = document.querySelector('img[alt="头像"]');
  if (!img || img.offsetParent === null) return null;
  return img.parentElement.getBoundingClientRect().width;
});

(async () => {
  assert(fs.existsSync(path.join(TMP, "avatar.png")), "缺少 e2e-tmp/avatar.png，先跑 e2e/make-fixtures.py");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950 });
  page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 120)));
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await page.reload({ waitUntil: "networkidle2" });
  await sleep(600);

  /* ---------- FEAT-01 基本信息·自定义信息项 ---------- */
  await t("FEAT-01a 自定义信息项 新增 + 渲染为 字段名：内容", async () => {
    await clickText(page, "载入示例");
    await sleep(800);
    await clickText(page, "新增信息项");
    await sleep(200);
    await typeByAria(page, "信息项字段名 1", "期望薪资");
    await typeByAria(page, "信息项内容 1", "25-35k");
    await sleep(300);
    const s = await state(page);
    const cf = s.resumes[0].data.basic_info.custom_fields;
    assert(Array.isArray(cf) && cf[0].label === "期望薪资" && cf[0].value === "25-35k", "store 应写入 custom_fields，实际 " + JSON.stringify(cf));
    await clickText(page, "预览 / 导出 PDF");
    await sleep(700);
    const modalTxt = await bodyText(page);
    assert(modalTxt.includes("期望薪资：25-35k"), "简历预览应显示 期望薪资：25-35k");
    await page.keyboard.press("Escape");
    await sleep(400);
  });

  await t("FEAT-01b 只有字段名无内容时不上屏 + 删除生效", async () => {
    await clickText(page, "新增信息项");
    await sleep(200);
    await typeByAria(page, "信息项字段名 2", "政治面貌");
    await sleep(300);
    const txt = await bodyText(page);
    assert(!txt.includes("政治面貌"), "内容为空时不应渲染到简历");
    const s1 = await state(page);
    assert(s1.resumes[0].data.basic_info.custom_fields.length === 2, "store 仍应保留两条");
    await clickAria(page, "删除信息项 政治面貌");
    await sleep(300);
    const s2 = await state(page);
    assert(s2.resumes[0].data.basic_info.custom_fields.length === 1, "删除后应剩一条");
  });

  /* ---------- FEAT-02 头像按比例显示 ---------- */
  await t("FEAT-02 头像比例 滑杆缩放模板头像尺寸（1×→1.5×→0.5×）", async () => {
    // 示例简历若为 ATS（不显示头像），切到现代单栏
    if ((await state(page)).resumes[0].template_id === "classic_ats") {
      await clickText(page, "现代单栏");
      await sleep(500);
    }
    await page.evaluate(() => document.querySelector('#img-头像').scrollIntoView({ block: "center" }));
    const fileInput = await page.$("#img-头像");
    await fileInput.uploadFile(path.join(TMP, "avatar.png"));
    await sleep(800);

    const previewW = async () => {
      await clickText(page, "预览 / 导出 PDF");
      await sleep(800);
      const w = await page.evaluate(() => {
        // 只在预览弹窗容器内找（弹窗背后编辑器的上传缩略图也有 alt=头像）
        const modal = document.querySelector(".fixed.inset-0.z-50");
        const img = modal && modal.querySelector('img[alt="头像"]');
        if (!img) return null;
        return img.parentElement.getBoundingClientRect().width;
      });
      await page.keyboard.press("Escape");
      await sleep(400);
      return w;
    };
    const setScale = async (v) => {
      await clickText(page, "排版布局");
      await sleep(400);
      await setInputValue(page, 'input[aria-label="头像显示比例"]', String(v));
      await sleep(200);
      const cur = (await state(page)).resumes[0].theme.avatar_scale;
      assert(cur === v, "theme.avatar_scale 应为 " + v + "，实际 " + cur);
      await page.keyboard.press("Escape");
      await sleep(400);
    };

    const w0 = await previewW();
    assert(w0 && w0 > 5, `1× 模板头像盒子应存在，实际 ${w0}`);
    await setScale(1.5);
    const w15 = await previewW();
    assert(Math.abs(w15 - w0 * 1.5) < 2, `1.5× 应≈${(w0 * 1.5).toFixed(1)}px，实际 ${w15}`);
    await setScale(0.5);
    const w05 = await previewW();
    assert(Math.abs(w05 - w0 * 0.5) < 2, `0.5× 应≈${(w0 * 0.5).toFixed(1)}px，实际 ${w05}`);
  });

  /* ---------- FEAT-03 条目追加多个副标题 ---------- */
  await t("FEAT-03a 工作经历条目 追加两个副标题 · 分隔渲染", async () => {
    try { await clickAriaInCard(page, "工作经历", "展开", 0); }
    catch { /* 条目默认展开，无需操作 */ }
    await sleep(300);
    await clickText(page, "新增副标题");
    await sleep(200);
    await clickText(page, "新增副标题");
    await sleep(200);
    await typeByPlaceholder(page, "追加副标题", "后端平台组");
    await typeByPlaceholder(page, "追加副标题", "上海·张江", 1);
    await sleep(300);
    const s = await state(page);
    const b = s.resumes[0].data.sections.find((x) => x.title === "工作经历").blocks[0];
    assert(JSON.stringify(b.subtitles) === JSON.stringify(["后端平台组", "上海·张江"]), "store subtitles 应为两段，实际 " + JSON.stringify(b.subtitles));
    await clickText(page, "预览 / 导出 PDF");
    await sleep(800);
    const txt = (await bodyText(page)).replace(/\s+/g, "");
    assert(txt.includes("后端平台组") && txt.includes("上海·张江"), "简历预览应渲染两个追加副标题");
    assert(txt.includes("·后端平台组·上海·张江"), "副标题间应以 · 分隔，实际片段: " + (txt.match(/.{0,20}后端平台组.{0,20}/) || [""])[0]);
    await page.keyboard.press("Escape");
    await sleep(400);
  });

  await t("FEAT-03b 删除追加副标题 + 刷新持久化", async () => {
    await clickAria(page, "删除副标题 1");
    await sleep(300);
    let s = await state(page);
    let b = s.resumes[0].data.sections.find((x) => x.title === "工作经历").blocks[0];
    assert(JSON.stringify(b.subtitles) === JSON.stringify(["上海·张江"]), "删除首段后应剩 上海·张江，实际 " + JSON.stringify(b.subtitles));
    await page.reload({ waitUntil: "networkidle2" });
    await sleep(600);
    // reload 后回首页，重新打开
    await clickText(page, "打开");
    await sleep(600);
    s = await state(page);
    b = s.resumes[0].data.sections.find((x) => x.title === "工作经历").blocks[0];
    assert(JSON.stringify(b.subtitles) === JSON.stringify(["上海·张江"]), "刷新后 subtitles 应保留");
    assert(s.resumes[0].data.basic_info.custom_fields?.[0]?.label === "期望薪资", "刷新后自定义信息项应保留");
    assert((s.resumes[0].theme.avatar_scale ?? 1) === 0.5, "刷新后头像比例应保留 0.5");
  });

  await browser.close();

  const fail = results.filter((r) => r[0] === "FAIL");
  console.log(`\n===== round3 结果: ${results.length - fail.length}/${results.length} PASS =====`);
  fail.forEach((f) => console.log("  FAIL", f[1]));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(2); });
