// Painel · wireframe navegável. JavaScript puro, sem dependências, roteamento por hash.
// Todos os números são fictícios (ver data.js). O estado da demonstração fica só neste navegador.
import { I } from './icons.js';
import * as D from './data.js';

// Dados reais: o arquivo carregado em Importar fica só neste navegador.
const REALK = 'painel-real-v1';
let realErr = null;
try { const t = localStorage.getItem(REALK); if (t) D.useReal(JSON.parse(t)); } catch (e) { realErr = e; }
const cardName = (m) => (m === 'Cartão Alfa' ? D.CARDS[0].n : m);

const app = document.getElementById('app');
const main = document.getElementById('main');
const sheetRoot = document.getElementById('sheet-root');
const toastRoot = document.getElementById('toasts');
const KEY = 'painel-wireframe-v1';

// ---------- Formatação ----------
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = (v) => BRL.format(v);
const brl0 = (v) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
const brlK = (v) => (Math.abs(v) >= 10000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(v) >= 100000 ? 0 : 1 }) + ' mil' : brl0(v));
const n1 = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dLong = (d) => cap(d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
const dShort = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const mon = (d) => d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
const monLong = (d) => d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const wd = (d) => cap(d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''));
const rel = (d) => { const k = D.diffDays(d, diaNow()); return k === 0 ? 'hoje' : k === 1 ? 'amanhã' : k === -1 ? 'ontem' : k > 1 ? `em ${k} dias` : `há ${-k} dias`; };
const relDue = (b) => { const k = D.diffDays(b.due, diaNow()); return b.pago ? `pago · vencia ${dShort(b.due)}` : k < 0 ? `venceu ${rel(b.due)}` : `vence ${rel(b.due)} · ${dShort(b.due)}`; };
// O dia do Painel vira às 03:00: quem fecha o dia depois da meia-noite ainda está no mesmo dia.
const diaNow = () => new Date(Date.now() - 3 * 36e5);
const monthKey = (d) => D.iso(d).slice(0, 7);
// Valor digitado: aceita 45,90 · 45.90 · 1.234,56 · R$ 1.234 (ponto com 3 dígitos é milhar).
function parseMoney(raw) {
  let t = String(raw || '').replace(/R\$/i, '').replace(/\s/g, '');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lin = (x, a, b) => 100 * clamp01((x - a) / (b - a));
const pct = (v) => `${Math.round(Math.max(0, Math.min(100, v)))}%`;

// ---------- Estado da demonstração ----------
function defaults() {
  return {
    v: 1, xp: D.XP_START, onboarded: false, onbStep: 0, theme: 'system', demo: 'auto', offline: false, pending: 0,
    day: null, checkin: null, quests: { corpo: false, comb: false, missao: false }, perfect: false, closed: false,
    top3: {}, sets: {}, meals: {}, workoutDone: false, wSel: null, wStart: null, rest: null,
    paid: {}, inbox: D.INBOX.slice(), weight: 86.4, sleep: 7, streak: 12, best: 12, pausa: false,
    notif: { briefing: true, treino: true, dormir: true, contas: true }, card: 0, fat: 'aberta', calSel: null, calOff: 0,
    billFilter: 'todas', importStep: 0, importXp: false, importCat: null, importRule: true, bp: 'resumo', dayType: null, agView: 'hoje', devices: {},
    draftExpense: '', inboxDraft: '', missaoRef: null, corpoKey: null, combByMeals: false, expenses: [], mealXp: {}, inboxXp: 0, prToday: false, best1rm: {}, brasaAt: null, hist: null,
    paidAmt: {}, good: {}, bossSeed: null, bossMonth: null, importAt: null, bossWon: null,
  };
}
const dayAt = (isoStr) => new Date(isoStr + 'T12:00');
// Histórico fictício dos 27 dias anteriores: os últimos 12 com check-in (a Chama de 12 dias) e 3 faltas antes disso.
function seedHist(s) {
  const h = {}, now = diaNow();
  for (let i = 1; i <= 27; i++) h[D.iso(D.addDays(now, -i))] = [13, 19, 24].includes(i) ? 0 : 1;
  s.brasaAt = D.iso(D.addDays(now, -19));
  return h;
}
// Virada do dia: fecha o histórico, atualiza a Chama (com brasa e Modo Pausa) e zera o que é diário.
function rollover(s, today) {
  const prev = dayAt(s.day), gap = D.diffDays(dayAt(today), prev);
  s.hist[s.day] = s.pausa ? 'p' : s.checkin ? 1 : 0;
  if (s.checkin && s.checkin.s >= 7) s.good[s.day] = 1; // noite boa = golpe no chefe, guardado de verdade
  for (let i = 1; i < gap; i++) { const d = D.iso(D.addDays(prev, i)); if (!(d in s.hist)) s.hist[d] = s.pausa ? 'p' : 0; }
  for (let i = 0; i < gap; i++) {
    const d = D.iso(D.addDays(prev, i)), v = s.hist[d];
    if (v === 1) s.streak += 1;
    else if (v === 'p') { /* pausa congela a Chama */ }
    else if (!s.brasaAt || D.diffDays(dayAt(d), dayAt(s.brasaAt)) >= 7) s.brasaAt = d; // 1 falta livre a cada 7 dias
    else s.streak = 0; // a Chama recomeça; XP nunca cai
  }
  s.best = Math.max(s.best, s.streak);
  Object.keys(s.hist).forEach((d) => { if (D.diffDays(dayAt(today), dayAt(d)) > 60) delete s.hist[d]; });
  Object.assign(s, { checkin: null, quests: { corpo: false, comb: false, missao: false }, perfect: false, closed: false, top3: {}, sets: {}, meals: {}, workoutDone: false, wStart: null, rest: null, dayType: null, wSel: null, missaoRef: null, corpoKey: null, combByMeals: false, mealXp: {}, inboxXp: 0, prToday: false, importStep: 0 });
}
// Mantém só valores com o mesmo formato do padrão: um dado salvo corrompido não pode travar o app.
function sane(stored) {
  const d = defaults(), out = { ...d };
  if (!stored || typeof stored !== 'object') return out;
  for (const k of Object.keys(stored)) {
    const v = stored[k], dv = d[k];
    if (!(k in d)) continue;
    if (dv === null) { out[k] = v; continue; }
    if (Array.isArray(dv)) { if (Array.isArray(v)) out[k] = v; continue; }
    if (typeof dv === 'object') { if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = { ...dv, ...v }; continue; }
    if (typeof dv === 'number') { if (Number.isFinite(v)) out[k] = v; continue; }
    if (typeof v === typeof dv) out[k] = v;
  }
  if (out.hist && typeof out.hist !== 'object') out.hist = null;
  return out;
}
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { s = null; }
  s = sane(s);
  if (!s.hist) s.hist = seedHist(s);
  const today = D.iso(diaNow());
  const rolled = s.day !== today;
  if (s.day && rolled) rollover(s, today);
  s.day = today;
  bossMonth(s);
  s.expenses.forEach((x, i) => { if (x && !x.id) x.id = `x${i}${Date.now().toString(36)}`; });
  if (rolled) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* modo privado */ } }
  return s;
}
// Chefe do mês: os golpes antes do primeiro uso são fictícios (fixados uma vez); depois contam as noites boas reais.
function bossMonth(s) {
  const now = diaNow(), m = monthKey(now);
  if (s.bossMonth === m && s.bossSeed != null) return;
  s.bossSeed = s.bossMonth == null ? Math.floor((now.getDate() - 1) * 0.6) : 0;
  if (s.bossMonth != null) s.good = {};
  s.bossMonth = m;
}
let S = load();
// O app instalado no iPhone volta da memória sem recarregar: confere a virada do dia ao voltar.
function checkDay() {
  const t = D.iso(diaNow()); if (S.day === t) return false;
  rollover(S, t); S.day = t; bossMonth(S); save(); setTimeout(checkBoss, 1200); closeSheet(true, false); toast(`${I('sun', 18)} Novo dia. Missões zeradas.`); render(false); return true;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* modo privado: segue sem salvar */ } }
function touch() { if (S.offline || !navigator.onLine) S.pending += 1; save(); }

// ---------- Regras do jogo ----------
const xpToNext = (L) => Math.round((70 * L ** 1.45) / 10) * 10;
function lvl(xp) { if (!Number.isFinite(xp) || xp < 0) xp = 0; let L = 1, acc = 0; for (;;) { const need = xpToNext(L); if (xp < acc + need) return { L, into: xp - acc, need }; acc += need; L++; } }
const titleFor = (L) => (L >= 30 ? 'Lenda' : L >= 25 ? 'Mestre' : L >= 20 ? 'Elite' : L >= 15 ? 'Veterano' : L >= 10 ? 'Combatente' : L >= 5 ? 'Aspirante' : 'Recruta');
const rank = (v) => (v >= 90 ? 'S' : v >= 75 ? 'A' : v >= 60 ? 'B' : v >= 40 ? 'C' : v >= 20 ? 'D' : 'E');
const SLEEP = [['<5', 4.5], ['5', 5], ['6', 6], ['7', 7], ['8', 8], ['9+', 9]];
function energia(h) { return Math.round(0.55 * lin(h, 4, 7.5) + 0.25 * 50 + 0.20 * 55); } // VFC e FC de repouso fictícias
const zoneOf = (e) => (e == null ? 'nd' : e >= 67 ? 'verde' : e >= 34 ? 'amarelo' : 'vermelho');
const ZNAME = { verde: 'Verde', amarelo: 'Amarelo', vermelho: 'Vermelho', nd: 'Sem dados' };

function addXP(n, why) {
  const before = lvl(S.xp).L; S.xp += n; touch();
  if (n > 0) toast(`<span class="xpv">+${n} XP</span> ${esc(why)}`);
  else toast(esc(why));
  const after = lvl(S.xp).L;
  if (after > before) setTimeout(() => toast(`${I('star')} <span>Nível ${after} · ${titleFor(after)}</span>`, 'lvl', 3800), 900);
}

// O que o "Hoje" mostra, respeitando o seletor de estados da demonstração.
function view() {
  const h = new Date().getHours();
  if (S.demo === 'manha') return { checkin: null, quests: { corpo: false, comb: false, missao: false }, evening: false, demo: true };
  if (S.demo === 'feito') return { checkin: S.checkin || { w: S.weight, s: S.sleep }, quests: { corpo: true, comb: false, missao: true }, evening: false, demo: true };
  if (S.demo === 'noite') return { checkin: S.checkin || { w: S.weight, s: S.sleep }, quests: { corpo: true, comb: true, missao: false }, evening: true, demo: true };
  return { checkin: S.checkin, quests: S.quests, evening: h >= 19 || h < 3 };
}
function plan() { return D.planFor(diaNow()); }
function todaySession() { const p = plan(); return { p, key: p.tipo, s: D.SESSION[p.tipo] }; }

// ---------- Dinheiro: uma fonte só para Hoje, Dinheiro, Contas e Cartões ----------
const cardOf = (f) => S.expenses.filter((x) => x.met === 'Cartão Alfa' && (x.fat || 'aberta') === f).reduce((a, x) => a + x.v, 0);
const cardExtra = () => cardOf('aberta');
const cardNext = () => cardOf('proxima');
// Conta paga mostra o valor que foi pago (o mesmo que saiu do saldo), em qualquer tela.
const bills = () => D.bills(S.paid, cardExtra(), diaNow()).map((b) => (b.pago && S.paidAmt[b.id] != null ? { ...b, v: S.paidAmt[b.id] } : b));
function money() {
  const now = diaNow(), payday = D.payday(now), B = bills();
  const pagas = B.filter((b) => S.paid[b.id]).reduce((a, b) => a + (S.paidAmt[b.id] ?? b.v), 0); // sai do saldo o valor pago, não o atual
  const avista = S.expenses.filter((x) => x.met !== 'Cartão Alfa').reduce((a, x) => a + x.v, 0);
  const saldo = D.SAFE.saldo - pagas - avista;
  const due = B.filter((b) => !b.pago && b.id !== 'fatura' && b.met !== 'Cartão' && b.due <= payday);
  const contas = due.reduce((a, b) => a + b.v, 0);
  const fb = B.find((b) => b.id === 'fatura'), faturaAntes = !fb.pago && fb.due <= payday ? fb.v : 0;
  const proxima = D.CARDS[0].faturas.proxima.v + cardNext();
  return { saldo, contas, due, fb, fatura: fb.v, faturaAntes, proxima, payday, dias: D.diffDays(payday, now), livre: saldo - contas - faturaAntes };
}
const livreLabel = (m) => (m.livre < 0 ? `Falta para as contas até ${dShort(m.payday)}` : `Livre para gastar até ${dShort(m.payday)}`);
const livreBig = (m) => `<span class="big${m.livre < 0 ? ' neg' : ''}" style="margin-top:2px">${brl0(Math.abs(m.livre))}</span>`;
function missionBill() { return bills().find((b) => !b.pago && !b.auto && D.diffDays(b.due, diaNow()) <= 1); }
// A Missão do dia é escolhida uma vez e fica fixa: pagar a conta não troca o texto pela próxima.
function missao() { if (!S.missaoRef) { const mb = missionBill(); S.missaoRef = mb ? mb.id : 't1'; save(); } return S.missaoRef; }

// ---------- XP das missões: o mesmo valor venha de onde vier ----------
// Energia vermelha troca o treino por recuperação: marcar no Hoje ou concluir no Treino conta igual na semana.
function corpoDefault() { const { key } = todaySession(); const red = key !== 'REST' && zoneOf(energia(S.checkin ? S.checkin.s : S.sleep)) === 'vermelho'; return red ? 'REC' : key; }
const QXP = () => { const { key } = todaySession(); return { corpo: key === 'REST' ? 15 : key === 'Z2' ? 40 : 50, comb: 20, missao: 20 }; };
const QWHY = { corpo: 'Corpo feito', comb: 'Combustível em dia', missao: 'Missão cumprida' };
function setQuest(k, on, why) {
  if (!!S.quests[k] === on) return;
  S.demo = 'auto'; S.quests[k] = on;
  if (k === 'corpo') S.corpoKey = on ? S.corpoKey || corpoDefault() : null;
  const x = QXP()[k];
  if (on) addXP(x, why || QWHY[k]); else { S.xp = Math.max(0, S.xp - x); touch(); }
  const all = S.quests.corpo && S.quests.comb && S.quests.missao;
  if (on && all && !S.perfect) { S.perfect = true; setTimeout(() => { addXP(20, 'Dia completo'); render(true); }, 700); }
  if (!on && S.perfect) { S.perfect = false; S.xp = Math.max(0, S.xp - 20); save(); }
}

// ---------- Hábito: consistência, Chama, brasa e chefe ----------
function consistency() {
  const now = diaNow(); let ok = 0, n = 0;
  for (let i = 1; i <= 27; i++) { const v = S.hist[D.iso(D.addDays(now, -i))]; if (v === 'p') continue; n++; if (v === 1) ok++; }
  if (S.checkin) { n++; ok++; }
  return n ? Math.round((ok / n) * 100) : 0;
}
const streakNow = () => S.streak + (S.checkin ? 1 : 0);
const brasaFree = () => !S.brasaAt || D.diffDays(diaNow(), dayAt(S.brasaAt)) >= 7;
const brasaYesterday = () => S.brasaAt === D.iso(D.addDays(diaNow(), -1));
function boss() {
  const now = diaNow(), B = D.BOSS, m = monthKey(now);
  const past = (S.bossSeed || 0) + Object.keys(S.good).filter((d) => d.startsWith(m) && d !== S.day).length; // golpes já dados neste mês
  const hoje = S.checkin && S.checkin.s >= 7 ? 1 : 0;
  const hp = Math.max(0, B.start - past - hoje);
  const fim = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { ...B, hp, hoje, faltam: D.diffDays(fim, now), won: S.bossWon === m };
}
// Missões da semana: os dias passados seguem o plano (demonstração) e hoje conta o que foi feito.
// Chefe vencido: +500 XP uma vez no mês, e a Ficha passa a mostrar a vitória.
function checkBoss() { const B = boss(); if (B.hp === 0 && !B.won) { S.bossWon = monthKey(diaNow()); addXP(500, `Chefe vencido · ${D.BOSS.titulo || 'Guardião da Noite'}`); } }
function weekly() {
  const now = diaNow(), p = plan(); let sess = 0, forca = 0, z2 = 0;
  for (let i = 0; i < p.dow; i++) { const q = D.planFor(D.addDays(now, i - p.dow)); if (q.pre || q.tipo === 'REST') continue; sess++; if (q.tipo === 'Z2') z2 += D.SESSION.Z2.min; else forca++; }
  const ck = S.quests.corpo ? S.corpoKey : null;
  if (ck && ck !== 'REST' && ck !== 'REC') { sess++; if (ck === 'Z2') z2 += D.SESSION.Z2.min; else forca++; }
  const val = { plano: sess, cerco: z2, revisao: 0 };
  return D.WEEKLY.map((q) => ({ ...q, p: Math.min(val[q.id], q.of) }));
}

// ---------- Componentes ----------
const bar = (v, c, cls = '') => `<div class="bar ${cls}" role="presentation"><i style="--v:${pct(v)};${c ? `--c:${c}` : ''}"></i></div>`;
function hdr(title, sub = '', actions = '') { return `<header class="hdr"><div class="grow"><h1 tabindex="-1">${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</header>`; }
function backbar(href, label) {
  const prev = navStack[hIdx - 1]?.r || null;
  if (prev && prev !== current()) return `<div class="backbar"><a class="back" href="#/${prev}" data-act="back">${I('chevL')}<span>${TITLES[prev] || label}</span></a></div>`;
  return `<div class="backbar"><a class="back" href="#/${href}">${I('chevL')}<span>${label}</span></a></div>`;
}
function sec(title, link = '') { return `<div class="sec"><h2>${title}</h2>${link}</div>`; }
function netbar() {
  if (!(S.offline || !navigator.onLine)) return '';
  return `<div class="netbar" role="status">${I('wifiOff', 20)}<span>Sem conexão. Tudo o que você registrar fica salvo no aparelho e sincroniza depois${S.pending ? ` (${S.pending} pendente${S.pending > 1 ? 's' : ''})` : ''}.</span></div>`;
}
function syncBtn() {
  const off = S.offline || !navigator.onLine;
  return `<button class="iconbtn" data-act="syncInfo" aria-label="${off ? 'Sem conexão' : 'Sincronizado'}" style="color:${off ? 'var(--warn)' : 'var(--muted)'}">${I(off ? 'wifiOff' : 'cloudCheck')}</button>`;
}
function stChip(st) { return `<span class="chip st-${st}">${D.ST[st]}</span>`; }
function ring(v, zone, size = 64) {
  const r = size / 2 - 5, c = 2 * Math.PI * r, off = c * (1 - (v ?? 0) / 100);
  return `<div class="ring zone-${zone}" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="7"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--zc)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><b>${v ?? '–'}</b></div>`;
}

function lineChart(vals, o = {}) {
  const w = 320, h = o.h || 130, pt = 10, pr = 8, pb = 20, pl = 34;
  const all = vals.concat(o.dots || [], o.goal != null ? [o.goal] : []);
  let mn = Math.min(...all), mx = Math.max(...all); const sp = mx - mn || 1; mn -= sp * 0.12; mx += sp * 0.12;
  const iw = w - pl - pr, ih = h - pt - pb;
  const x = (i, n = vals.length) => pl + (i * iw) / (n - 1);
  const y = (v) => pt + ih - ((v - mn) / (mx - mn)) * ih;
  const path = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const fmt = o.fmt || ((v) => n1(v));
  let g = '';
  [mx - sp * 0.12, mn + sp * 0.12].forEach((v) => { g += `<line x1="${pl}" x2="${w - pr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--line)" stroke-width="1"/><text x="${pl - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${fmt(v)}</text>`; });
  if (o.goal != null) g += `<line x1="${pl}" x2="${w - pr}" y1="${y(o.goal).toFixed(1)}" y2="${y(o.goal).toFixed(1)}" stroke="var(--xp-fill)" stroke-width="1.5" stroke-dasharray="4 4"/><text x="${w - pr}" y="${(y(o.goal) - 5).toFixed(1)}" text-anchor="end">meta ${fmt(o.goal)}</text>`;
  if (o.dots) g += o.dots.map((v, i) => `<circle cx="${x(i, o.dots.length).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2" fill="var(--muted)" opacity=".45"/>`).join('');
  if (o.area) g += `<path d="${path}L${x(vals.length - 1).toFixed(1)},${pt + ih}L${pl},${pt + ih}Z" fill="${o.color || 'var(--primary)'}" opacity=".12"/>`;
  g += `<path d="${path}" fill="none" stroke="${o.color || 'var(--primary)'}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  const last = vals[vals.length - 1];
  g += `<circle cx="${x(vals.length - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="4" fill="${o.color || 'var(--primary)'}" stroke="var(--surface)" stroke-width="2"/>`;
  if (o.labels) g += o.labels.map(([i, t]) => `<text x="${x(i).toFixed(1)}" y="${h - 4}" text-anchor="middle">${t}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(o.label || 'Gráfico')}">${g}</svg>`;
}
function barChart(items, o = {}) {
  const w = 320, h = o.h || 110, pb = 20, pt = 14, n = items.length, gap = 10;
  const mx = Math.max(...items.map((i) => i.v), o.target || 0) || 1;
  const bw = (w - gap * (n - 1)) / n, ih = h - pb - pt;
  let g = '';
  items.forEach((it, i) => {
    const bh = Math.max(2, (it.v / mx) * ih), x = i * (bw + gap), y = pt + ih - bh;
    g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="5" fill="${it.c || 'var(--primary)'}" opacity="${it.dim ? 0.45 : 1}"/>`;
    g += `<text x="${(x + bw / 2).toFixed(1)}" y="${h - 4}" text-anchor="middle">${it.l}</text>`;
    if (o.values) g += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle">${o.values(it.v)}</text>`;
  });
  if (o.target) { const y = pt + ih - (o.target / mx) * ih; g += `<line x1="0" x2="${w}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--xp-fill)" stroke-width="1.5" stroke-dasharray="4 4"/>`; }
  const lbl = (o.label || 'Gráfico de barras') + (o.values ? ': ' + items.map((it) => `${it.l} ${o.values(it.v) || 0}`).join(', ') : '');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(lbl)}">${g}</svg>`;
}

