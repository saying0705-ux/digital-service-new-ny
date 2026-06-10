/**
 * 디지털서비스본부 주간 대시보드 — 프론트엔드 v5.0
 *  - 팀별 주요 실적: HR 표 형식 (업무·목적·시작일·종료일·진척율·진행사항·지연사유·예정사항)
 *  - 진척율: 세로 막대 (100% 그린 / 지연사유 있음 오렌지 / 그 외 블루)
 *  - 시작일/종료일은 시트 J/K열에서 가져옴 (비면 '-')
 */

const API_URL = "https://script.google.com/macros/s/AKfycbzYzyEAhX2wxxHsjeZ8bmOTBpVjKKy9jvBsAqQz3SwZGY3Vs0HcK-T-e_NZ8S4dZ1-NjA/exec";

const NAV_OFFSET = 140;
let navClickGuard = 0;
let LAST_DATA = null;
let TEAM_FILTER = "all";   // all | star | delay

document.addEventListener("DOMContentLoaded", () => {
  bindTopBar();
  loadInitial();
});

async function loadInitial() {
  const urlParams = new URLSearchParams(location.search);
  const week = urlParams.get("week") || "";
  await loadData(week);
}

async function loadData(weekKey) {
  const root = document.getElementById("app");
  root.innerHTML = '<div class="loading">대시보드 데이터를 불러오는 중입니다…</div>';
  if (!API_URL || API_URL.indexOf("Apps-Script") !== -1) {
    root.innerHTML = '<div class="error">API_URL이 설정되지 않았습니다. app.js 의 API_URL 에 Apps Script 웹앱 URL을 입력하세요.</div>';
    return;
  }
  try {
    const qs = weekKey ? `?week=${encodeURIComponent(weekKey)}` : "";
    const res = await fetch(`${API_URL}${qs}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    LAST_DATA = data;
    render(data);
  } catch (err) {
    root.innerHTML = `<div class="error">데이터를 불러오지 못했습니다: ${err.message}</div>`;
    console.error(err);
  }
}

function bindTopBar() {
  const select = document.getElementById("week-select");
  const refresh = document.getElementById("refresh-btn");
  select.addEventListener("change", () => {
    const v = select.value;
    if (v) loadData(v);
  });
  refresh.addEventListener("click", () => loadData(select.value || ""));
}

function fillWeekDropdown(weeks, currentKey) {
  const select = document.getElementById("week-select");
  select.innerHTML = "";
  weeks.forEach((w, i) => {
    const opt = document.createElement("option");
    opt.value = w.key;
    opt.textContent = w.label + (i === 0 ? " (최신)" : "");
    if (w.key === currentKey) opt.selected = true;
    select.appendChild(opt);
  });
}

const TEAM_ORDER = ["marketing", "operations", "planning", "netimes", "ax"];
const TEAM_DISPLAY = {
  marketing:  "디지털마케팅팀",
  operations: "서비스운영팀",
  planning:   "서비스기획팀",
  netimes:    "NE Times팀",
  ax:         "AX팀",
};
const TEAM_META = {
  marketing:  { id: "marketing",  cls: "t-marketing",  summary: "자사몰 커머스 · NELT 플랫폼 운영" },
  operations: { id: "operations", cls: "t-operations", summary: "디지털 서비스 운영 · 자동화" },
  planning:   { id: "planning",   cls: "t-planning",   summary: "신규 서비스 기획 · 사용자 경험" },
  netimes:    { id: "netimes",    cls: "t-netimes",    summary: "B2G 채택 · 콘텐츠 제휴 · 운영 자동화" },
  ax:         { id: "ax",         cls: "t-ax",         summary: "AI 전환 · 데이터 자동화" },
};

function render(d) {
  fillWeekDropdown(d.weeks || [], d.week);
  const root = document.getElementById("app");

  const messages    = d.messages || [];
  const kpis        = d.kpis || [];
  const sales       = d.monthlySales || { title:"", rows: [], note: "", forecastTotal: null };
  const ceo         = d.ceo || [];
  const teams       = d.teams || {};
  const decisions   = d.decisions || [];

  const hasMessages = messages.length > 0;
  const hasKpis     = kpis.length > 0;
  const hasSales    = (sales.rows || []).length > 0;
  const hasCeo      = ceo.length > 0;
  const teamPresent = {};
  TEAM_ORDER.forEach(k => {
    teamPresent[k] = !!(teams[k] && teams[k].items && teams[k].items.length);
  });
  const hasTeams    = TEAM_ORDER.some(k => teamPresent[k]);
  const hasDecisions = decisions.length > 0;

  const parts = [];
  parts.push(`
    <section class="cover-card">
      <div class="cover-head">
        <span class="cover-dot" aria-hidden="true"></span>
        <h1 class="cover-title">${escape(d.cover["보고서 제목"] || "디지털서비스본부 주간 보고")}</h1>
      </div>
      <div class="cover-meta">
        <span><b>보고 기간</b> ${escape(d.cover["보고 기간"] || "")}</span>
        <span><b>보고일</b> ${escape(d.cover["보고일"] || "")}</span>
        <span><b>작성 본부</b> ${escape(d.cover["작성 본부"] || "")}</span>
        <span><b>주차</b> ${escape(d.weekLabel || d.week)}</span>
      </div>
    </section>
  `);

  if (hasMessages) {
    parts.push(`<h2 class="section-title" id="overview">핵심 메시지</h2>`);
    parts.push(`<div id="signals" class="signals"></div>`);
  }
  if (hasKpis) {
    parts.push(`<h2 class="section-title" id="kpis-anchor">본부 핵심 과제</h2>`);
    parts.push(`<div id="kpis" class="kpi-grid"></div>`);
  }
  if (hasSales) {
    const salesSectionLabel = escape(sales.title || "월별 매출현황");
    parts.push(`<h2 class="section-title" id="sales-anchor">${salesSectionLabel}</h2>`);
    parts.push(`<div id="monthly-sales"></div>`);
  }
  if (hasCeo) {
    parts.push(`<h2 class="section-title" id="ceo">CEO 지침 응답</h2>`);
    parts.push(`<div id="ceo-block" class="ceo-block"></div>`);
  }
  if (hasTeams) {
    parts.push(`
      <div class="section-head-row" id="teams-head">
        <h2 class="section-title" id="teams-anchor">팀별 주요 실적</h2>
        <button class="download-btn" id="download-form-btn" type="button" title="현재 보고 있는 주차 데이터를 기존 폼(금주/차주) 엑셀로 다운로드">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          기존 폼으로 다운로드
        </button>
      </div>
    `);
    parts.push(`
      <div class="team-toolbar" id="team-toolbar">
        <span class="tf-label">보기</span>
        <button type="button" class="tf-btn active" data-filter="all">전체</button>
        <button type="button" class="tf-btn" data-filter="star">핵심만</button>
        <button type="button" class="tf-btn" data-filter="delay">지연만</button>
      </div>
    `);
    parts.push(`<div id="teams"></div>`);
  }
  if (hasDecisions) {
    parts.push(`<h2 class="section-title" id="decisions-anchor">의사결정 요청</h2>`);
    parts.push(`<div id="decisions-block" class="decisions-block"></div>`);
  }
  if (parts.length === 1) parts.push('<div class="loading">이번 주차에 등록된 내용이 없습니다.</div>');

  root.innerHTML = parts.join("");

  if (hasMessages)  renderMessages(messages);
  if (hasKpis)      renderKpis(kpis);
  if (hasSales)     renderMonthlySales(sales);
  if (hasCeo)       renderCeo(ceo);
  if (hasTeams)     renderTeams(teams);
  if (hasDecisions) renderDecisions(decisions);

  const dlBtn = document.getElementById("download-form-btn");
  if (dlBtn) {
    dlBtn.addEventListener("click", () => {
      downloadWeeklyForm(LAST_DATA).catch(err => {
        console.error(err);
        alert("엑셀 변환 중 오류가 발생했습니다: " + err.message);
      });
    });
  }

  bindTeamToolbar();

  setupNavScroll({
    overview: hasMessages,
    "kpis-anchor": hasKpis,
    "sales-anchor": hasSales,
    ceo: hasCeo,
    marketing:  teamPresent.marketing,
    operations: teamPresent.operations,
    planning:   teamPresent.planning,
    netimes:    teamPresent.netimes,
    ax:         teamPresent.ax,
    "decisions-anchor": hasDecisions,
  });
}

function renderMessages(messages) {
  const el = document.getElementById("signals");
  if (!el) return;
  el.className = "signals count-" + Math.min(messages.length, 3);
  el.innerHTML = messages.map(m => `
    <div class="signal">
      <span class="num">${escape(m.idx)}</span>
      <div class="stitle">${escape(m.title)}</div>
      <p class="sbody">${escapeML(m.body)}</p>
    </div>
  `).join("");
}

const STATUS_MAP = {
  "정상 진척":         { card: "k-good", badge: "b-good" },
  "전환 가속":         { card: "k-good", badge: "b-good" },
  "페이스 부족":       { card: "k-bad",  badge: "b-bad"  },
  "목표 하향 조정":    { card: "k-warn", badge: "b-warn" },
  "컨설팅 영업 지속":  { card: "k-info", badge: "b-info" },
  "신규 진행":         { card: "k-new",  badge: "b-new"  },
};

function renderKpis(kpis) {
  const el = document.getElementById("kpis");
  if (!el) return;
  el.innerHTML = kpis.map(k => {
    const sm = STATUS_MAP[k.status] || { card: "", badge: "" };
    return `
      <div class="kpi-card ${sm.card}">
        <p class="kpi-name">${escape(k.name)}</p>
        <p class="kpi-value">${escape(k.value)}<span class="unit">${escape(k.unit || "")}</span></p>
        <p class="kpi-desc">${escapeML(k.desc)}</p>
        ${k.status ? `<span class="kpi-badge ${sm.badge}">${escape(k.status)}</span>` : ""}
      </div>
    `;
  }).join("");
}

function renderMonthlySales(ms) {
  const el = document.getElementById("monthly-sales");
  if (!el) return;
  const rows = ms.rows || [];
  if (!rows.length) { el.innerHTML = ""; return; }
  const fmt2 = v => (v === null || v === undefined) ? "-" : Number(v).toFixed(2);
  const fmtPct = v => (v === null || v === undefined) ? "-" : `${(Number(v) * 100).toFixed(1)}%`;
  const pctCls = v => {
    if (v === null || v === undefined) return "";
    const pct = Number(v) * 100;
    if (pct >= 100) return "up";
    if (pct < 50)   return "down";
    return "";
  };

  function pctCell(v, remark, cls) {
    const pctText = fmtPct(v);
    const info = remark ? `<span class="info-icon" tabindex="0" data-tip="${escape(remark)}" aria-label="비고">i</span>` : "";
    return `<td class="num ${cls}">${pctText}${info}</td>`;
  }

  const tableTitle = ms.tableLabel || ms.title || "월별 매출현황";
  const h = ms.headers || {
    team: '팀', target: '1Q 목표 매출액', shipped: '총출고',
    returns: '반품', net: '순매출액', progress: '진척율'
  };

  let bodyRows = rows.map(r => `
    <tr class="${r.type}">
      <td>${escape(r.label)}</td>
      <td class="num">${fmt2(r.target)}</td>
      <td class="num">${fmt2(r.shipped)}</td>
      <td class="num">${fmt2(r.returns)}</td>
      <td class="num">${fmt2(r.net)}</td>
      ${pctCell(r.progress, r.remark, r.type === 'normal' ? pctCls(r.progress) : '')}
    </tr>
  `).join("");

  if (ms.forecastTotal) {
    const ft = ms.forecastTotal;
    bodyRows += `
      <tr class="forecast-total">
        <td>${escape(ft.label || "월별 마감 예상매출 합계")}</td>
        <td class="num">${fmt2(ft.target)}</td>
        <td class="num">${fmt2(ft.shipped)}</td>
        <td class="num">${fmt2(ft.returns)}</td>
        <td class="num">${fmt2(ft.net)}</td>
        ${pctCell(ft.progress, ft.remark, '')}
      </tr>
    `;
  }

  el.innerHTML = `
    <div class="sales-block">
      <h3>${escape(tableTitle)}</h3>
      <table class="sales-table">
        <colgroup>
          <col style="width: 32%"/><col style="width: 14%"/><col style="width: 12%"/>
          <col style="width: 12%"/><col style="width: 15%"/><col style="width: 15%"/>
        </colgroup>
        <thead><tr>
          <th>${escape(h.team)}</th>
          <th class="num">${escape(h.target)}</th>
          <th class="num">${escape(h.shipped)}</th>
          <th class="num">${escape(h.returns)}</th>
          <th class="num">${escape(h.net)}</th>
          <th class="num">${escape(h.progress)}</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      ${ms.note ? `<div class="sales-note">${escapeML(ms.note)}</div>` : ""}
    </div>
  `;
}

function renderCeo(items) {
  const el = document.getElementById("ceo-block");
  if (!el) return;
  el.innerHTML = `
    <table class="ceo-table">
      <thead><tr>
        <th style="width: 22%;">CEO 지침</th>
        <th style="width: 22%;">갭 분석</th>
        <th style="width: 36%;">본부 응답</th>
        <th style="width: 10%;">When</th>
      </tr></thead>
      <tbody>
        ${items.map(c => `
          <tr>
            <td><b>${escapeML(c.directive)}</b></td>
            <td>${escapeML(c.gap)}</td>
            <td>${escapeML(c.answer)}</td>
            <td class="when">${escape(c.when)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/* ===== 팀별 주요 실적 — HR 표 양식 (v5.1 최적화) ===== */
function isStarItem(it) {
  const t = String(it.title || "");
  return it.isStar === true || /^\s*\[★\]\s*/.test(t) || /^\s*★\s*/.test(t);
}

function bindTeamToolbar() {
  const bar = document.getElementById("team-toolbar");
  if (!bar) return;
  bar.querySelectorAll(".tf-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.filter === TEAM_FILTER);
    btn.onclick = () => {
      TEAM_FILTER = btn.dataset.filter;
      bar.querySelectorAll(".tf-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === TEAM_FILTER));
      if (LAST_DATA) renderTeams(LAST_DATA.teams || {});
    };
  });
}

function renderTeams(teams) {
  const el = document.getElementById("teams");
  if (!el) return;
  const filter = TEAM_FILTER;

  el.innerHTML = TEAM_ORDER.map(k => {
    const t = teams[k];
    if (!t || !t.items.length) return "";

    // 필터 적용 (핵심만 / 지연만)
    let items = t.items.slice();
    if (filter === "star")  items = items.filter(isStarItem);
    if (filter === "delay") items = items.filter(it => it.gap && String(it.gap).trim());
    if (!items.length) return "";

    const meta = TEAM_META[k];
    // 날짜 열 자동 숨김: 이 팀에 시작일/종료일이 하나도 없으면 두 열 제거
    const hasDates = items.some(it => (it.startDate && it.startDate.trim()) || (it.endDate && it.endDate.trim()));
    const colCount = hasDates ? 8 : 6;

    const groups = groupByPart(items);
    const bodyRows = groups.map(g => {
      // ★핵심 항목을 각 파트 맨 위로 정렬
      const sorted = g.items.slice().sort((a, b) => (isStarItem(b) ? 1 : 0) - (isStarItem(a) ? 1 : 0));
      const partHeader = g.part
        ? `<tr class="part-row ${meta.cls}"><td colspan="${colCount}">${escape(g.part)}</td></tr>`
        : "";
      return partHeader + sorted.map(it => renderItemRow(it, hasDates)).join("");
    }).join("");

    const dateHeads = hasDates ? `<th class="c-date">시작일</th><th class="c-date">종료일</th>` : "";
    const colgroup = hasDates
      ? `<col style="width:15%"/><col style="width:15%"/><col style="width:7%"/><col style="width:7%"/><col style="width:10%"/><col style="width:16%"/><col style="width:14%"/><col style="width:16%"/>`
      : `<col style="width:17%"/><col style="width:18%"/><col style="width:11%"/><col style="width:18%"/><col style="width:16%"/><col style="width:20%"/>`;

    return `
      <section class="team-block" id="${meta.id}">
        <header class="team-card-head ${meta.cls}">
          <span class="team-dot" aria-hidden="true"></span>
          <span class="team-name">${escape(t.name)}</span>
          <span class="team-sub">${escape(meta.summary)}</span>
          <span class="collapse-caret" aria-hidden="true">▾</span>
        </header>
        <div class="work-table-wrap">
          <table class="work-table">
            <colgroup>${colgroup}</colgroup>
            <thead>
              <tr>
                <th>업무</th>
                <th>목적</th>
                ${dateHeads}
                <th class="c-prog">진척율</th>
                <th>진행사항</th>
                <th>지연사유</th>
                <th>예정사항</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
      </section>
    `;
  }).join("");

  if (!el.innerHTML.trim()) {
    el.innerHTML = `<div class="loading">조건에 맞는 항목이 없습니다.</div>`;
  }

  // 팀 헤더 클릭 → 접기/펼치기
  el.querySelectorAll(".team-card-head").forEach(h => {
    h.onclick = () => h.closest(".team-block").classList.toggle("is-collapsed");
  });
}

function groupByPart(items) {
  const groups = [];
  const map = new Map();
  items.forEach(it => {
    const key = it.part || "";
    if (!map.has(key)) {
      const g = { part: key, items: [] };
      groups.push(g);
      map.set(key, g);
    }
    map.get(key).items.push(it);   // map 값은 {part, items} 객체 → items 배열에 push
  });
  return groups;
}

// 진척율 색: 100% 그린 / 50~99% 블루 / 50% 미만 레드 (지연은 색이 아닌 별도 플래그로 표시)
function progClass(pct) {
  if (pct >= 100) return "p-done";
  if (pct >= 50)  return "p-go";
  return "p-low";
}

function renderItemRow(it, hasDates) {
  const title = String(it.title || "");
  const isStar = isStarItem(it);
  const titleClean = title.replace(/^\s*\[★\]\s*/, "").replace(/^\s*★\s*/, "").trim();

  const pct = (typeof it.progress === "number") ? it.progress : 0;
  const cls = progClass(pct);
  const hasDelay = !!(it.gap && String(it.gap).trim());

  const dash = s => (s && String(s).trim()) ? escapeML(s) : '<span class="muted">-</span>';

  let planHtml = (it.plan && it.plan.trim()) ? escapeML(it.plan) : "";
  if (it.action && it.action.trim()) {
    planHtml += (planHtml ? '<div class="sub-action">↳ ' : '<span class="sub-action">') + escapeML(it.action) + (planHtml ? '</div>' : '</span>');
  }
  if (!planHtml) planHtml = '<span class="muted">-</span>';

  const taskCell = `
    ${isStar ? '<span class="star-mark" aria-hidden="true">★</span>' : ""}
    <span class="task-name">${escape(titleClean)}</span>
    ${isStar ? '<span class="key-badge">핵심</span>' : ""}
  `;

  const dateCells = hasDates
    ? `<td class="c-date">${dash(it.startDate)}</td><td class="c-date">${dash(it.endDate)}</td>`
    : "";

  const delayCell = hasDelay
    ? `<td class="c-delay has-delay"><span class="delay-flag" aria-hidden="true">!</span>${escapeML(it.gap)}</td>`
    : `<td class="c-delay"><span class="muted">-</span></td>`;

  return `
    <tr class="${isStar ? "is-star" : ""}">
      <td class="c-task">${taskCell}</td>
      <td class="c-purpose">${dash(it.goal)}</td>
      ${dateCells}
      <td class="c-prog">
        <div class="hbar ${cls}"><div class="hfill" style="width:${Math.max(0, Math.min(100, pct))}%;"></div></div>
        <div class="hpct ${cls}">${pct}%</div>
      </td>
      <td class="c-notes">${dash(it.fact)}</td>
      ${delayCell}
      <td class="c-plan">${planHtml}</td>
    </tr>
  `;
}

function renderDecisions(items) {
  const el = document.getElementById("decisions-block");
  if (!el) return;
  el.innerHTML = `
    <div id="decisions-rows" class="decisions-table">
      <div class="decision-row decision-header" aria-hidden="true">
        <div>우선순위</div><div>타이틀</div><div>본문</div><div>필요 액션</div><div>마감일</div>
      </div>
      ${items.map(d => `
        <div class="decision-row">
          <div><span class="priority-chip ${priorityClass(d.priority)}">${escape(d.priority)}</span></div>
          <div class="decision-title">${escapeML(d.title)}</div>
          <div class="decision-body">${escapeML(d.body)}</div>
          <div class="decision-action">${escapeML(d.action)}</div>
          <div class="decision-due">${escape(d.deadline)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function priorityClass(priority) {
  const p = String(priority || "").trim();
  if (p === "긴급" || p === "P0" || p === "PO") return "p0";
  if (p === "중요" || p === "P1") return "p1";
  if (p === "참고" || p === "P2") return "p2";
  return "p2";
}

function setupNavScroll(visibleMap) {
  const links = Array.from(document.querySelectorAll(".tabs-inner a[href^='#']"));
  if (!links.length) return;
  links.forEach(link => {
    const id = link.getAttribute("href").slice(1);
    const visible = !visibleMap || visibleMap[id];
    link.style.display = visible ? "" : "none";
    link.onclick = (ev) => {
      const target = document.getElementById(id);
      if (!target) return;
      ev.preventDefault();
      links.forEach(l => l.classList.remove("active"));
      link.classList.add("active");
      navClickGuard = Date.now() + 800;
      const top = target.getBoundingClientRect().top + window.scrollY - NAV_OFFSET + 4;
      window.scrollTo({ top, behavior: "smooth" });
      history.replaceState(null, "", `#${id}`);
    };
  });
  if (!window.__navScrollBound) {
    window.__navScrollBound = true;
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (Date.now() < navClickGuard) return;
        updateActiveTab();
      });
    }, { passive: true });
  }
  updateActiveTab();
}

