/**
 * 디지털서비스본부 주간 대시보드 — Apps Script Web App v5.0
 *
 * v5.0 변경 (HR 표 양식 적용)
 *  - parseTeamItems: 팀별 주요 실적에 '시작일(J열)' / '종료일(K열)' 컬럼 파싱 추가
 *      · 기존 컬럼 위치(A~I)는 그대로 유지 — 뒤에 2개 컬럼만 덧붙이는 구조라 하위 호환
 *      · 날짜는 Date 값/문자열 모두 허용, 화면에는 MM.DD 형태로 표시 (formatDate)
 *      · 컬럼이 비어 있으면 startDate/endDate 는 "" 로 반환되어 화면에서 '-' 처리
 *  - 시트 입력 컬럼 구조 (6번 팀별 주요 실적 섹션):
 *      A 노출설정 | B 팀/파트 | C 업무 | D 진척율 | E 목표(목적) | F 실적(진행사항)
 *      | G 계획(예정사항) | H 갭(지연사유) | I 액션 | J 시작일 | K 종료일
 *
 * v4.0
 *  - parseMonthlySales: 시트의 표 라벨[...] + 컬럼 헤더 그대로 캡처 (대시보드 동적 반영)
 *
 * v3.5
 *  - onOpen + setupCheckboxes — 메뉴에서 한 번 클릭하면 모든 주차 시트의
 *    6번 섹션 A열(노출설정)이 체크박스로 변환됨
 */

const WEEK_SHEET_PATTERN = /^\d{1,2}M-\d{1,2}W$/i;

/* ============================================================
 * 메뉴 (스프레드시트 열 때 자동 추가)
 * ============================================================ */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('주간보고')
    .addItem('노출설정을 체크박스로', 'setupCheckboxes')
    .addToUi();
}

/** 모든 주차 시트의 노출설정 컬럼을 체크박스로 변환 (한 번만 실행하면 됨) */
function setupCheckboxes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let converted = 0;
  ss.getSheets().forEach(sheet => {
    if (!WEEK_SHEET_PATTERN.test(sheet.getName())) return;
    const data = sheet.getDataRange().getValues();
    // 6번 섹션
    let secRow = -1;
    for (let i = 0; i < data.length; i++) {
      if (/^\s*6\.\s*팀별\s*주요\s*실적/.test(String(data[i][0] || ''))) {
        secRow = i; break;
      }
    }
    if (secRow < 0) return;
    // 노출설정 헤더
    let hdr = -1;
    for (let i = secRow + 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() === '노출설정') { hdr = i; break; }
    }
    if (hdr < 0) return;
    let dataStart = hdr + 1;
    let dataEnd = data.length - 1;
    for (let i = dataStart; i < data.length; i++) {
      if (/^\s*7\.\s*의사결정/.test(String(data[i][0] || ''))) {
        dataEnd = i - 1; break;
      }
    }
    if (dataEnd < dataStart) return;
    // 셀 값을 TRUE/FALSE 로 정규화
    const range = sheet.getRange(dataStart + 1, 1, dataEnd - dataStart + 1, 1);
    const values = range.getValues();
    const newValues = values.map(([v]) => {
      if (v === true) return [true];
      if (v === false) return [false];
      const s = String(v == null ? '' : v).trim().toUpperCase();
      const yes = (s === 'Y' || s === 'YES' || s === 'TRUE' || s === '✓' || s === 'O' || s === '1');
      return [yes];
    });
    range.setValues(newValues);
    // 체크박스 데이터 검증
    range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    converted++;
  });
  SpreadsheetApp.getUi().alert(`체크박스 변환 완료 — ${converted}개 시트`);
}

/* ============================================================
 * 웹 앱 엔드포인트
 * ============================================================ */