// ---------- Telas ----------
function Hoje() {
  const V = view(), L = lvl(S.xp), now = new Date(), h = now.getHours();
  const greet = h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const { p, key, s } = todaySession();
  const sleepH = V.checkin ? V.checkin.s : S.sleep;
  const E = energia(sleepH), Z = zoneOf(E);
  const sk = streakNow(), cons = consistency(), br = brasaYesterday();
  const chama = S.pausa ? `${I('pause', 20)}<span class="num">Pausa</span>` : `${I('flame', 20)}<span class="num">${sk}</span>${br ? '<small>brasa</small>' : '<small class="sr">dias</small>'}`;
  const hero = `<a class="hero" href="#/ficha" aria-label="Ficha do personagem: ${titleFor(L.L)}, nível ${L.L}, ${L.into} de ${L.need} XP. Consistência de ${cons}% em 28 dias. ${S.pausa ? 'Chama em pausa' : `Chama de ${sk} dias${br ? ', salva pela brasa' : ''}`}. Energia ${E}, zona ${ZNAME[Z].toLowerCase()}.">
      <div class="top"><div class="avatar" aria-hidden="true">Y<span class="lv">${L.L}</span></div>
      <div class="grow"><div class="row-flex"><b>${titleFor(L.L)}</b><span class="muted small num xpn">${L.into}/${L.need} XP</span></div>${bar((L.into / L.need) * 100, null, 'xp')}</div></div>
      <div class="hstats"><span class="hs cons">${I('target', 20)}<span class="num">${cons}%</span><small>28 dias</small></span><span class="hs ${S.pausa ? '' : br ? 'flame brasa' : 'flame'}">${chama}</span><span class="hs zone-${Z}">${I('bolt', 20)}<span class="num">${E}</span><small>${ZNAME[Z].toLowerCase()}</small></span></div>
    </a>`;

  // Missões
  const X = QXP();
  let corpo = { t: s.nome, d: s.resumo + ` · ${s.min} min`, go: '#/saude/treino', goAct: 'openTreino', xp: X.corpo };
  if (p.deload && key !== 'REST') corpo.d += ' · semana leve (Acampamento)';
  if (Z === 'amarelo' && key !== 'REST') corpo.d = `${s.resumo} · Energia amarela: esforço máx. 8 e uma série a menos`;
  if (Z === 'vermelho' && key !== 'REST') corpo = { ...corpo, t: 'Recuperação', d: `Energia vermelha: caminhada leve de 20 a 30 min ou mobilidade, no lugar de ${s.nome.toLowerCase()}. Vale os mesmos ${X.corpo} XP.` };
  const dt = D.DAYTYPES[S.dayType || D.dayTypeFor(key)];
  const comb = { t: `Proteína ${D.PROT.meta} g`, d: `${dt.nome} · ${dt.kcal.toLocaleString('pt-BR')} kcal · conta a partir de ${D.PROT.conta} g`, go: '#/saude/dieta', xp: X.comb };
  const ref = missao(), mbill = ref !== 't1' ? bills().find((b) => b.id === ref) : null;
  const miss = mbill ? { t: `Pagar ${mbill.n.split(' · ')[0].toLowerCase()}`, d: `${brl(mbill.v)} · ${relDue(mbill)}`, goAct: 'bill', goArg: mbill.id, goLabel: 'Ver a conta', xp: X.missao } : { t: 'Concluir o Top 1 do dia', d: D.TOP3[0].t, go: '#/agenda', xp: X.missao };
  const qrow = (k, label, q) => {
    const on = V.quests[k];
    const go = q.go ? `<a class="iconbtn go" href="${q.go}" ${q.goAct ? `data-act="${q.goAct}"` : ''} aria-label="Abrir ${label}">${I('chevR')}</a>` : `<button class="iconbtn go" data-act="${q.goAct}" data-arg="${q.goArg}" aria-label="${q.goLabel || 'Abrir ' + label}">${I('chevR')}</button>`;
    return `<div class="quest ${on ? 'done' : ''}">
      <button class="qcheck" aria-pressed="${on}" data-act="quest" data-arg="${k}" aria-label="${label}: ${esc(q.t)}. ${on ? `Feito, ${q.xp} XP` : `Marcar como feito, vale ${q.xp} XP`}">${I('check', 28)}</button>
      <div class="grow"><div class="k">${label}<span class="qxp num">${on ? '' : '+'}${q.xp} XP</span></div><div class="t">${esc(q.t)}</div><div class="d">${esc(q.d)}</div></div>
      ${go}</div>`;
  };
  const doneN = ['corpo', 'comb', 'missao'].filter((k) => V.quests[k]).length;

  // Check-in
  let ci;
  if (!V.checkin) {
    ci = `<section class="card" aria-labelledby="ci-t">
      <div class="row-flex"><h3 id="ci-t">Check-in da manhã</h3><span class="chip xp right">+20 XP</span></div>
      <p class="lead">${S.pausa ? 'Modo Pausa ligado: o check-in é opcional e nada conta contra você.' : 'Já vem preenchido. Confira e salve.'}</p>
      ${checkinForm()}
      <button class="btn block" style="margin-top:16px" data-act="saveCheckin">Salvar check-in</button>
    </section>`;
  } else {
    ci = `<section class="card"><div class="done-line"><span class="tick">${I('check', 20)}</span><div class="grow"><b>Check-in feito</b><div class="meta muted small num">${n1(V.checkin.w)} kg · ${V.checkin.s >= 9 ? '9 h ou mais' : V.checkin.s < 5 ? 'menos de 5 h' : V.checkin.s + ' h'} de sono · Energia ${E} (${ZNAME[Z].toLowerCase()})</div></div><button class="btn sm ghost" data-act="openCheckin">Editar</button></div></section>`;
  }

  // Noite
  const tomorrow = D.planFor(D.addDays(diaNow(), 1)), ts = D.SESSION[tomorrow.tipo];
  const tdt = D.DAYTYPES[D.dayTypeFor(tomorrow.tipo)];
  const evening = V.evening ? `<section class="card soft" aria-labelledby="ev-t">
      <div class="row-flex">${I('moon')}<h3 id="ev-t" tabindex="-1">Fechar o dia</h3><span class="chip right num">${doneN}/3</span></div>
      <p class="lead" style="color:var(--ink)">${doneN === 3 ? 'Dia completo. ' : 'Marque abaixo o que você fez. '}Hora de dormir: <b>${D.BEDTIME}</b>, lembrete às 21:30.</p>
      <p class="small" style="margin-top:8px">Amanhã: <b>${ts.nome}</b> · ${tdt.nome.toLowerCase()} (${tdt.kcal.toLocaleString('pt-BR')} kcal). O resumo chega às 07:00.</p>
      ${S.closed ? `<p class="small b" style="margin-top:10px;color:var(--primary)">Dia fechado. Bom descanso.</p>` : `<button class="btn block" style="margin-top:12px" data-act="closeDay">Fechar o dia</button>`}
    </section>` : '';

  // Agenda
  const ev = D.events();
  const slots = [
    ...ev.map((e) => ({ h: e.h, t: e.t, c: 'var(--info)' })),
    { h: '18:30', t: corpo.t, c: 'var(--a-for)' },
    ...(mbill && !mbill.pago ? [{ h: 'Hoje', t: miss.t, c: 'var(--danger)' }] : []),
    { h: D.BEDTIME, t: 'Hora de dormir', c: 'var(--a-rec)' },
  ];
  const nowHM = `${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const nextIdx = slots.findIndex((x) => /\d/.test(x.h) && x.h >= nowHM);
  const agenda = `<section class="hscroll" tabindex="0" aria-label="Agenda de hoje, role para o lado">${slots.map((x, i) => `<div class="slot ${i === nextIdx ? 'now' : ''}"><div class="h"><span class="k" style="--c:${x.c}"></span>${x.h}${i === nextIdx ? '<span class="sr"> (próximo)</span>' : ''}</div><div class="t">${esc(x.t)}</div></div>`).join('')}</section>`;

  // Dinheiro
  const M = money();
  const up = bills().filter((b) => !b.pago && b.met !== 'Cartão' && D.diffDays(b.due, diaNow()) <= 7).slice(0, 3);
  const moneyCard = `<div class="card">
      <a class="cardhead" href="#/dinheiro"><span class="row-flex"><span class="muted small">${livreLabel(M)} (em ${M.dias} dias)</span>${I('chevR', 20, 'class="ic right muted"')}</span>
      ${livreBig(M)}</a>
      <div class="kpis"><div class="kpi"><span>Em conta</span><b>${brlK(M.saldo)}</b></div>${fatKpi(M)}<div class="kpi"><span>Reserva</span><b>${n1(D.SAVINGS.reservaMeses)} meses</b></div></div>
    </div>
    <div class="card tight">${up.map((b) => `<button class="row" data-act="bill" data-arg="${b.id}"><span class="badge-ic">${I('receipt', 20)}</span><div class="grow"><div class="ttl ellip">${esc(b.n)}</div><div class="meta">${relDue(b)}</div></div><div class="amt"><div class="num">${brl(b.v)}</div>${stChip(b.st)}</div></button>`).join('')}</div>`;

  // Semana
  const week = `<div class="card">
      <div class="row-flex wrap"><span class="chip p">${I('target')} Ato ${p.act.n} · ${p.act.nome}</span><span class="chip num">semana ${Math.max(1, p.week)} de 24</span></div>
      ${weekly().map((q) => `<div style="margin-top:14px"><div class="row-flex"><span class="b small grow">${q.t}</span><span class="small muted num">${q.p}/${q.of}${q.un ? ' ' + q.un : ''} · ${q.xp} XP</span></div>${bar((q.p / q.of) * 100)}</div>`).join('')}
    </div>`;

  const insight = `<div class="card"><div class="row-flex">${I('sparkle', 20, 'class="ic" style="color:var(--xp)"')}<b>Achado da semana</b></div><p class="small" style="margin-top:6px">Nas noites com 7 h ou mais de sono, seus treinos tiveram 9% mais volume. Liberado no nível 6.</p></div>`;

  return {
    title: 'Hoje',
    html: `${hdr(`${greet}, ${D.PROFILE.nome}`, dLong(diaNow()), `${syncBtn()}<button class="iconbtn" data-act="map" aria-label="Mapa do wireframe">${I('map')}</button>`)}
      ${netbar()}${hero}${evening}${ci}
      <section class="card" aria-labelledby="q-t"><div class="row-flex"><h3 id="q-t">Missões de hoje</h3><span class="chip right num ${doneN === 3 ? 'p' : ''}">${doneN}/3${doneN === 3 ? ' · dia completo' : ''}</span></div>
        ${qrow('corpo', 'Corpo', corpo)}${qrow('comb', 'Combustível', comb)}${qrow('missao', 'Missão', miss)}
        ${doneN < 3 ? `<p class="small muted" style="margin-top:4px">As três juntas dão +20 XP de bônus.${S.pausa ? ' Em Modo Pausa nada disso conta contra você.' : ''}</p>` : ''}
      </section>
      ${sec('Agenda', '<a href="#/agenda">Ver tudo</a>')}${agenda}
      ${sec('Dinheiro', '<a href="#/dinheiro/contas">Contas</a>')}${moneyCard}
      ${sec('Semana')}${week}${insight}`,
  };
}

function checkinForm() {
  const w = S.checkin ? S.checkin.w : S.weight, s = S.checkin ? S.checkin.s : S.sleep;
  return `<div class="ci-label">Peso <span class="src">último: ${n1(S.weight)} kg</span></div>
    <div class="stepper"><button type="button" data-act="wstep" data-arg="-0.1" aria-label="Diminuir 100 gramas">${I('minus')}</button>
      <input id="ci-w" type="text" inputmode="decimal" value="${n1(w)}" aria-label="Peso em quilos" data-in="weight"><span class="u">kg</span>
      <button type="button" data-act="wstep" data-arg="0.1" aria-label="Aumentar 100 gramas">${I('plus')}</button></div>
    <div class="ci-label" id="sl-l">Sono, em horas <span class="src">Apple Health: 7 h 10 min</span></div>
    <div class="picks six" role="radiogroup" aria-labelledby="sl-l">${SLEEP.map(([l, v]) => `<button type="button" class="pick" role="radio" aria-checked="${s === v}" tabindex="${s === v ? 0 : -1}" data-act="sleep" data-arg="${v}" aria-label="${l === '<5' ? 'menos de 5' : l === '9+' ? '9 ou mais' : l} horas">${l}</button>`).join('')}</div>`;
}

function Saude() {
  const { p, key, s } = todaySession();
  const ws = D.weightSeries(), trend = ws.map((x) => x.t), raw = ws.map((x) => x.w);
  const last = ws[ws.length - 1], first14 = ws[ws.length - 15];
  const dlt = last.t - first14.t;
  const sl = D.sleepSeries();
  const E = energia(S.checkin ? S.checkin.s : S.sleep), Z = zoneOf(E);
  const advice = { verde: 'Pode fazer o treino planejado.', amarelo: 'Treine com esforço máximo 8 e uma série a menos.', vermelho: 'Hoje vale recuperação: caminhada leve ou mobilidade.', nd: '' }[Z];
  const nextGym = (() => { for (let i = 0; i < 7; i++) { const q = D.planFor(D.addDays(diaNow(), i)); if (['A', 'B', 'C'].includes(q.tipo)) return { i, q }; } return null; })();
  const ex = D.EXAMS.itens, off = ex.filter((e) => e.v < e.lo || e.v > e.hi).length;
  return {
    title: 'Saúde',
    html: `${hdr('Saúde', `Ato ${p.act.n} · ${p.act.nome} · semana ${Math.max(1, p.week)} de 24`)}${netbar()}
      <button class="card cardlink" style="width:calc(100% - 32px);text-align:left" data-act="energia">
        <span class="sr">Energia ${E} de 100.</span>${ring(E, Z)}<div class="grow"><div class="row-flex"><b>Energia</b><span class="zpill zone-${Z} small">${ZNAME[Z]}</span></div><p class="small muted">Sono, variabilidade cardíaca e frequência de repouso.</p><p class="small" style="margin-top:2px">${advice}</p><span class="sr">Ver como é calculada.</span></div>${I('info', 20, 'class="ic chev"')}
      </button>
      <a class="card cardlink" href="#/saude/treino" data-act="openTreino"><span class="badge-ic p">${I(key === 'Z2' ? 'pulse' : key === 'REST' ? 'walk' : 'dumbbell')}</span><div class="grow"><div class="muted small">Hoje</div><b>${Z === 'vermelho' && key !== 'REST' ? 'Recuperação' : s.nome}</b><div class="small muted">${Z === 'vermelho' && key !== 'REST' ? 'Energia vermelha: caminhada leve ou mobilidade' : s.resumo}</div></div>${I('chevR', 24, 'class="ic chev"')}</a>
      ${nextGym && nextGym.i > 0 ? `<a class="card cardlink" href="#/saude/treino" data-act="openTreino" data-arg="${nextGym.q.tipo}"><span class="badge-ic">${I('dumbbell')}</span><div class="grow"><div class="muted small">Próximo treino de força · ${nextGym.i === 1 ? 'amanhã' : wd(D.addDays(diaNow(), nextGym.i))}</div><b>${D.SESSION[nextGym.q.tipo].nome}</b></div>${I('chevR', 24, 'class="ic chev"')}</a>` : ''}
      ${sec('Peso', '<a href="#/saude/exames">Medidas</a>')}
      <div class="card"><div class="row-flex"><div><div class="mid">${n1(last.t)} kg</div><div class="small muted">tendência · ${dlt <= 0 ? '−' : '+'}${n1(Math.abs(dlt))} kg em 14 dias</div></div><div class="right small muted">meta<br><b class="num" style="color:var(--ink)">${n1(D.PROFILE.metaPeso)} kg</b></div></div>
        ${lineChart(trend, { dots: raw, goal: D.PROFILE.metaPeso, label: `Peso: tendência de ${n1(trend[0])} para ${n1(last.t)} kg em 6 semanas`, labels: [[0, '6 sem'], [21, '3 sem'], [41, 'hoje']] })}
        <div class="legend"><span><i style="--c:var(--primary)"></i>tendência</span><span><i style="--c:var(--muted);height:6px;width:6px;border-radius:50%"></i>pesagens</span><span><i style="--c:var(--xp-fill)"></i>meta</span></div>
        <p class="small muted" style="margin-top:8px">A variação de um dia para o outro é água. O app mostra só a tendência.</p></div>
      ${sec('Sono · 7 dias')}
      <div class="card"><div class="row-flex"><div class="mid">${n1(sl.reduce((a, b) => a + b.h, 0) / 7)} h</div><span class="small muted">média · alvo 7 h</span></div>
        ${barChart(sl.map((x) => ({ v: x.h, l: wd(x.d).slice(0, 3), c: 'var(--a-rec)', dim: x.h < 7 })), { target: 7, label: 'Horas de sono nos últimos 7 dias', values: (v) => n1(v) })}</div>
      ${sec('Plano')}
      <a class="card cardlink" href="#/saude/campanha"><span class="badge-ic">${I('target')}</span><div class="grow"><b>Campanha de 24 semanas</b><div class="small muted">4 atos de 6 semanas, do condicionamento ao tatame</div>${bar((Math.max(1, p.week) / 24) * 100)}</div>${I('chevR', 24, 'class="ic chev"')}</a>
      <a class="card cardlink" href="#/saude/dieta"><span class="badge-ic">${I('utensils')}</span><div class="grow"><b>Dieta de hoje</b><div class="small muted">${D.DAYTYPES[S.dayType || D.dayTypeFor(key)].nome} · ${D.DAYTYPES[S.dayType || D.dayTypeFor(key)].kcal.toLocaleString('pt-BR')} kcal · proteína ${D.PROT.meta} g</div></div>${I('chevR', 24, 'class="ic chev"')}</a>
      <a class="card cardlink" href="#/saude/exames"><span class="badge-ic">${I('flask')}</span><div class="grow"><b>Exames e medidas</b><div class="small muted">Último painel: ${D.EXAMS.quando} · ${off} fora da referência</div></div>${I('chevR', 24, 'class="ic chev"')}</a>
      <p class="small muted" style="margin:14px 20px">${I('health', 16, 'style="display:inline;vertical-align:-3px"')} Apple Health sincronizado há 2 h pelo Atalho “PainelSync”.</p>`,
  };
}

function Treino() {
  const tp = todaySession();
  const today = tp.key;
  const sel = S.wSel || today;
  const p = tp.p;
  const Z = zoneOf(energia(S.checkin ? S.checkin.s : S.sleep));
  const opts = ['A', 'B', 'C', 'Z2'];
  const seg = `<div class="seg" role="group" aria-label="Escolher sessão" style="margin:4px 16px 0">${opts.map((k) => `<button aria-pressed="${sel === k}" data-act="wsel" data-arg="${k}">${k === 'Z2' ? 'Cardio' : 'Treino ' + k}</button>`).join('')}</div>`;
  const isToday = sel === today;
  const xpHoje = QXP().corpo;
  const xpNote = S.quests.corpo ? 'O XP de treino de hoje já foi ganho.' : isToday ? `Vale +${xpHoje} XP.` : `Reposição: vale os +${xpHoje} XP do plano de hoje, nunca mais que isso.`;
  const elapsed = S.wStart ? Math.floor((Date.now() - S.wStart) / 1000) : 0;
  const head = `${backbar('saude', 'Saúde')}${hdr(sel === 'REST' ? 'Descanso ativo' : D.SESSION[sel].nome, `${isToday ? 'Hoje' : 'Prévia'} · Ato ${p.act.n} · ${p.act.foco}${p.deload ? ' · semana leve' : ''}`, `<span class="syncchip num" aria-label="Tempo de treino">${I('timer', 16)}<span id="wT">${fmtT(elapsed)}</span></span>`)}${seg}`;
  if (sel === 'REST') {
    return { title: 'Descanso ativo', chrome: 'focus', html: `${head}<div class="card"><h3>Hoje é descanso</h3><p class="lead">Descanso faz parte do plano e conta para a Chama. Se quiser, 15 min de mobilidade ou 7 mil passos valem +${QXP().corpo} XP.</p><div class="btnrow"><button class="btn" data-act="finishWorkout" data-arg="REST">Fiz mobilidade</button><a class="btn ghost" href="#/hoje" data-act="voltar" data-arg="hoje">Voltar</a></div></div>` };
  }
  // Energia vermelha no dia do treino: a missão Corpo vira recuperação, com o mesmo XP.
  const recovery = isToday && Z === 'vermelho' ? `<div class="card soft" style="margin-top:12px"><div class="row-flex">${I('bolt', 20)}<b>Energia vermelha: hoje vale recuperação</b></div>
      <p class="small" style="margin-top:4px">Caminhada leve de 20 a 30 min ou 15 min de mobilidade, no lugar da sessão. Vale os mesmos +${xpHoje} XP e a sessão volta no próximo dia verde.</p>
      <div class="btnrow"><button class="btn" data-act="finishWorkout" data-arg="REC">${I('walk', 20)} Fiz a recuperação</button></div><p class="xs muted" style="margin-top:8px">Se mesmo assim quiser treinar, a sessão está abaixo.</p></div>` : '';
  if (sel === 'Z2') {
    const W = weekly().find((q) => q.id === 'cerco');
    return { title: 'Cardio zona 2', chrome: 'focus', html: `${head}${recovery}
      <div class="card"><div class="row-flex"><span class="badge-ic p">${I('pulse')}</span><div><b>${D.SESSION.Z2.min} min na zona 2</b><div class="small muted">125–140 bpm · esteira inclinada, bike ou caminhada rápida</div></div></div>
        <div class="kpis"><div class="kpi"><span>Semana (min)</span><b class="num">${W.p}/${W.of}</b></div><div class="kpi"><span>28 dias (min)</span><b class="num">185</b></div><div class="kpi"><span>Vale hoje</span><b class="num">${S.quests.corpo ? 'feito' : `${xpHoje} XP`}</b></div></div>
        <p class="small muted" style="margin-top:12px">O Apple Watch grava o treino e o Atalho manda para o Painel. Os minutos na zona entram sozinhos, sem digitar nada. ${xpNote}</p></div>
      <div class="card"><h3>Sem relógio hoje?</h3><p class="lead">Use o cronômetro e marque como feito no final.</p><div class="btnrow"><button class="btn ghost" data-act="startWorkout">${I('timer', 20)} Iniciar cronômetro</button></div></div>
      <div class="restbar"><div class="grow"><div class="xs" style="opacity:.75">Cardio</div><div class="t">${D.SESSION.Z2.min} min</div></div><button class="btn go" data-act="finishWorkout" data-arg="Z2">Concluir</button></div>` };
  }
  const list = D.WORKOUTS[sel];
  const cut = Z === 'amarelo' || Z === 'vermelho'; // uma série a menos por exercício
  const cards = list.map((ex) => {
    const sg = D.suggestion(ex);
    const reps = cut && ex.reps.length > 1 ? ex.reps.slice(0, -1) : ex.reps;
    const rows = reps.map((r, i) => {
      const k = `${sel}-${ex.id}-${i}`, st = S.sets[k] || {};
      const kg = st.kg ?? sg.kg, reps = st.reps ?? (sg.reps || r);
      return `<tr><td>${i + 1}</td><td><input type="text" inputmode="decimal" value="${D.fmtKg(kg)}" aria-label="${esc(ex.nome)}, série ${i + 1}, carga em kg" data-in="setkg" data-arg="${k}"></td><td><input type="text" inputmode="numeric" value="${reps}" aria-label="${esc(ex.nome)}, série ${i + 1}, repetições" data-in="setreps" data-arg="${k}"></td><td><button class="ok" aria-pressed="${!!st.ok}" data-act="set" data-arg="${k}" data-rest="${ex.rest}" aria-label="Concluir série ${i + 1} de ${esc(ex.nome)}">${I('check', 24)}</button></td></tr>`;
    }).join('');
    return `<section class="ex" aria-label="${esc(ex.nome)}"><div class="row-flex"><h3 class="grow">${esc(ex.nome)}</h3><span class="chip num">${ex.alvo}</span></div>
      <div class="tip">${I('refresh', 16)}<span>Última vez: <b class="num">${D.fmtKg(ex.kg)} kg × ${ex.reps.join(', ')}</b>. ${sg.txt}. Reserva de ${ex.rir} repetições · descanso ${ex.rest >= 120 ? ex.rest / 60 + ' min' : ex.rest + ' s'}.</span></div>
      <table class="sets"><thead><tr><th>Série</th><th>kg</th><th>Reps</th><th><span class="sr">Feito</span></th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join('');
  const total = list.reduce((a, e) => a + (cut && e.reps.length > 1 ? e.reps.length - 1 : e.reps.length), 0);
  const done = setsDone(sel, cut);
  const rest = S.rest && S.rest.end > Date.now();
  const banner = { verde: 'Sessão completa. As cargas sugeridas seguem a progressão dupla.', amarelo: 'Esforço máximo 8 e uma série a menos por exercício (já tirada abaixo).', vermelho: 'Se for treinar, esforço máximo 7 e uma série a menos por exercício.', nd: '' }[Z];
  return {
    title: D.SESSION[sel].nome, chrome: 'focus',
    html: `${head}${recovery}
      <div class="card soft" style="margin-top:12px"><div class="row-flex">${I('bolt', 20)}<span class="small"><b>Energia ${ZNAME[Z].toLowerCase()}.</b> ${banner} ${xpNote}</span></div></div>
      ${cards}
      <div class="restbar">${rest ? `<div class="grow"><div class="xs" style="opacity:.75">Descanso</div><div class="t" id="restT" role="timer" aria-label="Descanso restante">${fmtT(Math.ceil((S.rest.end - Date.now()) / 1000))}</div></div><button class="btn sm" data-act="skipRest">Pular</button>` : `<div class="grow"><div class="xs" style="opacity:.75">Séries</div><div class="t num">${done}/${total}</div></div><button class="btn go" data-act="finishWorkout" data-arg="${sel}">Concluir treino</button>`}</div>`,
  };
}
function setsDone(sel, cut) {
  return D.WORKOUTS[sel].reduce((a, ex) => { const n = cut && ex.reps.length > 1 ? ex.reps.length - 1 : ex.reps.length; let c = 0; for (let i = 0; i < n; i++) if (S.sets[`${sel}-${ex.id}-${i}`]?.ok) c++; return a + c; }, 0);
}
const e1rm = (kg, reps) => kg * (1 + reps / 30); // fórmula de Epley
const best1rm = (ex) => S.best1rm[ex.id] ?? e1rm(ex.kg, Math.max(...ex.reps));
const fmtT = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;