function updateActiveTab() {
  const links = Array.from(document.querySelectorAll(".tabs-inner a[href^='#']"))
    .filter(a => a.style.display !== "none");
  if (!links.length) return;
  const sections = links
    .map(a => {
      const id = a.getAttribute("href").slice(1);
      const el = document.getElementById(id);
      return el ? { id, el, link: a } : null;
    })
    .filter(Boolean);
  if (!sections.length) return;
  const probe = window.scrollY + NAV_OFFSET + 10;
  let activeIdx = 0;
  for (let i = 0; i < sections.length; i++) {
    const top = sections[i].el.getBoundingClientRect().top + window.scrollY;
    if (top - 1 <= probe) activeIdx = i;
    else break;
  }
  if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) {
    activeIdx = sections.length - 1;
  }
  links.forEach(l => l.classList.remove("active"));
  sections[activeIdx].link.classList.add("active");
}

function escape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* 셀 안 줄바꿈(\n)을 화면에서도 줄바꿈으로 표시 — HTML 이스케이프 후 <br> 변환 */
function escapeML(s) {
  return escape(s).replace(/\r\n|\r|\n/g, "<br>");
}

/* ===== 기존 폼(금주/차주) 엑셀 다운로드 ===== */
async function downloadWeeklyForm(data) {
  if (!data) throw new Error("표시 중인 데이터가 없습니다.");
  if (typeof ExcelJS === "undefined") throw new Error("엑셀 라이브러리(ExcelJS) 로드 실패");

  const period = (data.cover && data.cover["보고 기간"]) || "";
  const labels = buildWeekLabels(period);
  const teamBlocks = buildTeamBlocks(data.teams || {});
  if (!teamBlocks.length) throw new Error("팀별 주요 실적 데이터가 없습니다.");

  const wb = new ExcelJS.Workbook();
  const sheetName = data.week || "주간보고";
  const ws = wb.addWorksheet(sheetName);

  ws.getColumn(1).width = 9;
  ws.getColumn(2).width = 78;
  ws.getColumn(3).width = 78;

  const hdr = ws.getRow(1);
  hdr.values = ["본부/실", labels.cur, labels.next];
  hdr.height = 32;
  [1, 2, 3].forEach(col => {
    const cell = hdr.getCell(col);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4B8" } };
    cell.font = { name: "맑은 고딕", bold: true, color: { argb: "FF000000" }, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder();
  });

  let rowIdx = 2;
  for (const tb of teamBlocks) {
    const row = ws.getRow(rowIdx);
    row.getCell(2).value = tb.cur;
    row.getCell(3).value = tb.next;
    [2, 3].forEach(col => {
      const cell = row.getCell(col);
      cell.font = { name: "맑은 고딕", size: 10 };
      cell.alignment = { horizontal: "left", vertical: "top", wrapText: true, indent: 1 };
      cell.border = thinBorder();
    });
    const lineCount = Math.max(
      (tb.cur.match(/\n/g) || []).length + 1,
      (tb.next.match(/\n/g) || []).length + 1,
    );
    row.height = Math.max(40, 16 * lineCount);
    rowIdx++;
  }

  const lastRow = rowIdx - 1;
  ws.mergeCells(`A2:A${lastRow}`);
  const aCell = ws.getCell("A2");
  aCell.value = "디지털서비스본부";
  aCell.font = { name: "맑은 고딕", bold: true, size: 12, color: { argb: "FF000000" } };
  aCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  aCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4B8" } };
  for (let r = 2; r <= lastRow; r++) {
    const c = ws.getCell(`A${r}`);
    c.border = thinBorder();
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4B8" } };
  }
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `주간보고_금주차주폼_${sheetName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function thinBorder() {
  const side = { style: "thin", color: { argb: "FF999999" } };
  return { left: side, right: side, top: side, bottom: side };
}

function buildWeekLabels(period) {
  const m = String(period || "").match(/(\d{4})\.(\d{1,2})\.(\d{1,2})\s*~\s*(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if (!m) return { cur: "금주 핵심 업무 및 논의사항", next: "차주 핵심 업무계획" };
  const cs = new Date(+m[1], +m[2] - 1, +m[3]);
  const ce = new Date(+m[4], +m[5] - 1, +m[6]);
  const ns = new Date(cs.getTime() + 7 * 86400000);
  const ne = new Date(ce.getTime() + 7 * 86400000);
  const f = d => `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  return {
    cur:  `금주 핵심 업무 및 논의사항(${f(cs)}~${f(ce)})`,
    next: `차주 핵심 업무계획(${f(ns)}~${f(ne)})`,
  };
}

function buildTeamBlocks(teams) {
  const blocks = [];
  for (const key of TEAM_ORDER) {
    const t = teams[key];
    if (!t || !t.items || !t.items.length) continue;
    const [cur, next] = buildOneTeam(key, t);
    blocks.push({ key, cur, next });
  }
  return blocks;
}

function buildOneTeam(key, t) {
  const name = TEAM_DISPLAY[key] || t.name || key;
  const order = [];
  const map = new Map();
  t.items.forEach(it => {
    const k = it.part || "";
    if (!map.has(k)) { map.set(k, []); order.push(k); }
    map.get(k).push(it);
  });
  const allEmpty = order.length === 1 && order[0] === "";
  const cur  = [`[${name}]`];
  const next = [`[${name}]`];
  if (allEmpty) {
    t.items.forEach((it, i) => {
      cur.push(fmtCur(i + 1, it));
      next.push(fmtNext(i + 1, it));
    });
    return [cur.join("\n"), next.join("\n")];
  }
  order.forEach(partKey => {
    if (partKey) {
      cur.push("", `[${partKey}]`);
      next.push("", `[${partKey}]`);
    }
    map.get(partKey).forEach((it, i) => {
      cur.push(fmtCur(i + 1, it));
      next.push(fmtNext(i + 1, it));
    });
  });
  return [cur.join("\n"), next.join("\n")];
}

function _cleanInline(s) {
  return String(s || "").replace(/⏎/g, " ").replace(/\n/g, " ").trim();
}

function _displayTitle(it) {
  const t = String(it.title || "").trim();
  if (it.isStar && !/^\[★\]/.test(t)) return `[★] ${t}`;
  return t;
}

function fmtCur(idx, it) {
  const title = _displayTitle(it);
  const pct = (typeof it.progress === "number") ? `(${it.progress}%)` : "";
  let head = `${idx}. ${title}`;
  if (pct) head += ` ${pct}`;
  const fact = _cleanInline(it.fact);
  if (fact) head += ` - ${fact}`;
  const lines = [head];
  const gap = _cleanInline(it.gap);
  if (gap)    lines.push(` -이슈 : ${gap}`);
  const action = _cleanInline(it.action);
  if (action) lines.push(` -실행 : ${action}`);
  return lines.join("\n");
}


function fmtNext(idx, it) {
  const title = _displayTitle(it);
  const plan = _cleanInline(it.plan);
  return plan ? `${idx}. ${title} - ${plan}` : `${idx}. ${title}`;
}