function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = (params.action || '').toLowerCase();
  try {
    const weeks = listWeekSheets();
    if (action === 'weeks') return json({ weeks });
    const requestedWeek = params.week || (weeks[0] && weeks[0].key);
    if (!requestedWeek) return json({ error: 'No weekly sheets found (예: 6M-1W)' });
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(requestedWeek);
    if (!sheet) return json({ error: `Sheet '${requestedWeek}' not found`, weeks });
    const data = sheet.getDataRange().getValues();
    const sections = findSections(data);
    return json({
      week: requestedWeek,
      weekLabel: parseWeekLabel(requestedWeek),
      weeks,
      generatedAt: new Date().toISOString(),
      cover:        parseCover(data, sections['보고 정보']),
      messages:     parseMessages(data, sections['핵심 메시지']),
      kpis:         parseKpis(data, sections['본부 핵심']),
      monthlySales: parseMonthlySales(data, sections['월별 매출현황']),
      ceo:          parseCeoDirective(data, sections['CEO 지침 응답']),
      teams:        parseTeamItems(data, sections['팀별 주요 실적']),
      decisions:    parseDecisions(data, sections['의사결정 요청']),
    });
  } catch (err) {
    return json({ error: String(err && err.message || err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function listWeekSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const weeks = [];
  ss.getSheets().forEach(s => {
    const name = s.getName();
    if (WEEK_SHEET_PATTERN.test(name)) {
      const m = name.match(/^(\d{1,2})M-(\d{1,2})W$/i);
      const monthNum = parseInt(m[1], 10);
      const weekNum  = parseInt(m[2], 10);
      weeks.push({
        key: name.toUpperCase(),
        label: parseWeekLabel(name),
        monthNum, weekNum,
        sortKey: monthNum * 100 + weekNum,
      });
    }
  });
  weeks.sort((a, b) => b.sortKey - a.sortKey);
  return weeks.map(w => ({ key: w.key, label: w.label, monthNum: w.monthNum, weekNum: w.weekNum }));
}

function parseWeekLabel(key) {
  const m = String(key).match(/^(\d{1,2})M-(\d{1,2})W$/i);
  if (!m) return key;
  return `${parseInt(m[1], 10)}월 ${parseInt(m[2], 10)}주차`;
}

function findSections(data) {
  // 섹션 번호는 보고서 구성에 따라 달라질 수 있으므로 키워드로 매칭
  const sections = {};
  const patterns = {
    '보고 정보':       /보고\s*정보/,
    '핵심 메시지':     /핵심\s*메시지/,
    '본부 핵심':       /본부\s*핵심/,
    '월별 매출현황':   /월별\s*매출/,
    'CEO 지침 응답':   /CEO\s*지침/,
    '팀별 주요 실적':  /팀별\s*주요\s*실적/,
    '의사결정 요청':   /의사결정/,
  };
  for (let i = 0; i < data.length; i++) {
    const a = String(data[i][0] || '').trim();
    if (!a) continue;
    // 'N. 제목' 형태의 섹션 헤더만
    if (!/^\s*\d+\.\s/.test(a)) continue;
    for (const name in patterns) {
      if (patterns[name].test(a)) sections[name] = i;
    }
  }
  return sections;
}

function isHeaderRow(row) {
  return /^\s*\d+\.\s/.test(String(row[0] || '').trim());
}

function parseCover(data, startIdx) {
  if (startIdx == null) return {};
  const cover = {};
  for (let i = startIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (isHeaderRow(row)) break;
    const label = String(row[0] || '').trim();
    const value = String(row[1] || '').trim();
    if (label && value) cover[label] = value;
  }
  return cover;
}

function parseMessages(data, startIdx) {
  if (startIdx == null) return [];
  const items = [];
  let inTable = false;
  for (let i = startIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (isHeaderRow(row)) break;
    const a = String(row[0] || '').trim();
    if (a === '#') { inTable = true; continue; }
    if (!inTable) continue;
    if (!a) continue;
    if (!/^\d+$/.test(a)) continue;
    const title = String(row[1] || '').trim();
    const body  = String(row[3] || '').trim();
    if (!title && !body) continue;   // 빈 카드는 자동 생략
    items.push({ idx: a, title, body });
  }
  return items;
}

function parseKpis(data, startIdx) {
  if (startIdx == null) return [];
  const items = [];
  let inTable = false;
  for (let i = startIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (isHeaderRow(row)) break;
    const a = String(row[0] || '').trim();
    if (a === '지표명칭') { inTable = true; continue; }
    if (!inTable) continue;
    if (!a) continue;
    const value = row[2];
    if (value === '' || value == null) continue;
    items.push({
      name:   a,
      value:  String(value).trim(),
      unit:   String(row[3] || '').trim(),
      desc:   String(row[4] || '').trim(),
      status: String(row[7] || '').trim(),
    });
  }
  return items;
}

function parseMonthlySales(data, startIdx) {
  if (startIdx == null) return { title: '', tableLabel: '', headers: null, rows: [], note: '', forecastTotal: null };
  const sectionTitle = String(data[startIdx][0] || '').replace(/^\s*\d+\.\s*/, '').trim() || '월별 매출현황';
  let note = '';
  let firstHeaderRow = -1;
  let secondHeaderRow = -1;
  // 시트의 표 라벨 [...] 추출 (예: [5월 매출현황 (단위: 억)])
  let tableLabel = '';
  for (let i = startIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (isHeaderRow(row)) break;
    const a = String(row[0] || '').trim();
    if (a.startsWith('※') && !note) { note = a; continue; }
    // 첫 표 라벨
    if (!tableLabel && a.startsWith('[') && a.endsWith(']') && a.indexOf('월별 마감') === -1) {
      tableLabel = a.slice(1, -1).trim();
    }
    if (a === '팀 / 파트') {
      if (firstHeaderRow < 0) firstHeaderRow = i;
      else if (secondHeaderRow < 0) { secondHeaderRow = i; break; }
    }
  }
  // 시트의 컬럼 헤더 행 그대로 추출 (대시보드 표 헤더로 사용)
  let headers = null;
  if (firstHeaderRow >= 0) {
    const hr = data[firstHeaderRow];
    headers = {
      team:     String(hr[0] || '팀').trim(),
      target:   String(hr[3] || '목표 매출액').trim(),
      shipped:  String(hr[4] || '총출고').trim(),
      returns:  String(hr[5] || '반품').trim(),
      net:      String(hr[6] || '순매출액').trim(),
      progress: String(hr[7] || '진척율').trim(),
    };
  }
  const rows = [];
  const firstEnd = secondHeaderRow >= 0 ? (secondHeaderRow - 1) : data.length;
  if (firstHeaderRow >= 0) {
    for (let i = firstHeaderRow + 1; i < firstEnd; i++) {
      const row = data[i];
      if (isHeaderRow(row)) break;
      const a = String(row[0] || '').trim();
      if (!a) continue;
      if (a.indexOf('월별 마감 예상매출') !== -1) break;
      if (a.startsWith('[') && a.endsWith(']')) continue;
      if (a.startsWith('📌') || a.startsWith('※')) continue;
      const isSubtotal = a.indexOf('합계') !== -1 && a !== '합계';
      const isTotal    = a === '합계';
      rows.push({
        label: a,
        target:   toNumber(row[3]),
        shipped:  toNumber(row[4]),
        returns:  toNumber(row[5]),
        net:      toNumber(row[6]),
        progress: toNumber(row[7]),
        remark:   String(row[8] || '').trim(),
        type: isTotal ? 'total' : (isSubtotal ? 'subtotal' : 'normal'),
      });
    }
  }
  let forecastTotal = null;
  if (secondHeaderRow >= 0) {
    for (let i = secondHeaderRow + 1; i < data.length; i++) {
      const row = data[i];
      if (isHeaderRow(row)) break;
      const a = String(row[0] || '').trim();
      if (a.indexOf('월별 마감 예상매출 합계') !== -1) {
        forecastTotal = {
          label: a,
          target:   toNumber(row[3]),
          shipped:  toNumber(row[4]),
          returns:  toNumber(row[5]),
          net:      toNumber(row[6]),
          progress: toNumber(row[7]),
          remark:   String(row[8] || '').trim(),
        };
        break;
      }
    }
  }
  return { title: sectionTitle, tableLabel, headers, rows, note, forecastTotal };
}

function toNumber(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[,\s%]/g, ''));
  return isNaN(n) ? null : n;
}

/** 날짜 셀을 화면 표시용 문자열로 변환 (Date → "MM.DD", 문자열은 정리해서 그대로) */
function formatDate(v) {
  if (v === '' || v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) {
    const mm = String(v.getMonth() + 1).padStart(2, '0');
    const dd = String(v.getDate()).padStart(2, '0');
    return `${mm}.${dd}`;
  }
  // 문자열 입력: "2026.06.01", "6/1", "06-01" 등 → 가능하면 MM.DD 로 정규화
  const s = String(v).trim();
  if (!s) return '';
  const m = s.match(/(\d{1,2})\s*[.\-\/]\s*(\d{1,2})\s*$/);
  if (m) {
    const mm = String(parseInt(m[1], 10)).padStart(2, '0');
    const dd = String(parseInt(m[2], 10)).padStart(2, '0');
    return `${mm}.${dd}`;
  }
  return s;
}

function parseCeoDirective(data, startIdx) {
  if (startIdx == null) return [];
  const items = [];
  let inTable = false;
  for (let i = startIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (isHeaderRow(row)) break;
    const a = String(row[0] || '').trim();
    if (a === 'CEO 지침') { inTable = true; continue; }
    if (!inTable) continue;
    if (!a) continue;
    const directive = a;
    const gap     = String(row[2] || '').trim();
    const answer  = String(row[4] || '').trim();
    const when    = String(row[7] || '').trim();
    if (!gap && !answer && !when) continue;
    items.push({ directive, gap, answer, when });
  }
  return items;
}

const TEAM_KEYS = {
  '디지털마케팅팀': 'marketing',
  '서비스운영팀':   'operations',
  '서비스기획팀':   'planning',
  'NE Times팀':     'netimes',
  'AX팀':           'ax',
};

function parseTeamItems(data, startIdx) {
  if (startIdx == null) return {};
  const teams = {
    marketing:  { code: 'marketing',  name: '디지털마케팅팀', items: [] },
    operations: { code: 'operations', name: '서비스운영팀',   items: [] },
    planning:   { code: 'planning',   name: '서비스기획팀',   items: [] },
    netimes:    { code: 'netimes',    name: 'NE Times팀',     items: [] },
    ax:         { code: 'ax',         name: 'AX팀',           items: [] },
  };
  let inTable = false;
  for (let i = startIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (isHeaderRow(row)) break;
    const a = String(row[0] || '').trim();
    if (a === '노출설정') { inTable = true; continue; }
    if (!inTable) continue;
    if (!isShown(row[0])) continue;
    const teamLabel = String(row[1] || '').trim();
    if (!teamLabel) continue;
    const tokens = teamLabel.split('/').map(s => s.trim()).filter(Boolean);
    const team   = tokens[0] || '';
    const part   = tokens.slice(1).join(' / ');
    if (!(team in TEAM_KEYS)) continue;
    const title = String(row[2] || '').trim();
    if (!title) continue;
    const isStar = /^\s*\[★\]\s*/.test(title) || /^\s*★\s*/.test(title);
    const titleClean = title.replace(/^\s*\[★\]\s*/, '').replace(/^\s*★\s*/, '').trim();
    teams[TEAM_KEYS[team]].items.push({
      title:     titleClean,
      part:      part,
      isStar:    isStar,
      progress:  parseProgress(row[3]),
      goal:      String(row[4] || '').trim(),
      fact:      String(row[5] || '').trim(),
      plan:      String(row[6] || '').trim(),
      gap:       String(row[7] || '').trim(),
      action:    String(row[8] || '').trim(),
      startDate: formatDate(row[9]),   // J열 — 시작일 (없으면 "")
      endDate:   formatDate(row[10]),  // K열 — 종료일 (없으면 "")
    });
  }
  return teams;
}

function isShown(v) {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === 'string') {
    const s = v.trim().toUpperCase();
    return s === 'Y' || s === 'YES' || s === 'TRUE' || s === '✓' || s === 'O' || s === '1';
  }
  if (typeof v === 'number') return v !== 0;
  return false;
}

function parseProgress(v) {
  if (v === '' || v == null) return 0;
  if (typeof v === 'number') return v <= 1 ? Math.round(v * 100) : Math.round(v);
  const n = parseFloat(String(v).replace(/[%\s]/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
}

function parseDecisions(data, startIdx) {
  if (startIdx == null) return [];
  const items = [];
  let inTable = false;
  for (let i = startIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (isHeaderRow(row)) break;
    const a = String(row[0] || '').trim();
    if (a === '우선순위') { inTable = true; continue; }
    if (!inTable) continue;
    if (!a) continue;
    if (!/^(긴급|중요|참고|P[012])$/i.test(a)) continue;
    const title = String(row[1] || '').trim();
    if (!title) continue;
    items.push({
      priority: a,
      title:    title,
      body:     String(row[3] || '').trim(),
      action:   String(row[6] || '').trim(),
      deadline: String(row[7] || '').trim(),
    });
  }
  const rank = p => (p === '긴급' || p === 'P0' || p === 'PO') ? 0
                   : (p === '중요' || p === 'P1') ? 1 : 2;
  items.sort((x, y) => rank(x.priority) - rank(y.priority));
  return items;
}