function Campanha() {
  const p = plan(), wk = Math.max(1, p.week);
  const ws = D.weightSeries(), wt = ws[ws.length - 1], w0 = ws[0].t;
  const strip = D.DOW.map((d, i) => {
    const date = D.addDays(diaNow(), i - p.dow), q = D.planFor(date);
    const lbl = { A: 'A', B: 'B', C: 'C', Z2: 'Z2', REST: '—' }[q.tipo];
    return `<div class="${i === p.dow ? 'today' : i < p.dow ? 'done' : ''}"><b>${d}</b>${lbl}</div>`;
  }).join('');
  const acts = D.ACTS.map((a, i) => {
    const from = i * 6 + 1, to = from + 5, on = wk >= from && wk <= to, past = wk > to;
    const weeks = Array.from({ length: 6 }, (_, j) => { const w = from + j; return `<i class="${w < wk ? 'done' : w === wk ? 'now' : w % 6 === 0 ? 'deload' : ''}" title="Semana ${w}"></i>`; }).join('');
    return `<div class="act ${on ? 'on' : past ? 'past' : ''}"><span class="n">${a.n}</span><div><div class="row-flex"><b>${a.nome}</b><span class="small muted">· ${a.foco}</span><span class="small muted right num">sem ${from}–${to}</span></div><div class="weeks" aria-hidden="true">${weeks}</div><div class="xs muted" style="margin-top:4px">Semana ${to}: leve (Acampamento) e Teste do Ato</div></div></div>`;
  }).join('');
  return {
    title: 'Campanha',
    html: `${backbar('saude', 'Saúde')}${hdr('Campanha de 24 semanas', `Semana ${wk} de 24 · Ato ${p.act.n}: ${p.act.nome}`)}
      <div class="card"><h3>Esta semana</h3><p class="lead">Força seg, qua e sex. Cardio ter e sáb. Descanso qui e dom.</p><div class="weekstrip">${strip}</div></div>
      <div class="card"><h3>Atos</h3><div class="acts">${acts}</div>
        <div class="legend" style="margin-top:10px"><span><i style="--c:var(--primary)"></i>feita</span><span><i style="--c:var(--xp-fill)"></i>atual</span><span><i style="--c:var(--line)"></i>semana leve</span></div></div>
      <div class="card"><div class="row-flex">${I('lock', 20)}<h3>Pronto para o tatame</h3></div><p class="lead">O BJJ volta quando o condicionamento chegar lá. Critérios fictícios para a demonstração:</p>
        <div style="margin-top:12px"><div class="row-flex small"><span class="grow">Zona 2 ≥ 150 min/semana (meta do Ato IV) por 4 semanas</span><span class="muted num">0/4</span></div>${bar(0, 'var(--a-vig)')}</div>
        <div style="margin-top:12px"><div class="row-flex small"><span class="grow">Energia verde em 70% dos dias</span><span class="muted num">64%</span></div>${bar(91, 'var(--a-rec)')}</div>
        <div style="margin-top:12px"><div class="row-flex small"><span class="grow">Peso (tendência) ≤ 84 kg</span><span class="muted num">${n1(wt.t)} kg</span></div>${bar(((w0 - wt.t) / (w0 - 84)) * 100, 'var(--a-nut)')}</div>
        <p class="xs muted" style="margin-top:10px">O plano do Ato I pede ${D.Z2_WEEK_MIN} min de zona 2 por semana; a meta sobe a cada ato.</p></div>`,
  };
}

function Dieta() {
  const { key } = todaySession();
  const tkey = S.dayType || D.dayTypeFor(key), T = D.DAYTYPES[tkey], f = T.kcal / 2400;
  const meals = D.MEALS.map((m) => ({ ...m, kcal: Math.round((m.kcal * f) / 10) * 10 }));
  const got = meals.filter((m) => S.meals[m.id]);
  const p = got.reduce((a, m) => a + m.p, 0), k = got.reduce((a, m) => a + m.kcal, 0);
  const falta = D.PROT.meta - p;
  const resto = meals.filter((m) => !S.meals[m.id]).reduce((a, m) => a + m.p, 0);
  return {
    title: 'Dieta',
    html: `${backbar('saude', 'Saúde')}${hdr('Dieta de hoje', `${T.nome} · ${T.quando}`)}
      <div class="seg" role="group" aria-label="Tipo de dia" style="margin:4px 16px 0">${Object.entries(D.DAYTYPES).map(([id, t]) => `<button aria-pressed="${tkey === id}" data-act="daytype" data-arg="${id}">${t.nome.replace('Dia ', '')}</button>`).join('')}</div>
      <div class="card"><div class="grid3">
        <div><div class="small muted">Proteína</div><div class="mid">${p}<span class="small muted"> / ${D.PROT.meta} g</span></div>${bar((p / D.PROT.meta) * 100, 'var(--a-nut)')}</div>
        <div><div class="small muted">Calorias</div><div class="mid">${k.toLocaleString('pt-BR')}</div><div class="small muted">de ${T.kcal.toLocaleString('pt-BR')}</div></div>
        <div><div class="small muted">Combustível</div><div class="mid">${p >= D.PROT.conta ? 'ok' : `${Math.max(0, D.PROT.conta - p)} g`}</div><div class="small muted">${p >= D.PROT.conta ? 'missão feita' : 'para a missão contar'}</div></div>
      </div></div>
      ${sec('Refeições do plano')}
      <div class="card tight">${meals.map((m) => `<div class="quest ${S.meals[m.id] ? 'done' : ''}"><button class="qcheck" aria-pressed="${!!S.meals[m.id]}" data-act="meal" data-arg="${m.id}" aria-label="${m.nome}: ${S.meals[m.id] ? 'comida' : 'marcar como comida'}">${I('check', 28)}</button><div class="grow"><div class="k num">${m.hora}</div><div class="t">${m.nome}</div><div class="d">${m.itens} · <span class="num">${m.kcal} kcal · ${m.p} g</span></div></div></div>`).join('')}</div>
      ${falta > 0 ? `<div class="card soft"><div class="row-flex">${I('sparkle', 20)}<b>Sugestão</b></div><p class="small" style="margin-top:4px">Faltam ${falta} g de proteína. ${p + resto >= D.PROT.conta ? `As refeições que faltam no plano somam ${resto} g: seguindo o plano a missão conta${p + resto < D.PROT.meta ? `, e um iogurte com whey fecha os ${D.PROT.meta - p - resto} g até a meta` : ''}.` : `Mesmo seguindo o plano faltam ${D.PROT.conta - p - resto} g para a missão contar: um iogurte com whey resolve.`}</p></div>` : ''}
      <div class="btnrow" style="margin:6px 16px 0"><button class="btn ghost" data-act="toastInfo" data-arg="No app real: busca na Tabela TACO (offline) e no Open Food Facts.">${I('plus', 20)} Comi outra coisa</button></div>
      <p class="small muted" style="margin:14px 20px">Comer abaixo da faixa não dá XP. A meta é acertar o alvo, não comer menos.</p>`,
  };
}

function Exames() {
  const it = D.EXAMS.itens;
  return {
    title: 'Exames e medidas',
    html: `${backbar('saude', 'Saúde')}${hdr('Exames e medidas', 'Mostra tendências e a referência do laboratório. Não é diagnóstico.')}
      ${sec('Medidas', '<button class="link" data-act="toastInfo" data-arg="Missão mensal de medidas: +20 XP. No app real abre um formulário rápido.">Medir agora</button>')}
      <div class="card"><div class="grid2" style="margin:0">${D.MEASURES.map((m) => `<div class="kpi"><span>${m.n}</span><b>${n1(m.v)} ${m.u}</b><small>${m.v <= m.prev ? '−' : '+'}${n1(Math.abs(m.v - m.prev))} no mês</small></div>`).join('')}</div>
        <p class="small muted" style="margin-top:10px">Cintura ÷ altura: <b class="num" style="color:var(--ink)">${(D.MEASURES[0].v / D.PROFILE.alturaCm).toFixed(2).replace('.', ',')}</b> (alvo abaixo de 0,50).</p></div>
      ${sec(`Painel de ${D.EXAMS.quando}`, '<button class="link" data-act="toastInfo" data-arg="Abre o PDF original na pasta Painel/Saude/Exames do Google Drive.">PDF</button>')}
      <div class="card tight">${it.map((e) => {
        const lo = Math.min(e.lo, e.v) * 0.8, hi = Math.max(e.hi, e.v) * 1.15, sp = hi - lo;
        const fl = e.v > e.hi ? '<span class="flag hi">acima</span>' : e.v < e.lo ? '<span class="flag lo">abaixo</span>' : '<span class="flag">na faixa</span>';
        return `<div class="row" style="display:block;padding:12px 0"><div class="row-flex"><span class="ttl grow">${e.n}</span><b class="num">${n1(e.v).replace(',0', '')} ${e.u}</b>${fl}</div>
          <div class="ref" aria-hidden="true"><span class="ok" style="left:${pct(((e.lo - lo) / sp) * 100)};right:${pct(100 - ((e.hi - lo) / sp) * 100)}"></span><span class="mk" style="left:${pct(((e.v - lo) / sp) * 100)}"></span></div>
          <div class="xs muted" style="margin-top:4px">Referência do laboratório: ${e.lo ? `${n1(e.lo).replace(',0', '')} a ` : 'até '}${n1(e.hi).replace(',0', '')} ${e.u}</div></div>`;
      }).join('')}</div>
      ${sec('Histórico')}
      <div class="card tight">${D.EXAMS.historico.map((h) => `<button class="row" data-act="toastInfo" data-arg="Painel de ${h}: comparação lado a lado com o atual."><span class="badge-ic">${I('file', 20)}</span><span class="ttl grow">Painel de ${h}</span>${I('chevR', 20, 'class="ic muted"')}</button>`).join('')}</div>
      <p class="small muted" style="margin:14px 20px">Exame novo: envie o PDF para a pasta do Drive. Você digita os 12 marcadores principais em 1 minuto (+30 XP). A leitura automática do PDF vem depois.</p>`,
  };
}

// ---------- Dados reais ----------
const realDate = () => new Date(D.REAL.geradoEm + 'T12:00');
let realOk = null;
const justLoaded = () => { if (realOk === null) { try { realOk = !!sessionStorage.getItem('painel-real-ok'); sessionStorage.removeItem('painel-real-ok'); } catch { realOk = false; } } return realOk; };
const realLine = () => (D.REAL ? `<p class="small muted" style="margin:0 20px 6px">${I('lock', 14, 'style="display:inline;vertical-align:-2px"')} Seus dados de ${dShort(realDate())}, só neste aparelho. <a href="#/dinheiro/importar">Atualizar</a></p>` : '');
function plMes(pl) {
  if (!D.REAL) return '+1,2% no mês';
  const ser = D.netWorthSeries(); if (!ser.length) return '';
  const base = ser[ser.length - 1], dv = pl - base.v;
  return `${dv >= 0 ? '+' : '−'}${brlK(Math.abs(dv))} desde ${mon(base.d)}`;
}
function loadRealFile(f) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const R = JSON.parse(String(r.result));
      D.useReal(R); // valida antes de gravar
      localStorage.setItem(REALK, JSON.stringify(R));
      try { sessionStorage.setItem('painel-real-ok', '1'); } catch { /* sem aviso */ }
      // Os marcadores da demonstração (contas pagas, gastos à mão) não valem para os dados reais.
      S.paid = {}; S.paidAmt = {}; S.expenses = []; S.card = 0; S.fat = 'aberta'; save();
      location.reload();
    } catch (e) {
      toast(`Não consegui ler ${esc(f.name)}. Use o painel-dados.json gerado no seu computador.`, 'warn', 6000);
    }
  };
  r.onerror = () => toast('Não consegui abrir o arquivo.', 'warn', 5000);
  r.readAsText(f);
}
function pendentesSheet() {
  const P = (D.REAL && D.REAL.pendentes) || [];
  openSheet('Para completar o painel', `<p class="small muted" style="margin:0 0 10px">Na ordem do que mais muda os números.</p>
    <div class="card tight" style="margin:0">${P.map((x, i) => `<div class="row" style="align-items:flex-start"><span class="badge-ic">${i + 1}</span><div class="grow"><div class="ttl" style="white-space:normal">${esc(x.n)}</div><div class="meta" style="white-space:normal">${esc(x.por)}</div><div class="meta" style="white-space:normal"><b>Como:</b> ${esc(x.como)}</div></div></div>`).join('')}</div>
    ${(D.REAL.aClassificar || []).length ? `<h3 style="margin:16px 0 6px">Pix de terceiros para classificar</h3><div class="card tight" style="margin:0">${D.REAL.aClassificar.slice(0, 8).map((x) => `<div class="row"><div class="grow"><div class="ttl ellip">${esc(x.nome)}</div><div class="meta">${x.n} lançamento${x.n > 1 ? 's' : ''}</div></div><div class="amt num small">${x.entradas ? `+${brl0(x.entradas)}` : ''}${x.entradas && x.saidas ? '<br>' : ''}${x.saidas ? `−${brl0(x.saidas)}` : ''}</div></div>`).join('')}</div>` : ''}`);
}

function cats() {
  const add = {}; S.expenses.forEach((x) => { add[x.cat] = (add[x.cat] || 0) + x.v; });
  return D.CATS.map((c) => ({ ...c, v: c.v + (add[c.n] || 0) }));
}
function Dinheiro() {
  const M = money();
  const up = bills().filter((b) => !b.pago && b.met !== 'Cartão' && D.diffDays(b.due, diaNow()) <= 7);
  const C = cats(), tot = C.reduce((a, c) => a + c.v, 0), top = Math.max(...C.map((c) => c.v));
  const pl = plTotal();
  return {
    title: 'Dinheiro',
    html: `${hdr('Dinheiro', `${cap(monLong(diaNow()))} · pessoa física`, `<a class="iconbtn" href="#/dinheiro/importar" aria-label="Importar extratos">${I('upload')}</a>`)}${netbar()}${realLine()}
      <div class="card">
        <button class="cardhead" data-act="safe"><span class="row-flex"><span class="muted small">${livreLabel(M)}${D.REAL ? '' : ', dia do pagamento'}</span>${I('info', 18, 'class="ic right muted"')}</span>
        ${livreBig(M)}<span class="sr">Ver a conta.</span></button>
        <div class="kpis"><div class="kpi"><span>Em conta</span><b>${brlK(M.saldo)}</b></div>${fatKpi(M, D.REAL ? 'média de 3 meses' : `fecha ${rel(D.addDays(diaNow(), D.CARDS[0].fecha))}`)}<div class="kpi"><span>Patrimônio</span><b>${brlK(pl)}</b><small>${plMes(pl)}</small></div></div>
      </div>
      ${sec('Próximos 7 dias', '<a href="#/dinheiro/contas">Calendário</a>')}
      <div class="card tight">${up.length ? up.map((b) => `<button class="row" data-act="bill" data-arg="${b.id}"><span class="badge-ic">${I('receipt', 20)}</span><div class="grow"><div class="ttl ellip">${esc(b.n)}</div><div class="meta">${relDue(b)} · ${b.met}</div></div><div class="amt"><div class="num">${brl(b.v)}</div>${stChip(b.st)}</div></button>`).join('') : `<div class="empty"><p>Nada vence nos próximos 7 dias.</p></div>`}</div>
      ${sec('Reserva de emergência')}
      <div class="card"><div class="row-flex">${I('shieldHalf', 22, 'class="ic" style="color:var(--a-pat)"')}<div class="grow"><b class="num">${n1(D.SAVINGS.reservaMeses)} de ${D.SAVINGS.reservaMeta} meses</b><div class="small muted">de gastos essenciais (${brl0(D.SAVINGS.essenciais)}/mês ${D.SAVINGS.essLabel || ': moradia, mercado, transporte e saúde'})</div></div></div><div style="margin-top:10px">${bar((D.SAVINGS.reservaMeses / D.SAVINGS.reservaMeta) * 100, 'var(--a-pat)', 'lg')}</div>
        <p class="small muted" style="margin-top:8px">Escudo da Reserva: cada aporte reforça o escudo e sobe o atributo Patrimônio. Faltam ${brl0((D.SAVINGS.reservaMeta - D.SAVINGS.reservaMeses) * D.SAVINGS.essenciais)} para ${D.SAVINGS.reservaMeta} meses.</p></div>
      ${sec(D.CATS_TITLE, D.SAVINGS.taxa == null ? '' : `<span class="small muted num">poupança ${D.SAVINGS.taxa}% · meta ${D.SAVINGS.meta}%</span>`)}
      <div class="card">${C.map((c) => `<div style="margin:10px 0"><div class="row-flex small"><span class="grow">${c.n}</span><b class="num">${brl0(c.v)}</b><span class="muted num" style="width:72px;text-align:right">${c.v > c.avg * 1.1 ? `${I('up', 14, 'style="display:inline;vertical-align:-2px"')} ${Math.round((c.v / c.avg - 1) * 100)}%` : 'na média'}</span></div>${bar((c.v / top) * 100, c.v > c.avg * 1.1 ? 'var(--xp-fill)' : 'var(--primary)')}</div>`).join('')}
        <p class="small muted">Total ${brl0(tot)}. ${D.REAL ? 'Comparação com a média dos 6 meses anteriores. A fatura aparece numa linha só até as faturas do cartão chegarem.' : 'Comparação com a média de 30 dias dos últimos 6 meses.'}${S.expenses.length ? ` Inclui ${S.expenses.length} gasto${S.expenses.length > 1 ? 's' : ''} registrado${S.expenses.length > 1 ? 's' : ''} à mão.` : ''}</p></div>
      ${S.expenses.length ? `${sec('Registrados à mão', '<span class="small muted">ligados ao extrato quando ele chegar</span>')}<div class="card tight">${S.expenses.slice().reverse().map(expRow).join('')}</div>` : ''}
      ${D.REAL && (D.REAL.pendentes || []).length ? `${sec('Para completar o painel')}<button class="card cardlink" data-act="pendentes"><span class="badge-ic">${I('target')}</span><div class="grow"><b>Faltam ${D.REAL.pendentes.length} itens</b><div class="small muted">${esc(D.REAL.pendentes.slice(0, 2).map((x) => x.n).join(', '))} e outros</div></div>${I('chevR', 24, 'class="ic chev"')}</button>` : ''}
      ${sec('Mais')}
      <a class="card cardlink" href="#/dinheiro/cartoes"><span class="badge-ic">${I('card')}</span><div class="grow"><b>Cartões e faturas</b><div class="small muted">Fatura aberta, parcelas e melhor dia de compra</div></div>${I('chevR', 24, 'class="ic chev"')}</a>
      <a class="card cardlink" href="#/dinheiro/patrimonio"><span class="badge-ic">${I('pie')}</span><div class="grow"><b>Patrimônio</b><div class="small muted">Balanço, evolução e alocação</div></div>${I('chevR', 24, 'class="ic chev"')}</a>
      <a class="card cardlink" href="#/dinheiro/importar"><span class="badge-ic">${I('upload')}</span><div class="grow"><b>Importar extratos</b><div class="small muted">${D.REAL ? `Seus dados de ${dShort(new Date(D.REAL.geradoEm + 'T12:00'))}` : `Última importação ${S.importAt ? rel(dayAt(S.importAt)) : 'há 9 dias'}`}</div></div>${I('chevR', 24, 'class="ic chev"')}</a>`,
  };
}
// Depois de paga, a fatura do mês sai de cena: o card mostra a próxima, que recebe os gastos novos no cartão.
const fatKpi = (M, sub = '') => (M.fb.pago ? `<div class="kpi"><span>Próxima fatura</span><b>${brlK(M.proxima)}</b><small>a aberta já foi paga</small></div>` : `<div class="kpi"><span>Fatura aberta</span><b>${brlK(M.fatura)}</b>${sub ? `<small>${sub}</small>` : ''}</div>`);
const expRow = (x) => `<div class="row"><span class="badge-ic">${I(x.met === 'Cartão Alfa' ? 'card' : 'wallet', 20)}</span><div class="grow"><div class="ttl">${esc(x.cat)}</div><div class="meta">${dShort(dayAt(x.d))} · ${esc(cardName(x.met))}${x.met === 'Cartão Alfa' ? (x.fat === 'proxima' ? ', próxima fatura' : ', fatura aberta') : ''}</div></div><div class="amt num">${brl(x.v)}</div><button class="iconbtn" data-act="delExpense" data-arg="${esc(x.id)}" aria-label="Apagar gasto de ${brl(x.v)} em ${esc(x.cat.toLowerCase())}">${I('x')}</button></div>`;
function plTotal() { const a = D.BALANCE.ativo.flatMap((g) => g.itens).reduce((s, i) => s + i[1], 0); const p = D.BALANCE.passivo.flatMap((g) => g.itens).reduce((s, i) => s + i[1], 0); return a - p; }

function Contas() {
  const all = bills(), now = diaNow();
  const m0 = new Date(now.getFullYear(), now.getMonth() + S.calOff, 1);
  const first = (m0.getDay() + 6) % 7, dim = new Date(m0.getFullYear(), m0.getMonth() + 1, 0).getDate();
  let cells = D.DOW.map((d) => `<div class="dh">${d.slice(0, 1)}</div>`).join('');
  for (let i = 0; i < first; i++) cells += '<span></span>';
  for (let d = 1; d <= dim; d++) {
    const date = new Date(m0.getFullYear(), m0.getMonth(), d), id = D.iso(date);
    const bs = all.filter((b) => D.iso(b.due) === id);
    const isT = id === D.iso(now);
    const stTxt = Object.entries(bs.reduce((o, b) => ((o[b.st] = (o[b.st] || 0) + 1), o), {})).map(([st, n]) => `${n} ${{ pago: n > 1 ? 'pagas' : 'paga', agendado: n > 1 ? 'agendadas' : 'agendada', avencer: 'a vencer', atrasado: n > 1 ? 'atrasadas' : 'atrasada' }[st]}`).join(', ');
    cells += `<button class="${isT ? 'today' : ''}" aria-pressed="${S.calSel === id}" data-act="calsel" data-arg="${id}" aria-label="${d} de ${mon(date)}${isT ? ', hoje' : ''}${bs.length ? `: ${stTxt}` : ''}"><span>${d}</span><span class="dots">${bs.map((b) => `<i class="dot-${b.st}"></i>`).join('')}</span></button>`;
  }
  const inMonth = all.filter((b) => b.due.getMonth() === m0.getMonth() && b.due.getFullYear() === m0.getFullYear());
  let list = S.calSel ? all.filter((b) => D.iso(b.due) === S.calSel) : inMonth;
  if (S.billFilter !== 'todas') list = list.filter((b) => b.st === S.billFilter);
  // Contas pagas no cartão já estão dentro da fatura: não entram duas vezes no total.
  const conta = inMonth.filter((b) => b.met !== 'Cartão');
  const tot = conta.reduce((a, b) => a + b.v, 0), pago = conta.filter((b) => b.pago).reduce((a, b) => a + b.v, 0), noCartao = inMonth.length - conta.length;
  const F = [['todas', 'Todas'], ['avencer', 'A vencer'], ['agendado', 'Agendadas'], ['atrasado', 'Atrasadas'], ['pago', 'Pagas']];
  return {
    title: 'Contas a pagar',
    html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Contas a pagar', `${brl0(tot)} no mês · ${brl0(pago)} já pagos${noCartao ? ` · ${noCartao} no cartão, dentro da fatura` : ''}`, `<button class="iconbtn" data-act="toastInfo" data-arg="No app real: nova conta recorrente com valor, dia, forma de pagamento e lembretes 3 dias antes e no dia." aria-label="Nova conta">${I('plus')}</button>`)}
      <div class="card"><div class="row-flex"><button class="iconbtn" data-act="calnav" data-arg="-1" aria-label="Mês anterior">${I('chevL')}</button><b class="grow" style="text-align:center">${cap(monLong(m0))}</b><button class="iconbtn" data-act="calnav" data-arg="1" aria-label="Próximo mês">${I('chevR')}</button></div>
        <div class="cal">${cells}</div>
        <div class="legend" style="margin-top:8px"><span><i class="dot-pago" style="width:8px;height:8px;border-radius:50%"></i>paga</span><span><i class="dot-agendado" style="width:8px;height:8px;border-radius:50%"></i>agendada</span><span><i class="dot-avencer" style="width:8px;height:8px;border-radius:50%"></i>a vencer</span><span><i class="dot-atrasado" style="width:8px;height:8px;border-radius:50%"></i>atrasada</span></div></div>
      <div class="hscroll" role="group" aria-label="Filtrar contas">${F.map(([k, l]) => `<button class="pick" aria-pressed="${S.billFilter === k}" data-act="billf" data-arg="${k}">${l}</button>`).join('')}</div>
      ${S.calSel ? `<div class="sec"><h2>${dShort(new Date(S.calSel + 'T12:00'))}</h2><button class="link" data-act="calsel" data-arg="${S.calSel}">Ver o mês todo</button></div>` : ''}
      <div class="card tight">${list.length ? list.map((b) => `<button class="row" data-act="bill" data-arg="${b.id}"><span class="badge-ic">${I(b.cat === 'Cartão' ? 'card' : b.cat === 'Transporte' ? 'car' : b.cat === 'Investimento' ? 'trend' : 'receipt', 20)}</span><div class="grow"><div class="ttl ellip">${esc(b.n)}</div><div class="meta">${relDue(b)} · ${b.met === 'Cartão' ? `no ${D.CARDS[0].n}, entra na fatura` : b.met}</div></div><div class="amt"><div class="num">${brl(b.v)}</div>${stChip(b.st)}</div></button>`).join('') : `<div class="empty"><span class="badge-ic">${I('receipt')}</span><p>Nenhuma conta com esse filtro.</p></div>`}</div>
      <p class="small muted" style="margin:14px 20px">Lembretes 3 dias antes e no dia, dentro do resumo das 07:00. Pagar no prazo dá +15 XP e sobe o Foco. Fontes: contas recorrentes detectadas no extrato, DDA do banco e as que você cadastrar.</p>`,
  };
}

function CartoesReal() {
  const i = Math.min(S.card, D.CARDS.length - 1), k = D.CARDS[i].real, now = diaNow();
  const usado = k.usado || 0, pc = k.limite ? (usado / k.limite) * 100 : 0;
  let vdate = null;
  if (k.vence) { vdate = new Date(now.getFullYear(), now.getMonth(), k.vence); if (vdate < D.startOfDay(now)) vdate = new Date(now.getFullYear(), now.getMonth() + 1, k.vence); }
  const P = k.pagamentos || [], tot = P.reduce((a, p) => a + p.v, 0), med = P.length ? P.slice(-3).reduce((a, p) => a + p.v, 0) / Math.min(3, P.length) : 0;
  const pd = (p) => new Date(p.d + 'T12:00');
  const refU = (k.refUsado || '').replace(/^(\d{4})-(\d{2}).*/, (_, y, m) => `${m}/${y.slice(2)}`);
  const N = D.REAL.notas || {};
  return {
    title: 'Cartões e faturas',
    html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Cartões e faturas', esc(N.cartoes || 'Limite e pagamentos pelos seus arquivos'))}${realLine()}
      <div class="seg" role="group" aria-label="Escolher cartão" style="margin:4px 16px 0">${D.CARDS.map((x, j) => `<button aria-pressed="${i === j}" data-act="card" data-arg="${j}">${esc(x.n.replace('Cartão ', ''))}</button>`).join('')}</div>
      <div class="card"><div class="row-flex"><span class="small muted grow">Limite usado${refU ? ` em ${refU}` : ''}</span><b class="num">${brl0(usado)} de ${brl0(k.limite)}</b></div><div style="margin-top:8px">${bar(pc, pc > 50 ? 'var(--xp-fill)' : 'var(--primary)', 'lg')}</div>
        <p class="small muted" style="margin-top:8px">Disponível ${brl0(k.limite - usado)}.${vdate ? ` Vence todo dia ${k.vence}; a próxima em ${dShort(vdate)} (${rel(vdate)}).` : ''}</p></div>
      ${P.length ? `${sec('Faturas pagas')}<div class="card"><div class="small muted">Última, paga em ${dShort(pd(P[P.length - 1]))}</div><div class="big">${brl(P[P.length - 1].v)}</div>
        <div class="kpis"><div class="kpi"><span>Média 3 meses</span><b>${brlK(med)}</b></div><div class="kpi"><span>No período</span><b>${brlK(tot)}</b></div><div class="kpi"><span>Maior</span><b>${brlK(Math.max(...P.map((p) => p.v)))}</b></div></div>
        <div style="margin-top:12px">${barChart(P.slice(-10).map((p) => ({ v: p.v, l: mon(pd(p)), c: 'var(--a-pat)' })), { label: `Faturas pagas por mês, de ${brl0(P[Math.max(0, P.length - 10)].v)} a ${brl0(P[P.length - 1].v)}`, values: (v) => (v ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : '') })}</div></div>` : ''}
      ${sec('Lançamentos')}
      <div class="card"><div class="empty"><span class="badge-ic">${I('file', 28)}</span><b>${usado || P.length ? 'Faltam as faturas' : 'Sem uso'}</b><p>${usado || P.length ? `${esc(k.faturas || '')}. Com elas o Painel separa mercado, restaurante, assinaturas e parcelas.` : `Nenhuma compra neste cartão. Limite livre de ${brl0(k.limite)}.`}</p>${usado || P.length ? '<a class="btn" href="#/dinheiro/importar">Como enviar</a>' : ''}</div></div>`,
  };
}

function Cartoes() {
  if (D.REAL) return CartoesReal();
  const c = D.CARDS[S.card], now = diaNow();
  const fecha = D.addDays(now, c.fecha), vence = D.addDays(now, c.vence);
  const extra = S.card === 0 ? cardExtra() : 0, aberta = { v: c.faturas.aberta.v + extra, st: S.card === 0 && S.paid.fatura ? 'Paga' : null };
  const proxima = { v: c.faturas.proxima.v + (S.card === 0 ? cardNext() : 0) };
  const nx = S.card === 0 ? cardNext() : 0;
  const comprometido = (aberta.st ? 0 : aberta.v) + nx + c.futuro.reduce((a, b) => a + b, 0);
  const f = S.fat;
  const mine = S.card === 0 && f !== 'fechada' ? S.expenses.filter((x) => x.met === 'Cartão Alfa' && (x.fat || 'aberta') === f).map((x) => ({ id: x.id, d: dayAt(x.d), n: `${x.cat} · registrado no Painel`, c: x.cat, v: x.v })).reverse() : [];
  const fv = { fechada: c.faturas.fechada, aberta, proxima }[f];
  // Cada lista soma o valor da fatura mostrada: o que não está detalhado vira uma linha de “demais lançamentos”.
  const base = S.card === 0 ? (f === 'aberta' ? D.cardTx(diaNow()) : f === 'proxima' ? nextTx(c) : []) : f === 'aberta' ? BETA_TX.map((t) => ({ ...t, d: D.addDays(diaNow(), t.d) })) : [];
  const rows = [...mine, ...base], rest = Math.round((fv.v - rows.reduce((a, t) => a + t.v, 0)) * 100) / 100;
  const tx = rest > 0.004 ? [...rows, { more: true, n: rows.length ? 'Demais lançamentos desta fatura' : 'Todos os lançamentos desta fatura', c: 'Compras', v: rest }] : rows;
  const nextDue = new Date(vence.getFullYear(), vence.getMonth() + 1, vence.getDate());
  const months = Array.from({ length: 6 }, (_, i) => mon(new Date(nextDue.getFullYear(), nextDue.getMonth() + i, 1)));
  return {
    title: 'Cartões e faturas',
    html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Cartões e faturas')}
      <div class="seg" role="group" aria-label="Escolher cartão" style="margin:4px 16px 0">${D.CARDS.map((k, i) => `<button aria-pressed="${S.card === i}" data-act="card" data-arg="${i}">${k.n} ••${k.fim}</button>`).join('')}</div>
      <div class="card"><div class="row-flex"><span class="small muted grow">Limite usado</span><b class="num">${brl0(comprometido)} de ${brl0(c.limite)}</b></div><div style="margin-top:8px">${bar((comprometido / c.limite) * 100, comprometido / c.limite > 0.5 ? 'var(--xp-fill)' : 'var(--primary)', 'lg')}</div>
        <p class="small muted" style="margin-top:8px">Disponível ${brl0(c.limite - comprometido)}. Acima de 50% no fechamento pesa no atributo Patrimônio.</p></div>
      <div class="seg" role="group" aria-label="Escolher fatura" style="margin:10px 16px 0">${[['fechada', 'Fechada'], ['aberta', 'Aberta'], ['proxima', 'Próxima']].map(([k, l]) => `<button aria-pressed="${f === k}" data-act="fat" data-arg="${k}">${l}</button>`).join('')}</div>
      <div class="card">
        <div class="row-flex"><div><div class="small muted">${f === 'fechada' ? 'Fatura anterior' : f === 'aberta' ? (aberta.st ? `Paga antes do fechamento · vencia ${dShort(vence)}` : `Fecha ${rel(fecha)} (${dShort(fecha)}) · vence ${dShort(vence)}`) : `Vence ${dShort(nextDue)} · parcelas já lançadas${nx ? ' e compras novas' : ''}`}</div><div class="big">${brl(fv.v)}</div></div>${fv.st ? `<span class="chip st-pago right">${I('check', 16)} ${fv.st}</span>` : ''}</div>
        ${f === 'aberta' ? `<div class="kpis"><div class="kpi"><span>Média 3 meses</span><b>${brl0(3010)}</b></div><div class="kpi"><span>Projeção</span><b>${brl0(3180)}</b></div><div class="kpi"><span>Melhor dia</span><b>${dShort(D.addDays(fecha, 1))}</b></div></div>
        <p class="small muted" style="margin-top:10px">${aberta.st ? 'Compras novas no cartão já entram na próxima fatura.' : `Compras a partir de ${dShort(D.addDays(fecha, 1))} caem na próxima fatura, com até 40 dias para pagar.`}</p>` : ''}
      </div>
      ${sec('Comprometido nos próximos meses')}
      <div class="card">${c.futuro.some((v) => v) ? barChart(c.futuro.map((v, i) => ({ v: v + (i === 0 ? nx : 0), l: months[i], c: 'var(--a-pat)' })), { label: 'Parcelas já assumidas nos próximos 6 meses', values: (v) => (v ? Math.round(v / 10) * 10 : '') }) + `<p class="small muted" style="margin-top:6px">Parcelas já assumidas. Elas reduzem o “livre para gastar” dos próximos meses.</p>` : `<div class="empty"><p>Nenhuma parcela futura neste cartão.</p></div>`}</div>
      ${sec(f === 'aberta' ? 'Lançamentos da fatura aberta' : 'Lançamentos', '<button class="link" data-act="toastInfo" data-arg="Busca por loja, categoria ou valor, e filtro só de parcelados.">Buscar</button>')}
      <div class="card tight">${tx.map((t) => `<div class="row"><span class="badge-ic">${I(t.c === 'Mercado' ? 'utensils' : t.c === 'Transporte' ? 'car' : t.c === 'Saúde' ? 'heart' : t.c === 'Compras' ? 'tag' : t.c === 'Assinaturas' ? 'refresh' : 'utensils', 20)}</span><div class="grow"><div class="ttl ellip">${esc(t.n)}</div><div class="meta">${t.more ? 'vários dias e categorias' : `${dShort(t.d)} · ${t.c}${t.parc ? ` · <b>parcela ${t.parc}</b>` : ''}`}</div></div><div class="amt num">${brl(t.v)}</div>${t.id ? `<button class="iconbtn" data-act="delExpense" data-arg="${esc(t.id)}" aria-label="Apagar gasto de ${brl(t.v)}">${I('x')}</button>` : ''}</div>`).join('') || '<div class="empty"><p>Nenhum lançamento nesta fatura ainda.</p></div>'}</div>`,
  };
}

// Próxima fatura: as parcelas que caem nela (próxima parcela de cada compra) e o resto agrupado, somando o total.
const BETA_TX = [{ d: -3, n: 'Posto Rodovia', c: 'Transporte', v: 180.00 }, { d: -6, n: 'Farmácia', c: 'Saúde', v: 56.80 }, { d: -9, n: 'Livraria', c: 'Compras', v: 49.90 }];
function nextTx(c) {
  const v0 = D.addDays(diaNow(), c.vence), due = new Date(v0.getFullYear(), v0.getMonth() + 1, v0.getDate());
  const parc = D.cardTx(diaNow()).filter((t) => t.parc).map((t) => { const [n, m] = t.parc.split('/').map(Number); return n < m ? { d: due, n: t.n, c: t.c, v: t.v, parc: `${n + 1}/${m}` } : null; }).filter(Boolean);
  const rest = Math.round((c.faturas.proxima.v - parc.reduce((a, t) => a + t.v, 0)) * 100) / 100;
  return rest > 0 ? [...parc, { d: due, n: 'Outras parcelas e assinaturas', c: 'Assinaturas', v: rest }] : parc;
}
function Patrimonio() {
  const A = D.BALANCE.ativo, P = D.BALANCE.passivo;
  const ta = A.flatMap((g) => g.itens).reduce((s, i) => s + i[1], 0), tp = P.flatMap((g) => g.itens).reduce((s, i) => s + i[1], 0), pl = ta - tp;
  const ser = D.netWorthSeries();
  if (D.REAL) ser.push({ d: realDate(), v: pl }); else { const shift = pl - ser[ser.length - 1].v; ser.forEach((x) => (x.v += shift)); }
  const L = ser.length - 1, sg = (v) => `${v >= 0 ? '+' : '−'}${brl0(Math.abs(v))}`, N = (D.REAL && D.REAL.notas) || {};
  const colors = ['var(--a-foc)', 'var(--a-pat)', 'var(--a-vig)'];
  const gsum = A.map((g) => g.itens.reduce((s, i) => s + i[1], 0));
  const table = (side, label, tot) => `<table class="bp"><caption class="sr">${label}</caption>${side.map((g) => `<tr><th colspan="2">${g.g}</th></tr>${g.itens.map(([n, v]) => `<tr><td>${n}</td><td>${brl0(v)}</td></tr>`).join('')}`).join('')}<tr class="tot"><td>Total ${label.toLowerCase()}</td><td>${brl0(tot)}</td></tr></table>`;
  return {
    title: 'Patrimônio',
    html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Patrimônio', D.REAL ? `Foto de ${dShort(realDate())}, com os seus arquivos` : 'Atualizado no dia 1º de cada mês')}${realLine()}
      <div class="card"><div class="small muted">Patrimônio líquido</div><div class="big">${brl0(pl)}</div><div class="small muted">${D.REAL ? `${sg(ser[L].v - ser[L - 1].v)} desde o fim de ${mon(ser[L - 1].d)} · ${sg(ser[L].v - ser[0].v)} desde o fim de ${mon(ser[0].d)}` : `+${brl0(ser[11].v - ser[10].v)} no mês · +${brl0(ser[11].v - ser[0].v)} em 12 meses`}</div>
        ${lineChart(ser.map((x) => x.v), { area: true, label: `Patrimônio líquido ${D.REAL ? `desde o fim de ${mon(ser[0].d)}` : 'nos últimos 12 meses'}, de ${brl0(ser[0].v)} para ${brl0(pl)}`, fmt: (v) => Math.round(v / 1000) + 'k', labels: [[0, mon(ser[0].d)], [Math.round(L / 2), mon(ser[Math.round(L / 2)].d)], [L, D.REAL ? 'hoje' : mon(ser[L].d)]] })}
        ${N.serie ? `<p class="xs muted" style="margin-top:8px">${esc(N.serie)}</p>` : ''}</div>
      <div class="seg" role="group" aria-label="Formato" style="margin:6px 16px 0"><button aria-pressed="${S.bp === 'resumo'}" data-act="bp" data-arg="resumo">Resumo</button><button aria-pressed="${S.bp === 'balanco'}" data-act="bp" data-arg="balanco">Balanço patrimonial</button></div>
      ${S.bp === 'resumo' ? `<div class="card"><b>Onde está o ativo</b><div class="stack" aria-hidden="true">${gsum.map((v, i) => `<i style="--c:${colors[i]};width:${((v / ta) * 100).toFixed(1)}%"></i>`).join('')}</div>
          ${A.map((g, i) => `<div class="row-flex small" style="margin-top:10px"><span class="k" style="width:10px;height:10px;border-radius:3px;background:${colors[i]}"></span><span class="grow">${g.g}</span><b class="num">${brl0(gsum[i])}</b><span class="muted num" style="width:44px;text-align:right">${Math.round((gsum[i] / ta) * 100)}%</span></div>`).join('')}</div>
        <div class="grid2"><div class="card"><div class="small muted">Ativo</div><div class="mid">${brlK(ta)}</div></div><div class="card"><div class="small muted">Passivo</div><div class="mid">${brlK(tp)}</div></div></div>
        ${lvl(S.xp).L >= 10 ? `<div class="card soft"><div class="row-flex">${I('trend', 20)}<b>Projeção de independência</b></div><p class="small" style="margin-top:4px">${D.SAVINGS.taxa == null ? 'Precisa da sua renda mensal para calcular a taxa de poupança.' : `Com poupança de ${D.SAVINGS.taxa}% e retorno real de 4% a.a., o patrimônio cobre seus gastos em cerca de 21 anos.`}</p></div>` : `<div class="card soft"><div class="row-flex">${I('lock', 20)}<b>Projeção de independência</b><span class="chip right">nível 10</span></div><p class="small" style="margin-top:4px">Em quantos anos o patrimônio cobre seus gastos, com a sua taxa de poupança. Libera no nível 10.</p></div>`}`
        : `<div class="card">${table(A, 'Ativo', ta)}</div><div class="card">${table(P, 'Passivo', tp)}<table class="bp"><tr class="tot"><td>Patrimônio líquido</td><td>${brl0(pl)}</td></tr></table></div>`}
      ${D.REAL ? `<p class="small muted" style="margin:14px 20px">${esc(N.balanco || '')} Só pessoa física: as empresas ficam fora.</p>${(D.REAL.pendentes || []).length ? `<div style="margin:0 16px"><button class="btn line block" data-act="pendentes">Ver o que falta (${D.REAL.pendentes.length})</button></div>` : ''}` : `<p class="small muted" style="margin:14px 20px">Veículo pela tabela FIPE, investimentos pela última posição importada, FGTS pelo extrato. Só pessoa física: as empresas ficam fora.</p>`}`,
  };
}

function Importar() {
  const st = S.importStep;
  const steps = ['Arquivo', 'Conferir', 'Conciliar', 'Pronto'];
  const line = `<h2 class="sr" id="imp-step" tabindex="-1">Etapa ${st + 1} de 4: ${steps[st]}</h2><div class="stepline" aria-hidden="true">${steps.map((s, i) => `<span class="${i <= st ? 'on' : ''}">${s}</span>`).join('')}</div>`;
  let body = '';
  if (st === 0) {
    const realCard = `${sec('Seus dados reais')}<div class="card"><div class="row-flex"><span class="badge-ic">${I('lock', 20)}</span><div class="grow"><b>${D.REAL ? 'Carregados neste aparelho' : 'Carregar o arquivo do Painel'}</b><div class="small muted">${D.REAL ? `Arquivo de ${dShort(realDate())}: ${(D.REAL.transacoes || []).length} lançamentos, ${(D.REAL.contas || []).length} contas e ${(D.REAL.cartoes || []).length} cartões.` : 'O painel-dados.json é gerado no seu computador a partir dos seus extratos. Ele é lido aqui e não sai deste aparelho.'}</div></div></div>
      ${realErr ? '<p class="small" style="color:var(--danger);margin-top:8px">O arquivo salvo neste aparelho não abriu. Carregue de novo.</p>' : ''}
      ${justLoaded() ? `<p class="small" style="margin-top:8px">${I('check', 16, 'style="display:inline;vertical-align:-3px;color:var(--primary)"')} Pronto. <a href="#/dinheiro">Ver em Dinheiro</a></p>` : ''}
      <label class="btn ${D.REAL ? 'line ' : ''}block filebtn" style="margin-top:12px"><input type="file" accept=".json,application/json" data-in="realfile">${I('upload', 20)} ${D.REAL ? 'Trocar pelo arquivo novo' : 'Escolher painel-dados.json'}</label>
      ${D.REAL ? '<button class="btn ghost block" style="margin-top:8px" data-act="realClear">Apagar deste aparelho e voltar ao exemplo</button>' : ''}</div>
      ${sec('Extrato ou fatura avulsa')}`;
    body = `${realCard}<div class="card"><label class="drop"><input type="file" accept=".ofx,.csv,.xlsx,.pdf" data-in="file"><span class="badge-ic p" style="margin:0 auto 10px;width:56px;height:56px;border-radius:18px">${I('upload', 28)}</span><b>Escolher extrato ou fatura</b><p class="small muted" style="margin-top:4px">OFX é o melhor. Também aceita CSV, XLSX e PDF de fatura. O arquivo é lido no aparelho.</p></label>
        <button class="btn ghost block" style="margin-top:12px" data-act="importNext">Usar arquivo de exemplo</button></div>
      ${sec('Onde baixar')}
      <div class="card tight">${[['Extrato do banco', 'Internet banking → Extrato → exportar OFX ou CSV'], ['Fatura do cartão', 'App do cartão → Faturas → PDF ou CSV'], ['Investimentos (B3)', 'Área do Investidor → Relatórios → Consolidado'], ['Faturas no e-mail', 'Fase 2: o Painel busca o PDF no Gmail e guarda no Drive']].map(([t, d]) => `<div class="row"><span class="badge-ic">${I('file', 20)}</span><div class="grow"><div class="ttl">${t}</div><div class="meta">${d}</div></div></div>`).join('')}</div>
      ${sec('Conexão automática')}
      <div class="card"><div class="row-flex"><span class="badge-ic">${I('link')}</span><div class="grow"><b>Open Finance pelo Meu Pluggy</b><div class="small muted">Gratuito para uso pessoal, até 5 bancos, consentimento de 12 meses. Atualiza uma vez por dia.</div></div><span class="chip">Em configuração</span></div></div>`;
  } else if (st === 1) {
    const rows = D.IMPORT_PREVIEW;
    const chip = (r) => `<span class="chip ${r.conf === 'duplicada' ? 'st-atrasado' : r.conf === 'sugerida' && !S.importCat ? 'st-avencer' : ''}" style="min-height:22px;font-size:12px">${r.conf === 'duplicada' ? 'duplicado, será ignorado' : r.conf === 'sugerida' ? `${S.importCat || r.c} · ${S.importCat ? 'escolhida por você' : 'sugerida, toque para mudar'}` : r.c}</span>`;
    const inner = (r) => `<div class="grow"><div class="ttl ellip" style="font-size:14px">${r.n}</div><div class="meta">${dShort(D.addDays(diaNow(), r.d))} · ${chip(r)}</div></div><div class="amt num" style="color:${r.v > 0 ? 'var(--primary)' : 'var(--ink)'}">${r.v > 0 ? '+' : ''}${brl(r.v)}</div>`;
    body = `<div class="card"><div class="row-flex"><span class="badge-ic">${I('file', 20)}</span><div class="grow"><b>extrato-exemplo.ofx</b><div class="small muted">Conta principal · 48 lançamentos · 1 duplicado</div></div></div></div>
      ${sec('Prévia')}<div class="card tight">${rows.map((r) => (r.conf === 'sugerida' ? `<button class="row" data-act="importCatSheet">${inner(r)}</button>` : `<div class="row">${inner(r)}</div>`)).join('')}</div>
      <div class="btnrow" style="margin:6px 16px"><button class="btn ghost" data-act="importBack">Voltar</button><button class="btn" data-act="importNext">Continuar</button></div>`;
  } else if (st === 2) {
    body = `<div class="card"><div class="row-flex">${I('check', 22, 'class="ic" style="color:var(--primary)"')}<b>Saldo confere</b></div><p class="small muted" style="margin-top:4px">Saldo final do arquivo ${brl(4180.55)} = saldo calculado ${brl(4180.55)}.</p></div>
      <div class="card"><div class="row-flex">${I('refresh', 22)}<b>1 duplicado ignorado</b></div><p class="small muted" style="margin-top:4px">Posto Avenida, ${brl(210)}, já veio na importação anterior.</p></div>
      <div class="card"><div class="row-flex">${I('tag', 22)}<b class="grow">Criar regra nova?</b><button class="switch" role="switch" aria-checked="${S.importRule}" data-act="importRule" aria-label="Criar regra para PAGTO ELETRON TRIBUTO"></button></div><p class="small muted" style="margin-top:4px">“PAGTO ELETRON TRIBUTO” → ${S.importCat || 'Moradia'}. ${S.importRule ? 'Da próxima vez entra sozinho.' : 'Sem regra: na próxima importação ele aparece de novo para você escolher.'}</p></div>
      <div class="btnrow" style="margin:6px 16px"><button class="btn ghost" data-act="importBack">Voltar</button><button class="btn" data-act="importNext">Importar 47 lançamentos</button></div>`;
  } else {
    body = `<div class="card" style="text-align:center;padding:26px 16px"><span class="badge-ic p" style="margin:0 auto 12px;width:64px;height:64px;border-radius:20px">${I('check', 32)}</span><h3>Importação concluída</h3><p class="lead">47 lançamentos na Conta principal. Contas recorrentes e gastos do mês atualizados.</p>
      <div class="btnrow"><button class="btn ghost" data-act="importReset">Importar outro</button><a class="btn" href="#/dinheiro" data-act="goto" data-arg="dinheiro">Ver Dinheiro</a></div>
      <button class="btn line block" style="margin-top:12px" data-act="importUndo">${I('refresh', 20)} Desfazer esta importação</button></div>`;
  }
  return { title: 'Importar extratos', html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Importar extratos', 'Arquivo → conferir → conciliar. Cada importação pode ser desfeita depois.')}${line}${body}` };
}

function Agenda() {
  const now = new Date(), day = diaNow(), { key, s } = todaySession(), ref = missao(), mb = ref !== 't1' ? bills().find((b) => b.id === ref && !b.pago) : null;
  const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const items = [
    { h: '07:00', t: 'Resumo do dia', d: 'Notificação: treino, dieta, contas e Top 3', c: 'var(--muted)' },
    ...D.events().map((e) => ({ h: e.h, t: e.t, d: `${e.h}–${e.fim} · ${e.src}`, c: 'var(--info)' })),
    { h: '18:30', t: s.nome, d: `${s.resumo} · do plano`, c: 'var(--a-for)' },
    ...(mb ? [{ h: '—', t: `Pagar ${mb.n.toLowerCase()}`, d: `${brl(mb.v)} · ${relDue(mb)}`, c: 'var(--danger)' }] : []),
    { h: '21:30', t: 'Hora de desacelerar', d: `Lembrete para deitar às ${D.BEDTIME}`, c: 'var(--a-rec)' },
  ].sort((a, b) => (a.h === '—' ? -1 : b.h === '—' ? 1 : a.h.localeCompare(b.h)));
  const top = D.TOP3.map((t) => `<div class="quest ${S.top3[t.id] ? 'done' : ''}"><button class="qcheck" aria-pressed="${!!S.top3[t.id]}" data-act="top3" data-arg="${t.id}" aria-label="${esc(t.t)}: ${S.top3[t.id] ? 'feito' : 'marcar como feito'}">${I('check', 28)}</button><div class="grow"><div class="t">${esc(t.t)}</div><div class="d">${t.area} · +10 XP${t.id === 't1' && ref === 't1' ? ' · é a Missão de hoje (+20 XP)' : ''}</div></div></div>`).join('');
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = D.addDays(diaNow(), i), q = D.planFor(d), bs = bills().filter((b) => D.iso(b.due) === D.iso(d) && !b.pago);
    return `<div class="row"><div style="width:52px"><b>${i === 0 ? 'Hoje' : wd(d)}</b><div class="xs muted num">${dShort(d)}</div></div><div class="grow small"><div>${D.SESSION[q.tipo].nome}</div>${bs.map((b) => `<div class="muted">${esc(b.n)} · ${brl(b.v)}</div>`).join('')}${i === 0 ? `<div class="muted">${D.events().length} compromissos</div>` : i % 2 ? `<div class="muted">${(i % 3) + 1} compromissos</div>` : ''}</div></div>`;
  }).join('');
  return {
    title: 'Agenda',
    html: `${hdr('Agenda', dLong(day))}${netbar()}
      <div class="card"><label class="field" style="margin:0"><span>Anotar</span><div class="row-flex"><input class="input" id="inbox" placeholder="ex.: pagar IPVA dia 10 R$ 820 #financas" data-in="inbox" autocomplete="off" value="${esc(S.inboxDraft)}"><button class="btn" data-act="addInbox" aria-label="Anotar">${I('plus')}</button></div></label>
        <div class="parse" id="parse" aria-hidden="true"></div><p class="xs muted">Entende datas (amanhã, sexta, dia 10), horários (às 9h), #área, !prioridade e valores em R$. Também pelo Atalho “Anotar no Painel” e pela Siri.</p></div>
      <div class="seg" role="group" aria-label="Visão" style="margin:10px 16px 0"><button aria-pressed="${S.agView === 'hoje'}" data-act="agview" data-arg="hoje">Hoje</button><button aria-pressed="${S.agView === 'semana'}" data-act="agview" data-arg="semana">Próximos 7 dias</button></div>
      ${S.agView === 'hoje' ? `${sec('Top 3 de hoje', '<span class="small muted">só 3 contam para o Foco</span>')}<div class="card tight">${top}</div>
        ${sec('Linha do dia')}<div class="card tight timeline">${items.map((x) => { const past = x.h !== '—' && x.h < nowHM; return `<div class="tl ${past ? 'past' : ''}"><span class="h">${x.h}</span><span class="bul" style="--c:${x.c}"></span><div class="grow"><div class="t">${esc(x.t)}${past ? '<span class="sr"> (já passou)</span>' : ''}</div><div class="meta small muted">${esc(x.d)}</div></div></div>`; }).join('')}</div>`
        : `${sec('Próximos 7 dias')}<div class="card tight">${week}</div>`}
      ${sec('Caixa de entrada', `<span class="small muted num">${S.inbox.length} ite${S.inbox.length === 1 ? 'm' : 'ns'}</span>`)}
      <div class="card tight">${S.inbox.length ? S.inbox.map((x, i) => `<div class="row"><span class="badge-ic">${I('inbox', 20)}</span><div class="grow"><div class="ttl">${esc(x.t)}</div><div class="parse" style="margin-top:2px">${(x.chips || []).map((c) => `<span class="chip" style="min-height:22px;font-size:12px">${esc(c)}</span>`).join('')}</div></div><button class="iconbtn" data-act="doneInbox" data-arg="${i}" aria-label="Concluir ${esc(x.t)}">${I('check')}</button></div>`).join('') : `<div class="empty"><p>Caixa vazia. Tudo processado.</p></div>`}</div>
      <div class="card soft"><div class="row-flex">${I('bell', 20)}<b>Notificações de hoje: 3 de 3</b></div><p class="small" style="margin-top:4px">07:00 resumo · 18:00 treino · 21:30 hora de dormir. Nunca entre 22h e 7h.</p></div>`,
  };
}

function Ficha() {
  const L = lvl(S.xp), sk = streakNow(), cons = consistency();
  const avg = Math.round(D.ATTRS.reduce((a, x) => a + x.v, 0) / D.ATTRS.length);
  const B = boss();
  return {
    title: 'Ficha',
    html: `${hdr('Ficha', 'Você é o personagem principal', `<a class="iconbtn" href="#/ajustes" aria-label="Integrações e ajustes">${I('sliders')}</a>`)}
      <div class="card"><div class="row-flex" style="gap:14px"><div class="avatar" style="width:64px;height:64px;font-size:26px;border-radius:20px" aria-hidden="true">Y<span class="lv">${L.L}</span></div>
        <div class="grow"><div class="mid">${D.PROFILE.nome}</div><div class="small muted">Nível ${L.L} · ${titleFor(L.L)}${S.bossWon ? ' · Guardião da Noite' : ''} · próximo título no nível ${L.L < 5 ? 5 : L.L < 10 ? 10 : L.L < 15 ? 15 : L.L < 20 ? 20 : L.L < 25 ? 25 : 30}</div></div></div>
        <div style="margin-top:12px"><div class="row-flex small"><span class="grow">XP para o nível ${L.L + 1}</span><b class="num">${L.into} / ${L.need}</b></div>${bar((L.into / L.need) * 100, null, 'xp lg')}</div>
        <div class="kpi" style="margin-top:14px"><span>Consistência em 28 dias</span><b style="font-size:28px">${cons}%</b><small>dias com check-in. É o número que mais importa: um dia ruim mexe pouco nele.</small></div>
        <button class="kpi chama" data-act="chama"><span>Chama</span><b>${S.pausa ? `${I('pause', 20)} em pausa` : `${I('flame', 20)} ${sk} dias`}</b><small>${S.pausa ? 'Modo Pausa ligado: a Chama está congelada.' : brasaFree() ? '1 brasa livre: uma falta nesta semana não apaga a Chama.' : `Brasa usada em ${dShort(dayAt(S.brasaAt))}. Volta em ${dShort(D.addDays(dayAt(S.brasaAt), 7))}.`} Recorde: ${Math.max(S.best, sk)} dias.</small>${I('info', 18, 'class="ic chev"')}</button></div>
      ${sec('Atributos', `<span class="small muted num">média ${avg} · janela de 28 dias</span>`)}
      <div class="card tight">${D.ATTRS.map((a) => `<button class="attr" style="--c:${a.cor}" data-act="attr" data-arg="${a.k}" aria-label="${a.nome}: ${a.v} de 100, nota ${rank(a.v)}, ${a.d >= 0 ? 'subiu' : 'caiu'} ${Math.abs(a.d)} em 7 dias. Ver como subir"><span class="code">${a.k}</span><span class="nm">${a.nome}</span>${bar(a.v, a.cor)}<span class="val">${a.v}<span class="rank">${rank(a.v)}</span><small>${a.d >= 0 ? '+' : '−'}${Math.abs(a.d)} em 7 d</small></span></button>`).join('')}</div>
      ${sec('Chefe do mês')}
      <div class="card"><div class="row-flex">${I('crown', 24, 'class="ic" style="color:var(--a-rec)"')}<div class="grow"><b>${B.nome}</b><div class="small muted">${B.regra}</div></div></div>
        ${B.won ? `<div class="done-line" style="margin-top:12px"><span class="tick">${I('check', 20)}</span><div class="grow"><b>Vencido neste mês</b><div class="small muted">+500 XP e o título “Guardião da Noite”. Um chefe novo chega no dia 1º.</div></div></div>` : `<div style="margin-top:12px"><div class="row-flex small"><span class="grow">Vida do chefe</span><b class="num">${B.hp} / ${B.max}</b><span class="muted num">· faltam ${B.faltam} dias</span></div>${bar((B.hp / B.max) * 100, 'var(--a-rec)', 'lg')}</div>`}
        <p class="small muted" style="margin-top:8px">${B.won ? '' : `${B.hoje ? 'A noite de hoje já foi um golpe. ' : ''}Começou com ${B.start} de ${B.max} (90%: o primeiro golpe é seu). Vencer dá +500 XP e o título “Guardião da Noite”. Se ele fugir, nada se perde e a revanche vem mais fraca. `}Alternativa deste mês: ${B.alt}.</p></div>
      ${sec('Missões da semana', `<span class="small muted">bônus de +${D.WEEKLY_BONUS} XP ao fechar as 3</span>`)}
      <div class="card">${L.L >= 7 ? `<p class="small" style="margin:0 0 4px">${I('target', 16, 'style="display:inline;vertical-align:-3px;color:var(--primary)"')} O Cerco aeróbico mira seu atributo mais fraco: <b>${weakest().k} ${weakest().v}</b>.</p>` : ''}${weekly().map((q) => `<div style="margin:10px 0"><div class="row-flex"><b class="small grow">${q.t}</b><span class="chip xp">${q.xp} XP</span></div><div class="small muted">${q.d}</div><div class="row-flex" style="margin-top:6px"><div class="grow">${bar((q.p / q.of) * 100)}</div><span class="small muted num">${q.p}/${q.of}</span></div></div>`).join('')}</div>
      ${sec('Conquistas', `<span class="small muted num">${D.ACHIEVEMENTS.filter((a) => a.ok).length}/${D.ACHIEVEMENTS.length}</span>`)}
      <div class="card"><div class="ach">${D.ACHIEVEMENTS.map((a) => `<div class="${a.ok ? '' : 'off'}"><div class="medal">${I(a.ic, 26)}</div><b>${a.n}</b><div class="muted">${a.ok ? a.d : a.p}</div></div>`).join('')}</div></div>
      ${sec('Próximos desbloqueios')}
      <div class="card tight">${[[7, 'Missões semanais escolhidas pelo seu atributo mais fraco'], [10, 'Projeção de independência financeira'], [12, 'Crônica do mês: um resumo narrado do que você fez']].map(([n, t]) => { const ok = L.L >= n; return `<div class="row"><span class="badge-ic ${ok ? 'p' : ''}">${I(ok ? 'check' : 'lock', 20)}</span><div class="grow"><div class="ttl">Nível ${n}${ok ? ' · liberado' : ''}</div><div class="meta">${t}</div></div></div>`; }).join('')}</div>`,
  };
}

const weakest = () => D.ATTRS.reduce((a, x) => (x.v < a.v ? x : a));
function Ajustes() {
  const integ = [
    ['health', 'Apple Health', 'Atalho grátis “PainelSync”: sono, passos, treinos, VFC e frequência de repouso. Roda ao abrir o celular.', 'Conectado · há 2 h', 'pago'],
    ['calendar', 'Google Agenda', 'Leitura pelo endereço privado da agenda (iCal). Só leitura na fase 1.', 'Conectado', 'pago'],
    ['bank', 'Open Finance (Meu Pluggy)', 'Até 5 bancos, grátis para uso pessoal. Atualiza uma vez por dia e avisa o Painel quando muda.', 'Em configuração', 'agendado'],
    ['file', 'Google Drive', 'Pasta Painel/ com faturas, extratos e exames originais.', 'Conectado', 'pago'],
    ['note', 'Notion', 'Migração única do diário, treinos, medidas e exames atuais.', 'Fase 1', 'agendado'],
    ['pulse', 'Strava', 'Fora do plano: a API exige assinatura. Os treinos chegam pelo Apple Health.', 'Não usar', 'atrasado'],
  ];
  const N = [['briefing', 'Resumo do dia', '07:00'], ['treino', 'Lembrete de treino', '18:00'], ['dormir', 'Hora de desacelerar', '21:30'], ['contas', 'Contas no dia do vencimento', 'no resumo']];
  return {
    title: 'Integrações e ajustes',
    html: `${backbar('ficha', 'Ficha')}${hdr('Integrações e ajustes')}
      ${sec('Integrações')}<div class="card tight">${integ.map(([ic, n, d, st, cls]) => `<div class="row"><span class="badge-ic">${I(ic, 20)}</span><div class="grow"><div class="ttl">${n}</div><div class="meta">${d}</div></div><span class="chip st-${cls}">${st}</span></div>`).join('')}</div>
      ${sec('Notificações', '<span class="small muted">no máximo 3 por dia</span>')}
      <div class="card tight">${N.map(([k, n, h]) => `<div class="row"><div class="grow"><div class="ttl">${n}</div><div class="meta">${h}</div></div><button class="switch" role="switch" aria-checked="${S.notif[k]}" data-act="notif" data-arg="${k}" aria-label="${n}"></button></div>`).join('')}
        <div class="row"><div class="grow"><div class="ttl">Silêncio</div><div class="meta">22:00 às 07:00, sempre</div></div>${I('moon', 20, 'class="ic muted"')}</div></div>
      <div style="margin:10px 16px"><button class="btn line block" data-act="testNotif">${I('bell', 20)} Testar notificação</button><p class="xs muted" style="margin-top:6px">No iPhone, notificações funcionam depois de adicionar o Painel à Tela de Início.</p></div>
      ${sec('Aparência')}<div class="card"><div class="seg" role="group" aria-label="Tema">${[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, l]) => `<button aria-pressed="${S.theme === k}" data-act="theme" data-arg="${k}">${l}</button>`).join('')}</div></div>
      ${sec('Pausa')}<div class="card tight"><div class="row"><div class="grow"><div class="ttl">Modo Pausa</div><div class="meta">Doente ou viajando: congela a Chama e tira os dias das médias. Até 30 dias por vez.</div></div><button class="switch" role="switch" aria-checked="${S.pausa}" data-act="pausa" aria-label="Modo Pausa"></button></div></div>
      ${sec('Dados e privacidade')}<div class="card tight">
        <div class="row"><span class="badge-ic">${I('lock', 20)}</span><div class="grow"><div class="ttl">Seus dados</div><div class="meta">No aparelho (funciona offline) e no Supabase com acesso só seu. O app real fica num endereço próprio, não neste do GitHub.</div></div></div>
        <button class="row" data-act="toastInfo" data-arg="No app real: baixa um arquivo com tudo (JSON e CSV)."><span class="badge-ic">${I('upload', 20)}</span><div class="grow"><div class="ttl">Exportar tudo</div><div class="meta">JSON e CSV, quando quiser</div></div>${I('chevR', 20, 'class="ic muted"')}</button></div>
      ${sec('Wireframe')}<div class="card tight">
        <button class="row" data-act="map"><span class="badge-ic">${I('map', 20)}</span><div class="grow"><div class="ttl">Mapa de telas e estados</div></div>${I('chevR', 20, 'class="ic muted"')}</button>
        <a class="row" href="#/estados"><span class="badge-ic">${I('eye', 20)}</span><div class="grow"><div class="ttl">Estados vazio, offline e carregando</div></div>${I('chevR', 20, 'class="ic muted"')}</a>
        <button class="row" data-act="restartOnb"><span class="badge-ic">${I('sparkle', 20)}</span><div class="grow"><div class="ttl">Ver as boas-vindas de novo</div></div>${I('chevR', 20, 'class="ic muted"')}</button>
        <button class="row" data-act="resetDemo"><span class="badge-ic">${I('refresh', 20)}</span><div class="grow"><div class="ttl">Zerar a demonstração</div><div class="meta">Volta XP, check-in e marcações ao início</div></div></button></div>
      <p class="xs muted" style="margin:14px 20px">${D.REAL ? `Wireframe. Dinheiro usa os seus dados de ${dShort(realDate())}, guardados só neste aparelho; o resto é fictício.` : 'Wireframe com dados fictícios.'} Versão ${VERSION}.</p>`,
  };
}

function Estados() {
  return {
    title: 'Estados',
    html: `${backbar('ajustes', 'Ajustes')}${hdr('Estados das telas', 'Como o app se comporta sem dados, sem internet e carregando.')}
      ${sec('Carregando')}<div class="card" aria-busy="true"><div class="skel" style="width:40%"></div><div class="skel" style="height:30px;width:70%"></div><div class="skel"></div><div class="skel" style="width:85%"></div></div>
      <p class="small muted" style="margin:0 20px">Quase nunca aparece: os dados ficam no aparelho e a tela abre na hora. Só a primeira sincronização mostra isto.</p>
      ${sec('Sem internet')}<div class="netbar" style="margin-top:10px">${I('wifiOff', 20)}<span>Sem conexão. Tudo o que você registrar fica salvo no aparelho e sincroniza depois (3 pendentes).</span></div>
      ${sec('Primeiro uso')}<div class="card"><div class="empty"><span class="badge-ic">${I('wallet', 28)}</span><b>Nenhum lançamento ainda</b><p>Importe o primeiro extrato e o Painel monta seus gastos, contas recorrentes e saldo.</p><a class="btn" href="#/dinheiro/importar">Importar extrato</a></div></div>
      ${sec('Dados antigos')}<div class="card stale"><div class="row-flex"><b class="grow">PAT · Patrimônio <span class="muted num">64</span></b><span class="chip">${I('clock', 14)} névoa</span></div><p class="small muted" style="margin-top:4px">Sem importação há 21 dias. O valor fica cinza em vez de inventar uma mudança, e a Missão do dia vira “Importar extratos”.</p></div>
      ${sec('Integração com problema')}<div class="card"><div class="row-flex">${I('health', 22, 'class="ic" style="color:var(--warn)"')}<div class="grow"><b>Apple Health sem dados há 3 dias</b><div class="small muted">O Atalho roda quando o celular está desbloqueado. Abra o app Atalhos e confira a automação.</div></div></div><button class="btn ghost block" style="margin-top:12px" data-act="toastInfo" data-arg="No app real: passo a passo com prints da automação.">Ver como corrigir</button></div>`,
  };
}

function Onboarding() {
  const st = S.onbStep || 0, total = 4;
  const dots = `<p class="sr">Passo ${st + 1} de ${total}</p><div class="dots" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<i class="${i <= st ? 'on' : ''}"></i>`).join('')}</div>`;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  let body = '';
  if (st === 0) {
    body = `<div class="big-ic">${I('shield', 40)}</div><h1 tabindex="-1">Seu painel. Você é o personagem principal.</h1>
      <p class="lead">Saúde, dinheiro e agenda num lugar só. Cada coisa que você faz no dia vira XP e sobe seus atributos.</p>
      <label class="field"><span>Como quer ser chamado?</span><input class="input" value="${esc(D.PROFILE.nome)}" autocomplete="given-name"></label>
      <div class="field"><span id="onb-q1">O que importa mais agora? <span class="muted small">(pode marcar mais de um)</span></span><div class="picks" role="group" aria-labelledby="onb-q1">${['Treinar com constância', 'Dormir melhor', 'Organizar as finanças', 'Dar conta do dia'].map((t, i) => `<button type="button" class="pick" aria-pressed="${i < 2}" data-act="togglePick">${t}</button>`).join('')}</div></div>
      <div class="foot"><button class="btn block" data-act="onbNext">Começar</button></div>`;
  } else if (st === 1) {
    const q = [['watch', 'Usa Apple Watch?'], ['scale', 'Tem balança inteligente?'], ['ios', 'O iPhone está no iOS 18.4 ou mais novo?']];
    body = `<div class="big-ic">${I('phone', 40)}</div><h1 tabindex="-1">Seus aparelhos</h1><p class="lead">Isso decide o que entra sozinho e o que você confirma com um toque.</p>
      ${q.map(([k, t]) => `<div class="field"><span>${t}</span><div class="seg" role="group" aria-label="${t}"><button aria-pressed="${S.devices[k] === true}" data-act="dev" data-arg="${k}:1">Sim</button><button aria-pressed="${S.devices[k] === false}" data-act="dev" data-arg="${k}:0">Não</button><button aria-pressed="${S.devices[k] === undefined}" data-act="dev" data-arg="${k}:">Não sei</button></div></div>`).join('')}
      <div class="field"><span id="onb-q2">Quantos bancos e cartões você usa?</span><div class="picks" role="radiogroup" aria-labelledby="onb-q2">${['1–2', '3–5', '6+'].map((t, i) => `<button type="button" class="pick" role="radio" aria-checked="${i === 1}" tabindex="${i === 1 ? 0 : -1}" data-act="radio" data-arg="${t}">${t}</button>`).join('')}</div></div>
      <div class="foot"><button class="btn block" data-act="onbNext">Continuar</button><button class="btn ghost block" data-act="onbBack">Voltar</button></div>`;
  } else if (st === 2) {
    body = `<div class="big-ic">${I('squarePlus', 40)}</div><h1 tabindex="-1">Coloque na Tela de Início</h1><p class="lead">Assim o Painel abre como app, funciona sem internet e pode mandar lembretes.</p>
      ${standalone ? `<div class="card soft" style="margin:20px 0 0"><div class="row-flex">${I('check', 22)}<b>Já está instalado.</b></div></div>` : ios ? `<ol class="steps"><li><span class="n">1</span><span>Toque em ${I('share', 18, 'style="display:inline;vertical-align:-3px"')} <b>Compartilhar</b> no Safari</span></li><li><span class="n">2</span><span>Escolha <b>Adicionar à Tela de Início</b></span></li><li><span class="n">3</span><span>Abra o Painel pelo ícone novo</span></li></ol>` : `<ol class="steps"><li><span class="n">1</span><span>No iPhone, abra este endereço no <b>Safari</b></span></li><li><span class="n">2</span><span>Toque em ${I('share', 18, 'style="display:inline;vertical-align:-3px"')} <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b></span></li><li><span class="n">3</span><span>No computador, use o ícone de instalar na barra de endereço</span></li></ol>${deferredPrompt ? '<button class="btn line block" style="margin-top:12px" data-act="install">Instalar neste aparelho</button>' : ''}`}
      ${ios && !standalone ? `<p class="small muted" style="margin-top:14px">No iPhone os lembretes só podem ser ativados no app instalado. Depois de adicionar, abra o Painel pelo ícone novo: ele pergunta por lá.</p>` : ''}
      <div class="foot">${ios && !standalone ? `<button class="btn block" data-act="onbDone">Concluir e abrir pelo ícone</button><button class="btn ghost block" data-act="onbDone">Continuar no Safari por enquanto</button>` : `<button class="btn block" data-act="onbNext">${standalone ? 'Continuar' : 'Já fiz isso'}</button><button class="btn ghost block" data-act="onbNext">Depois</button>`}</div>`;
  } else {
    const canNotify = 'Notification' in window;
    body = `<div class="big-ic">${I('bell', 40)}</div><h1 tabindex="-1">Lembretes que ajudam</h1><p class="lead">No máximo 3 por dia e nunca entre 22h e 7h.</p>
      <ul class="steps"><li><span class="n">${I('sun', 18)}</span><span><b>07:00</b> resumo: treino, dieta, contas e Top 3</span></li><li><span class="n">${I('dumbbell', 18)}</span><span><b>18:00</b> lembrete do treino do dia</span></li><li><span class="n">${I('moon', 18)}</span><span><b>21:30</b> hora de desacelerar</span></li></ul>
      ${canNotify ? '' : '<p class="small muted" style="margin-top:14px">Este navegador não mostra notificações. No iPhone, elas funcionam no app instalado na Tela de Início.</p>'}
      <div class="foot">${canNotify ? `<button class="btn block" data-act="enableNotif">Ativar lembretes</button><button class="btn ghost block" data-act="onbDone">Agora não</button>` : '<button class="btn block" data-act="onbDone">Concluir</button>'}</div>`;
  }
  return { title: 'Boas-vindas', chrome: 'bare', html: `<div class="onb">${dots}${body}</div>` };
}

const ROUTES = {
  onboarding: Onboarding, hoje: Hoje, saude: Saude, 'saude/treino': Treino, 'saude/campanha': Campanha, 'saude/dieta': Dieta, 'saude/exames': Exames,
  dinheiro: Dinheiro, 'dinheiro/contas': Contas, 'dinheiro/cartoes': Cartoes, 'dinheiro/patrimonio': Patrimonio, 'dinheiro/importar': Importar,
  agenda: Agenda, ficha: Ficha, ajustes: Ajustes, estados: Estados,
};
const TAB_OF = (r) => (r.startsWith('saude') ? 'saude' : r.startsWith('dinheiro') ? 'dinheiro' : r === 'agenda' ? 'agenda' : ['ficha', 'ajustes', 'estados'].includes(r) ? 'ficha' : 'hoje');
const MAP = [
  ['Começo', [['onboarding', 'Boas-vindas e instalação', 'sparkle'], ['hoje', 'Hoje', 'sun']]],
  ['Saúde', [['saude', 'Visão geral', 'heart'], ['saude/treino', 'Registro de treino', 'dumbbell'], ['saude/campanha', 'Campanha de 24 semanas', 'target'], ['saude/dieta', 'Dieta do dia', 'utensils'], ['saude/exames', 'Exames e medidas', 'flask']]],
  ['Dinheiro', [['dinheiro', 'Visão geral', 'wallet'], ['dinheiro/contas', 'Contas a pagar', 'receipt'], ['dinheiro/cartoes', 'Cartões e faturas', 'card'], ['dinheiro/patrimonio', 'Patrimônio', 'pie'], ['dinheiro/importar', 'Importar extratos', 'upload']]],
  ['Assessor', [['agenda', 'Agenda e tarefas', 'calendar']]],
  ['Personagem', [['ficha', 'Ficha do personagem', 'shield'], ['ajustes', 'Integrações e ajustes', 'sliders'], ['estados', 'Estados das telas', 'eye']]],
];

const NOTES = {
  onboarding: ['Boas-vindas', 'Quatro passos curtos, todos puláveis.', ['Primeiro a promessa (“você é o personagem principal”), depois só o que muda o app: aparelhos, instalação e lembretes.', 'No iPhone, notificação só funciona com o app na Tela de Início. Por isso a instalação vem antes do pedido de permissão, e o pedido sai de um botão.', 'As respostas sobre Apple Watch, balança e iOS decidem o que entra sozinho e o que vira um toque de confirmação.', 'O nível 2 chega no primeiro dia (progresso dado de partida).'], 'M1'],
  hoje: ['Hoje', 'Abrir, ver o dia e registrar em menos de 30 segundos.', ['Check-in já preenchido (último peso, sono do Apple Health): na maioria dos dias é 1 toque em Salvar.', 'Três missões fixas, sempre as mesmas: Corpo, Combustível, Missão, cada uma com o XP à vista. A Missão é escolhida de manhã (a conta mais urgente ou o Top 1) e não muda durante o dia.', 'Energia (sono, VFC, FC de repouso) adapta o treino em vez de tirar XP: amarela reduz o esforço, vermelha troca por recuperação com o mesmo XP.', 'Consistência em 28 dias é o número principal; a Chama perdoa uma falta por semana (brasa) e congela no Modo Pausa.', 'Dinheiro resumido num número: quanto dá para gastar até o pagamento, com a data.', 'À noite aparece “Fechar o dia” com o plano de amanhã. Use o seletor de estados para ver manhã, feito e noite.'], 'M1'],
  saude: ['Saúde', 'Tendências, não números soltos.', ['Peso mostrado como tendência suavizada (média móvel exponencial). A variação diária não ganha cor de bom ou ruim.', 'Sono com alvo de 7 h e barras mais fracas nas noites abaixo do alvo.', 'O plano de 24 semanas do Notion vira a Campanha, com 4 atos de 6 semanas.', 'Fonte: Apple Health por um Atalho grátis que envia os dados ao abrir o celular. Strava fica fora (a API exige assinatura).'], 'M1 · automação no M3'],
  'saude/treino': ['Registro de treino', 'Feito para usar na academia, com uma mão.', ['Carga e repetições já preenchidas com a sugestão da progressão dupla: bateu o topo da faixa em todas as séries, sobe a carga.', 'Concluir a série dispara o descanso com contagem. Botões de 48 px, sem teclado na maior parte do tempo.', 'Modo foco: sem barra de abas, para não sair sem querer.', 'Recorde pessoal (carga estimada acima da sua melhor marca) dá +25 XP, uma vez por dia. XP de treino: uma sessão por dia, no valor do plano; reposição nunca vale mais que o planejado.'], 'M1'],
  'saude/campanha': ['Campanha de 24 semanas', 'O plano periodizado como uma temporada.', ['Ato I Fundação (adaptação), II Construção (hipertrofia), III Intensificação (força), IV Pico (condicionamento).', 'Cada ato termina com semana leve (“Acampamento”) e um Teste do Ato.', 'O BJJ aparece como desbloqueio com critérios claros, não como nível ou faixa.', 'Recomeço a cada 6 semanas: um novo ato é um bom momento para retomar se a semana foi ruim.'], 'M1'],
  'saude/dieta': ['Dieta do dia', 'Marcar o que comeu do plano, sem contar caloria por caloria.', ['O tipo de dia (forte, treino, leve) vem do plano de treino e muda as porções.', 'Proteína é a missão: a partir de 90% da meta já conta.', 'Comer abaixo da faixa não dá XP, para o jogo não incentivar comer menos.', 'Refeição fora do plano: busca na Tabela TACO (offline) e depois no Open Food Facts.'], 'M1'],
  'saude/exames': ['Exames e medidas', 'Informação, nunca diagnóstico.', ['Cada marcador mostra o valor dentro da faixa de referência do próprio laboratório.', 'Fora da faixa aparece em âmbar, sem vermelho e sem alarme.', 'O PDF original fica na pasta do Google Drive; o app guarda só o link e os valores.', 'Medidas são uma missão mensal, não diária.'], 'M3'],
  dinheiro: ['Dinheiro', 'Um número para o dia, detalhes quando quiser.', ['“Livre para gastar até o pagamento” = saldo − contas até o pagamento − fatura que vence antes. Toque para ver a conta.', 'Contas dos próximos 7 dias com o status sempre em texto, não só em cor.', 'Reserva de emergência como “Escudo da Reserva”: cada aporte reforça. Só existe um chefe por mês, na Ficha.', 'Gastos por categoria contra a média de 6 meses. Só pessoa física; as empresas ficam fora.'], 'M2'],
  'dinheiro/contas': ['Contas a pagar', 'Calendário e lista no mesmo lugar.', ['Pontos por dia no calendário, com legenda. Tocar no dia filtra a lista.', 'Quatro status: paga, agendada (débito automático ou Pix Automático), a vencer, atrasada.', 'Recorrentes detectadas no extrato (3 ocorrências, intervalo de ~30 dias, valor parecido) + DDA + cadastro manual.', 'Lembretes D-3 e D-0 dentro do resumo das 07:00, sem notificação extra.'], 'M1 manual · M2 automático'],
  'dinheiro/cartoes': ['Cartões e faturas', 'Fatura do jeito que o banco cobra.', ['Fechada, aberta e próxima numa tela só, com fechamento, vencimento e melhor dia de compra.', 'Parcelas “3/10” reconhecidas na importação e projetadas nos meses seguintes.', '“Comprometido” soma a fatura aberta e as parcelas futuras para mostrar o limite real.', 'Alerta de rotativo ou parcelamento de fatura (fase 2).'], 'M2'],
  'dinheiro/patrimonio': ['Patrimônio', 'Visão de contador, quando quiser.', ['Resumo com alocação e evolução de 12 meses, ou o balanço patrimonial completo (ativo, passivo, PL).', 'Foto mensal no dia 1º; a âncora oficial é o IRPF (bens e direitos em 31/12).', 'Veículo pela FIPE, FGTS pelo extrato, investimentos pela posição da B3 ou da corretora.', 'Projeção de independência financeira libera no nível 10.'], 'M2'],
  'dinheiro/importar': ['Importar extratos', 'O caminho principal até o Open Finance entrar.', ['Ordem de preferência: OFX, depois CSV ou XLSX, depois PDF.', 'O arquivo é lido no aparelho. Prévia com categorias por regra, duplicados marcados e conciliação de saldo antes de gravar.', 'Cada importação é um lote que pode ser desfeito.', 'Meu Pluggy (grátis, uso pessoal, 5 bancos) entra na fase 2, depois que a importação estiver sólida.'], 'M2'],
  agenda: ['Agenda e tarefas', 'O assessor: o que fazer e quando.', ['Captura rápida em português: “pagar IPVA dia 10 R$ 820 #financas” vira tarefa com data, área e valor (e sugere conta a pagar). Experimente digitar.', 'Só 3 prioridades por dia contam para o atributo Foco, para tarefas pequenas não inflarem o placar.', 'Linha do dia junta agenda do Google, treino do plano, contas e hora de dormir.', 'Notificações: no máximo 3 por dia, silêncio das 22h às 7h.'], 'M1'],
  ficha: ['Ficha do personagem', 'Você, em 6 atributos.', ['FOR força, VIG cardio, REC sono, NUT nutrição, PAT patrimônio, FOC organização. Todos de 0 a 100 numa janela de 28 dias, com nota de S a E.', 'Toque num atributo para ver como ele é calculado e o que faz subir.', 'Consistência em 28 dias vem antes da Chama. A Chama perdoa: 1 falta livre por semana (“brasa”) e Modo Pausa.', 'Sem punição: XP nunca cai, chefe que foge não tira nada, nada se compra.'], 'M1'],
  ajustes: ['Integrações e ajustes', 'O que conecta e como.', ['Apple Health por Atalho grátis (o app exportador pago é opcional, só depois de testar).', 'Google Agenda pelo endereço privado iCal (só leitura). Gravar blocos na agenda fica para depois.', 'Open Finance pelo Meu Pluggy na fase 2. Strava fora.', 'Teste de notificação real: funciona no navegador do computador e no iPhone com o app instalado.'], 'M1–M3'],
  estados: ['Estados', 'O app nunca fica em branco.', ['Offline: tudo grava no aparelho e sincroniza depois, com contagem de pendentes.', 'Primeiro uso: cada tela vazia diz qual é o próximo passo.', 'Dados antigos ficam cinza (“névoa”) em vez de inventar números.', 'Problema de integração aparece com o conserto, não só com o erro.'], 'M1'],
};

// ---------- Folhas (bottom sheets) ----------
// Chave estável de um controle, para devolver o foco depois que a tela é redesenhada.
function focusKey(el) {
  if (!el || el === document.body || !el.isConnected) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  const d = el.dataset || {}, arg = d.arg != null ? `[data-arg="${CSS.escape(d.arg)}"]` : '';
  if (d.act) return `[data-act="${d.act}"]${arg}`;
  if (d.in) return `[data-in="${d.in}"]${arg}`;
  if (el.matches?.('a[href]')) return `a[href="${CSS.escape(el.getAttribute('href'))}"]`;
  return null;
}
let lastFocus = null, lastFocusKey = null, lastFocusY = null;
const behindSheet = () => [main, document.querySelector('.tabbar'), document.getElementById('fab'), document.querySelector('.side'), document.querySelector('.notes')].filter(Boolean);
function openSheet(title, html, id = 'sheet', focusSel = null) {
  // Folhas encadeadas (Registrar → Gasto) guardam o controle que abriu a primeira.
  if (!sheetRoot.querySelector('.sheet:not([inert])')) {
    lastFocus = document.activeElement; lastFocusKey = focusKey(lastFocus);
    lastFocusY = lastFocus && lastFocus !== document.body ? lastFocus.getBoundingClientRect().top : null;
    // Uma entrada no histórico: o voltar do Android (ou o gesto) fecha a folha em vez de sair da tela.
    if (!history.state?.sheet) history.pushState({ sheet: id, i: hIdx + 1 }, '');
  }
  sheetRoot.innerHTML = `<div class="scrim" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="${id}-t" id="${id}"><div class="grab" aria-hidden="true"></div><div class="sh"><h2 id="${id}-t" tabindex="-1">${title}</h2><button class="iconbtn" data-act="closeSheet" aria-label="Fechar">${I('x')}</button></div>${html}</div>`;
  behindSheet().forEach((el) => { el.inert = true; el.setAttribute('aria-hidden', 'true'); });
  const sh = sheetRoot.querySelector('.sheet');
  const target = (focusSel && sh.querySelector(focusSel)) || sh.querySelector('[data-autofocus]') || sh.querySelector('h2');
  target.focus({ preventScroll: true });
  requestAnimationFrame(() => { sheetRoot.querySelector('.scrim')?.classList.add('open'); sh.classList.add('open'); });
}
function closeSheet(instant, restore = true) {
  if (!sheetRoot.querySelector('.sheet:not([inert])')) { if (instant) sheetRoot.innerHTML = ''; return; }
  behindSheet().forEach((el) => { el.inert = false; el.removeAttribute('aria-hidden'); });
  if (instant) sheetRoot.innerHTML = '';
  else {
    const old = [...sheetRoot.children];
    old.forEach((n) => n.classList.remove('open'));
    setTimeout(() => old.forEach((n) => n.remove()), 220);
    old.forEach((n) => { n.inert = true; });
  }
  const k = lastFocusKey, lf = lastFocus; lastFocus = null; lastFocusKey = null;
  if (history.state?.sheet && !closingByPop) { ignorePop = true; history.back(); }
  // Devolve o foco depois do redesenho (o controle original pode ter sido recriado).
  if (restore) { const y = lastFocusY; requestAnimationFrame(() => focusNear(k, lf, y)); }
  lastFocusY = null;
}
// Foco de volta para o controle que abriu (ou o mais próximo dele na tela), nunca para o topo da página.
const inView = (el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
function focusNear(k, lf, y, root = document) {
  const dist = (el) => Math.abs(el.getBoundingClientRect().top - (y ?? 0));
  let c = k ? [...root.querySelectorAll(k)].filter((el) => el.offsetParent !== null && !el.closest('[inert]')) : [];
  if (y != null) c.sort((a, b) => dist(a) - dist(b));
  let t = c.find(inView) || (lf && lf.isConnected && inView(lf) ? lf : null);
  if (!t && y != null) t = focusables(main).filter(inView).sort((a, b) => dist(a) - dist(b))[0];
  t = t || c[0] || main.querySelector('h1');
  t?.focus?.({ preventScroll: !!(t && inView(t)) });
}
let closingByPop = false, ignorePop = false;
let drag = null;
sheetRoot.addEventListener('pointerdown', (e) => {
  const sh = e.target.closest('.sheet'); if (!sh || !e.target.closest('.grab, .sh') || e.target.closest('button') || sh.scrollTop > 0) return;
  drag = { sh, y: e.clientY, t: Date.now(), dy: 0 }; sh.style.transition = 'none'; sh.setPointerCapture?.(e.pointerId);
});
sheetRoot.addEventListener('pointermove', (e) => { if (!drag) return; drag.dy = Math.max(0, e.clientY - drag.y); drag.sh.style.transform = `translateY(${drag.dy}px)`; });
const endDrag = () => { if (!drag) return; const { sh, dy, t } = drag; drag = null; sh.style.transition = ''; const fast = dy > 40 && dy / Math.max(1, Date.now() - t) > 0.6; sh.style.transform = ''; if (dy > 100 || fast) closeSheet(); };
sheetRoot.addEventListener('pointerup', endDrag); sheetRoot.addEventListener('pointercancel', endDrag);
let afterPop = null;
window.addEventListener('popstate', () => {
  if (afterPop) { const f = afterPop; afterPop = null; ignorePop = false; setTimeout(f, 0); return; }
  if (ignorePop) { ignorePop = false; return; }
  const st = history.state, open = !!sheetRoot.querySelector('.sheet:not([inert])');
  if (open && !st?.sheet) { closingByPop = true; closeSheet(); closingByPop = false; return; }
  // Entrada de uma folha que já foi fechada (avançar, recarregar): pula, para nenhum toque de voltar ficar morto.
  if (!open && st?.sheet) history.back();
});
// Sair de uma folha para outra tela: troca a entrada da folha pela nova tela (o voltar não reabre a folha).
function navFromSheet(href) {
  if (location.hash === href) { closeSheet(); return; } // já está nesta tela: só fecha a folha
  const fromSheet = !!history.state?.sheet; closingByPop = true; closeSheet(true, false); closingByPop = false; if (fromSheet) location.replace(href); else location.hash = href; }
const focusables = (root) => [...root.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.tabIndex !== -1 && x.offsetParent !== null);
document.addEventListener('keydown', (e) => {
  const sh = sheetRoot.querySelector('.sheet:not([inert])');
  if (!sh) return;
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
  if (e.key === 'Tab') {
    const f = focusables(sh); if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  }
});

function toast(html, kind = '', ms = 2600) {
  const t = document.createElement('div');
  t.className = `toast ${kind}`; t.innerHTML = html; t.setAttribute('role', 'status');
  toastRoot.appendChild(t);
  while (toastRoot.querySelectorAll('.toast:not(.keep)').length > 3) toastRoot.querySelector('.toast:not(.keep)').remove();
  if (ms) {
    let timer = null;
    const kill = () => { const had = t.contains(document.activeElement); t.classList.add('out'); setTimeout(() => { t.remove(); if (had) restFocus(); }, 260); };
    const arm = () => { clearTimeout(timer); timer = setTimeout(kill, ms); };
    t.addEventListener('focusin', () => clearTimeout(timer)); t.addEventListener('focusout', arm);
    t.addEventListener('pointerenter', () => clearTimeout(timer)); t.addEventListener('pointerleave', arm);
    arm();
  }
  return t;
}
// Foco num lugar seguro quando o controle focado some fora da tela (aviso que fecha, por exemplo).
function restFocus() {
  const sh = sheetRoot.querySelector('.sheet:not([inert])'); if (sh) { sh.querySelector('h2')?.focus({ preventScroll: true }); return; }
  const f = document.getElementById('fab'); (f && f.offsetParent !== null ? f : main.querySelector('h1'))?.focus({ preventScroll: true }); }
// Aviso de nova versão: faixa embaixo, acima do botão Registrar, com Atualizar e Agora não. Não cobre o cabeçalho.
function showUpdate() {
  if (document.getElementById('upd')) return;
  const d = document.createElement('div'); d.id = 'upd'; d.className = 'upd'; d.setAttribute('role', 'status');
  d.innerHTML = `${I('refresh', 18)}<span>Nova versão pronta.</span><button class="link" data-act="reload">Atualizar</button><button class="iconbtn" data-act="updClose" aria-label="Agora não">${I('x', 18)}</button>`;
  app.appendChild(d); app.classList.add('has-upd'); fitRestbar();
}

function mapHtml() {
  return `${demoControls()}${MAP.map(([g, items]) => `<h3 class="small muted" style="margin:16px 0 4px;text-transform:uppercase;letter-spacing:.06em">${g}</h3><div class="card tight" style="margin:0">${items.map(([r, l, ic]) => `<a class="row" href="#/${r}" data-act="closeSheetNav"><span class="badge-ic">${I(ic, 20)}</span><span class="ttl grow">${l}</span>${I('chevR', 20, 'class="ic muted"')}</a>`).join('')}</div>`).join('')}`;
}
function demoControls() {
  return `<div class="field" style="margin-top:6px"><span>Estado da tela Hoje</span><div class="seg" role="group" aria-label="Estado da tela Hoje">${[['auto', 'Real'], ['manha', 'Manhã'], ['feito', 'Feito'], ['noite', 'Noite']].map(([k, l]) => `<button aria-pressed="${S.demo === k}" data-act="demo" data-arg="${k}">${l}</button>`).join('')}</div></div>
    <div class="row" style="border:0;min-height:52px"><div class="grow"><div class="ttl">Simular sem internet</div></div><button class="switch" role="switch" aria-checked="${S.offline}" data-act="offline" aria-label="Simular sem internet"></button></div>
    <div class="seg" role="group" aria-label="Tema">${[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, l]) => `<button aria-pressed="${S.theme === k}" data-act="theme" data-arg="${k}">${l}</button>`).join('')}</div>`;
}

function safeSheet() {
  const M = money();
  openSheet(M.livre < 0 ? 'Falta para as contas' : 'Livre para gastar', `<p class="small muted" style="margin:0 0 8px">${D.REAL ? `Até o fim do mês, ${dShort(M.payday)} (${rel(M.payday)}). Com os dados reais a conta fecha no último dia do mês.` : `Até o pagamento em ${dShort(M.payday)} (${rel(M.payday)}).`}</p>
    <table class="bp"><tr><td>Saldo em conta</td><td>${brl(M.saldo)}</td></tr>
    <tr><td>− Contas até ${dShort(M.payday)} (${M.due.length}${D.REAL ? '' : ', com o aporte da reserva'})<div class="xs muted">${M.due.map((b) => esc(b.n.split(' · ')[0])).join(', ') || 'nenhuma'}</div></td><td>${brl(-M.contas)}</td></tr>
    <tr><td>− Fatura do ${D.CARDS[0].n}${M.faturaAntes ? `, vence ${dShort(M.fb.due)}` : M.fb.pago ? ', já paga' : `: vence ${dShort(M.fb.due)}, depois do pagamento`}</td><td>${brl(-M.faturaAntes)}</td></tr>
    <tr class="tot"><td>${M.livre < 0 ? 'Falta' : 'Livre'}</td><td>${brl(M.livre)}</td></tr></table>
    <p class="small muted" style="margin-top:12px">Pagar uma conta não muda esse número: sai do saldo e da lista ao mesmo tempo. ${M.fb.pago ? 'A fatura aberta já foi paga: compras novas no cartão vão para a próxima, que vence depois do pagamento, e não mexem neste número.' : 'Gastar no cartão reduz, porque aumenta a fatura que vence antes do pagamento.'} Use “Registrar → Gasto” para ver.</p>`);
}
function energiaSheet() {
  const h = S.checkin ? S.checkin.s : S.sleep, E = energia(h), Z = zoneOf(E);
  openSheet('Energia', `<div class="row-flex">${ring(E, Z, 72)}<div><b class="zpill zone-${Z}">${ZNAME[Z]}</b><p class="small muted">Calculada de manhã. Nunca aumenta nem diminui XP.</p></div></div>
    <table class="bp" style="margin-top:12px"><tr><td>Sono da noite (55%)</td><td>${h >= 9 ? '9 h+' : h < 5 ? '< 5 h' : h + ' h'}</td></tr><tr><td>Variabilidade cardíaca vs sua média de 30 dias (25%)</td><td>normal</td></tr><tr><td>FC de repouso vs sua média de 30 dias (20%)</td><td>normal</td></tr></table>
    <div class="card tight" style="margin:14px 0 0">${[['verde', '67 ou mais', 'Treino planejado. Três dias verdes seguidos sugerem tentar +2,5 kg.'], ['amarelo', '34 a 66', 'Mesmo treino, esforço máximo 8 e uma série a menos.'], ['vermelho', '33 ou menos', 'Troca por recuperação, com o mesmo XP. Dois dias seguidos sugerem semana leve.']].map(([z, r, t]) => `<div class="row zone-${z}"><span class="zpill" style="width:86px">${ZNAME[z]}</span><div class="grow"><div class="ttl small">${r}</div><div class="meta">${t}</div></div></div>`).join('')}</div>
    <p class="xs muted" style="margin-top:10px">Na demonstração, mude as horas de sono no check-in para ver a zona mudar.</p>`);
}
function attrSheet(k) {
  const a = D.ATTRS.find((x) => x.k === k);
  openSheet(`${a.k} · ${a.nome}`, `<div style="--c:${a.cor}"><div class="row-flex"><div class="big" style="color:var(--c)">${a.v}</div><span class="rank" style="width:32px;height:32px;font-size:15px">${rank(a.v)}</span><span class="small muted right">${a.d >= 0 ? '+' : '−'}${Math.abs(a.d)} em 7 dias</span></div><div style="margin-top:8px">${bar(a.v, a.cor, 'lg')}</div></div>
    <h3 class="small muted" style="margin:16px 0 4px;text-transform:uppercase;letter-spacing:.06em">O que mede</h3><p>${a.mede}</p>
    <h3 class="small muted" style="margin:16px 0 4px;text-transform:uppercase;letter-spacing:.06em">Como subir</h3><ul style="padding-left:20px;margin:0">${a.subir.map((s) => `<li style="margin:4px 0">${s}</li>`).join('')}</ul>
    <p class="small muted" style="margin-top:14px">Fonte: ${a.fonte}. Notas: S ≥ 90 · A ≥ 75 · B ≥ 60 · C ≥ 40 · D ≥ 20.</p>`);
}
function billSheet(id) {
  const b = bills().find((x) => x.id === id); if (!b) return;
  openSheet(esc(b.n), `<div class="big">${brl(b.v)}</div><div class="row-flex" style="margin-top:6px">${stChip(b.st)}<span class="small muted">${relDue(b)}</span></div>
    <table class="bp" style="margin-top:12px"><tr><td>Forma de pagamento</td><td>${b.met}</td></tr><tr><td>Categoria</td><td>${b.cat}</td></tr><tr><td>Lembretes</td><td>3 dias antes e no dia</td></tr></table>
    ${b.pago ? `<p class="small muted" style="margin-top:14px">${b.met === 'Cartão' ? `Cobrada no ${D.CARDS[0].n}: entra na fatura, que é a conta a pagar.` : 'Paga. O lançamento do extrato é ligado a esta conta automaticamente.'}</p>${S.paid[b.id] ? `<div class="btnrow"><button class="btn line" data-act="unpayBill" data-arg="${b.id}">${I('refresh', 20)} Desfazer pagamento</button></div>` : ''}` : `<div class="btnrow"><button class="btn" data-act="payBill" data-arg="${b.id}" data-autofocus>${I('check', 20)} Marcar como paga</button></div><p class="xs muted" style="margin-top:8px">${b.st === 'atrasado' ? 'Venceu, então não dá os +15 XP de conta em dia. Marcar agora tira a conta da lista e do resumo de amanhã.' : 'Paga até o vencimento: +15 XP e o atributo Foco sobe.'}${b.id === missao() && !S.quests.missao ? ' É a Missão de hoje: +20 XP.' : ''}</p>`}`);
}
function quickAdd() {
  const items = [['openCheckin', 'Check-in', 'scale'], ['nav:saude/treino', 'Treino', 'dumbbell'], ['nav:saude/dieta', 'Refeição', 'utensils'], ['expense', 'Gasto', 'wallet'], ['nav:dinheiro/contas', 'Conta a pagar', 'receipt'], ['task', 'Tarefa ou nota', 'note'], ['nav:saude/exames', 'Medidas', 'target'], ['nav:dinheiro/importar', 'Extrato', 'upload']];
  openSheet('Registrar', `<div class="qa">${items.map(([a, l, ic]) => `<button data-act="qa" data-arg="${a}">${I(ic)}<span>${l}</span></button>`).join('')}</div><p class="xs muted" style="margin-top:12px">Também pela Siri e pelo botão de Ação do iPhone, com o Atalho “Anotar no Painel”.</p>`, 'qa');
}
const radios = (label, id, opts, sel, labels = {}) => `<div class="field"><span id="${id}">${label}</span><div class="picks" role="radiogroup" aria-labelledby="${id}">${opts.map((c) => `<button type="button" class="pick" role="radio" aria-checked="${c === sel}" tabindex="${c === sel ? 0 : -1}" data-act="radio" data-arg="${esc(c)}" data-val="${esc(c)}">${esc(labels[c] || c)}</button>`).join('')}</div></div>`;
function expenseSheet() {
  const cats = ['Mercado', 'Alimentação fora', 'Transporte', 'Saúde', 'Lazer', 'Compras'];
  openSheet('Gasto rápido', `<label class="field"><span>Valor</span><input class="input" id="ex-v" inputmode="decimal" placeholder="R$ 0,00" style="font-size:24px;font-weight:750" data-autofocus value="${esc(S.draftExpense)}"></label>
    ${radios('Categoria', 'ex-cat', cats, 'Mercado')}
    ${radios('Pago com', 'ex-met', ['Cartão Alfa', 'Pix', 'Dinheiro'], 'Cartão Alfa', { 'Cartão Alfa': D.CARDS[0].n })}
    <button class="btn block" style="margin-top:16px" data-act="saveExpense">Salvar gasto</button><p class="xs muted" style="margin-top:8px">${S.paid.fatura ? 'No Cartão Alfa vai para a próxima fatura (a aberta já foi paga) e não muda o “livre para gastar”. Pix e dinheiro saem do saldo na hora.' : 'Entra na hora no “livre para gastar”.'} Quando o extrato chegar, o lançamento é ligado a este gasto e não duplica.</p>`, 'ex');
}
function chamaSheet() {
  const sk = streakNow();
  openSheet('Chama', `<div class="row-flex">${I('flame', 28, 'class="ic flame"')}<div class="big">${sk} dias</div></div>
    <p class="small" style="margin-top:8px">Dias seguidos com check-in. Recorde: ${Math.max(S.best, sk)} dias.</p>
    <table class="bp" style="margin-top:12px"><tr><td>Brasa (1 falta livre a cada 7 dias)</td><td>${brasaFree() ? 'disponível' : `volta em ${dShort(D.addDays(dayAt(S.brasaAt), 7))}`}</td></tr><tr><td>Modo Pausa (doente ou viajando)</td><td>${S.pausa ? 'ligado' : 'desligado'}</td></tr></table>
    <p class="small muted" style="margin-top:12px">Se você faltar e tiver brasa, a Chama não apaga: fica âmbar no dia seguinte. Sem brasa, ela recomeça do zero, mas XP, nível e atributos nunca caem. A consistência em 28 dias é o número principal porque um dia ruim mexe pouco nela.</p>
    <div class="btnrow"><a class="btn line" href="#/ajustes" data-act="closeSheetNav">${I('pause', 20)} Modo Pausa em Ajustes</a></div>`);
}
function confirmSheet(title, text, yes, yesArg, no = 'Continuar') {
  openSheet(title, `<p class="small">${text}</p><div class="btnrow"><button class="btn" data-act="${yes}" data-arg="${yesArg}">Concluir assim mesmo</button><button class="btn ghost" data-act="closeSheet" data-autofocus>${no}</button></div>`, 'cf');
}
function importCatSheet() {
  const opts = ['Moradia', 'Transporte', 'Impostos e taxas', 'Saúde', 'Outros'];
  openSheet('Categoria do lançamento', `<p class="small muted" style="margin:0">PAGTO ELETRON TRIBUTO · ${brl(96.10)}</p>${radios('Categoria', 'imp-cat', opts, S.importCat || 'Moradia')}<button class="btn block" style="margin-top:12px" data-act="importCatSave">Usar esta categoria</button>`, 'ic');
}

// ---------- Ações ----------
const A = {
  closeSheet: () => closeSheet(),
  closeSheetNav: (_, el, e) => { const href = el?.getAttribute?.('href'); if (href) { e.preventDefault(); navFromSheet(href); } else closeSheet(true, false); },
  map: () => openSheet('Mapa do wireframe', mapHtml(), 'map'),
  back: (_, el, e) => { e.preventDefault(); history.back(); },
  quest: (k) => {
    if (k === 'missao') {
      // Conta: pagar ou desfazer sempre pela folha da conta, com o mesmo XP de qualquer lugar.
      const ref = missao();
      if (ref === 't1') { A.top3('t1'); return; }
      billSheet(ref); return;
    }
    if (k === 'corpo' && !S.quests.corpo) S.corpoKey = corpoDefault();
    if (k === 'comb') S.combByMeals = false;
    setQuest(k, !S.quests[k]); render(true);
  },
  wstep: (d) => { const el = document.getElementById('ci-w'); const v = parseFloat((el.value || '0').replace(',', '.')) + parseFloat(d); el.value = n1(Math.max(30, Math.min(250, v))); },
  sleep: (v, el) => {
    S.sleep = parseFloat(v);
    el.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]').forEach((b) => { const on = b === el; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
    if (S.checkin) S.checkin.s = S.sleep;
    save(); if (S.checkin) { render(true); setTimeout(checkBoss, 600); }
  },
  saveCheckin: () => {
    const el = document.getElementById('ci-w'); const w = parseFloat((el?.value || '').replace(',', '.'));
    if (!(w > 30 && w < 250)) { toast('Confira o peso: use algo como 86,4.'); el?.focus(); return; }
    const first = !S.checkin; S.demo = 'auto'; S.checkin = { w, s: S.sleep }; S.weight = w;
    // XP fixo: dormir pouco não tira XP (o sono alimenta Recuperação e o chefe).
    if (first) addXP(20, S.sleep >= 7 ? 'Check-in feito · golpe no chefe' : 'Check-in feito'); else { touch(); toast('Check-in atualizado'); }
    setTimeout(checkBoss, 900);
    lastFocusKey = '[data-act="openCheckin"]';
    closeSheet(true); render(true, '[data-act="openCheckin"]');
  },
  openCheckin: () => {
    // No Hoje antes do check-in o formulário já está na tela: vai até ele em vez de abrir uma cópia.
    const inline = main.querySelector('#ci-w');
    if (inline && current() === 'hoje') { closingByPop = false; closeSheet(true, false); inline.scrollIntoView({ block: 'center' }); inline.focus({ preventScroll: true }); return; }
    openSheet('Check-in', `${checkinForm()}<button class="btn block" style="margin-top:16px" data-act="saveCheckin">Salvar check-in</button>`, 'ci');
  },
  closeDay: () => { S.closed = true; save(); toast(`${I('moon', 18)} Dia fechado. Amanhã, resumo às 07:00.`); render(true, '#ev-t'); },
  demo: (k) => { S.demo = k; save(); renderChrome(); if (current() === 'hoje') { render(true); refreshSheet(); } else if (sheetRoot.querySelector('.sheet:not([inert])')) navFromSheet('#/hoje'); else go('#/hoje'); },
  offline: () => { S.offline = !S.offline; if (!S.offline && S.pending) { toast(`${I('cloudCheck', 18)} Sincronizado: ${S.pending} registro${S.pending > 1 ? 's' : ''}`); S.pending = 0; } save(); render(true); refreshSheet(); renderChrome(); },
  theme: (k) => { S.theme = k; save(); applyTheme(); render(true); refreshSheet(); renderChrome(); },
  energia: () => energiaSheet(),
  safe: () => safeSheet(),
  attr: (k) => attrSheet(k),
  bill: (id) => billSheet(id),
  chama: () => chamaSheet(),
  payBill: (id) => {
    const b = bills().find((x) => x.id === id); if (!b || b.pago) return;
    S.paid[id] = true; S.paidAmt[id] = b.v;
    lastFocusKey = focusKey(lastFocus) || lastFocusKey;
    closeSheet(true);
    if (b.st !== 'atrasado') addXP(15, 'Conta paga em dia'); else { touch(); toast(`${I('check', 18)} Conta marcada como paga`); }
    if (id === missao()) setQuest('missao', true);
    render(true);
  },
  unpayBill: (id) => {
    if (!S.paid[id]) return;
    delete S.paid[id]; delete S.paidAmt[id];
    if (id === 'fatura') S.expenses.forEach((x) => { if (x.fat === 'proxima') x.fat = 'aberta'; }); // sem pagamento, voltam para a fatura aberta
    const b = bills().find((x) => x.id === id);
    if (b && b.st !== 'atrasado') S.xp = Math.max(0, S.xp - 15);
    if (id === missao()) setQuest('missao', false);
    touch(); closeSheet(true); toast('Pagamento desfeito'); render(true);
  },
  openTreino: (k, el) => { S.wSel = k || null; save(); if (el.tagName !== 'A') location.hash = '#/saude/treino'; else if (current() === 'saude/treino') render(false); },
  wsel: (k) => { S.wSel = k; save(); render(false); },
  set: (k, el) => {
    const st = S.sets[k] || {}; st.ok = !st.ok;
    const row = el.closest('tr'); const ins = row.querySelectorAll('input');
    st.kg = parseFloat(ins[0].value.replace(',', '.')) || 0; st.reps = parseInt(ins[1].value, 10) || 0;
    S.sets[k] = st; if (!S.wStart) S.wStart = Date.now();
    const sec = parseInt(el.dataset.rest, 10);
    unlockAudio();
    if (st.ok) { S.rest = { end: Date.now() + sec * 1000 }; announce(`Série concluída. Descanso de ${sec >= 120 ? sec / 60 + ' minutos' : sec + ' segundos'} iniciado.`); } else S.rest = null;
    touch(); render(true);
  },
  skipRest: () => { S.rest = null; save(); render(true, '.restbar .btn'); },
  startWorkout: () => { S.wStart = Date.now(); save(); toast(`${I('timer', 18)} Cronômetro iniciado`); render(true); },
  finishWorkout: (k, el, e, force) => {
    const sel = k, { key } = todaySession();
    const Z = zoneOf(energia(S.checkin ? S.checkin.s : S.sleep)), cut = Z === 'amarelo' || Z === 'vermelho';
    if (['A', 'B', 'C'].includes(sel) && !force && setsDone(sel, cut) === 0) {
      confirmSheet('Concluir sem séries marcadas?', 'Nenhuma série foi marcada como feita. Se você treinou e só não marcou, pode concluir assim mesmo: o treino conta como feito, sem recorde.', 'finishForce', sel, 'Continuar treino');
      return;
    }
    const fromSheet = !!history.state?.sheet; closingByPop = true; closeSheet(true, false); closingByPop = false;
    // XP do plano de hoje: reposição nunca vale mais que o planejado, e só uma sessão por dia dá XP.
    let pr = false;
    if (['A', 'B', 'C'].includes(sel)) {
      D.WORKOUTS[sel].forEach((ex) => ex.reps.forEach((_, i) => {
        const st = S.sets[`${sel}-${ex.id}-${i}`];
        if (st && st.ok && st.reps >= ex.rr[0] && e1rm(st.kg, st.reps) > best1rm(ex) + 0.01) { S.best1rm[ex.id] = e1rm(st.kg, st.reps); pr = true; }
      }));
      Object.keys(S.sets).forEach((x) => { if (x.startsWith(sel + '-')) delete S.sets[x]; });
    }
    S.rest = null; S.wStart = null;
    const label = sel === 'REST' ? 'Mobilidade feita' : sel === 'REC' ? 'Recuperação feita' : `${D.SESSION[sel].nome} concluído${sel !== key ? ' (reposição)' : ''}`;
    if (!S.quests.corpo) {
      S.corpoKey = sel; setQuest('corpo', true, label);
      if (pr && !S.prToday) { S.prToday = true; setTimeout(() => addXP(25, 'Recorde pessoal'), 800); }
    } else {
      if (['REC', 'REST'].includes(S.corpoKey) && !['REC', 'REST'].includes(sel)) S.corpoKey = sel; // a sessão feita conta na semana
      toast(`${label}. O XP de treino é de uma sessão por dia${pr ? '; o recorde fica salvo na ficha' : ''}.`, '', 3600);
    }
    // Volta para o Hoje sem deixar o treino concluído no caminho do “voltar”.
    save();
    // Saindo de uma folha: primeiro desfaz a entrada da folha, depois troca o treino pelo Hoje.
    if (fromSheet) { afterPop = () => go('#/hoje', true); history.back(); } else go('#/hoje', true);
  },
  finishForce: (k) => A.finishWorkout(k, null, null, true),
  daytype: (k) => { S.dayType = k; save(); render(true); },
  meal: (id) => {
    S.meals[id] = !S.meals[id];
    const p = D.MEALS.filter((m) => S.meals[m.id]).reduce((a, m) => a + m.p, 0);
    // +3 XP por refeição só na primeira marcação do dia: desmarcar e marcar de novo não paga outra vez.
    if (S.meals[id] && !S.mealXp[id]) { S.mealXp[id] = true; addXP(3, 'Refeição registrada'); } else touch();
    if (p >= D.PROT.conta && !S.quests.comb) setQuest('comb', true);
    else if (p < D.PROT.conta && S.quests.comb && S.combByMeals) setQuest('comb', false);
    if (S.quests.comb && p >= D.PROT.conta) S.combByMeals = true;
    render(true);
  },
  card: (i) => { S.card = +i; save(); render(true); },
  fat: (k) => { S.fat = k; save(); render(true); },
  bp: (k) => { S.bp = k; save(); render(true); },
  calnav: (d) => { S.calOff += +d; S.calSel = null; save(); render(true); },
  calsel: (id) => { S.calSel = S.calSel === id ? null : id; save(); render(true); },
  billf: (k) => { S.billFilter = k; save(); render(true); },
  importNext: () => {
    S.importStep = Math.min(3, S.importStep + 1); save();
    if (S.importStep === 3) {
      // +50 uma vez por mês: importar de novo no mesmo mês atualiza, mas não paga outra vez.
      const first = !S.importAt || S.importAt.slice(0, 7) !== monthKey(diaNow());
      S.importAt = D.iso(diaNow()); S.importXp = first;
      if (first) addXP(50, 'Importação do mês'); else { touch(); toast(`${I('check', 18)} Importação concluída. O bônus do mês já foi.`); }
    }
    render(false, '#imp-step');
  },
  importBack: () => { S.importStep = Math.max(0, S.importStep - 1); save(); render(false, '#imp-step'); },
  importReset: () => { S.importStep = 0; save(); render(false, '#imp-step'); },
  importUndo: () => { if (S.importXp) { S.importXp = false; S.xp = Math.max(0, S.xp - 50); S.importAt = null; } S.importStep = 0; S.importCat = null; touch(); toast(`${I('refresh', 18)} Importação desfeita: 47 lançamentos removidos.`); render(false, '#imp-step'); },
  importCatSheet: () => importCatSheet(),
  importCatSave: () => { const v = sheetRoot.querySelector('[aria-labelledby="imp-cat"] [aria-checked="true"]'); S.importCat = v ? v.dataset.val : null; save(); closeSheet(true); render(true); },
  importRule: () => { S.importRule = !S.importRule; save(); render(true); },
  agview: (k) => { S.agView = k; save(); render(true); },
  top3: (id) => {
    const on = !S.top3[id]; S.top3[id] = on;
    // Top 1 e Missão são a mesma tarefa: paga uma vez só, os +20 da Missão.
    if (id === 't1' && missao() === 't1') setQuest('missao', on);
    else if (on) addXP(10, 'Top 3: um a menos'); else { S.xp = Math.max(0, S.xp - 10); touch(); }
    render(true);
  },
  addInbox: () => {
    const el = document.getElementById('inbox'); const v = el.value.trim(); if (!v) { el.focus(); return; }
    const p = parseInbox(v); S.inbox.unshift({ t: p.title || v, chips: p.chips.map((c) => c.t) }); S.inboxDraft = ''; touch();
    toast(p.amount ? `${I('receipt', 18)} Anotado. Tem valor: no app real vira sugestão de conta a pagar.` : `${I('inbox', 18)} Anotado na caixa de entrada`);
    render(true, '#inbox');
  },
  doneInbox: (i) => {
    S.inbox.splice(+i, 1);
    // Tarefas pequenas valem pouco e têm teto, para não inflar o placar (o Top 3 é o que conta).
    if (S.inboxXp < 5) { S.inboxXp += 1; addXP(2, 'Tarefa concluída'); } else { touch(); toast(`${I('check', 18)} Tarefa concluída`); }
    render(true, S.inbox.length ? `[data-act="doneInbox"][data-arg="${Math.min(+i, S.inbox.length - 1)}"]` : '#inbox');
  },
  notif: (k) => { S.notif[k] = !S.notif[k]; save(); render(true); },
  pausa: () => { S.pausa = !S.pausa; save(); toast(S.pausa ? `${I('pause', 18)} Modo Pausa ligado. A Chama fica congelada e os dias saem das médias.` : 'Modo Pausa desligado'); render(true); },
  testNotif: () => testNotif(),
  enableNotif: async () => { await testNotif(true); A.onbDone(); },
  restartOnb: () => { S.onbStep = 0; save(); location.hash = '#/onboarding'; },
  pendentes: () => pendentesSheet(),
  realClear: () => { if (!confirm('Apagar os seus dados reais deste aparelho? O arquivo no seu computador continua lá.')) return; try { localStorage.removeItem(REALK); } catch { /* nada a apagar */ } S.paid = {}; S.paidAmt = {}; S.expenses = []; save(); location.reload(); },
  resetDemo: () => { const keep = { theme: S.theme, onboarded: true }; S = Object.assign(defaults(), keep, { day: D.iso(diaNow()) }); S.hist = seedHist(S); bossMonth(S); save(); toast('Demonstração zerada'); if (current() !== 'hoje') go('#/hoje', true); else render(false); renderChrome(); },
  onbNext: () => { S.onbStep = Math.min(3, (S.onbStep || 0) + 1); save(); render(false, 'h1'); },
  onbBack: () => { S.onbStep = Math.max(0, (S.onbStep || 0) - 1); save(); render(false, 'h1'); },
  onbDone: () => { const first = !S.onboarded; S.onboarded = true; S.onbStep = 0; save(); try { navigator.storage?.persist?.(); } catch { /* opcional */ } go('#/hoje', true); if (first) setTimeout(() => toast(`${I('star')} <span>Tudo pronto. A demonstração simula duas semanas de uso.</span>`, 'lvl', 3600), 400); },
  dev: (a) => { const [k, v] = a.split(':'); if (v === '') delete S.devices[k]; else S.devices[k] = v === '1'; save(); render(true); },
  install: async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; render(true); },
  togglePick: (_, el) => el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') !== 'true'),
  radio: (_, el) => el.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]').forEach((b) => { const on = b === el; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; }),
  qa: (a) => { if (a.startsWith('nav:')) navFromSheet('#/' + a.slice(4)); else if (a === 'openCheckin') A.openCheckin(); else if (a === 'expense') expenseSheet(); else if (a === 'task') { navFromSheet('#/agenda'); setTimeout(() => document.getElementById('inbox')?.focus(), 80); } },
  saveExpense: () => {
    const el = document.getElementById('ex-v'); const v = parseMoney(el.value);
    if (!(v > 0 && v < 100000)) { toast('Digite o valor, por exemplo 45,90'); el.focus(); return; }
    const pick = (id) => sheetRoot.querySelector(`[aria-labelledby="${id}"] [aria-checked="true"]`)?.dataset.val;
    const x = { id: 'x' + Date.now().toString(36), v: Math.round(v * 100) / 100, cat: pick('ex-cat') || 'Mercado', met: pick('ex-met') || 'Cartão Alfa', d: D.iso(diaNow()) };
    if (x.met === 'Cartão Alfa') x.fat = S.paid.fatura ? 'proxima' : 'aberta'; // fatura já paga: o gasto novo vai para a próxima
    S.expenses.push(x); S.draftExpense = ''; touch(); closeSheet(true);
    toast(`${I('check', 18)} <span>${brl(x.v)} em ${esc(x.cat.toLowerCase())}. Livre: ${brl0(money().livre)}.</span><button class="link" data-act="delExpense" data-arg="${x.id}">Desfazer</button>`, '', 6000);
    render(true);
  },
  delExpense: (id, el) => {
    const i = S.expenses.findIndex((x) => x.id === id); if (i < 0) return;
    const fromToast = !!el?.closest('.toast');
    const y = S.expenses[i];
    if (y.met === 'Cartão Alfa' && (y.fat || 'aberta') === 'aberta' && S.paid.fatura) { toast('Esse gasto está na fatura que você já marcou como paga. Para apagar, desfaça o pagamento da fatura primeiro.', '', 4200); return; }
    const [x] = S.expenses.splice(i, 1); touch();
    if (fromToast) el.closest('.toast').remove();
    toast(`${I('refresh', 18)} Gasto de ${brl(x.v)} apagado. Livre: ${brl0(money().livre)}.`);
    render(true);
    if (fromToast) restFocus();
  },
  toastInfo: (msg) => toast(esc(msg), '', 3600),
  reload: () => location.reload(),
  updClose: () => { document.getElementById('upd')?.remove(); app.classList.remove('has-upd'); fitRestbar(); restFocus(); },
  voltar: (r, el, e) => { e?.preventDefault(); if (navStack[hIdx - 1]) history.back(); else go('#/' + r, true); },
  goto: (r, el, e) => { e?.preventDefault(); go('#/' + r, true); }, // “Voltar”/“Ver Dinheiro” de telas de fim: não deixam a tela no caminho do voltar
  syncInfo: () => toast((S.offline || !navigator.onLine) ? `${I('wifiOff', 18)} Sem conexão. ${S.pending} registro${S.pending === 1 ? '' : 's'} esperando para sincronizar.` : `${I('cloudCheck', 18)} Tudo sincronizado. Último envio agora há pouco.`, '', 3200),
};

// Região viva única (fora das telas) para avisos pontuais ao leitor de tela.
const liveRegion = Object.assign(document.createElement('div'), { className: 'sr' });
liveRegion.setAttribute('aria-live', 'polite'); document.body.appendChild(liveRegion);
function announce(msg) { liveRegion.textContent = ''; setTimeout(() => { liveRegion.textContent = msg; }, 60); }

async function testNotif(fromOnb) {
  if (!('Notification' in window)) { toast('Este navegador não mostra notificações. No iPhone, instale na Tela de Início primeiro.', '', 4200); return; }
  let p = Notification.permission;
  if (p === 'default') { try { p = await Notification.requestPermission(); } catch { p = 'denied'; } }
  if (p !== 'granted') { toast(fromOnb ? 'Tudo bem. Dá para ativar depois em Ajustes.' : 'Permissão negada. Ative nas configurações do navegador.', '', 3600); return; }
  const opts = { body: 'Cardio zona 2 às 18:30 · 2.150 kcal · 1 conta vence amanhã', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'resumo' };
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) await reg.showNotification('Bom dia, Yuri', opts); else new Notification('Bom dia, Yuri', opts); toast(`${I('bell', 18)} Notificação enviada`); } catch { toast('Não foi possível mostrar a notificação aqui.'); }
}

function parseInbox(txt) {
  // Limites de palavra que entendem acentos (o \b do JavaScript não entende "amanhã" ou "às").
  const W = (src) => new RegExp(`(?<![\\p{L}\\d])(?:${src})(?![\\p{L}\\d])`, 'iu');
  const chips = []; let t = txt; let amount = null; let date = null;
  const take = (m) => { t = t.replace(m[0], ' '); };
  const am = t.match(/R\$\s?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i);
  if (am) { amount = parseFloat(am[1].replace(/\./g, '').replace(',', '.')); chips.push({ t: brl(amount), k: 'money' }); take(am); }
  [...t.matchAll(/#([\p{L}\d_]+)/gu)].forEach((m) => { chips.push({ t: '#' + m[1], k: 'tag' }); take(m); });
  const pr = t.match(/!([1-3])/); if (pr) { chips.push({ t: `prioridade ${pr[1]}`, k: 'pr' }); take(pr); }
  const now = diaNow();
  const rec = t.match(W('tod[oa]s?\\s+(?:as\\s+|os\\s+)?(?:dia\\s+\\d{1,2}|segundas?|terças?|quartas?|quintas?|sextas?|sábados?|domingos?|dias|m[eê]s)'));
  if (rec) { chips.push({ t: `repete: ${rec[0].toLowerCase()}`, k: 'rec' }); take(rec); }
  const dm = t.match(W('hoje|depois de amanh[ãa]|amanh[ãa]'));
  const dmy = t.match(W('(\\d{1,2})/(\\d{1,2})'));
  const dd = t.match(W('dia\\s+(\\d{1,2})'));
  const dw = t.match(W('(domingo|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado)(?:-feira)?'));
  const days = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  if (dm) { const w = dm[0].toLowerCase(); date = D.addDays(now, w === 'hoje' ? 0 : w.startsWith('depois') ? 2 : 1); take(dm); }
  else if (dmy) { date = new Date(now.getFullYear(), +dmy[2] - 1, +dmy[1]); if (date < D.startOfDay(now)) date.setFullYear(date.getFullYear() + 1); take(dmy); }
  else if (dd) { date = new Date(now.getFullYear(), now.getMonth(), +dd[1]); if (date < D.startOfDay(now)) date.setMonth(date.getMonth() + 1); take(dd); }
  else if (dw) { const name = dw[1].toLowerCase().replace('terca', 'terça').replace('sabado', 'sábado'); let k = (days.indexOf(name) - now.getDay() + 7) % 7; if (k === 0) k = 7; date = D.addDays(now, k); take(dw); }
  if (date) chips.unshift({ t: `${D.diffDays(date, now) <= 1 ? cap(rel(date)) : wd(date)}, ${dShort(date)}`, k: 'date' });
  const tm = t.match(W('(?:às|as)\\s+(\\d{1,2})(?:[:h](\\d{2}))?h?|(\\d{1,2})[:h](\\d{2})|(\\d{1,2})h'));
  if (tm) { const hh = tm[1] || tm[3] || tm[5], mm = tm[2] || tm[4] || '00'; if (+hh < 24 && +mm < 60) { chips.splice(date ? 1 : 0, 0, { t: `${hh.padStart(2, '0')}:${mm}`, k: 'time' }); take(tm); } }
  if (amount && /pagar|conta|boleto|fatura|ipva|iptu|condom/i.test(txt)) chips.push({ t: 'sugere: conta a pagar', k: 'bill' });
  const title = t.replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
  return { title: title ? cap(title) : '', chips, amount, date };
}

// ---------- Entradas ----------
let parseT = null;
document.addEventListener('input', (e) => {
  if (e.target.id === 'ex-v') { S.draftExpense = e.target.value; save(); }
  const el = e.target.closest('[data-in]'); if (!el) return;
  if (el.dataset.in === 'setkg' || el.dataset.in === 'setreps') { const k = el.dataset.arg, st = S.sets[k] || {}; if (el.dataset.in === 'setkg') st.kg = parseFloat(el.value.replace(',', '.')) || 0; else st.reps = parseInt(el.value, 10) || 0; S.sets[k] = st; save(); }
  if (el.dataset.in === 'inbox') { S.inboxDraft = el.value; save(); }
  if (el.dataset.in === 'inbox') {
    const p = parseInbox(el.value); document.getElementById('parse').innerHTML = el.value.trim() ? [`<span class="chip p">${esc(p.title || '…')}</span>`, ...p.chips.map((c) => `<span class="chip ${c.k === 'bill' ? 'xp' : ''}">${esc(c.t)}</span>`)].join('') : '';
    clearTimeout(parseT); if (el.value.trim() && p.chips.length) parseT = setTimeout(() => announce(`Entendido: ${[p.title, ...p.chips.map((c) => c.t)].filter(Boolean).join(', ')}`), 1200);
  }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-in]'); if (!el) return;
  const k = el.dataset.arg;
  if (el.dataset.in === 'setkg' || el.dataset.in === 'setreps') { const st = S.sets[k] || {}; if (el.dataset.in === 'setkg') st.kg = parseFloat(el.value.replace(',', '.')) || 0; else st.reps = parseInt(el.value, 10) || 0; S.sets[k] = st; save(); }
  if (el.dataset.in === 'realfile' && el.files?.length) { loadRealFile(el.files[0]); el.value = ''; return; }
  if (el.dataset.in === 'file' && el.files?.length) { toast(`${I('file', 18)} ${esc(el.files[0].name)}: no wireframe, a prévia usa o arquivo de exemplo.`, '', 3600); A.importNext(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'inbox') { e.preventDefault(); A.addInbox(); } });
// Grupos de opção única: setas movem a escolha e o foco (padrão ARIA de radiogroup).
document.addEventListener('keydown', (e) => {
  const r = e.target.closest?.('[role="radio"]'); if (!r) return;
  const k = e.key; if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(k)) return;
  const g = [...r.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]')];
  let i = g.indexOf(r); i = k === 'Home' ? 0 : k === 'End' ? g.length - 1 : (i + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1) + g.length) % g.length;
  // Foca o próprio botão; se o toque redesenhou a tela, acha o novo dentro do mesmo lugar (folha ou tela).
  e.preventDefault(); const key = focusKey(g[i]), scope = r.closest('.sheet') || main; g[i].click();
  (g[i].isConnected ? g[i] : (key && scope.querySelector(key)) || null)?.focus({ preventScroll: false });
});
// Toques dentro da tela atual mantêm a aba de origem (Hoje → Treino continua em Hoje).
let navFromMain = false;
document.addEventListener('click', (e) => { navFromMain = main.contains(e.target); }, true);
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const fn = A[t.dataset.act]; if (!fn) return;
  if (checkDay()) { e.preventDefault(); return; } // não aplica um toque de ontem no dia novo
  if (t.tagName !== 'A') e.preventDefault();
  fn(t.dataset.arg, t, e);
});

// ---------- Navegação ----------
// Cada entrada do histórico ganha um índice; assim voltar, avançar e trocar de aba ficam previsíveis.
const NAVK = 'painel-nav';
const bootSt = history.state || {};
let hIdx = Number.isInteger(bootSt.i) ? (bootSt.sheet ? bootSt.i - 1 : bootSt.i) : 0;
// A pilha vive na sessão da aba: recarregar não esquece de onde você veio.
const navStack = (() => { try { const a = JSON.parse(sessionStorage.getItem(NAVK) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } })();
const saveNav = () => { try { sessionStorage.setItem(NAVK, JSON.stringify(navStack)); } catch { /* sem sessão */ } };
if (bootSt.sheet) { history.back(); } // recarregou com uma folha aberta: volta para a entrada da tela
else history.replaceState({ i: hIdx }, '');
let navReplace = false, navMode = 'init';
function go(href, replace = false) {
  if (location.hash === href) return;
  // Trocar pela tela que já está logo atrás é o mesmo que voltar (sem duas entradas iguais em sequência).
  if (replace && navStack[hIdx - 1]?.r === href.replace(/^#\/?/, '')) { history.back(); return; }
  if (replace) { navReplace = true; location.replace(href); } else location.hash = href;
}
window.addEventListener('pagehide', () => { if (navStack[hIdx]) { navStack[hIdx].y = main.scrollTop; saveNav(); } });
window.addEventListener('hashchange', () => {
  const st = history.state;
  if (st && st.sheet && Number.isInteger(st.i)) { navMode = 'pop'; hIdx = st.i - 1; } // entrada de folha já fechada: vale a tela embaixo dela
  else if (st && Number.isInteger(st.i)) { navMode = st.i < hIdx ? 'pop' : st.i > hIdx ? 'fwd' : 'replace'; hIdx = st.i; }
  else { navMode = navReplace ? 'replace' : 'push'; if (!navReplace) hIdx += 1; history.replaceState({ i: hIdx }, ''); }
  navReplace = false;
  closeSheet(true, false); render(false);
});
// Barra de descanso: presa no rodapé em telas longas, e no fundo da tela quando o conteúdo é curto.
function fitRestbar() {
  main.classList.remove('short');
  const room = app.classList.contains('has-upd') ? 64 : 0;
  if (main.querySelector(':scope > .restbar') && main.scrollHeight <= main.clientHeight - room + 1) main.classList.add('short');
}
window.addEventListener('resize', fitRestbar);

// ---------- Render ----------
const VERSION = '0.3.0';
function current() { const h = location.hash.replace(/^#\/?/, ''); return ROUTES[h] ? h : 'hoje'; }
const TOP = ['hoje', 'saude', 'dinheiro', 'agenda', 'ficha'];
const TITLES = { onboarding: 'Boas-vindas', hoje: 'Hoje', saude: 'Saúde', 'saude/treino': 'Treino', 'saude/campanha': 'Campanha', 'saude/dieta': 'Dieta', 'saude/exames': 'Exames', dinheiro: 'Dinheiro', 'dinheiro/contas': 'Contas', 'dinheiro/cartoes': 'Cartões', 'dinheiro/patrimonio': 'Patrimônio', 'dinheiro/importar': 'Importar', agenda: 'Agenda', ficha: 'Ficha', ajustes: 'Ajustes', estados: 'Estados' };
let lastRoute = null, curTab = 'hoje', shownIdx = null;
function render(keep, focusSel) {
  const r = current();
  const sameRoute = r === lastRoute;
  let y = keep && sameRoute ? main.scrollTop : 0;
  const fk = sameRoute && !focusSel ? focusKey(document.activeElement) : null;
  const ae = document.activeElement, aeY = sameRoute && ae && ae !== main && main.contains(ae) ? ae.getBoundingClientRect().top : null;
  const typing = sameRoute && ae && main.contains(ae) && ae.tagName === 'INPUT' ? { v: ae.value, a: ae.selectionStart, b: ae.selectionEnd } : null;
  if (!sameRoute) {
    // Cada entrada do histórico guarda tela, aba e rolagem: voltar devolve tudo como estava.
    if (shownIdx != null && navStack[shownIdx]?.r === lastRoute) navStack[shownIdx].y = main.scrollTop;
    const ent = navStack[hIdx];
    if ((navMode === 'pop' || navMode === 'fwd' || (navMode === 'init' && lastRoute === null)) && ent && ent.r === r) { curTab = ent.tab; y = ent.y || 0; }
    else {
      curTab = TOP.includes(r) || !navFromMain || lastRoute === null || navMode === 'replace' ? TAB_OF(r) : curTab;
      if (navMode === 'push') navStack.length = hIdx;
      navStack[hIdx] = { r, tab: curTab, y: 0 };
    }
    navMode = 'none'; shownIdx = hIdx; navFromMain = false; saveNav();
    if (lastRoute === 'dinheiro/importar' && S.importStep === 3) { S.importStep = 0; save(); }
  }
  let scr;
  try { scr = ROUTES[r](); } catch (err) {
    console.error(err);
    scr = { title: 'Erro', html: `${hdr('Algo deu errado')}<div class="card"><p class="lead">Esta tela não abriu com os dados salvos neste aparelho.</p><button class="btn block" style="margin-top:12px" data-act="resetDemo">Zerar a demonstração</button></div>` };
  }
  main.innerHTML = scr.html;
  app.classList.toggle('focus', scr.chrome === 'focus');
  app.classList.toggle('bare', scr.chrome === 'bare');
  document.title = `${scr.title} · Painel`;
  document.querySelectorAll('.tab').forEach((a) => { if (a.dataset.tab === curTab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  fitRestbar();
  main.scrollTop = y;
  const sheetOpen = !!sheetRoot.querySelector('.sheet:not([inert])');
  if (!sameRoute) { const h1 = main.querySelector('h1'); if (h1 && lastRoute !== null && !sheetOpen) h1.focus({ preventScroll: true }); renderChrome(); }
  else if (!sheetOpen) {
    const t = (focusSel && main.querySelector(focusSel)) || (fk && main.querySelector(fk));
    if (t) { t.focus({ preventScroll: true }); if (typing && t.tagName === 'INPUT' && !focusSel) { t.value = typing.v; try { t.setSelectionRange(typing.a, typing.b); } catch { /* inputmode numérico */ } } }
    else if (aeY != null) focusNear(null, null, aeY, main); // o controle sumiu (linha apagada, conta paga): foco no vizinho
  }
  lastRoute = r;
  updateBadge(); keepAwake();
}
function renderChrome() {
  const r = current();
  const side = document.querySelector('.side'), notes = document.querySelector('.notes');
  const sfk = side && side.contains(document.activeElement) ? focusKey(document.activeElement) : null;
  if (side) side.innerHTML = `<div class="brand"><img src="icons/icon-192.png" alt="">Painel</div><p class="small muted" style="margin-top:6px">Wireframe navegável · dados fictícios</p>
    ${MAP.map(([g, items]) => `<h2>${g}</h2><nav aria-label="${g}">${items.map(([k, l, ic]) => `<a href="#/${k}" ${k === r ? 'aria-current="page"' : ''}>${I(ic, 18)}${l}</a>`).join('')}</nav>`).join('')}
    <div class="demo"><b class="small">Controles da demonstração</b>${demoControls()}</div>`;
  if (sfk) side.querySelector(sfk)?.focus({ preventScroll: true });
  const n = NOTES[r];
  if (notes && n) notes.innerHTML = `<div class="panel"><h2 style="margin-top:0">Notas de UX</h2><h3>${n[0]}</h3><p class="tagline">${n[1]}</p><ul>${n[2].map((x) => `<li>${x}</li>`).join('')}</ul><span class="ms">Entrega: ${n[3]}</span>
    <p class="foot">Tudo aqui é fictício e fica só neste navegador. Abra no iPhone pelo Safari e adicione à Tela de Início para testar como app, offline e com notificações.</p></div>`;
}
function refreshSheet() { const m = document.getElementById('map'); if (m && !m.inert) { const y = m.scrollTop, k = focusKey(document.activeElement); openSheet('Mapa do wireframe', mapHtml(), 'map', k); const n = document.getElementById('map'); n.classList.add('open'); sheetRoot.querySelector('.scrim')?.classList.add('open'); n.scrollTop = y; } }
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  if (S.theme === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = S.theme;
  const dark = S.theme === 'dark' || (S.theme === 'system' && darkMQ.matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = dark ? '#0F1411' : '#F3F4EF'; m.removeAttribute('media'); });
}
darkMQ.addEventListener?.('change', () => { if (S.theme === 'system') applyTheme(); });
// Teclado na tela: a folha sobe junto, para o botão Salvar não ficar escondido.
if (window.visualViewport) { const vv = window.visualViewport; const kb = () => app.style.setProperty('--kb', `${Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop))}px`); vv.addEventListener('resize', kb); vv.addEventListener('scroll', kb); }
function updateBadge() { try { const V = view(); const left = ['corpo', 'comb', 'missao'].filter((k) => !V.quests[k]).length; if ('setAppBadge' in navigator && Notification?.permission === 'granted') { if (left) navigator.setAppBadge(left); else navigator.clearAppBadge(); } } catch { /* opcional */ } }

setInterval(() => {
  const rt = document.getElementById('restT');
  if (rt && S.rest) { const s = Math.ceil((S.rest.end - Date.now()) / 1000); if (s <= 0) { S.rest = null; save(); if (navigator.vibrate) navigator.vibrate(200); beep(); toast(`${I('timer', 18)} Descanso acabou. Próxima série.`); swapPart('.restbar'); } else rt.textContent = fmtT(s); }
  const wt = document.getElementById('wT'); if (wt && S.wStart) wt.textContent = fmtT(Math.floor((Date.now() - S.wStart) / 1000));
}, 500);

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (current() === 'onboarding') render(true); });
window.addEventListener('online', () => { render(true); });
window.addEventListener('offline', () => { render(true); });
// Troca só um pedaço da tela (sem perder o que está sendo digitado em outro campo).
function swapPart(sel) {
  let scr; try { scr = ROUTES[current()](); } catch { return; }
  const t = document.createElement('template'); t.innerHTML = scr.html;
  const n = t.content.querySelector(sel), o = main.querySelector(sel);
  if (!n || !o) { render(true); return; }
  const had = o.contains(document.activeElement);
  o.replaceWith(n); fitRestbar();
  if (had) n.querySelector('button, a[href]')?.focus({ preventScroll: true });
}
// Treino: tela acesa durante o descanso e um bipe no fim (o iPhone não vibra pelo navegador).
let audio = null, wake = null;
function unlockAudio() { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch { audio = null; } }
function beep() { if (!audio) return; try { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.18); } catch { /* sem áudio */ } }
async function keepAwake() {
  const want = current() === 'saude/treino' && (S.wStart || S.rest) && document.visibilityState === 'visible';
  try { if (want && !wake && navigator.wakeLock) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } else if (!want && wake) { await wake.release(); wake = null; } } catch { wake = null; }
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  checkDay(); keepAwake();
  try { (await navigator.serviceWorker?.getRegistration())?.update(); } catch { /* offline */ }
});
window.addEventListener('pageshow', (e) => { if (e.persisted) checkDay(); });
setInterval(checkDay, 60000);
document.getElementById('fab').addEventListener('click', quickAdd);
document.querySelector('.tabbar').addEventListener('click', (e) => {
  const a = e.target.closest('a.tab'); if (!a) return; e.preventDefault();
  const href = a.getAttribute('href'), r = href.replace(/^#\/?/, '');
  if (current() === r) { main.scrollTo({ top: 0 }); return; }
  go(href, true); // troca de aba não empilha histórico; de uma subtela para a aba dela, volta
});

applyTheme();
const STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// No iPhone o app instalado tem armazenamento próprio: a primeira abertura pelo ícone pede os lembretes lá.
if (!S.onboarded && (!location.hash || STANDALONE)) { if (STANDALONE && (S.onbStep || 0) < 2) { S.onbStep = 2; save(); } go('#/onboarding', true); }
render(false);
renderChrome();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showUpdate(); });
}
