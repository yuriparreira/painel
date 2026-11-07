// Painel. JavaScript puro, sem dependências, roteamento por hash.
// Só dados seus: dinheiro do Open Finance (Supabase) ou do arquivo do Painel, saúde do Supabase (saude_painel) e o que
// você registra aqui. Com o login, o que você registra também fica na nuvem (nuvem.js), igual no celular e no
// computador; sem login, só neste navegador. O repositório não guarda dado pessoal nenhum.
import { I } from './icons.js';
import * as D from './data.js';
import { CATALOGO, GRUPOS } from './catalogo.js';
import * as AL from './alimentos.js';
// Se o aparelho ainda guarda só os arquivos de uma versão sem o sync.js (sem internet, antes da atualização
// terminar), o app abre sem o login em vez de ficar em branco.
const sbOff = async () => { const e = new Error('offline'); e.code = 'offline'; throw e; };
const SB_OFF = { consumeHash: () => null, session: () => null, email: () => null, pending: () => null, clearPending() {}, currentEpoch: () => 0, onChange() {}, sendCode: sbOff, verifyCode: sbOff, fetchPainel: sbOff, fetchSaude: sbOff, lerEstado: sbOff, salvarEstado: sbOff, novoToken: sbOff, ATALHO_URL: '', signOut: async () => 'ok' };
// Antes da espera abaixo: o navegador pode oferecer a instalação enquanto o sync.js ainda chega.
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; try { if (current() === 'onboarding') render(true); } catch { /* ainda abrindo */ } });
const SB = await import('./sync.js').catch(() => SB_OFF);
// Sem o nuvem.js (cópia antiga no aparelho), o app abre como antes: tudo só neste navegador.
const NUV = await import('./nuvem.js').catch(() => null);
const nuvemOn = () => !!(NUV && SB.session());

// Volta do link mágico do e-mail: a sessão sai do endereço antes do roteador ler o hash.
const hashLogin = SB.consumeHash();

// Dinheiro: vem do Open Finance (Supabase, depois do login) ou do arquivo carregado em Importar.
// Saúde: plano, fichas, dieta, medidas e exames do Supabase. A última cópia de cada um fica só neste navegador,
// para abrir sem internet.
const REALK = 'painel-real-v1';
const SAUDEK = 'painel-saude-v1';
let realErr = null, saudeRaw = null, saudeErr = null;
try { const t = localStorage.getItem(REALK); if (t) D.useReal(JSON.parse(t)); } catch (e) { realErr = e; }
try { const t = localStorage.getItem(SAUDEK); if (t) { const H = JSON.parse(t); D.useSaude(H); saudeRaw = H; } } catch { saudeRaw = null; /* lê de novo na próxima sincronização */ }
const CARD = 'cartao'; // gasto registrado à mão no cartão principal
const card0 = () => (D.CARDS[0] ? D.CARDS[0].n : 'cartão');
const semCartao = () => !D.CARDS.length; // sem nenhum cartão: nada de fatura nas telas
const cardName = (m) => (m === CARD ? card0() : m);

const app = document.getElementById('app');
const main = document.getElementById('main');
const sheetRoot = document.getElementById('sheet-root');
const toastRoot = document.getElementById('toasts');
// O estado mora numa chave nova desde a 0.5.0. A antiga (da demonstração) só é lida uma vez, para migrar o que é seu:
// uma aba ainda na versão anterior que grave nela não mexe mais no estado desta versão.
const KEY = 'painel-estado-v2', OLDKEY = 'painel-wireframe-v1';


// ---------- Formatação ----------
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = (v) => BRL.format(v);
const brl0 = (v) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
const brlK = (v) => (Math.abs(v) >= 10000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(v) >= 100000 ? 0 : 1 }) + ' mil' : brl0(v));
const n1 = (v) => (Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—');
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
// Hora para comparar com os horários do dia do app ('HH:MM'). Da meia-noite às 03:00 o dia ainda é o de ontem, e tudo dele já passou.
const hmAgora = () => { const n = new Date(); return n.getHours() < 3 ? '24:00' : `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; };
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


// ---------- Estado neste aparelho ----------
// Treinos seus, fichas editadas, exercícios criados e o histórico de cargas ficam dentro do mapa lastSets, com chaves que
// nenhum exercício usa (o id de um exercício só tem a-z, 0-9 e hífen). Assim a cópia 0.6.0 do app, ainda aberta em outro
// aparelho, guarda essas chaves na nuvem como guarda as cargas, em vez de apagar o que ela não conhece.
//   ~t:id     treino seu { nome, ex: [{ n, p }], dia? } (com dia: montado naquele dia; some depois de 30 dias)
//   ~f:A-1    a ficha A do bloco 1 editada { ex: [{ n, p }] }, no lugar da do Supabase (que não muda)
//   ~e:id     exercício criado por você { n }
//   id@dia    o que se fez num dia { kg, reps } (histórico de cargas, 400 dias)
// E no mapa sets, que é do dia: ~s:sessão-posição { n }, a troca de um exercício só hoje.
const K_T = '~t:', K_F = '~f:', K_E = '~e:', K_S = '~s:';
// Refeições: no mapa meals (do dia) true = seguiu o plano; { f: [itens] } = o que você comeu nessa refeição (a porção do
// plano pode ser um dos itens, em vezes). As refeições fora do plano têm chave x~… e { n nome, h hora, f itens }.
// Os alimentos que você usa ficam em lastSets ~a:fonte (recentes, sem dia: valem nos dois aparelhos e sem internet).
// As versões anteriores do app só olham se a refeição foi marcada: uma refeição ajustada aparece lá como seguida.
const K_A = '~a:', K_X = 'x~', RECENTES = 60;
const mVal = (v) => (v === true ? true : v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.f) ? v : null);
const planB = (m) => [m.kcal, m.p, m.c, m.g];
const planoItem = (m, x = 1) => ({ pl: 1, x, b: planB(m) });
const extrasDe = (M) => Object.keys(M || {}).filter((k) => k.startsWith(K_X) && mVal(M[k]) && M[k] !== true).sort();
function realizado(m, v) { v = mVal(v); return !v ? null : v === true ? (m ? planB(m) : [0, 0, 0, 0]) : AL.soma(v.f); }
// O que se comeu: [kcal, P, C, G] das refeições do plano marcadas ou ajustadas e das refeições fora do plano.
function consumo(M, meals) {
  let t = [0, 0, 0, 0], n = 0;
  const add = (r) => { if (r) { t = t.map((x, i) => x + r[i]); n++; } };
  meals.forEach((m) => add(realizado(m, (M || {})[m.id])));
  extrasDe(M).forEach((k) => add(realizado(null, M[k])));
  return { t, n };
}
// Para o registro do dia: [kcal, P, C, G] arredondados, ou null se nada foi registrado.
function nutriDe(M, dayType, day) {
  if (!M || typeof M !== 'object' || !Object.keys(M).length) return null;
  const tk = D.DIAS[dayType] ? dayType : D.tipoDia(isoOk(day) ? D.sessao(D.planFor(dayAt(day))).tipo || 'LIVRE' : 'LIVRE');
  const { t, n } = consumo(M, D.SAUDE ? D.refeicoes(tk) : []);
  return n ? t.map((v) => Math.round(v)) : null;
}
const isP = (s) => typeof s === 'string' && /^P:[a-z0-9]{1,24}$/.test(s);
function defaults() {
  return {
    v: 2, xp: 0, since: null, nome: '', onboarded: false, onbStep: 0, theme: 'system',
    day: null, checkin: null, quests: { corpo: false, comb: false, missao: false }, perfect: false, closed: false,
    sets: {}, meals: {}, wSel: null, wStart: null, rest: null, edAlvo: null, refEd: null,
    paid: {}, inbox: [], weight: null, sleep: null, streak: 0, best: 0, pausa: false,
    card: 0, calSel: null, calOff: 0, billFilter: 'todas', bp: 'resumo', dayType: null, agView: 'hoje',
    draftExpense: '', inboxDraft: '', missaoRef: null, corpoKey: null, corpoMin: 0, combByMeals: false, expenses: [], mealXp: {}, inboxXp: 0, prToday: false,
    best1rm: {}, lastSets: {}, brasaAt: null, hist: {}, dias: {}, semXp: {}, conq: {}, qxp: {},
    paidAmt: {}, paidAt: {}, txUsados: [], good: {}, bossSeed: 0, bossMonth: null, bossWon: null, bossWonDay: null,
  };
}
const dayAt = (isoStr) => new Date(isoStr + 'T12:00');
const isoOk = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const fin = (v) => (Number.isFinite(v) ? v : null);
// O registro de um dia: sono e peso do check-in, sessão feita (e minutos de zona 2), Combustível e Missão.
function logHoje(s, nut) {
  const e = {};
  if (nut) e.n = nut;
  if (s.checkin) { if (fin(s.checkin.s) != null) e.s = s.checkin.s; if (fin(s.checkin.w) != null) e.w = s.checkin.w; }
  if (s.quests.corpo && s.corpoKey) { e.k = s.corpoKey; if (s.corpoKey === 'Z2' && s.corpoMin > 0) e.z = s.corpoMin; }
  if (s.quests.comb) e.b = 1;
  if (s.quests.missao) e.m = 1;
  return Object.keys(e).length ? e : null;
}
// Virada do dia: fecha o histórico, atualiza a Chama (com brasa e Modo Pausa) e zera o que é diário.
function rollover(s, today) {
  const prev = dayAt(s.day), gap = D.diffDays(dayAt(today), prev);
  s.hist[s.day] = s.pausa ? 'p' : s.checkin ? 1 : 0;
  if (s.checkin && s.checkin.s >= 7) s.good[s.day] = 1; // noite boa = golpe no chefe
  const e = logHoje(s, nutriDe(s.meals, s.dayType, s.day)); if (e) s.dias[s.day] = e;
  for (let i = 1; i < gap; i++) { const d = D.iso(D.addDays(prev, i)); if (!(d in s.hist)) s.hist[d] = s.pausa ? 'p' : 0; }
  for (let i = 0; i < gap; i++) {
    const d = D.iso(D.addDays(prev, i)), v = s.hist[d];
    if (v === 1) { s.streak += 1; s.best = Math.max(s.best, s.streak); }
    else if (v === 'p') { /* pausa congela a Chama */ }
    else if (s.streak > 0 && (!s.brasaAt || D.diffDays(dayAt(d), dayAt(s.brasaAt)) >= 7)) s.brasaAt = d; // 1 falta livre a cada 7 dias
    else s.streak = 0; // a Chama recomeça (sem Chama acesa, a brasa fica guardada); XP nunca cai
  }
  s.best = Math.max(s.best, s.streak);
  chama(s, today);
  Object.keys(s.hist).forEach((d) => { if (D.diffDays(dayAt(today), dayAt(d)) > 400) delete s.hist[d]; });
  Object.keys(s.dias).forEach((d) => { if (D.diffDays(dayAt(today), dayAt(d)) > 400) delete s.dias[d]; });
  Object.keys(s.semXp).forEach((d) => { if (D.diffDays(dayAt(today), dayAt(d)) > 60) delete s.semXp[d]; });
  // Histórico de cargas: 400 dias. Treino montado num dia: 30 dias (salvo como treino seu, ele fica).
  Object.keys(s.lastSets).forEach((k) => {
    const h = /@(\d{4}-\d{2}-\d{2})$/.exec(k), v = s.lastSets[k], d = h ? h[1] : k.startsWith(K_T) && v && v.dia;
    if (isoOk(d) && D.diffDays(dayAt(today), dayAt(d)) > (h ? 400 : 30)) delete s.lastSets[k];
  });
  // Alimentos recentes: os 60 usados por último.
  Object.keys(s.lastSets).filter((k) => k.startsWith(K_A)).sort((a, b) => ((s.lastSets[b] || {}).t || 0) - ((s.lastSets[a] || {}).t || 0)).slice(RECENTES).forEach((k) => { delete s.lastSets[k]; });
  s.inbox = s.inbox.filter((x) => !x.done); // tarefas concluídas saem na virada
  Object.assign(s, { checkin: null, sleep: null, quests: { corpo: false, comb: false, missao: false }, perfect: false, closed: false, sets: {}, meals: {}, wStart: null, rest: null, dayType: null, wSel: null, missaoRef: null, corpoKey: null, corpoMin: 0, combByMeals: false, mealXp: {}, inboxXp: 0, prToday: false, qxp: {} });
}
// A Chama, a brasa e o recorde refeitos a partir do histórico, dia a dia desde o primeiro: o mesmo histórico dá a mesma
// Chama em qualquer aparelho, mesmo quando o check-in de um dia chega depois pela nuvem. Dias sem histórico antes do
// primeiro (que nenhum aparelho fechou) não mudam a conta. Quando o histórico pode ter sido podado (começa depois do
// primeiro dia e há mais de 58 dias: a 0.5.0 guardava 60, esta guarda 400), fica a conta que a virada já fez.
function chama(s, ate = s.day) {
  if (!isoOk(ate) || !s.hist || typeof s.hist !== 'object') return;
  const ks = Object.keys(s.hist).filter((d) => isoOk(d) && d < ate).sort();
  if (!ks.length || (isoOk(s.since) && s.since < ks[0] && D.diffDays(dayAt(ate), dayAt(ks[0])) > 58)) return;
  let streak = 0, brasaAt = null, best = 0;
  for (let d = ks[0], i = 0; d < ate && i < 800; d = D.iso(D.addDays(dayAt(d), 1)), i++) {
    const v = d in s.hist ? s.hist[d] : s.pausa ? 'p' : 0;
    if (v === 1) { streak += 1; best = Math.max(best, streak); }
    else if (v === 'p') { /* pausa congela a Chama */ }
    else if (streak > 0 && (!brasaAt || D.diffDays(dayAt(d), dayAt(brasaAt)) >= 7)) brasaAt = d;
    else streak = 0;
  }
  s.streak = streak; s.brasaAt = brasaAt; s.best = Math.max(Number.isFinite(s.best) ? s.best : 0, best, streak);
}
// Um dia que ficou para trás sem ser fechado neste aparelho (o outro aparelho virou o dia antes, ou este virou sem a
// nuvem): o que se fez nele (check-in, missões, treino) vira histórico, noite boa e registro do dia, sem apagar o
// que já estava lá. velhos: { dia: { chave: [quando, aparelho, valor em JSON, dia] } }, da junção da nuvem.
function fecharVelhos(s, velhos) {
  let mudou = false;
  for (const d of Object.keys(velhos).filter(isoOk).sort()) {
    if (!(isoOk(s.day) && d < s.day) || (isoOk(s.since) && d < s.since)) continue;
    const V = velhos[d], P = (k) => { try { return V[k] && V[k][2] != null ? JSON.parse(V[k][2]) : undefined; } catch { return undefined; } };
    const ci = P('checkin'), T = {
      checkin: ci && typeof ci === 'object' && fin(ci.s) != null ? { s: ci.s, w: fin(ci.w) } : null,
      quests: { corpo: P('quests|corpo') === true, comb: P('quests|comb') === true, missao: P('quests|missao') === true },
      corpoKey: typeof P('corpoKey') === 'string' ? P('corpoKey') : null, corpoMin: fin(P('corpoMin')) || 0,
    };
    if (T.checkin && s.hist[d] !== 1) { s.hist[d] = 1; mudou = true; }
    if (T.checkin && T.checkin.s >= 7 && s.bossMonth === d.slice(0, 7) && !s.good[d]) { s.good[d] = 1; mudou = true; }
    const ml = {}; Object.keys(V).forEach((k) => { if (k.startsWith('meals|')) { const v = P(k); if (v != null) ml[k.slice(6)] = v; } });
    const e = logHoje(T, nutriDe(ml, P('dayType'), d));
    if (e) { const cur = s.dias[d] && typeof s.dias[d] === 'object' ? s.dias[d] : {}, u = { ...e, ...cur }; if (JSON.stringify(u) !== JSON.stringify(cur)) { s.dias[d] = u; mudou = true; } }
  }
  if (mudou) chama(s);
  return mudou;
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
  // Campos que começam vazios (null) e aceitam qualquer coisa salva: confere o formato um a um.
  out.weight = fin(out.weight); out.sleep = fin(out.sleep);
  if (out.checkin && (typeof out.checkin !== 'object' || fin(out.checkin.s) == null)) out.checkin = null;
  if (out.checkin) out.checkin = { s: out.checkin.s, w: fin(out.checkin.w) };
  ['day', 'since', 'brasaAt', 'bossMonth', 'bossWon', 'bossWonDay', 'calSel'].forEach((k) => { if (out[k] != null && typeof out[k] !== 'string') out[k] = null; });
  if (out.dayType && !D.DIAS[out.dayType]) out.dayType = null;
  if (out.wSel && !['A', 'B', 'C', 'Z2', 'REST'].includes(out.wSel) && !isP(out.wSel)) out.wSel = null;
  if (out.edAlvo && !['A', 'B', 'C'].includes(out.edAlvo) && !isP(out.edAlvo)) out.edAlvo = null;
  if (out.rest && !(out.rest.end > 0)) out.rest = null;
  if (out.refEd != null && typeof out.refEd !== 'string') out.refEd = null;
  out.inbox = out.inbox.filter((x) => x && typeof x.t === 'string');
  out.expenses = out.expenses.filter((x) => x && Number.isFinite(x.v));
  return out;
}
// A versão anterior era uma demonstração: XP, Chama, histórico, chefe, peso e sono começavam com números de exemplo, e
// boa parte do XP vinha de contas, tarefas e importações de exemplo. Daqui em diante só conta o que você fizer: tudo do
// jogo volta a zero, inclusive o dia de hoje. Fica o que é seu: tema, gastos registrados, tarefas anotadas por você e
// contas marcadas nos dados reais.
const DEMO_INBOX = ['Comprar whey', 'Trocar óleo do carro'];
function migrate(s, today) {
  s.xp = 0;
  Object.assign(s, { hist: {}, dias: {}, semXp: {}, conq: {}, good: {}, streak: 0, best: 0, brasaAt: null, bossSeed: 0, bossWon: null, bossWonDay: null, bossMonth: null, best1rm: {}, lastSets: {}, sets: {}, meals: {}, mealXp: {}, combByMeals: false, dayType: null, wSel: null, missaoRef: null, corpoMin: 0 });
  s.inbox = s.inbox.filter((x) => !DEMO_INBOX.includes(x.t)).map((x) => {
    const ch = (Array.isArray(x.chips) ? x.chips : []).filter((c) => typeof c === 'string');
    const y = { ...x, top: null, topAt: null, doneAs: null, done: false, chips: ch.filter((c) => !/^(repete|sugere):/.test(c)) };
    // Tarefas que se repetem não existem mais: "repete: todo dia 10" vira a próxima data, ou volta para o texto da tarefa.
    const rp = ch.find((c) => /^repete:/.test(c));
    if (rp) {
      const r = rp.replace(/^repete:\s*/, ''), p = parseInbox(r);
      if (p.date && !isoOk(y.quando)) { y.quando = D.iso(p.date); y.chips.unshift(p.chips[0].t); } else if (!p.date) y.t = `${y.t} ${r}`.trim();
    }
    return y;
  });
  // O check-in da demonstração vinha preenchido com peso e sono de exemplo: o de hoje é feito de novo.
  Object.assign(s, { checkin: null, weight: null, sleep: null, quests: { corpo: false, comb: false, missao: false }, perfect: false, closed: false, corpoKey: null, inboxXp: 0, prToday: false, qxp: {}, wStart: null, rest: null });
  s.expenses.forEach((x) => { if (x.met === 'Cartão Alfa') x.met = CARD; });
  if (!D.REAL) { s.paid = {}; s.paidAmt = {}; s.paidAt = {}; } // marcações de contas de exemplo
  else Object.values(s.paidAt).forEach((a) => { if (a && typeof a === 'object') a.xp = 0; }); // o XP delas foi zerado junto
  s.since = today; s.day = today; s.v = 2; // o dia antigo não passa pela virada: nada de brasa gasta num dia que não contava
  return true;
}
function load() {
  const read = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; } };
  let s = read(KEY), v1 = false;
  if (!s) { s = read(OLDKEY); v1 = !!s; } // primeira abertura da 0.5.0: o que estava na chave antiga é da demonstração
  const fresh = !s;
  s = sane(s);
  const today = D.iso(diaNow());
  const mig = v1 && migrate(s, today);
  if (!isoOk(s.since)) s.since = today;
  arruma(s);
  // Com a nuvem, a virada do dia espera a leitura dela (checkDay): o outro aparelho pode já ter virado o dia.
  // O dia só vira para frente: um dia à frente do relógio (fuso ou relógio do outro aparelho) fica como está.
  const stale = isoOk(s.day) && s.day < today, rolled = stale && !nuvemOn();
  if (rolled) rollover(s, today);
  if (!isoOk(s.day) || rolled) s.day = today;
  bossMonth(s);
  if (rolled || mig || fresh) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); if (mig) localStorage.removeItem(OLDKEY); } catch { /* modo privado */ }
  }
  return s;
}
// Ids que faltam e a ordem das tarefas (o, mais nova em cima), que a nuvem usa para montar a lista igual nos aparelhos.
function arruma(s) {
  const t = Date.now();
  s.inbox.forEach((x, i) => { if (!x.id) x.id = `n${i}${t.toString(36)}`; if (!Number.isFinite(x.o)) x.o = t - i; });
  s.expenses.forEach((x, i) => { if (x && !x.id) x.id = `x${i}${t.toString(36)}`; });
  return s;
}
// Chefe do mês: começa com 18 de 20 de vida a cada mês e cada noite boa (7 h ou mais no check-in) é um golpe.
function bossMonth(s) {
  const m = monthKey(diaNow());
  if (s.bossMonth === m) return;
  if (s.bossMonth != null) s.good = {};
  s.bossSeed = 0; s.bossMonth = m;
}
let S = load();
let NV = null; // a nuvem (criada mais abaixo, com a sessão)
// O app instalado no iPhone volta da memória sem recarregar: confere a virada do dia ao voltar. Com a nuvem, lê antes
// (até 4 s): se o outro aparelho já virou o dia, este fica com o dia dele em vez de virar de novo com dados velhos.
// Devolve true enquanto o dia está velho (o toque de ontem não vale no dia novo).
let virando = null;
let pesoRasc = null; // peso digitado no check-in e ainda não salvo: um redesenho (mudança vinda da nuvem) não apaga
function checkDay() {
  const t = D.iso(diaNow());
  if (!isoOk(S.day)) { S.day = t; save(); return false; }
  if (S.day >= t) return false;
  if (virando) return true;
  if (!NV || !nuvemOn()) { virarDia(); return true; }
  splash(true);
  virando = Promise.race([NV.puxar(), new Promise((res) => setTimeout(res, 4000))]).catch(() => {}).then(() => { virando = null; splash(false); virarDia(); });
  return true;
}
function virarDia() {
  const t = D.iso(diaNow());
  if (isoOk(S.day) && S.day < t) { rollover(S, t); S.day = t; }
  pesoRasc = null; bossMonth(S); pruneReal(); save(); setTimeout(checkBoss, 1200); closeSheet(true, false); toast(`${I('sun', 18)} Novo dia. Missões zeradas.`); render(false);
}
function splash(on) {
  let el = document.getElementById('nv-splash');
  if (!on) { el?.remove(); return; }
  if (el) return;
  el = document.createElement('div'); el.id = 'nv-splash'; el.className = 'nv-splash'; el.setAttribute('role', 'status');
  el.innerHTML = `<div>${I('refresh', 28)}<p>Dia novo. Buscando o que você fez no outro aparelho…</p></div>`;
  document.body.appendChild(el);
}
function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* modo privado: segue sem salvar */ } }
// Grava aqui e, com a nuvem, sobe em 2 segundos.
function save() { saveLocal(); NV?.mudou(); }
const touch = save;

// ---------- Regras do jogo ----------
const xpToNext = (L) => Math.round((70 * L ** 1.45) / 10) * 10;
function lvl(xp) { if (!Number.isFinite(xp) || xp < 0) xp = 0; let L = 1, acc = 0; for (;;) { const need = xpToNext(L); if (xp < acc + need) return { L, into: xp - acc, need }; acc += need; L++; } }
const titleFor = (L) => (L >= 30 ? 'Lenda' : L >= 25 ? 'Mestre' : L >= 20 ? 'Elite' : L >= 15 ? 'Veterano' : L >= 10 ? 'Combatente' : L >= 5 ? 'Aspirante' : 'Recruta');
const rank = (v) => (v == null ? '—' : v >= 90 ? 'S' : v >= 75 ? 'A' : v >= 60 ? 'B' : v >= 40 ? 'C' : v >= 20 ? 'D' : 'E');
const SLEEP = [['<5', 4.5], ['5', 5], ['6', 6], ['7', 7], ['8', 8], ['9+', 9]];
// Zona do dia pelas horas de sono do check-in: 7 h ou mais, treino completo; de 6 a 7 h, uma série a menos; menos de
// 6 h, só caminhada leve ou mobilidade. Sem check-in, sem zona (o Apple Health já deixa a opção marcada no check-in).
const zoneOf = (h) => (fin(h) == null ? 'nd' : h >= 7 ? 'verde' : h >= 6 ? 'amarelo' : 'vermelho');
const ZNAME = { verde: 'Verde', amarelo: 'Amarelo', vermelho: 'Vermelho', nd: 'Sem check-in' };
const sleepNow = () => (S.checkin ? fin(S.checkin.s) : null);
const zoneNow = () => zoneOf(sleepNow());
const hTxt = (h) => (h >= 9 ? '9 h ou mais' : h < 5 ? 'menos de 5 h' : `${h} h`);
const hShort = (h) => (h >= 9 ? '9+' : h < 5 ? '<5' : String(h));
const nomeDe = () => String(S.nome || D.PROFILE.nome || '').trim();
const inicial = () => { const n = nomeDe(); return n ? esc(n.charAt(0).toUpperCase()) : I('shield', 22); };

function addXP(n, why) {
  const before = lvl(S.xp).L; S.xp += n; touch();
  if (n > 0) toast(`<span class="xpv">+${n} XP</span> ${esc(why)}`);
  else toast(esc(why));
  const after = lvl(S.xp).L;
  if (after > before) setTimeout(() => toast(`${I('star')} <span>Nível ${after} · ${titleFor(after)}</span>`, 'lvl', 3800), 900);
}

function view() { const h = new Date().getHours(); return { checkin: S.checkin, quests: S.quests, evening: h >= 19 || h < 3 }; }
const plan = () => D.planFor(diaNow());
// Semana do plano para a meta de cardio: depois do fim do plano, continua a da última semana.
const cw = (p) => p.week || p.ultima || 0;
// A sessão de hoje pelo plano. Sem plano (sem dados, antes do início ou depois do fim) a chave é LIVRE.
function todaySession() { const p = plan(), s = D.sessao(p); return { p, key: s.tipo || 'LIVRE', s }; }
const sessOf = (p, tipo) => D.sessao(tipo ? { ...p, tipo } : p);

// ---------- Dinheiro: uma fonte só para Hoje, Dinheiro, Contas e Cartões ----------
const cardOf = (f) => S.expenses.filter((x) => x.met === CARD && (x.fat || 'aberta') === f).reduce((a, x) => a + x.v, 0);
const cardExtra = () => cardOf('aberta');
const cardNext = () => cardOf('proxima');
// Conta paga mostra o valor que foi pago (o mesmo que saiu do saldo), em qualquer tela.
const bills = () => D.bills(S.paid, cardExtra(), diaNow()).map((b) => (b.pago && S.paidAmt[b.id] != null ? { ...b, v: S.paidAmt[b.id] } : b));
const bankIds = () => new Set(((D.REAL && D.REAL.contas) || []).map((c) => c.id).filter(Boolean));
const tsOf = (s) => { const t = Date.parse(s || ''); return isNaN(t) ? 0 : t; };
// Chave de um lançamento que vale entre leituras (o app não recebe o id): dia, valor, conta e descrição, com um
// número quando dois são iguais.
let txKeysOf = null, txKeysMap = new Map();
function txKeys() {
  const T = (D.REAL && D.REAL.transacoes) || [];
  if (txKeysOf !== T) { const n = {}; txKeysMap = new Map(T.map((y) => { const b = `${y.d}|${y.v}|${y.conta || ''}|${y.desc || ''}`; n[b] = (n[b] || 0) + 1; return [y, `${b}#${n[b]}`]; })); txKeysOf = T; }
  return txKeysMap;
}
// Contas marcadas à mão que o banco já mostra; até lá elas saem do saldo. Com o Open Finance o banco mostra quando o
// extrato de uma conta traz um débito do mesmo valor feito a partir da véspera da marcação (nunca mais de 28 dias
// antes do vencimento), fora da categoria de outra conta e sem já explicar outra coisa; ou quando todos os bancos
// atualizaram depois da marcação e depois do dia do vencimento (um pagamento agendado só sai no dia). Na dúvida,
// continua descontando: o "livre para gastar" nunca fica maior do que é. Devolve as contas e os débitos usados.
function reflected(B) {
  const ids = new Set(), tx = new Set();
  if (!fromSB()) return { ids, tx };
  const R = D.REAL, bank = bankIds(), K = txKeys(), cps = R.contasPagar || [], u = tsOf(R.atualizadoEm), usados = new Set(S.txUsados);
  B.forEach((b) => { if (b.hitTx) tx.add(b.hitTx); });
  B.filter((b) => S.paid[b.id] && !b.porExtrato && S.paidAt[b.id]).sort((a, b) => a.due - b.due).forEach((b) => {
    const at = S.paidAt[b.id], v = S.paidAmt[b.id] ?? b.v;
    const own = cps.find((c) => (c.fatura ? 'fatura' : c.id) === b.id), oc = own && own.txCat;
    const outras = new Set(cps.filter((c) => c !== own && c.txCat && c.txCat !== oc).map((c) => c.txCat));
    const d0 = [D.iso(D.addDays(new Date(tsOf(at.t) || Date.now()), -1)), D.iso(D.addDays(b.due, -28))].sort()[1];
    const hit = v >= 1 && (R.transacoes || []).find((x) => !tx.has(x) && !usados.has(K.get(x)) && bank.has(x.conta) && x.v < 0 && Math.abs(-x.v - v) < 1 && x.d >= d0 && !outras.has(x.cat));
    if (hit) { tx.add(hit); ids.add(b.id); return; }
    const depois = new Date(b.due.getFullYear(), b.due.getMonth(), b.due.getDate() + 1).getTime();
    if (u && u > Math.max(tsOf(at.t), depois)) ids.add(b.id);
  });
  return { ids, tx };
}
function money() {
  const now = diaNow(), payday = D.payday(now), B = bills(), RF = reflected(B);
  const pagas = B.filter((b) => S.paid[b.id] && !b.porExtrato && !RF.ids.has(b.id)).reduce((a, b) => a + (S.paidAmt[b.id] ?? b.v), 0); // sai do saldo o valor pago, não o atual
  const avista = S.expenses.filter((x) => x.met !== CARD).reduce((a, x) => a + x.v, 0);
  const saldo = D.SAFE.saldo - pagas - avista;
  const due = B.filter((b) => !b.pago && b.id !== 'fatura' && b.met !== 'Cartão' && b.due <= payday);
  const contas = due.reduce((a, b) => a + b.v, 0);
  const fb = B.find((b) => b.id === 'fatura') || { id: 'fatura', pago: true, v: 0, due: payday }, faturaAntes = !fb.pago && fb.due <= payday ? fb.v : 0;
  const c0 = D.CARDS[0];
  let proxima = (c0 ? c0.faturas.proxima.v : 0) + cardNext();
  // A próxima vem do uso atual do cartão, que ainda inclui a fatura paga à mão até o banco registrar o pagamento
  // (a mesma regra do saldo, para os dois números nunca discordarem).
  if (c0 && c0.faturas.proxima.deUso && fb.pago && !fb.porExtrato && S.paid.fatura && !RF.ids.has('fatura')) proxima = Math.max(0, proxima - fb.v);
  return { saldo, contas, due, fb, fatura: fb.v, faturaAntes, proxima, payday, dias: D.diffDays(payday, now), livre: saldo - contas - faturaAntes };
}
// Contas marcadas à mão nos dados reais: valem no mês em que foram marcadas, só para a mesma conta (mesmo nome e
// vencimento: a fatura do cartão principal pode passar a ser de outro cartão), e saem quando o extrato mostra o pagamento.
const billName = (b) => String(b.n || '').split(' · ')[0];
function prunePaid() {
  if (!D.REAL) return false;
  const m = D.iso(diaNow()).slice(0, 7), B = bills(); let ch = false;
  Object.keys(S.paid).forEach((id) => {
    let at = S.paidAt[id];
    if (!at || typeof at !== 'object') { at = S.paidAt[id] = { m, t: new Date().toISOString(), xp: 0 }; ch = true; } // marcação de antes desta versão
    const b = B.find((x) => x.id === id);
    if (b && !at.due) { at.due = D.iso(b.due); at.n = billName(b); ch = true; }
    const outra = b && (at.due !== D.iso(b.due) || (at.n && at.n !== billName(b)));
    if (at.m !== m || (b && b.porExtrato) || outra) { delete S.paid[id]; delete S.paidAmt[id]; delete S.paidAt[id]; ch = true; }
  });
  return ch;
}
// Gastos registrados à mão, com o Open Finance: saem quando o extrato traz um lançamento do mesmo valor (do dia
// anterior a 5 dias depois; no cartão para gasto no cartão, numa conta para Pix; dinheiro não aparece no extrato)
// que não estava lá quando o gasto foi registrado e não explica outra coisa, ou quando todos os bancos atualizaram
// depois do registro. Cada lançamento vale para um gasto só, também entre uma abertura do app e outra.
const sameDebits = (v, d) => { if (!fromSB()) return []; const K = txKeys(), d0 = D.iso(D.addDays(dayAt(d), -1)); return (D.REAL.transacoes || []).filter((y) => y.v < 0 && y.d >= d0 && Math.abs(-y.v - v) < 0.5).map((y) => K.get(y)); };
function pruneExpenses() {
  if (!fromSB()) return false;
  const R = D.REAL, bank = bankIds(), card = new Set((R.cartoes || []).map((c) => c.id).filter(Boolean)), K = txKeys();
  const busy = S.expenses.length ? reflected(bills()).tx : new Set(), usados = new Set(S.txUsados), u = tsOf(R.atualizadoEm);
  let ch = false;
  const keep = S.expenses.filter((x) => {
    if (!x.t) { x.t = new Date().toISOString(); ch = true; } // registrado antes desta versão
    const ok = x.met === CARD ? card : x.met === 'Pix' ? bank : null;
    if (ok) {
      const d0 = D.iso(D.addDays(dayAt(x.d), -1)), d1 = D.iso(D.addDays(dayAt(x.d), 5)), ja = new Set(x.ja || []);
      const hit = (R.transacoes || []).find((y) => { const k = K.get(y); return y.v < 0 && ok.has(y.conta) && !busy.has(y) && !usados.has(k) && !ja.has(k) && Math.abs(-y.v - x.v) < 0.5 && y.d >= d0 && y.d <= d1; });
      if (hit) {
        const k = K.get(hit); usados.add(k); S.txUsados.push(k);
        // O banco não soube classificar (Pix para pessoa, por exemplo): fica com a categoria do gasto rápido.
        if (hit.id && x.cat && (/classificar/i.test(hit.cat || '') || hit.cat === 'Outros') && !hit.man) RECAT.push({ id: hit.id, cat: x.cat });
        return false;
      }
    }
    return !(u && u > tsOf(x.t));
  });
  if (keep.length !== S.expenses.length) { S.expenses = keep; ch = true; }
  // Uma chave só importa enquanto o lançamento pode casar com um gasto ainda na lista.
  const lim = D.iso(D.addDays(diaNow(), -10)), n0 = S.txUsados.length;
  S.txUsados = S.txUsados.filter((k) => k.slice(0, 10) >= lim);
  return ch || S.txUsados.length !== n0;
}
const pruneReal = () => { const a = prunePaid(), b = pruneExpenses(); return a || b; };
const livreLabel = (m) => (m.livre < 0 ? `Falta para as contas até ${dShort(m.payday)}` : `Livre para gastar até ${dShort(m.payday)}`);
const livreBig = (m) => `<span class="big${m.livre < 0 ? ' neg' : ''}" style="margin-top:2px">${brl0(Math.abs(m.livre))}</span>`;
function missionBill() { return bills().find((b) => !b.pago && !b.auto && D.diffDays(b.due, diaNow()) <= 1); }
// A Missão do dia é escolhida uma vez e fica fixa: pagar a conta não troca o texto pela próxima.
function missao() { if (S.missaoRef && S.missaoRef !== 't1' && !bills().some((b) => b.id === S.missaoRef)) S.missaoRef = null; if (!S.missaoRef) { const mb = missionBill(); S.missaoRef = mb ? mb.id : 't1'; save(); } return S.missaoRef; }


// ---------- XP das missões: o mesmo valor venha de onde vier ----------
// Sono curto troca o treino por recuperação: marcar no Hoje ou concluir no Treino conta igual na semana.
function corpoDefault() { const { key } = todaySession(); const red = !['REST', 'LIVRE'].includes(key) && zoneNow() === 'vermelho'; return red ? 'REC' : key; }
const QXP = () => { const { key } = todaySession(); return { corpo: key === 'REST' ? 15 : key === 'Z2' || key === 'LIVRE' ? 40 : 50, comb: 20, missao: 20 }; };
const QWHY = { corpo: 'Corpo feito', comb: 'Combustível em dia', missao: 'Missão cumprida' };
// Minutos de zona 2 que entram na semana: os do cronômetro, se ele rodou, senão os do plano para esta semana.
function z2Min() { const el = S.wStart ? Math.round((Date.now() - S.wStart) / 60000) : 0; const c = D.cardioMin(cw(plan())); return el >= 10 ? Math.min(el, 180) : c ? c.min : 0; }
function setQuest(k, on, why) {
  if (!!S.quests[k] === on) return;
  S.quests[k] = on;
  if (k === 'corpo') { S.corpoKey = on ? S.corpoKey || corpoDefault() : null; S.corpoMin = on && S.corpoKey === 'Z2' ? z2Min() : 0; }
  // O XP que sai ao desmarcar é o que entrou ao marcar (o plano do dia pode ter mudado no meio, com a sincronização).
  if (on) { const x = QXP()[k]; S.qxp[k] = x; addXP(x, why || QWHY[k]); }
  else { const x = Number.isFinite(S.qxp[k]) ? S.qxp[k] : QXP()[k]; delete S.qxp[k]; S.xp = Math.max(0, S.xp - x); touch(); }
  const all = S.quests.corpo && S.quests.comb && S.quests.missao;
  if (on && all && !S.perfect) { S.perfect = true; setTimeout(() => { addXP(20, 'Dia completo'); render(true); }, 700); }
  if (!on && S.perfect) { S.perfect = false; S.xp = Math.max(0, S.xp - 20); save(); }
  if (k === 'corpo') setTimeout(checkWeekly, 1200);
}

// ---------- Registros: o que você marcou aqui, mais o diário do Supabase ----------
const notionDia = (d) => { const x = D.SAUDE && D.SAUDE.diario.find((r) => r.d === d); if (!x) return null; const e = {}; if (fin(x.sono) != null) e.s = x.sono; if (fin(x.peso) != null) e.w = x.peso; return Object.keys(e).length ? e : null; };
// Apple Health pelo atalho do iPhone: a linha do diário do dia (com ah, a hora em que chegou) e o sono da noite,
// arredondado para baixo na opção do check-in (6,6 h fica 6: nunca sobe de zona por arredondamento).
const ahDia = (d) => { const x = D.SAUDE && D.SAUDE.diario.find((r) => r.d === d); return x && x.ah ? x : null; };
const ahSono = () => { const x = ahDia(S.day); return x && fin(x.sono) != null && x.sono > 0 ? x.sono : null; };
const ahPick = () => { const h = ahSono(); return h == null ? null : SLEEP.map((x) => x[1]).filter((v) => v <= h).pop() ?? 4.5; };
const atalhoEm = () => (D.SAUDE && D.SAUDE.atalhoEm) || {};
// Há quanto tempo: "agora", "há 5 min", "há 3 h", "há 2 dias".
const haQuanto = (iso) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 2 ? 'agora' : m < 60 ? `há ${m} min` : m < 36 * 60 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} dias`; };
const recente = (iso) => !!iso && Date.now() - Date.parse(iso) < 36 * 36e5;
// Eventos do Calendário do iPhone que tocam o dia d (um evento de vários dias aparece em todos); o horário só no dia
// em que ele começa.
const eventosDe = (d) => ((D.SAUDE && D.SAUDE.agenda) || []).filter((e) => e.d <= d && d <= e.ate);
const evH = (e, d) => (!e.diaTodo && e.h && e.d === d ? e.h : null);
const evSub = (e, d) => [evH(e, d) ? (e.fim && e.ate === d ? `${e.h}–${e.fim}` : e.h) : e.diaTodo ? (e.ate > e.d ? `dia inteiro, até ${dShort(dayAt(e.ate))}` : 'dia inteiro') : e.ate > d ? `até ${dShort(dayAt(e.ate))}${e.fim ? ` às ${e.fim}` : ''}` : e.fim ? `até ${e.fim}` : '', e.local, e.cal].filter(Boolean).join(' · ');
function logDia(d) { const loc = d === S.day ? logHoje(S) : S.dias[d] || null; const n = notionDia(d); return loc && n ? { ...n, ...loc } : loc || n; }
// Primeiro dia com registro: o dia em que o app começou a contar, ou o primeiro do diário do Supabase, se for antes.
function inicio() { const c = [S.since, ...((D.SAUDE && D.SAUDE.diario) || []).map((x) => x.d)].filter(isoOk).sort()[0]; return c ? D.startOfDay(dayAt(c)) : D.startOfDay(diaNow()); }
const FORCA = new Set(['A', 'B', 'C']);
// Treino de força feito: A, B, C ou um treino seu (F).
const ehForca = (k) => FORCA.has(k) || k === 'F';

// ---------- Hábito: consistência, Chama, brasa e chefe ----------
// Dias com check-in nos últimos 28, contando só a partir do primeiro dia de uso. Sem nenhum dia ainda, sem número.
function consistency() {
  const now = diaNow(), ini = D.startOfDay(dayAt(S.since || D.iso(now))); let ok = 0, n = 0;
  for (let i = 1; i <= 27; i++) { const d = D.addDays(now, -i); if (d < ini) break; const v = S.hist[D.iso(d)]; if (v === 'p') continue; n++; if (v === 1) ok++; }
  if (S.checkin) { n++; ok++; }
  return n ? Math.round((ok / n) * 100) : null;
}
const pctTxt = (v) => (v == null ? '—' : `${v}%`);
const diasTxt = (n) => `${n} dia${n === 1 ? '' : 's'}`;
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
// Chefe vencido: +500 XP uma vez no mês, e a Ficha passa a mostrar a vitória.
// Se a vitória veio do check-in de hoje e o sono foi corrigido para menos de 7 h, ela é desfeita, com os 500 XP.
function checkBoss() {
  const B = boss();
  if (B.hp === 0 && !B.won) { S.bossWon = monthKey(diaNow()); S.bossWonDay = S.day; addXP(500, 'Chefe vencido · Guardião da Noite'); return; }
  if (B.won && B.hp > 0 && S.bossWonDay === S.day) { S.bossWon = null; S.bossWonDay = null; S.xp = Math.max(0, S.xp - 500); touch(); toast('O chefe voltou: com o sono corrigido, o golpe de hoje não vale.'); render(true); }
}

// Semana de segunda a domingo, pelo que você registrou: sessões feitas (força e cardio) e minutos de zona 2.
const segunda = (ref = diaNow()) => D.addDays(ref, -((D.startOfDay(ref).getDay() + 6) % 7));
function semana(ref = diaNow()) {
  const seg = segunda(ref), n = D.diffDays(ref, seg); let sess = 0, forca = 0, z2 = 0, cardio = 0;
  for (let i = 0; i <= n; i++) {
    const e = logDia(D.iso(D.addDays(seg, i))); if (!e || !e.k) continue;
    if (e.k === 'Z2') { sess++; cardio++; z2 += e.z || 0; } else if (ehForca(e.k)) { sess++; forca++; } else if (e.k === 'LIVRE') sess++;
  }
  return { sess, forca, cardio, z2, week: cw(D.planFor(ref)), key: D.iso(seg) };
}
const cardiosSemana = () => { const m = D.metas().semana; return (m && Number(m.cardio)) || 2; };
const forcaSemana = () => { const m = D.metas().semana; return (m && Number(m.musculacao)) || 3; };
function weekly() {
  const W = semana(), c = D.cardioMin(W.week), alvo = c ? c.min * cardiosSemana() : null;
  return D.WEEKLY.map((q) => (q.id === 'plano'
    ? { ...q, p: Math.min(W.sess, q.of), ok: W.sess >= q.of && W.forca >= 2 }
    : { ...q, of: alvo, p: alvo ? Math.min(W.z2, alvo) : W.z2, ok: !!alvo && W.z2 >= alvo, d: alvo ? `${cardiosSemana()} cardios de ${esc(c.txt)} na zona 2` : 'A meta de zona 2 vem do plano de treino' }));
}
// XP da semana: uma vez por semana em cada missão, mais o bônus com as duas. Desfazer a sessão no mesmo dia devolve.
function checkWeekly() {
  const k = semana().key, got = (S.semXp[k] = S.semXp[k] || {}); let ch = false;
  weekly().forEach((q) => {
    if (q.ok && !got[q.id]) { got[q.id] = S.day; addXP(q.xp, `Missão da semana: ${q.t}`); ch = true; }
    else if (!q.ok && got[q.id] === S.day) { delete got[q.id]; S.xp = Math.max(0, S.xp - q.xp); ch = true; }
  });
  const both = D.WEEKLY.every((q) => got[q.id]);
  if (both && !got.bonus) { got.bonus = S.day; setTimeout(() => addXP(D.WEEKLY_BONUS, 'Semana completa'), 900); ch = true; }
  else if (!both && got.bonus === S.day) { delete got.bonus; S.xp = Math.max(0, S.xp - D.WEEKLY_BONUS); ch = true; }
  if (ch) { save(); render(true); }
}

// ---------- Atributos: de 0 a 100, pelo que você registrou ----------
// Janela de 28 dias (14 para sono, nutrição e foco), com no mínimo 7 dias para um dia só não valer 100. Força, Vigor,
// Nutrição e Foco contam a partir do primeiro dia de uso do app; Recuperação também usa o sono do diário do Supabase.
// Sem nenhum registro na janela, o atributo fica sem número.
function attrAt(off) {
  const end = D.addDays(diaNow(), -off), uso = D.startOfDay(dayAt(isoOk(S.since) ? S.since : D.iso(diaNow())));
  const dias = (n, ini) => { const L = []; for (let i = 0; i < n; i++) { const d = D.addDays(end, -i); if (d < ini) break; L.push(logDia(D.iso(d))); } return L; };
  const A28 = dias(28, uso), A14 = dias(14, uso), R14 = dias(14, inicio()), out = {};
  const w = (L) => Math.max(7, L.length);
  if (A28.some(Boolean)) {
    const forca = A28.filter((e) => e && ehForca(e.k)).length, z2 = A28.reduce((a, e) => a + (e && e.k === 'Z2' ? e.z || 0 : 0), 0);
    const cm = D.cardioMin(cw(D.planFor(end)));
    Object.assign(out, { FOR: lin(forca, 0, (forcaSemana() * 4 * w(A28)) / 28), VIG: cm ? lin(z2, 0, (cm.min * cardiosSemana() * w(A28)) / 7) : null });
  }
  if (A14.some(Boolean)) Object.assign(out, { NUT: lin(A14.filter((e) => e && e.b).length, 0, w(A14)), FOC: lin(A14.filter((e) => e && e.m).length, 0, w(A14)) });
  if (R14.some((e) => e && fin(e.s) != null)) out.REC = lin(R14.filter((e) => e && e.s >= 7).length, 0, w(R14));
  return out;
}
function attrs() {
  const a = attrAt(0), b = attrAt(7), R = D.SAVINGS && D.SAVINGS.reservaMeses;
  return D.ATTRS.map((x) => {
    const raw = x.k === 'PAT' ? (R != null ? lin(R, 0, 6) : null) : a[x.k] ?? null, prev = x.k === 'PAT' ? null : b[x.k] ?? null;
    const v = raw == null ? null : Math.round(raw);
    return { ...x, v, d: v != null && prev != null ? v - Math.round(prev) : null };
  });
}
const deltaTxt = (d) => (d == null ? 'sem histórico' : `${d >= 0 ? '+' : '−'}${Math.abs(d)} em 7 d`);

// ---------- Conquistas: ficam guardadas no dia em que você chega lá ----------
function conquistas() {
  const dias = [...Object.values(S.dias), logHoje(S)].filter(Boolean);
  const forca = dias.filter((e) => ehForca(e.k)).length, sk = Math.max(S.best, streakNow());
  let z28 = 0; for (let i = 0; i < 28; i++) { const e = logDia(D.iso(D.addDays(diaNow(), -i))); if (e && e.k === 'Z2') z28 += e.z || 0; }
  const W = semana(), R = D.SAVINGS && D.SAVINGS.reservaMeses;
  const st = {
    primeiro: [!!S.checkin || Object.values(S.hist).includes(1), 'Faça o check-in de hoje'],
    chama: [sk >= 7, `${sk} de 7 dias`],
    semana: [Object.values(S.semXp).some((w) => w && w.plano), `${W.sess} de 4 sessões nesta semana`],
    contador: [fromSB(), 'Entrar e sincronizar o Open Finance'],
    dez: [forca >= 10, `${forca} de 10 treinos`],
    escudo: [R != null && R >= 3, R != null ? `${n1(R)} de 3 meses` : 'Precisa do Open Finance e dos gastos essenciais'],
    pulmao: [z28 >= 300, `${z28} de 300 min em 28 dias`],
  };
  let ch = false;
  const out = D.ACHIEVEMENTS.map((a) => { const [ok, prog] = st[a.k] || [false, '']; if (ok && !S.conq[a.k]) { S.conq[a.k] = S.day; ch = true; } return { ...a, ok: !!S.conq[a.k], p: prog }; });
  if (ch) save();
  return out;
}

// ---------- Top 3: até três tarefas da caixa de entrada escolhidas para hoje. A primeira é a Missão. ----------
const top3 = () => S.inbox.filter((x) => x.top === S.day).sort((a, b) => (a.topAt || 0) - (b.topAt || 0)).slice(0, 3);
const top1 = () => top3()[0] || null;

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
  if (navigator.onLine) return '';
  return `<div class="netbar" role="status">${I('wifiOff', 20)}<span>Sem internet. O que você registrar fica salvo neste aparelho${nvJunto() ? ' e sobe para a nuvem quando a internet voltar' : ''}; dinheiro e saúde ficam com a última leitura.</span></div>`;
}
// Estado da sincronização com o Supabase: abre a tela da conexão.
function syncBtn() {
  const off = !navigator.onLine, s = SB.session();
  const lbl = off ? 'Sem internet' : !s ? 'Entrar para sincronizar' : syncErr || saudeErr ? 'Sincronização com problema' : 'Sincronizado';
  return `<a class="iconbtn" href="#/dinheiro/sincronizar" aria-label="${lbl}" style="color:${off || (s && (syncErr || saudeErr)) ? 'var(--warn)' : 'var(--muted)'}">${I(off ? 'wifiOff' : s ? 'cloudCheck' : 'link')}</a>`;
}
function stChip(st) { return `<span class="chip st-${st}">${D.ST[st]}</span>`; }
function ring(v, zone, size = 64, txt = null) {
  const r = size / 2 - 5, c = 2 * Math.PI * r, off = c * (1 - (v ?? 0) / 100);
  return `<div class="ring zone-${zone}" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="7"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--zc)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><b>${txt ?? v ?? '–'}</b></div>`;
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
// Linha no tempo (pesagens em datas irregulares): o eixo x é a data, não a ordem.
function timeChart(pts, o = {}) {
  const w = 320, h = o.h || 130, pt = 10, pr = 8, pb = 20, pl = 34;
  const vals = pts.map((p) => p.v), all = vals.concat(o.goal != null ? [o.goal] : []);
  let mn = Math.min(...all), mx = Math.max(...all); const sp = mx - mn || 1; mn -= sp * 0.12; mx += sp * 0.12;
  const t0 = +pts[0].d, ts = +pts[pts.length - 1].d - t0 || 1, iw = w - pl - pr, ih = h - pt - pb;
  const x = (d) => pl + ((+d - t0) / ts) * iw, y = (v) => pt + ih - ((v - mn) / (mx - mn)) * ih;
  const fmt = o.fmt || ((v) => n1(v)), col = o.color || 'var(--primary)';
  let g = '';
  [mx - sp * 0.12, mn + sp * 0.12].forEach((v) => { g += `<line x1="${pl}" x2="${w - pr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--line)" stroke-width="1"/><text x="${pl - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${fmt(v)}</text>`; });
  if (o.goal != null) g += `<line x1="${pl}" x2="${w - pr}" y1="${y(o.goal).toFixed(1)}" y2="${y(o.goal).toFixed(1)}" stroke="var(--xp-fill)" stroke-width="1.5" stroke-dasharray="4 4"/><text x="${w - pr}" y="${(y(o.goal) - 5).toFixed(1)}" text-anchor="end">meta ${fmt(o.goal)}</text>`;
  g += `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.v).toFixed(1)}`).join('')}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  g += pts.map((p, i) => `<circle cx="${x(p.d).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${i === pts.length - 1 ? 4 : 2.5}" fill="${col}" stroke="var(--surface)" stroke-width="${i === pts.length - 1 ? 2 : 1}"/>`).join('');
  const lab = (d) => (D.diffDays(pts[pts.length - 1].d, d) < 300 ? dShort(d) : `${mon(d)}/${String(d.getFullYear()).slice(2)}`);
  g += `<text x="${pl}" y="${h - 4}" text-anchor="start">${lab(pts[0].d)}</text><text x="${w - pr}" y="${h - 4}" text-anchor="end">${lab(pts[pts.length - 1].d)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(o.label || 'Gráfico')}">${g}</svg>`;
}
// Tela ou bloco sem dados: diz de onde eles vêm e qual é o próximo passo.
const empty = (ic, t, p, href = '', btn = '') => `<div class="card"><div class="empty"><span class="badge-ic">${I(ic, 28)}</span><b>${t}</b><p>${p}</p>${href ? `<a class="btn" href="${href}">${btn}</a>` : ''}</div></div>`;
const semSaude = () => empty('heart', 'Seus dados de saúde ficam no Supabase', SB.session() ? (syncBusy ? 'Buscando…' : saudeErr ? `A última leitura não veio: ${sbMsg(saudeErr)}` : 'Toque para buscar o plano de treino, as fichas, o plano alimentar, as medidas e os exames.') : 'Plano de treino, fichas, plano alimentar, medidas e exames chegam depois do login, só para a sua conta.', '#/dinheiro/sincronizar', SB.session() ? 'Sincronizar' : 'Entrar');
const semDinheiro = () => empty('wallet', 'Nenhum dado de dinheiro neste aparelho', 'Saldo, contas, fatura e patrimônio chegam pelo Open Finance depois do login, ou pelo arquivo do Painel.', '#/dinheiro/sincronizar', SB.session() ? 'Sincronizar' : 'Entrar');
const fmtNum = (v) => (Number.isFinite(v) ? v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—');
const fmtInt = (v) => Math.round(v).toLocaleString('pt-BR');
const dAno = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const txtBr = (s) => esc(String(s || '')).replace(/\n/g, '<br>');
const dQuando = (d) => (d.getFullYear() === diaNow().getFullYear() ? dShort(d) : dAno(d));

// ---------- Telas ----------
const hm = (s) => { const m = /(\d{1,2})[:h](\d{2})/.exec(s || ''); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null; };
function Hoje() {
  const V = view(), L = lvl(S.xp), now = new Date(), h = now.getHours();
  const greet = h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite', nome = nomeDe();
  const { p, key, s } = todaySession();
  const sl = sleepNow(), Z = zoneOf(sl);
  const sk = streakNow(), cons = consistency(), br = brasaYesterday();
  const chama = S.pausa ? `${I('pause', 20)}<span class="num">Pausa</span>` : `${I('flame', 20)}<span class="num">${sk}</span>${br ? '<small>brasa</small>' : '<small class="sr">dias</small>'}`;
  const hero = `<a class="hero" href="#/ficha" aria-label="Ficha do personagem: ${titleFor(L.L)}, nível ${L.L}, ${L.into} de ${L.need} XP. ${cons == null ? 'Consistência ainda sem dias' : `Consistência de ${cons}% em 28 dias`}. ${S.pausa ? 'Chama em pausa' : `Chama de ${sk} dias${br ? ', salva pela brasa' : ''}`}. ${sl == null ? 'Sem check-in de sono hoje' : `Sono de ${hTxt(sl)}, zona ${ZNAME[Z].toLowerCase()}`}.">
      <div class="top"><div class="avatar" aria-hidden="true">${inicial()}<span class="lv">${L.L}</span></div>
      <div class="grow"><div class="row-flex"><b>${titleFor(L.L)}</b><span class="muted small num xpn">${L.into}/${L.need} XP</span></div>${bar((L.into / L.need) * 100, null, 'xp')}</div></div>
      <div class="hstats"><span class="hs cons">${I('target', 20)}<span class="num">${pctTxt(cons)}</span><small>28 dias</small></span><span class="hs ${S.pausa ? '' : br ? 'flame brasa' : 'flame'}">${chama}</span><span class="hs zone-${Z}">${I('bolt', 20)}<span class="num">${sl == null ? '—' : `${hShort(sl)} h`}</span><small>${Z === 'nd' ? 'sono' : ZNAME[Z].toLowerCase()}</small></span></div>
    </a>`;

  // Missões
  const X = QXP(), F = !['REST', 'LIVRE'].includes(key);
  let corpo = { t: s.nome, d: s.resumo || '', go: '#/saude/treino', goAct: 'openTreino', xp: X.corpo };
  if (key === 'LIVRE') corpo = { ...corpo, t: 'Treino livre', d: `${s.nome}. ${s.resumo}.` };
  if (p.deload && F) corpo.d += ' · semana de deload';
  if (Z === 'amarelo' && FORCA.has(key)) corpo.d = `${s.resumo} · Sono entre 6 e 7 h: uma série a menos por exercício`;
  if (Z === 'vermelho' && F) corpo = { ...corpo, t: 'Recuperação', d: `Menos de 6 h de sono: caminhada leve ou mobilidade, no lugar de ${s.nome.toLowerCase()}. Vale os mesmos ${X.corpo} XP.` };
  const pr = D.prot(), tk = S.dayType || D.tipoDia(key), kc = D.kcalDia(tk);
  const comb = pr ? { t: `Proteína ${pr.meta} g`, d: `Dia de ${D.DIAS[tk].toLowerCase()}${kc ? ` · ${fmtInt(kc)} kcal` : ''} · conta a partir de ${pr.conta} g`, go: '#/saude/dieta', xp: X.comb } : { t: 'Proteína na meta', d: 'A meta vem do plano alimentar no Supabase', go: '#/saude/dieta', xp: X.comb };
  const ref = missao(), mbill = ref !== 't1' ? bills().find((b) => b.id === ref) : null, t1 = top1();
  const miss = mbill ? { t: `Pagar ${mbill.n.split(' · ')[0].toLowerCase()}`, d: `${brl(mbill.v)} · ${relDue(mbill)}`, goAct: 'bill', goArg: mbill.id, goLabel: 'Ver a conta', xp: X.missao }
    : t1 ? { t: 'Concluir o Top 1 do dia', d: t1.t, go: '#/agenda', xp: X.missao } : { t: 'Escolher o Top 1 do dia', d: 'Na Agenda, marque até 3 tarefas com a estrela. A primeira é a Missão.', go: '#/agenda', xp: X.missao };
  const qrow = (k, label, q) => {
    const on = V.quests[k];
    const go = q.go ? `<a class="iconbtn go" href="${q.go}" ${q.goAct ? `data-act="${q.goAct}"` : ''} aria-label="Abrir ${label}">${I('chevR')}</a>` : `<button class="iconbtn go" data-act="${q.goAct}" data-arg="${esc(q.goArg)}" aria-label="${q.goLabel || 'Abrir ' + label}">${I('chevR')}</button>`;
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
      <p class="lead">${S.pausa ? 'Modo Pausa ligado: o check-in é opcional e nada conta contra você.' : 'As horas de sono decidem o treino de hoje. O peso é só se você se pesou.'}</p>
      ${checkinForm()}
      <button class="btn block" style="margin-top:16px" data-act="saveCheckin">Salvar check-in</button>
    </section>`;
  } else {
    ci = `<section class="card"><div class="done-line"><span class="tick">${I('check', 20)}</span><div class="grow"><b>Check-in feito</b><div class="meta muted small num">${V.checkin.w != null ? `${n1(V.checkin.w)} kg · ` : ''}${hTxt(V.checkin.s)} de sono · zona ${ZNAME[Z].toLowerCase()}</div></div><button class="btn sm ghost" data-act="openCheckin">Editar</button></div></section>`;
  }

  // Noite
  const tq = D.planFor(D.addDays(diaNow(), 1)), ts = D.sessao(tq), ttk = D.tipoDia(ts.tipo || 'LIVRE'), tkc = D.kcalDia(ttk);
  const evening = V.evening ? `<section class="card soft" aria-labelledby="ev-t">
      <div class="row-flex">${I('moon')}<h3 id="ev-t" tabindex="-1">Fechar o dia</h3><span class="chip right num">${doneN}/3</span></div>
      <p class="lead" style="color:var(--ink)">${doneN === 3 ? 'Dia completo. ' : 'Marque abaixo o que você fez. '}Meta de sono: <b>${Number(D.metas().sono) || 7} h</b>.</p>
      <p class="small" style="margin-top:8px">Amanhã: <b>${esc(ts.tipo ? ts.nome : 'sem sessão no plano')}</b>${D.SAUDE && D.SAUDE.refeicoes.length ? ` · dia de ${D.DIAS[ttk].toLowerCase()}${tkc ? ` (${fmtInt(tkc)} kcal)` : ''}` : ''}.</p>
      ${S.closed ? `<p class="small b" style="margin-top:10px;color:var(--primary)">Dia fechado. Bom descanso.</p>` : `<button class="btn block" style="margin-top:12px" data-act="closeDay">Fechar o dia</button>`}
    </section>` : '';

  // Linha do dia: o que já existe no Painel e os eventos do Calendário do iPhone (atalho)
  const meals = D.SAUDE ? D.refeicoes(tk) : [];
  const slots = [
    { h: 'Hoje', t: corpo.t, c: 'var(--a-for)' },
    ...(mbill && !mbill.pago ? [{ h: 'Hoje', t: miss.t, c: 'var(--danger)' }] : []),
    ...top3().filter((x) => !x.done).map((x) => ({ h: hm(x.hora) || 'Top 3', t: x.t, c: 'var(--a-foc)' })),
    ...S.inbox.filter((x) => x.quando === S.day && x.top !== S.day && !x.done).map((x) => ({ h: hm(x.hora) || 'Hoje', t: x.t, c: 'var(--info)' })),
    ...eventosDe(S.day).map((e) => ({ h: evH(e, S.day) || 'Hoje', t: e.t, c: 'var(--ev)' })),
    ...meals.map((m) => ({ h: hm(m.hora) || '—', t: m.nome, c: 'var(--a-nut)' })),
  ];
  const isHm = (x) => /^\d\d:\d\d$/.test(x.h);
  const ord = [...slots.filter((x) => !isHm(x) && x.h !== '—'), ...slots.filter(isHm).sort((a, b) => a.h.localeCompare(b.h)), ...slots.filter((x) => x.h === '—')];
  const nowHM = hmAgora();
  const nextIdx = ord.findIndex((x) => isHm(x) && x.h >= nowHM);
  const agenda = `<section class="hscroll" tabindex="0" aria-label="Linha do dia, role para o lado">${ord.map((x, i) => `<div class="slot ${i === nextIdx ? 'now' : ''}"><div class="h"><span class="k" style="--c:${x.c}"></span>${esc(x.h)}${i === nextIdx ? '<span class="sr"> (próximo)</span>' : ''}</div><div class="t">${esc(x.t)}</div></div>`).join('')}</section>`;

  // Dinheiro
  let moneyCard;
  if (!D.REAL) moneyCard = `<a class="card cardlink" href="#/dinheiro/sincronizar"><span class="badge-ic">${I('wallet')}</span><div class="grow"><b>${SB.session() ? 'Buscar os dados do Open Finance' : 'Entrar para ver o dinheiro'}</b><div class="small muted">Saldo, contas e fatura chegam pelo Supabase.</div></div>${I('chevR', 24, 'class="ic chev"')}</a>`;
  else {
    const M = money(), up = bills().filter((b) => !b.pago && b.met !== 'Cartão' && D.diffDays(b.due, diaNow()) <= 7).slice(0, 3), R = D.SAVINGS && D.SAVINGS.reservaMeses;
    moneyCard = `<div class="card">
      <a class="cardhead" href="#/dinheiro"><span class="row-flex"><span class="muted small">${livreLabel(M)} (em ${M.dias} dias)</span>${I('chevR', 20, 'class="ic right muted"')}</span>
      ${livreBig(M)}</a>
      <div class="kpis"><div class="kpi"><span>Em conta</span><b>${brlK(M.saldo)}</b></div>${fatKpi(M)}<div class="kpi"><span>Reserva</span><b>${R != null ? `${n1(R)} meses` : '—'}</b></div></div>
    </div>
    ${up.length ? `<div class="card tight">${up.map((b) => `<button class="row" data-act="bill" data-arg="${esc(b.id)}"><span class="badge-ic">${I('receipt', 20)}</span><div class="grow"><div class="ttl ellip">${esc(b.n)}</div><div class="meta">${relDue(b)}</div></div><div class="amt"><div class="num">${brl(b.v)}</div>${stChip(b.st)}</div></button>`).join('')}</div>` : ''}`;
  }

  // Semana
  const P = D.SAUDE && D.SAUDE.plano, b = p.bloco;
  const chips = P && p.week ? `<div class="row-flex wrap" style="margin-bottom:4px">${b ? `<span class="chip p">${I('target')} Bloco ${b.n} · ${esc(b.nome)}</span>` : ''}<span class="chip num">semana ${p.week} de ${P.semanas}</span>${p.deload ? '<span class="chip">deload</span>' : ''}</div>`
    : P && p.pre ? `<div class="row-flex wrap" style="margin-bottom:4px"><span class="chip">${I('target')} O plano começa em ${dShort(P.ini)}</span></div>` : '';
  const week = `<div class="card">${chips}${weekly().map(weekRow).join('')}</div>`;

  return {
    title: 'Hoje',
    html: `${hdr(`${greet}${nome ? `, ${esc(nome)}` : ''}`, dLong(diaNow()), syncBtn())}
      ${netbar()}${hero}${evening}${ci}
      <section class="card" aria-labelledby="q-t"><div class="row-flex"><h3 id="q-t">Missões de hoje</h3><span class="chip right num ${doneN === 3 ? 'p' : ''}">${doneN}/3${doneN === 3 ? ' · dia completo' : ''}</span></div>
        ${qrow('corpo', 'Corpo', corpo)}${qrow('comb', 'Combustível', comb)}${qrow('missao', 'Missão', miss)}
        ${doneN < 3 ? `<p class="small muted" style="margin-top:4px">As três juntas dão +20 XP de bônus.${S.pausa ? ' Em Modo Pausa nada disso conta contra você.' : ''}</p>` : ''}
      </section>
      ${sec('Linha do dia', '<a href="#/agenda">Agenda</a>')}${agenda}
      ${sec('Dinheiro', D.REAL ? '<a href="#/dinheiro/contas">Contas</a>' : '')}${moneyCard}
      ${sec('Semana')}${week}`,
  };
}
const weekRow = (q) => `<div style="margin-top:12px"><div class="row-flex"><span class="b small grow">${q.t}</span><span class="small muted num">${q.p}/${q.of ?? '—'}${q.un ? ' ' + q.un : ''} · ${q.xp} XP</span></div>${bar(q.of ? (q.p / q.of) * 100 : 0)}</div>`;

// Pesagens: medidas e diário do Supabase, mais os check-ins com peso (o check-in do dia vale mais que o resto).
function pesos() {
  const m = new Map(), H = D.SAUDE;
  ((H && H.medidas) || []).forEach((x) => { if (fin(x.peso) != null) m.set(x.d, { d: dayAt(x.d), v: x.peso, f: 'Medida' }); });
  ((H && H.diario) || []).forEach((x) => { if (fin(x.peso) != null) m.set(x.d, { d: dayAt(x.d), v: x.peso, f: 'Diário' }); });
  Object.entries(S.dias).forEach(([d, e]) => { if (e && fin(e.w) != null && isoOk(d)) m.set(d, { d: dayAt(d), v: e.w, f: 'Check-in' }); });
  if (S.checkin && fin(S.checkin.w) != null) m.set(S.day, { d: dayAt(S.day), v: S.checkin.w, f: 'Check-in' });
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map((x) => x[1]);
}
const lastWeight = () => { const P = pesos(); return P[P.length - 1] || null; };

function checkinForm() {
  const ah = ahSono(), w = S.checkin ? S.checkin.w : null, s = S.checkin ? S.checkin.s : S.sleep ?? ahPick(), lw = lastWeight();
  const src = ah != null ? `Apple Health: ${n1(ah)} h` : atalhoEm().saude ? 'o Apple Health ainda não mandou esta noite' : 'Apple Health não conectado';
  return `<div class="ci-label">Peso <span class="src">${lw ? `último: ${n1(lw.v)} kg em ${dQuando(lw.d)}` : 'opcional'}</span></div>
    <div class="stepper"><button type="button" data-act="wstep" data-arg="-0.1" aria-label="Diminuir 100 gramas">${I('minus')}</button>
      <input id="ci-w" type="text" inputmode="decimal" value="${w != null ? n1(w) : pesoRasc != null ? esc(pesoRasc) : ''}" placeholder="${lw ? n1(lw.v) : '—'}" aria-label="Peso em quilos, vazio se não se pesou" data-in="weight"><span class="u">kg</span>
      <button type="button" data-act="wstep" data-arg="0.1" aria-label="Aumentar 100 gramas">${I('plus')}</button></div>
    <div class="ci-label" id="sl-l">Sono, em horas <span class="src">${src}</span></div>
    <div class="picks six" role="radiogroup" aria-labelledby="sl-l">${SLEEP.map(([l, v]) => `<button type="button" class="pick" role="radio" aria-checked="${s === v}" tabindex="${s === v || (s == null && v === 7) ? 0 : -1}" data-act="sleep" data-arg="${v}" aria-label="${l === '<5' ? 'menos de 5' : l === '9+' ? '9 ou mais' : l} horas">${l}</button>`).join('')}</div>`;
}

const foraRef = (e) => Number.isFinite(e.v) && ((e.hi != null && e.v > e.hi) || (e.lo != null && e.v < e.lo));
// Último resultado de cada marcador (a lista vem em ordem de data).
function examesUltimos() { const m = new Map(); ((D.SAUDE && D.SAUDE.exames) || []).forEach((e) => { if (e.n) m.set(e.n, e); }); return [...m.values()]; }

function Saude() {
  const H = D.SAUDE, P = H && H.plano, { p, key, s } = todaySession(), sl = sleepNow(), Z = zoneOf(sl);
  const advice = { verde: 'Treino completo, como no plano.', amarelo: 'Uma série a menos por exercício.', vermelho: 'Só caminhada leve ou mobilidade.', nd: 'Faça o check-in para ajustar o treino ao sono.' }[Z];
  const red = Z === 'vermelho' && !['REST', 'LIVRE'].includes(key);
  const nextGym = (() => { if (!P) return null; for (let i = 0; i < 7; i++) { const q = D.planFor(D.addDays(diaNow(), i)); if (FORCA.has(q.tipo)) return { i, q }; } return null; })();

  const WS = pesos(), last = WS[WS.length - 1];
  let peso;
  if (!last) peso = `<div class="card"><p class="small muted" style="margin:0">Sem pesagens ainda. O check-in da manhã aceita o peso, e as medidas vêm do Supabase.</p></div>`;
  else {
    const ano = WS.filter((x) => D.diffDays(last.d, x.d) <= 365), pts = ano.length >= 3 ? ano : WS.slice(-8);
    const prev = [...WS].reverse().find((x) => D.diffDays(last.d, x.d) >= 14), meta = fin(Number(D.metas().peso));
    peso = `<div class="card"><div class="row-flex"><div><div class="mid">${n1(last.v)} kg</div><div class="small muted">${last.f} de ${dQuando(last.d)}${prev ? ` · ${last.v <= prev.v ? '−' : '+'}${n1(Math.abs(last.v - prev.v))} kg desde ${dQuando(prev.d)}` : ''}</div></div>${meta ? `<div class="right small muted">meta<br><b class="num" style="color:var(--ink)">${n1(meta)} kg</b></div>` : ''}</div>
      ${pts.length >= 2 ? `${timeChart(pts, { goal: meta, label: `Peso: de ${n1(pts[0].v)} kg em ${dQuando(pts[0].d)} para ${n1(last.v)} kg em ${dQuando(last.d)}` })}<div class="legend"><span><i style="--c:var(--primary)"></i>pesagens</span>${meta ? '<span><i style="--c:var(--xp-fill)"></i>meta</span>' : ''}</div>` : ''}
      <p class="small muted" style="margin-top:8px">Medidas e diário do Supabase, mais os check-ins com peso. A variação de um dia para o outro é água.</p></div>`;
  }
  const alvo = Number(D.metas().sono) || 7;
  const noites = Array.from({ length: 7 }, (_, i) => { const d = D.addDays(diaNow(), i - 6), e = logDia(D.iso(d)); return { d, h: e && fin(e.s) != null ? e.s : null }; });
  const com = noites.filter((x) => x.h != null);
  const sono = com.length ? `<div class="card"><div class="row-flex"><div class="mid">${n1(com.reduce((a, x) => a + x.h, 0) / com.length)} h</div><span class="small muted">média de ${com.length} noite${com.length > 1 ? 's' : ''} · alvo ${alvo} h</span></div>
      ${barChart(noites.map((x) => ({ v: x.h || 0, l: wd(x.d).slice(0, 3), c: 'var(--a-rec)', dim: x.h == null || x.h < alvo })), { target: alvo, label: 'Horas de sono nos últimos 7 dias', values: (v) => (v ? n1(v) : '') })}</div>`
    : `<div class="card"><p class="small muted" style="margin:0">Sem noites registradas nesta semana. O check-in da manhã pede as horas de sono.</p></div>`;

  let planos = '';
  if (H) {
    const tk = S.dayType || D.tipoDia(key), kc = D.kcalDia(tk), pr = D.prot();
    const ultD = H.exames.length ? H.exames[H.exames.length - 1].d : null, fora = ultD ? H.exames.filter((e) => e.d === ultD && foraRef(e)).length : 0;
    planos = `${sec('Plano')}
      ${P ? `<a class="card cardlink" href="#/saude/campanha"><span class="badge-ic">${I('target')}</span><div class="grow"><b>${esc(P.nome || `Plano de ${P.semanas} semanas`)}</b><div class="small muted">${P.blocos.length} blocos · de ${dQuando(P.ini)}${isoOk(P.fim) ? ` a ${dQuando(dayAt(P.fim))}` : ''}</div>${bar(p.fim ? 100 : ((p.week || 0) / P.semanas) * 100)}</div>${I('chevR', 24, 'class="ic chev"')}</a>` : ''}
      ${H.refeicoes.length ? `<a class="card cardlink" href="#/saude/dieta"><span class="badge-ic">${I('utensils')}</span><div class="grow"><b>Dieta de hoje</b><div class="small muted">Dia de ${D.DIAS[tk].toLowerCase()}${kc ? ` · ${fmtInt(kc)} kcal` : ''}${pr ? ` · proteína ${pr.meta} g` : ''}</div></div>${I('chevR', 24, 'class="ic chev"')}</a>` : ''}
      <a class="card cardlink" href="#/saude/exames"><span class="badge-ic">${I('flask')}</span><div class="grow"><b>Exames e medidas</b><div class="small muted">${ultD ? `Último exame em ${dAno(dayAt(ultD))} · ${fora} fora da referência` : 'Sem exames'}${H.medidas.length ? ` · ${H.medidas.length} medidas` : ''}</div></div>${I('chevR', 24, 'class="ic chev"')}</a>`;
    const anos = {}; H.historico.forEach((x) => { const y = x.mes.slice(0, 4); anos[y] = (anos[y] || 0) + (Number(x.musculacao) || 0) + (Number(x.cardio) || 0) + (Number(x.outros) || 0); });
    const AY = Object.keys(anos).sort();
    if (AY.length) planos += `${sec('Histórico de treinos')}<div class="card">${barChart(AY.map((y) => ({ v: anos[y], l: y, c: 'var(--a-for)' })), { label: 'Treinos por ano', values: (v) => (v ? fmtInt(v) : '') })}<p class="small muted" style="margin-top:6px">Treinos por ano, de ${D.mesCurto(H.historico[0].mes)} a ${D.mesCurto(H.historico[H.historico.length - 1].mes)}, do histórico mensal no Supabase.</p></div>`;
  }
  const sessTxt = red ? 'Recuperação' : s.nome, sessSub = red ? 'Menos de 6 h de sono: caminhada leve ou mobilidade' : s.resumo;
  return {
    title: 'Saúde',
    html: `${hdr('Saúde', P && p.week ? `${p.bloco ? `Bloco ${p.bloco.n} · ${esc(p.bloco.nome)} · ` : ''}semana ${p.week} de ${P.semanas}` : P && p.pre ? `O plano começa em ${dShort(P.ini)}` : P && p.fim ? 'Plano de treino concluído' : '')}${netbar()}
      <button class="card cardlink" style="width:calc(100% - 32px);text-align:left" data-act="energia">
        <span class="sr">${sl == null ? 'Sem check-in de sono hoje.' : `Sono de ${hTxt(sl)}.`}</span>${ring(sl == null ? 0 : lin(sl, 4, 8), Z, 64, sl == null ? '—' : hShort(sl))}<div class="grow"><div class="row-flex"><b>Energia</b><span class="zpill zone-${Z} small">${ZNAME[Z]}</span></div><p class="small muted">Pelas horas de sono do check-in.</p><p class="small" style="margin-top:2px">${advice}</p><span class="sr">Ver como é calculada.</span></div>${I('info', 20, 'class="ic chev"')}
      </button>
      <a class="card cardlink" href="#/saude/treino" data-act="openTreino"><span class="badge-ic p">${I(key === 'Z2' ? 'pulse' : key === 'REST' || key === 'LIVRE' || red ? 'walk' : 'dumbbell')}</span><div class="grow"><div class="muted small">Hoje</div><b>${esc(sessTxt)}</b><div class="small muted">${esc(sessSub || '')}</div></div>${I('chevR', 24, 'class="ic chev"')}</a>
      ${nextGym && nextGym.i > 0 ? `<a class="card cardlink" href="#/saude/treino" data-act="openTreino" data-arg="${nextGym.q.tipo}"><span class="badge-ic">${I('dumbbell')}</span><div class="grow"><div class="muted small">Próximo treino de força · ${nextGym.i === 1 ? 'amanhã' : wd(D.addDays(diaNow(), nextGym.i))}</div><b>${esc(D.sessao(nextGym.q).nome)}</b></div>${I('chevR', 24, 'class="ic chev"')}</a>` : ''}
      <a class="card cardlink" href="#/saude/exercicios"><span class="badge-ic">${I('search')}</span><div class="grow"><div class="muted small">Exercícios e treinos seus</div><b>Base de exercícios e cargas</b><div class="small muted">Monte um treino, troque exercícios, edite as fichas</div></div>${I('chevR', 24, 'class="ic chev"')}</a>
      ${sec('Peso', H ? '<a href="#/saude/exames">Medidas</a>' : '')}${peso}
      ${ahCard()}
      ${sec('Sono · 7 dias')}${sono}
      ${H ? planos : `${sec('Plano')}${semSaude()}`}
      <p class="small muted" style="margin:14px 20px">${I('note', 16, 'style="display:inline;vertical-align:-3px"')} ${H && H.fonte ? `${esc(H.fonte)}. ` : ''}${atalhoEm().saude ? `Apple Health recebido ${haQuanto(atalhoEm().saude)} pelo atalho do iPhone; o check-in vale mais que ele no dia em que os dois existem.` : 'Apple Health ainda não conectado: o sono vem do check-in. O atalho do iPhone (em Sincronizar) traz sono, passos, peso e mais.'}</p>`,
  };
}

// O que o Apple Health mandou (sono da última noite, passos, energia ativa, exercício, VFC e FC de repouso). Sem treinos:
// eles não passam pelo atalho.
function ahCard() {
  const H = D.SAUDE, rows = H ? H.diario.filter((x) => x.ah) : [];
  if (!rows.length) return '';
  const ult = (k) => { for (let i = rows.length - 1; i >= 0; i--) if (fin(rows[i][k]) != null) return rows[i]; return null; };
  const quando = (r) => (r.d === S.day ? 'hoje' : r.d === D.iso(D.addDays(dayAt(S.day), -1)) ? 'ontem' : dShort(dayAt(r.d)));
  const k = (n, key, fmt) => { const r = ult(key); return `<div class="kpi"><span>${n}</span><b class="num">${r ? fmt(r[key]) : '—'}</b><small>${r ? quando(r) : 'sem dado'}</small></div>`; };
  return `${sec('Apple Health', `<span class="small muted">${haQuanto(atalhoEm().saude || rows[rows.length - 1].ah)}</span>`)}<div class="card"><div class="kpis" style="margin-top:0">
    ${k('Sono', 'sono', (v) => `${n1(v)} h`)}${k('Passos', 'passos', fmtInt)}${k('Energia ativa', 'kcalAtiva', (v) => `${fmtInt(v)} kcal`)}
    ${k('Exercício', 'exMin', (v) => `${fmtInt(v)} min`)}${k('VFC', 'hrv', (v) => `${fmtInt(v)} ms`)}${k('FC de repouso', 'fc', (v) => `${fmtInt(v)} bpm`)}</div>
    <p class="xs muted" style="margin-top:8px">Pelo atalho Painel Sync do iPhone, que só lê o Saúde com o celular desbloqueado. Treinos não passam: o Corpo conta o que você marca aqui.</p></div>`;
}

// ---------- Treinos seus, fichas editadas e a base de exercícios ----------
const PRESC = '3 × 8–12';
const LS = (k) => { const v = S.lastSets[k]; return v && typeof v === 'object' && !Array.isArray(v) ? v : null; };
const exArr = (a) => (Array.isArray(a) ? a : []).filter((x) => x && typeof x.n === 'string' && x.n.trim()).slice(0, 30)
  .map((x) => ({ n: x.n.trim().slice(0, 60), p: typeof x.p === 'string' ? x.p.trim().slice(0, 40) : '' }));
function treinoP(id) { const t = LS(K_T + id); return t ? { id, nome: (typeof t.nome === 'string' && t.nome.trim().slice(0, 40)) || 'Treino', ex: exArr(t.ex), dia: isoOk(t.dia) ? t.dia : null } : null; }
const meusTreinos = () => Object.keys(S.lastSets).filter((k) => k.startsWith(K_T)).map((k) => treinoP(k.slice(K_T.length))).filter(Boolean);
const putT = (t) => { S.lastSets[K_T + t.id] = { nome: t.nome, ex: t.ex, ...(t.dia ? { dia: t.dia } : {}) }; };
const fKey = (f) => `${f.treino}-${f.bloco ?? 0}`;
const exOrig = (f) => (f.exercicios || []).filter((e) => e && e.nome).map((e) => ({ n: String(e.nome).trim().slice(0, 60), p: String(e.prescricao || '').trim().slice(0, 40) }));
const exDaFicha = (f) => { const ed = LS(K_F + fKey(f)); return ed ? exArr(ed.ex) : exOrig(f); };
const troca = (sel, j) => { const v = S.sets[`${K_S}${sel}-${j}`]; return v && typeof v.n === 'string' && v.n.trim() ? v.n.trim().slice(0, 60) : null; };

// A sessão escolhida já convertida em exercícios com séries e faixa de repetições: a ficha do bloco (ou a sua versão
// dela) para A, B e C; o treino seu para P:id. A troca de hoje entra no lugar, com as séries do exercício trocado.
function fichaList(sel, p) {
  if (isP(sel)) {
    const t = treinoP(sel.slice(2)), q = { ...p, tipo: sel, semBloco: 99 };
    const ss = { tipo: sel, nome: t ? t.nome : 'Treino', resumo: '', ficha: t ? { treino: sel, orientacao: '', observacoes: [] } : null };
    const base = t ? t.ex : [];
    return { ss, f: ss.ficha, q, t, base, list: lista(sel, base, q) };
  }
  const ss = sessOf(p, sel), f = ss.ficha, q = { ...p, tipo: sel };
  const base = f && FORCA.has(sel) ? exDaFicha(f) : [];
  return { ss, f, q, base, list: lista(sel, base, q) };
}
function lista(sel, base, q) {
  return base.map((e, j) => {
    const tr = troca(sel, j), ex = D.exercicio({ nome: tr || e.n, prescricao: e.p || PRESC }, q);
    if (tr && D.slug(tr) !== D.slug(e.n)) ex.no = e.n;
    return ex;
  });
}
// Muda a lista de exercícios da sessão: o treino seu, ou a sua versão da ficha (a do Supabase continua lá).
function setBase(sel, arr) {
  const ex = exArr(arr);
  if (isP(sel)) { const t = treinoP(sel.slice(2)); if (!t) return false; putT({ ...t, ex }); return true; }
  const f = fichaList(sel, plan()).f; if (!f) return false;
  S.lastSets[K_F + fKey(f)] = { ex };
  return true;
}

// A base de exercícios: os das fichas (originais e editadas), os dos seus treinos, os que você criou, os que já têm carga
// (esses são "seus" e vêm primeiro) e o catálogo de musculação do app, por grupo muscular.
const normq = (s) => D.slug(s).replace(/-/g, ' ');
const GRUPO_DE = new Map(); for (const g of GRUPOS) for (const n of CATALOGO[g]) GRUPO_DE.set(D.slug(n), g);
function biblioteca() {
  const m = new Map(), H = D.SAUDE;
  const add = (nome, p, onde, cat) => {
    nome = String(nome || '').trim(); const id = D.slug(nome); if (!id) return;
    let x = m.get(id); if (!x) m.set(id, (x = { id, nome, p: '', onde: [], g: GRUPO_DE.get(id) || '', meu: false }));
    if (!cat) x.meu = true;
    if (!x.p && p) x.p = p; if (onde && !x.onde.includes(onde)) x.onde.push(onde);
  };
  for (const f of (H && H.fichas) || []) if (FORCA.has(f.treino)) { const o = `Treino ${f.treino}${f.bloco ? ` (bloco ${f.bloco})` : ''}`; exDaFicha(f).forEach((e) => add(e.n, e.p, o)); exOrig(f).forEach((e) => add(e.n, e.p)); }
  for (const t of meusTreinos()) t.ex.forEach((e) => add(e.n, e.p, t.dia ? null : t.nome));
  for (const k of Object.keys(S.lastSets)) { const v = LS(k); if (v && typeof v.n === 'string' && (k.startsWith(K_E) || /^[a-z0-9-]+$/.test(k))) add(v.n, '', null); }
  for (const g of GRUPOS) for (const n of CATALOGO[g]) add(n, '', null, true);
  return [...m.values()].sort((a, b) => (b.meu - a.meu) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
// Como fazer: abre a busca de vídeos do exercício no YouTube (no iPhone, no app do YouTube). O app não guarda vídeos nem GIFs.
const videoUrl = (nome) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${nome} execução`)}`;
const videoLink = (nome, cls = 'small') => `<a class="${cls} vlink" href="${videoUrl(nome)}" target="_blank" rel="noopener noreferrer">${I('eye', 16)}<span>Ver como faz</span><span class="sr"> ${esc(nome)}, abre o YouTube</span></a>`;
const buscar = (L, q) => { const t = normq(q).split(' ').filter(Boolean); return t.length ? L.filter((x) => { const n = normq(x.nome); return t.every((w) => n.includes(w)); }) : L; };
function ultimaTxt(id) {
  const l = LS(id); if (!l || !Array.isArray(l.reps) || !l.reps.length) return '';
  return `${l.kg ? `${D.fmtKg(l.kg)} kg × ` : ''}${l.reps.join(', ')}${isoOk(l.d) ? ` · ${dShort(dayAt(l.d))}` : ''}`;
}
function historico(id) {
  const pre = `${id}@`;
  return Object.keys(S.lastSets).filter((k) => k.startsWith(pre) && isoOk(k.slice(pre.length))).sort().reverse()
    .map((k) => ({ d: k.slice(pre.length), ...LS(k) })).filter((x) => Array.isArray(x.reps));
}

// Ficha do dia (ou da sessão escolhida): séries, cargas sugeridas e o que você marcou.
const nSeries = (ex, cut) => (cut && ex.series > 1 ? ex.series - 1 : ex.series);
const setKey = (sel, j, ex, i) => `${sel}-${j}-${ex.id}-${i}`;
const seuTreinoRow = (t) => `<button class="row" data-act="tAbrir" data-arg="${t.id}"><span class="badge-ic">${I('dumbbell', 20)}</span><div class="grow"><div class="ttl ellip">${esc(t.nome)}</div><div class="meta">${t.ex.length} exercício${t.ex.length === 1 ? '' : 's'}${t.dia ? ` · montado em ${dShort(dayAt(t.dia))}` : ''}</div></div>${I('chevR', 20, 'class="ic muted"')}</button>`;
function Treino() {
  const tp = todaySession(), today = tp.key, p = tp.p, H = D.SAUDE;
  let sel = S.wSel || (today === 'LIVRE' ? 'A' : today);
  if (isP(sel) && !treinoP(sel.slice(2))) sel = today === 'LIVRE' ? 'A' : today; // apagado no outro aparelho
  const Z = zoneNow(), isToday = sel === today, xpHoje = QXP().corpo;
  const xpNote = S.quests.corpo ? 'O XP de treino de hoje já foi ganho.' : isToday || today === 'LIVRE' || isP(sel) ? `Vale +${xpHoje} XP.` : `Reposição: vale os +${xpHoje} XP do plano de hoje, nunca mais que isso.`;
  const elapsed = S.wStart ? Math.floor((Date.now() - S.wStart) / 1000) : 0;
  const seus = meusTreinos().filter((t) => !t.dia || t.dia === S.day);
  if ((!H || !H.fichas.length) && !isP(sel)) {
    return { title: 'Treino', chrome: 'focus', html: `${backbar('saude', 'Saúde')}${hdr('Treino', 'Sem fichas neste aparelho')}${semSaude()}
      <div class="card"><h3>Treinos seus</h3><p class="lead">Monte o treino de hoje buscando os exercícios, ou abra um treino seu. As cargas ficam guardadas por exercício.</p>
        <div class="btnrow"><button class="btn" data-act="tMontar">${I('plus', 20)} Montar o treino de hoje</button></div>${seus.length ? `<div class="tight" style="margin-top:8px">${seus.map(seuTreinoRow).join('')}</div>` : ''}</div>
      <div class="card"><h3>Treinou mesmo assim?</h3><p class="lead">Marque como feito: ${S.quests.corpo ? 'o XP de treino de hoje já foi ganho' : `vale +${xpHoje} XP`} e conta na semana.</p><div class="btnrow"><button class="btn" data-act="finishWorkout" data-arg="LIVRE">${I('check', 20)} Fiz um treino</button></div></div>` };
  }
  const FL = fichaList(sel, p), ss = FL.ss;
  const seg = `<div class="seg" role="group" aria-label="Escolher sessão" style="margin:4px 16px 0">${['A', 'B', 'C', 'Z2'].map((k) => `<button aria-pressed="${sel === k}" data-act="wsel" data-arg="${k}"${k === 'Z2' ? '' : ` aria-label="Treino ${k}"`}>${k === 'Z2' ? 'Cardio' : k}</button>`).join('')}<button aria-pressed="${isP(sel)}" data-act="wOutros" aria-haspopup="dialog">Outros</button></div>`;
  const sub = isP(sel) ? [FL.t.dia ? 'Montado por você' : 'Treino seu', p.deload ? 'deload' : ''].filter(Boolean).join(' · ')
    : [isToday ? 'Hoje' : today === 'LIVRE' ? 'Fora do plano' : 'Prévia', p.bloco ? `Bloco ${p.bloco.n}: ${esc(p.bloco.nome)}` : '', p.week ? `semana ${p.week}` : '', p.deload ? 'deload' : ''].filter(Boolean).join(' · ');
  const head = `${backbar('saude', 'Saúde')}${hdr(sel === 'REST' ? 'Descanso ativo' : esc(ss.nome), sub, `<span class="syncchip num" aria-label="Tempo de treino">${I('timer', 16)}<span id="wT">${fmtT(elapsed)}</span></span>`)}${seg}`;
  if (sel === 'REST') {
    const f = ss.ficha, L = f ? (f.exercicios || []).filter((e) => e && e.nome) : [];
    return { title: 'Descanso ativo', chrome: 'focus', html: `${head}<div class="card"><h3>Hoje é descanso</h3><p class="lead">Descanso faz parte do plano e conta para a Chama. Se quiser, a mobilidade vale +${xpHoje} XP.</p>
      ${L.length ? `<ul class="small" style="padding-left:20px;margin:10px 0 0">${L.map((e) => `<li style="margin:4px 0">${esc(e.nome)}${e.prescricao ? ` · <span class="muted">${esc(e.prescricao)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      ${f && f.orientacao ? `<p class="small muted" style="margin-top:10px">${txtBr(f.orientacao)}</p>` : ''}
      <div class="btnrow"><button class="btn" data-act="finishWorkout" data-arg="REST">Fiz mobilidade</button><a class="btn ghost" href="#/hoje" data-act="voltar" data-arg="hoje">Voltar</a></div></div>` };
  }
  // Sono curto no dia do treino: a missão Corpo vira recuperação, com o mesmo XP.
  const recovery = isToday && Z === 'vermelho' ? `<div class="card soft" style="margin-top:12px"><div class="row-flex">${I('bolt', 20)}<b>Menos de 6 h de sono: hoje vale recuperação</b></div>
      <p class="small" style="margin-top:4px">Caminhada leve ou mobilidade, no lugar da sessão. Vale os mesmos +${xpHoje} XP, e a sessão volta no próximo dia com sono bom.</p>
      <div class="btnrow"><button class="btn" data-act="finishWorkout" data-arg="REC">${I('walk', 20)} Fiz a recuperação</button></div><p class="xs muted" style="margin-top:8px">Se mesmo assim quiser treinar, a sessão está abaixo.</p></div>` : '';
  if (sel === 'Z2') {
    const W = weekly().find((q) => q.id === 'cerco'), c = D.cardioMin(cw(p) || 1), f = ss.ficha, P = H.plano, z2 = P && typeof P.zona2 === 'string' ? P.zona2 : '';
    const prog = f ? (f.exercicios || []).filter((e) => e && e.nome) : [];
    return { title: 'Cardio zona 2', chrome: 'focus', html: `${head}${recovery}
      <div class="card"><div class="row-flex"><span class="badge-ic p">${I('pulse')}</span><div><b>${c ? `${esc(c.txt)} na zona 2` : 'Cardio na zona 2'}</b>${c && c.nota ? `<div class="small muted">${esc(c.nota)}</div>` : ''}</div></div>
        <div class="kpis"><div class="kpi"><span>Semana (min)</span><b class="num">${W.p}/${W.of ?? '—'}</b></div><div class="kpi"><span>Cardios</span><b class="num">${semana().cardio}/${cardiosSemana()}</b></div><div class="kpi"><span>Vale hoje</span><b class="num">${S.quests.corpo ? 'feito' : `${xpHoje} XP`}</b></div></div>
        <p class="small muted" style="margin-top:12px">Sem relógio conectado: use o cronômetro e conclua no final. Com 10 min ou mais no cronômetro entram os minutos dele; senão, os do plano. ${xpNote}</p></div>
      ${z2 ? `<div class="card"><h3>Zona 2</h3><p class="small" style="margin-top:4px">${txtBr(z2)}</p></div>` : ''}
      ${prog.length ? `<div class="card"><h3>${esc(f.titulo || 'Progressão do cardio')}</h3><table class="bp" style="margin-top:8px">${prog.map((e) => `<tr><td>${esc(e.nome)}</td><td>${esc(e.prescricao || '')}</td></tr>`).join('')}</table>${f.orientacao ? `<p class="small muted" style="margin-top:8px">${txtBr(f.orientacao)}</p>` : ''}</div>` : ''}
      <div class="card"><h3>Cronômetro</h3><p class="lead">${S.wStart ? 'Rodando. Conclua no final.' : 'Inicie ao começar e conclua no final.'}</p>${S.wStart ? '' : `<div class="btnrow"><button class="btn ghost" data-act="startWorkout">${I('timer', 20)} Iniciar cronômetro</button></div>`}</div>
      <div class="restbar"><div class="grow"><div class="xs" style="opacity:.75">Cardio</div><div class="t">${c ? esc(c.txt) : 'zona 2'}</div></div><button class="btn go" data-act="finishWorkout" data-arg="Z2">Concluir</button></div>` };
  }
  const { f, list } = FL;
  if (!f) return { title: esc(ss.nome), chrome: 'focus', html: `${head}${empty('dumbbell', 'Sem ficha para esta sessão', 'A ficha deste bloco não veio do Supabase. Confira em Sincronizar, ou monte o treino de hoje em Outros.', '#/dinheiro/sincronizar', 'Sincronizar')}` };
  // Embaixo da lista: adicionar (treino seu), editar a ficha e guardar o treino montado.
  const extra = `<div class="card tight">${isP(sel) ? `<button class="row" data-act="exAdd" data-arg="${sel}"><span class="badge-ic p">${I('plus', 20)}</span><div class="grow"><div class="ttl">Adicionar exercício</div><div class="meta">Busque na sua base ou crie um novo</div></div></button>` : ''}
      <a class="row" href="#/saude/treino-editar" data-act="edAbrir" data-arg="${sel}"><span class="badge-ic">${I('edit', 20)}</span><div class="grow"><div class="ttl">${isP(sel) ? 'Editar este treino' : `Editar a ficha do Treino ${sel}`}</div><div class="meta">${isP(sel) ? 'Ordem, séries e repetições, nome' : LS(K_F + fKey(f)) ? 'Você já mudou esta ficha' : 'Trocar, tirar, pôr e reordenar exercícios'}</div></div>${I('chevR', 20, 'class="ic muted"')}</a>
      ${isP(sel) && FL.t.dia ? `<button class="row" data-act="tSalvar" data-arg="${FL.t.id}"><span class="badge-ic">${I('star', 20)}</span><div class="grow"><div class="ttl">Guardar para repetir</div><div class="meta">Vira um treino seu em Outros</div></div></button>` : ''}</div>`;
  if (!list.length) {
    return { title: esc(ss.nome), chrome: 'focus', html: `${head}
      <div class="card"><div class="empty"><span class="badge-ic">${I('search', 28)}</span><b>Que exercícios você vai fazer?</b><p>Busque na base (os das fichas, os seus e os que já têm carga) ou crie um novo. Cada um guarda o histórico de cargas.</p><button class="btn" data-act="exAdd" data-arg="${sel}">${I('plus', 20)} Adicionar exercício</button></div></div>${extra}` };
  }
  const rest = D.descanso(f), cut = Z === 'amarelo' || Z === 'vermelho';
  const cards = list.map((ex, j) => {
    const last = LS(ex.id), sg = D.suggestion(ex, last), n = nSeries(ex, cut);
    const rows = Array.from({ length: n }, (_, i) => {
      const k = setKey(sel, j, ex, i), st = S.sets[k] || {};
      const kg = st.kg ?? (sg ? sg.kg : last ? last.kg : ex.carga), reps = st.reps ?? (sg ? sg.reps : ex.rr ? ex.rr[0] : null);
      return `<tr><td>${i + 1}</td><td><input type="text" inputmode="decimal" value="${kg ? D.fmtKg(kg) : ''}" placeholder="kg" aria-label="${esc(ex.nome)}, série ${i + 1}, carga em kg" data-in="setkg" data-arg="${k}"></td><td><input type="text" inputmode="numeric" value="${reps || ''}" aria-label="${esc(ex.nome)}, série ${i + 1}, repetições" data-in="setreps" data-arg="${k}"></td><td><button class="ok" aria-pressed="${!!st.ok}" data-act="set" data-arg="${k}" data-rest="${rest}" aria-label="Concluir série ${i + 1} de ${esc(ex.nome)}">${I('check', 24)}</button></td></tr>`;
    }).join('');
    const tip = last && Array.isArray(last.reps) ? `Última vez: <b class="num">${last.kg ? `${D.fmtKg(last.kg)} kg × ` : ''}${last.reps.join(', ')}</b>${isoOk(last.d) ? ` em ${dShort(dayAt(last.d))}` : ''}.${sg ? ` ${sg.txt}.` : ''}` : 'Primeira vez com este exercício: anote a carga que usar.';
    return `<section class="ex" aria-label="${esc(ex.nome)}"><div class="row-flex"><h3 class="grow">${esc(ex.nome)}</h3><span class="chip num">${esc(ex.alvo)}</span><button class="iconbtn sm" data-act="trocarEx" data-arg="${sel}:${j}" aria-label="Trocar ${esc(ex.nome)} por outro exercício">${I('refresh', 20)}</button></div>
      ${ex.no ? `<p class="xs muted" style="margin-top:2px">Só hoje, no lugar de ${esc(ex.no)}.</p>` : ''}${videoLink(ex.nome, 'xs')}
      <div class="tip">${I('refresh', 16)}<span>${tip} Hoje ${n} série${n > 1 ? 's' : ''}${ex.perna ? ', repetições por perna' : ''} · descanso ${fmtRest(rest)}.</span></div>
      <table class="sets"><thead><tr><th>Série</th><th>kg</th><th>Reps</th><th><span class="sr">Feito</span></th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join('');
  const total = list.reduce((a, ex) => a + nSeries(ex, cut), 0), done = setsDone(sel, list, cut);
  const restOn = S.rest && S.rest.end > Date.now();
  const banner = { verde: 'Sono de 7 h ou mais: treino completo. As cargas sugeridas seguem a progressão dupla.', amarelo: 'Sono entre 6 e 7 h: uma série a menos por exercício (já tirada abaixo).', vermelho: 'Se for treinar mesmo assim: uma série a menos por exercício e esforço leve.', nd: 'Com as horas de sono do check-in, o treino se ajusta sozinho.' }[Z];
  const obs = (f.observacoes || []).filter((x) => typeof x === 'string' && x.trim());
  const orient = f.orientacao || obs.length ? `<div class="card"><h3>Da ficha</h3>${f.orientacao ? `<p class="small" style="margin-top:4px">${txtBr(f.orientacao)}</p>` : ''}${obs.map((x) => `<p class="small muted" style="margin-top:6px">${txtBr(x)}</p>`).join('')}</div>` : '';
  return {
    title: esc(ss.nome), chrome: 'focus',
    html: `${head}${recovery}
      <div class="card soft" style="margin-top:12px"><div class="row-flex">${I('bolt', 20)}<span class="small"><b>${Z === 'nd' ? 'Sem check-in.' : `Zona ${ZNAME[Z].toLowerCase()}.`}</b> ${banner} ${xpNote}</span></div></div>
      ${cards}${extra}${orient}
      <div class="restbar">${restOn ? `<div class="grow"><div class="xs" style="opacity:.75">Descanso</div><div class="t" id="restT" role="timer" aria-label="Descanso restante">${fmtT(Math.ceil((S.rest.end - Date.now()) / 1000))}</div></div><button class="btn sm" data-act="skipRest">Pular</button>` : `<div class="grow"><div class="xs" style="opacity:.75">Séries</div><div class="t num">${done}/${total}</div></div><button class="btn go" data-act="finishWorkout" data-arg="${sel}">Concluir treino</button>`}</div>`,
  };
}

// Editar a ficha A, B ou C (a sua versão, no lugar da do Supabase) ou um treino seu.
function EditarTreino() {
  const sel = S.edAlvo, back = backbar('saude/treino', 'Treino');
  if (!(sel && (FORCA.has(sel) || isP(sel)))) return { title: 'Editar treino', html: `${back}${hdr('Editar treino')}${empty('dumbbell', 'Nada para editar', 'Abra o Treino e toque em editar.', '#/saude/treino', 'Abrir o Treino')}` };
  const FL = fichaList(sel, plan());
  if (isP(sel) ? !FL.t : !FL.f) return { title: 'Editar treino', html: `${back}${hdr('Editar treino')}${empty('dumbbell', isP(sel) ? 'Este treino foi apagado' : 'Sem ficha para esta sessão', isP(sel) ? 'Talvez no outro aparelho.' : 'A ficha deste bloco não veio do Supabase.', '#/saude/treino', 'Voltar ao Treino')}` };
  const ed = !isP(sel) && !!LS(K_F + fKey(FL.f)), N = FL.base.length;
  const rows = FL.base.map((e, j) => `<div class="row edrow"><div class="grow"><div class="ttl">${esc(e.n)}</div>
      <input class="input" value="${esc(e.p)}" placeholder="${PRESC}" data-in="edp" data-arg="${j}" aria-label="Séries e repetições de ${esc(e.n)}" autocomplete="off"></div>
      <div class="edbtns"><button class="iconbtn" data-act="edMove" data-arg="${j}:-1" aria-label="Subir ${esc(e.n)}"${j === 0 ? ' aria-disabled="true"' : ''}>${I('up', 20)}</button><button class="iconbtn" data-act="edMove" data-arg="${j}:1" aria-label="Descer ${esc(e.n)}"${j === N - 1 ? ' aria-disabled="true"' : ''}>${I('down', 20)}</button>
      <button class="iconbtn" data-act="trocarEx" data-arg="${sel}:${j}:ficha" aria-label="Trocar ${esc(e.n)}">${I('refresh', 20)}</button><button class="iconbtn" data-act="edDel" data-arg="${j}" aria-label="Tirar ${esc(e.n)}">${I('x', 20)}</button></div></div>`).join('');
  const sub = isP(sel) ? (FL.t.dia ? `Montado em ${dShort(dayAt(FL.t.dia))}` : 'Treino seu') : `${FL.f.bloco ? `Bloco ${FL.f.bloco} · ` : ''}${ed ? 'sua versão' : 'como veio do Supabase'}`;
  return {
    title: 'Editar treino',
    html: `${back}${hdr(isP(sel) ? 'Editar treino' : `Editar o Treino ${sel}`, sub)}
      ${isP(sel) ? `<div class="card"><label class="field" style="margin:0"><span>Nome</span><input class="input" id="ed-nome" data-in="tnome" value="${esc(FL.t.nome)}" maxlength="40" autocomplete="off"></label></div>` : ''}
      <div class="card tight">${rows || '<p class="small muted" style="padding:12px 0">Nenhum exercício ainda.</p>'}
        <button class="row" data-act="exAdd" data-arg="${sel}:ficha"><span class="badge-ic p">${I('plus', 20)}</span><div class="grow"><div class="ttl">Adicionar exercício</div><div class="meta">Busque na sua base ou crie um novo</div></div></button></div>
      <p class="small muted" style="margin:10px 20px">Séries × repetições como na ficha: “3 × 8–12”, “2–3 × 12–15” (2 séries nas 2 primeiras semanas do bloco, depois 3). As cargas ficam guardadas por exercício: trocar, tirar ou reordenar não perde o histórico.</p>
      ${isP(sel) ? `<div class="card tight"><button class="row" data-act="tApagar" data-arg="${FL.t.id}"><span class="badge-ic">${I('x', 20)}</span><div class="grow"><div class="ttl">Apagar este treino</div><div class="meta">O histórico de cargas dos exercícios fica</div></div></button></div>`
        : `<div class="card tight">${ed ? `<button class="row" data-act="edReset" data-arg="${sel}"><span class="badge-ic">${I('refresh', 20)}</span><div class="grow"><div class="ttl">Voltar à ficha original</div><div class="meta">Desfaz as suas mudanças nesta ficha</div></div></button>` : '<p class="small muted" style="padding:12px 0">A ficha no Supabase não muda: a sua versão fica no app e na nuvem, igual nos dois aparelhos.</p>'}</div>`}`,
  };
}

// A base de exercícios, com a última carga e o histórico de cada um: os seus em cima, o catálogo embaixo, por grupo.
let exBusca = '', exGrupo = '';
const exRow = (x) => `<button class="row" data-act="exVer" data-arg="${x.id}"><div class="grow"><div class="ttl ellip">${esc(x.nome)}</div><div class="meta">${esc(ultimaTxt(x.id) || (x.meu ? 'Sem cargas ainda' : x.g))}${x.onde.length ? ` · ${esc(x.onde.slice(0, 2).join(', '))}${x.onde.length > 2 ? '…' : ''}` : ''}</div></div>${I('chevR', 20, 'class="ic muted"')}</button>`;
function exLista() {
  const L = buscar(biblioteca(), exBusca).filter((x) => !exGrupo || x.g === exGrupo), M = L.filter((x) => x.meu), C = L.filter((x) => !x.meu);
  if (!L.length) return `<div class="card"><p class="small muted">Nenhum exercício com esse nome${exGrupo ? ` em ${esc(exGrupo)}` : ''}. Toque em + para criar.</p></div>`;
  return `${M.length ? `${sec('Seus')}<div class="card tight">${M.map(exRow).join('')}</div>` : ''}${C.length ? `${sec(exGrupo ? `Catálogo · ${esc(exGrupo)}` : 'Catálogo')}<div class="card tight">${C.map(exRow).join('')}</div>` : ''}`;
}
const exChips = () => `<div class="picks exgrupos" role="radiogroup" aria-label="Grupo muscular">${['', ...GRUPOS].map((g) => `<button type="button" class="pick" role="radio" aria-checked="${g === exGrupo}" tabindex="${g === exGrupo ? 0 : -1}" data-act="exGrupo" data-arg="${esc(g)}">${g ? esc(g) : 'Todos'}</button>`).join('')}</div>`;
function Exercicios() {
  const L = biblioteca(), T = meusTreinos().filter((t) => !t.dia || t.dia === S.day), n = L.filter((x) => x.meu).length;
  return {
    title: 'Exercícios',
    html: `${backbar('saude', 'Saúde')}${hdr('Exercícios', `${n} seus · ${L.length - n} no catálogo`, `<button class="iconbtn" data-act="exNovo" aria-label="Criar exercício">${I('plus')}</button>`)}
      <div class="card"><label class="field" style="margin:0"><span>Buscar</span><input class="input" id="exq" data-in="exq" value="${esc(exBusca)}" placeholder="ex.: supino, remada" autocomplete="off" type="search"></label>${exChips()}</div>
      <div id="exlist" aria-live="polite">${exLista()}</div>
      ${sec('Treinos seus')}<div class="card tight">${T.map(seuTreinoRow).join('')}
        <button class="row" data-act="tMontar"><span class="badge-ic p">${I('plus', 20)}</span><div class="grow"><div class="ttl">Montar o treino de hoje</div><div class="meta">Buscando os exercícios que vai fazer</div></div></button>
        <button class="row" data-act="tNovo"><span class="badge-ic">${I('squarePlus', 20)}</span><div class="grow"><div class="ttl">Criar um treino para repetir</div><div class="meta">Fora do A, B e C</div></div></button></div>`,
  };
}
function exSheet(id) {
  const x = biblioteca().find((e) => e.id === id); if (!x) return;
  const H = historico(id), b = S.best1rm[id], meu = !!LS(K_E + id);
  openSheet(esc(x.nome), `<p>${videoLink(x.nome)}</p>${b ? `<p class="small">Recorde estimado (1RM): <b class="num">${D.fmtKg(Math.round(b * 2) / 2)} kg</b></p>` : ''}
    ${x.onde.length ? `<p class="small muted" style="margin-top:4px">Em: ${esc(x.onde.join(', '))}.</p>` : x.g ? `<p class="small muted" style="margin-top:4px">${esc(x.g)}, do catálogo do app.</p>` : ''}
    ${H.length ? `<table class="bp" style="margin-top:12px"><thead><tr><th>Dia</th><th>Carga</th><th>Repetições</th></tr></thead><tbody>${H.slice(0, 30).map((h) => `<tr><td>${dShort(dayAt(h.d))}</td><td class="num">${h.kg ? `${D.fmtKg(h.kg)} kg` : '—'}</td><td class="num">${h.reps.join(', ')}</td></tr>`).join('')}</tbody></table>`
      : `<p class="small muted" style="margin-top:12px">${ultimaTxt(id) ? `Última vez: ${esc(ultimaTxt(id))}. O histórico dia a dia começa no próximo treino.` : 'Ainda sem cargas. Elas entram quando você concluir um treino com este exercício.'}</p>`}
    ${meu && !x.onde.length ? `<div class="btnrow"><button class="btn ghost" data-act="exTirar" data-arg="${id}">Tirar da base</button></div>` : ''}`, 'exv');
}

// Escolher um exercício (trocar ou adicionar): busca na base, ou cria um com o nome digitado.
let PK = null;
function pickSheet(modo, sel, j, ficha) {
  PK = { modo, sel, j, ficha: !!ficha, q: '', res: [] };
  let topo = '';
  if (modo === 'troca') {
    const FL = fichaList(sel, plan()), e = FL.base[j]; if (!e) { PK = null; return; }
    const tr = troca(sel, j);
    topo = `<p class="small muted">No lugar de <b>${esc(e.n)}</b>, com as mesmas séries. A carga de cada exercício fica guardada separada.</p>
      ${ficha ? '' : radios('Vale para', 'pk-alc', ['hoje', 'sempre'], 'hoje', { hoje: 'Só hoje', sempre: isP(sel) ? 'Sempre neste treino' : 'Sempre nesta ficha' })}
      ${tr && !ficha ? `<div class="btnrow"><button class="btn line" data-act="pkDesfaz">Voltar para ${esc(e.n)}</button></div>` : ''}`;
  }
  openSheet(modo === 'troca' ? 'Trocar exercício' : 'Adicionar exercício', `${topo}
    <label class="field"><span>Buscar</span><input class="input" id="pk-q" data-in="pkq" placeholder="ex.: supino, remada" autocomplete="off" type="search"></label>
    <div class="tight" id="pk-res" aria-live="polite" style="margin-top:8px">${pkRes()}</div>`, 'pk', '#pk-q');
}
function pkRes() {
  const q = PK.q.trim(), L = biblioteca(), hit = buscar(L, q), novo = q && !L.some((x) => x.id === D.slug(q));
  PK.res = hit.slice(0, 40);
  return `${novo ? `<button class="row" data-act="pkNovo"><span class="badge-ic p">${I('plus', 20)}</span><div class="grow"><div class="ttl ellip">Criar “${esc(q)}”</div><div class="meta">Entra na sua base de exercícios</div></div></button>` : ''}${PK.res.map((x, i) => `<button class="row" data-act="pkPick" data-arg="${i}"><div class="grow"><div class="ttl ellip">${esc(x.nome)}</div><div class="meta">${esc(ultimaTxt(x.id) || x.onde.slice(0, 2).join(', ') || x.g || 'Sem cargas ainda')}</div></div></button>`).join('')}${!novo && !PK.res.length ? '<p class="small muted" style="padding:12px 0">Digite o nome para buscar ou criar.</p>' : ''}`;
}
function pkAplicar(nome, p) {
  const { modo, sel, j } = PK, FL = fichaList(sel, plan()), base = FL.base.map((e) => ({ ...e }));
  const sempre = PK.ficha || document.querySelector('#pk [aria-checked="true"]')?.dataset.val === 'sempre';
  let msg;
  if (modo === 'troca') {
    if (!base[j]) return;
    if (sempre) { base[j] = { n: nome, p: base[j].p }; setBase(sel, base); delete S.sets[`${K_S}${sel}-${j}`]; msg = `${nome} entrou ${isP(sel) ? 'no treino' : 'na ficha'}`; }
    else { S.sets[`${K_S}${sel}-${j}`] = { n: nome }; msg = `Hoje: ${nome} no lugar de ${base[j].n}`; }
  } else { base.push({ n: nome, p: p || PRESC }); setBase(sel, base); msg = `${nome} adicionado`; }
  PK = null; save(); closeSheet(); render(true); toast(`${I('check', 18)} ${esc(msg)}`);
}

// Nome de um treino seu (novo, ou o montado de hoje guardado para repetir).
function nomeSheet(act, arg, valor) {
  openSheet(act === 'tCriar' ? 'Novo treino' : 'Guardar para repetir', `<label class="field"><span>Nome do treino</span><input class="input" id="tn-nome" maxlength="40" autocomplete="off" value="${esc(valor || '')}" placeholder="ex.: Superiores em casa" data-autofocus></label>
    <button class="btn block" style="margin-top:16px" data-act="${act}" data-arg="${esc(arg || '')}">${act === 'tCriar' ? 'Criar e escolher os exercícios' : 'Guardar'}</button>`, 'tn', '#tn-nome');
}
function outrosSheet() {
  const L = meusTreinos(), seus = L.filter((t) => !t.dia), hoje = L.find((t) => t.dia === S.day), rec = L.filter((t) => t.dia && t.dia !== S.day).sort((a, b) => b.dia.localeCompare(a.dia)).slice(0, 5);
  openSheet('Outros treinos', `<button class="btn block" data-act="tMontar">${I('plus', 20)} ${hoje ? 'Abrir o treino montado hoje' : 'Montar o treino de hoje'}</button>
    <p class="xs muted" style="margin-top:6px">Busque os exercícios que vai fazer. As cargas ficam no histórico de cada exercício.</p>
    ${seus.length ? `<h3 style="margin-top:16px">Treinos seus</h3><div class="tight">${seus.map(seuTreinoRow).join('')}</div>` : ''}
    ${rec.length ? `<h3 style="margin-top:16px">Montados nos últimos dias</h3><div class="tight">${rec.map(seuTreinoRow).join('')}</div>` : ''}
    <div class="btnrow"><button class="btn line" data-act="tNovo">${I('squarePlus', 20)} Criar um treino para repetir</button></div>`, 'ou');
}
function setsDone(sel, list, cut) { return list.reduce((a, ex, j) => { let c = 0; for (let i = 0; i < nSeries(ex, cut); i++) if (S.sets[setKey(sel, j, ex, i)]?.ok) c++; return a + c; }, 0); }
const e1rm = (kg, reps) => kg * (1 + reps / 30); // fórmula de Epley
const fmtT = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;
const fmtRest = (r) => (r >= 120 && r % 60 === 0 ? `${r / 60} min` : `${r} s`);

function Campanha() {
  const H = D.SAUDE, P = H && H.plano;
  if (!P) return { title: 'Plano de treino', html: `${backbar('saude', 'Saúde')}${hdr('Plano de treino')}${semSaude()}` };
  const p = plan(), wk = p.week, W = semana(), wkB = p.fim ? P.semanas + 1 : wk; // plano concluído: todos os blocos ficam para trás
  const strip = D.DOW.map((d, i) => {
    const date = D.addDays(diaNow(), i - p.dow), q = D.planFor(date), e = logDia(D.iso(date));
    const lbl = q.tipo ? { A: 'A', B: 'B', C: 'C', Z2: 'Z2', REST: '—' }[q.tipo] : '·';
    return `<div class="${i === p.dow ? 'today' : e && e.k ? 'done' : ''}"><b>${d}</b>${lbl}<span class="sr">${e && e.k ? ', feito' : ''}</span></div>`;
  }).join('');
  const dias = (fn) => P.semana.map((x, i) => (fn(String(x).toUpperCase()) ? D.DOW[i].toLowerCase() : null)).filter(Boolean);
  const lista = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} e ${a[a.length - 1]}` : a[0] || '');
  const lead = [['Força', dias((t) => FORCA.has(t))], ['Cardio', dias((t) => t === 'Z2')], ['Descanso', dias((t) => t === 'REST')]].filter(([, a]) => a.length).map(([n, a]) => `${n} ${lista(a)}.`).join(' ');
  const blocos = P.blocos.map((b) => {
    const on = wkB >= b.de && wkB <= b.ate, past = wkB > b.ate, nW = b.ate - b.de + 1;
    const weeks = Array.from({ length: nW }, (_, j) => { const w = b.de + j, dl = P.deload.includes(w); return `<i class="${w < wkB ? 'done' : w === wkB ? 'now' : dl ? 'deload' : ''}" title="Semana ${w}${dl ? ', deload' : ''}"></i>`; }).join('');
    const det = [b.series, b.esforco].filter((x) => typeof x === 'string' && x).map(esc).join(' · ');
    return `<div class="act ${on ? 'on' : past ? 'past' : ''}"><span class="n">${esc(b.n)}</span><div><div class="row-flex"><b>${esc(b.nome || `Bloco ${b.n}`)}</b><span class="small muted right num">sem ${b.de}–${b.ate}</span></div>${b.objetivo ? `<div class="small muted">${esc(b.objetivo)}</div>` : ''}<div class="weeks" aria-hidden="true" style="grid-template-columns:repeat(${nW},1fr)">${weeks}</div>${det ? `<div class="xs muted" style="margin-top:4px">${det}</div>` : ''}</div></div>`;
  }).join('');
  const M = D.metas(), med = H.medidas;
  const atual = (k) => { for (let i = med.length - 1; i >= 0; i--) if (fin(med[i][k]) != null) return { v: med[i][k], d: dayAt(med[i].d) }; return null; };
  const metasL = [['peso', 'Peso', 'kg', lastWeight()], ['cintura', 'Cintura', 'cm', atual('cintura')], ['abdomen', 'Abdômen', 'cm', atual('abdomen')], ['gordura', 'Gordura', '%', atual('gordura')]].filter(([k]) => fin(Number(M[k])) != null);
  const metasH = metasL.map(([k, n, u, a]) => { const alvo = Number(M[k]); return `<div style="margin-top:10px"><div class="row-flex small"><span class="grow">${n}</span><span class="muted num">${a ? `${n1(a.v)} ${u} em ${dQuando(a.d)}` : 'sem medida'}</span><b class="num" style="min-width:96px;text-align:right">meta ${n1(alvo)} ${u}</b></div>${a ? `<div class="xs muted">${a.v > alvo ? `faltam ${n1(a.v - alvo)} ${u}` : 'meta alcançada'}</div>` : ''}</div>`; }).join('');
  const ul = (t, L) => (L.length ? `<div class="card"><h3>${t}</h3><ul class="small" style="padding-left:20px;margin:8px 0 0">${L.map((x) => `<li style="margin:4px 0">${txtBr(x)}</li>`).join('')}</ul></div>` : '');
  return {
    title: 'Plano',
    html: `${backbar('saude', 'Saúde')}${hdr(esc(P.nome || 'Plano de treino'), wk ? `Semana ${wk} de ${P.semanas}${p.bloco ? ` · Bloco ${p.bloco.n}: ${esc(p.bloco.nome)}` : ''}${p.deload ? ' · deload' : ''}` : p.pre ? `Começa em ${dShort(P.ini)}` : 'Plano concluído')}
      <div class="card"><h3>Esta semana</h3><p class="lead">${lead}</p><div class="weekstrip">${strip}</div>
        <p class="small muted" style="margin-top:10px">Feito nesta semana: ${W.forca} de ${forcaSemana()} treinos de força e ${W.cardio} de ${cardiosSemana()} cardios.</p></div>
      <div class="card"><h3>Blocos</h3><div class="acts">${blocos}</div>
        <div class="legend" style="margin-top:10px"><span><i style="--c:var(--primary)"></i>feita</span><span><i style="--c:var(--xp-fill)"></i>atual</span><span><i style="--c:var(--line)"></i>deload</span></div>
        ${typeof P.deloadTexto === 'string' && P.deloadTexto ? `<p class="small muted" style="margin-top:8px">${txtBr(P.deloadTexto)}</p>` : ''}</div>
      ${metasH ? `<div class="card"><h3>Metas</h3>${metasH}</div>` : ''}
      ${ul('Regras do plano', P.lista('regras'))}${ul('Sono e treino', P.lista('sono'))}${ul('Testes de progresso', P.lista('testes'))}
      ${typeof P.aviso === 'string' && P.aviso ? `<p class="small muted" style="margin:14px 20px">${txtBr(P.aviso)}</p>` : ''}`,
  };
}

// ---------- Dieta: o sugerido pelo plano e o que você comeu de verdade ----------
const planoHoje = () => { const { key } = todaySession(); return D.SAUDE ? D.refeicoes(S.dayType || D.tipoDia(key)) : []; };
const g0 = (v) => fmtInt(Math.max(0, v));
const macroTxt = (r) => `${g0(r[0])} kcal · P ${g0(r[1])} · C ${g0(r[2])} · G ${g0(r[3])} g`;
const curto = (n) => String(n || '').split(',').slice(0, 2).join(',').trim();
const vezes = (x) => (x === 1 ? 'o plano' : x === 0.5 ? 'metade do plano' : `${String(x).replace('.', ',')} × o plano`);
const resumoItens = (f) => { const L = f.map((it) => (it.pl ? vezes(Number(it.x) || 0) : curto(it.n))); return L.length ? (L.length > 3 ? `${L.slice(0, 3).join(', ')} e mais ${L.length - 3}` : L.join(', ')) : 'nada ainda'; };
// A Missão Combustível acompanha a proteína das refeições: marca sozinha ao chegar na meta e desmarca se foi ela que marcou.
function combMeals() {
  const pr = D.prot(); if (!pr) return;
  const p = consumo(S.meals, planoHoje()).t[1];
  if (p >= pr.conta && !S.quests.comb) setQuest('comb', true);
  else if (p < pr.conta && S.quests.comb && S.combByMeals) setQuest('comb', false);
  if (S.quests.comb && p >= pr.conta) S.combByMeals = true;
}
// +3 XP por refeição só na primeira vez no dia: desmarcar e marcar de novo não paga outra vez.
function mealXp(id) { if (!S.mealXp[id]) { S.mealXp[id] = true; addXP(3, 'Refeição registrada'); } }
// A lista do que se comeu numa refeição, pronta para mudar (seguiu o plano vira a porção do plano).
function itensDe(id) {
  const v = mVal(S.meals[id]);
  if (v && v !== true) return v.f;
  const m = planoHoje().find((x) => x.id === id); if (!m) return null;
  S.meals[id] = { f: v === true ? [planoItem(m)] : [] };
  return S.meals[id].f;
}
function mealRow(m) {
  const v = mVal(S.meals[m.id]), ed = v && v !== true, r = ed ? realizado(m, v) : null, dif = ed ? Math.round(r[0] - m.kcal) : 0;
  return `<div class="quest ${v ? 'done' : ''}"><button class="qcheck" aria-pressed="${!!v}" data-act="meal" data-arg="${esc(m.id)}" aria-label="${esc(m.nome)}: ${ed ? 'ajustada, abrir' : v ? 'seguiu o plano' : 'marcar que seguiu o plano'}">${I('check', 28)}</button>
    <div class="grow"><div class="k num">${esc(m.hora)}${ed ? `${m.hora ? ' · ' : ''}ajustada` : v ? `${m.hora ? ' · ' : ''}seguiu o plano` : ''}</div><div class="t">${esc(m.nome)}</div>
      <div class="d">${ed ? 'Plano: ' : ''}${txtBr(m.itens)} · <span class="num">${fmtInt(m.kcal)} kcal · ${fmtInt(m.p)} g</span></div>
      ${ed ? `<div class="d real"><b>Comeu:</b> ${esc(resumoItens(v.f))} · <span class="num">${g0(r[0])} kcal · ${g0(r[1])} g</span>${dif ? ` <span class="dif num">${dif > 0 ? '+' : '−'}${fmtInt(Math.abs(dif))} kcal</span>` : ''}</div>` : ''}</div>
    <button class="iconbtn go" data-act="refEd" data-arg="${esc(m.id)}" aria-label="Registrar o que comeu em ${esc(m.nome)}">${I('edit')}</button></div>`;
}
function extraRow(k) {
  const v = S.meals[k], r = AL.soma(v.f), nome = (typeof v.n === 'string' && v.n) || 'Refeição';
  return `<div class="quest done"><button class="qcheck" aria-pressed="true" data-act="refEd" data-arg="${esc(k)}" aria-label="${esc(nome)}: fora do plano, abrir">${I('check', 28)}</button>
    <div class="grow"><div class="k num">${esc(typeof v.h === 'string' ? v.h : '')}${v.h ? ' · ' : ''}fora do plano</div><div class="t">${esc(nome)}</div><div class="d">${esc(resumoItens(v.f))} · <span class="num">${g0(r[0])} kcal · ${g0(r[1])} g</span></div></div>
    <button class="iconbtn go" data-act="refEd" data-arg="${esc(k)}" aria-label="Abrir ${esc(nome)}">${I('edit')}</button></div>`;
}
function Dieta() {
  const H = D.SAUDE;
  if (!H) return { title: 'Dieta', html: `${backbar('saude', 'Saúde')}${hdr('Dieta de hoje')}${semSaude()}` };
  const { key } = todaySession(), tk = S.dayType || D.tipoDia(key), meals = D.refeicoes(tk), pr = D.prot(), kc = D.kcalDia(tk);
  const [k, p, c, g] = consumo(S.meals, meals).t.map((v) => Math.round(v)), X = extrasDe(S.meals);
  const plano = meals.reduce((a, m) => a.map((v, i) => v + planB(m)[i]), [0, 0, 0, 0]).map((v) => Math.round(v)), [planK, planP, planC, planG] = plano;
  const resto = Math.round(meals.filter((m) => !mVal(S.meals[m.id])).reduce((a, m) => a + m.p, 0));
  const ver = (meals[0] && meals[0].versao) || '', agua = fin(Number(D.metas().agua)), metaP = pr ? pr.meta : planP, metaK = kc || planK;
  // Os últimos 7 dias pelo registro do dia (o que foi comido) e hoje ao vivo.
  const sem = Array.from({ length: 7 }, (_, i) => { const d = D.addDays(diaNow(), i - 6), id = D.iso(d), n = id === S.day ? (k || p ? [k, p] : null) : S.dias[id] && Array.isArray(S.dias[id].n) ? S.dias[id].n : null; return { d, n }; });
  const semN = sem.filter((x) => x.n && x.n[0] > 0);
  return {
    title: 'Dieta',
    html: `${backbar('saude', 'Saúde')}${hdr('Dieta de hoje', `Dia de ${D.DIAS[tk].toLowerCase()} · ${S.dayType ? 'escolhido por você' : 'pelo plano de treino'}`)}
      <div class="seg" role="group" aria-label="Tipo de dia" style="margin:4px 16px 0">${Object.entries(D.DIAS).map(([id, t]) => `<button aria-pressed="${tk === id}" data-act="daytype" data-arg="${id}">${t}</button>`).join('')}</div>
      <div class="card"><div class="grid3">
        <div><div class="small muted">Proteína</div><div class="mid">${p}<span class="small muted"> / ${metaP} g</span></div>${bar(metaP ? (p / metaP) * 100 : 0, 'var(--a-nut)')}</div>
        <div><div class="small muted">Calorias</div><div class="mid">${fmtInt(k)}</div><div class="small muted">de ${fmtInt(metaK)}</div>${bar(metaK ? (k / metaK) * 100 : 0, 'var(--a-nut)')}</div>
        <div><div class="small muted">Combustível</div><div class="mid">${pr ? (p >= pr.conta ? 'ok' : `${pr.conta - p} g`) : '—'}</div><div class="small muted">${pr ? (p >= pr.conta ? 'missão feita' : 'para a missão contar') : 'sem meta'}</div></div>
      </div><p class="small muted num" style="margin:10px 0 0">Carboidrato ${fmtInt(c)} de ${fmtInt(planC)} g · gordura ${fmtInt(g)} de ${fmtInt(planG)} g no plano</p></div>
      ${sec('Refeições do plano', `<span class="small muted num">${fmtInt(planK)} kcal · ${planP} g</span>`)}
      <div class="card tight">${meals.length ? meals.map(mealRow).join('') : '<div class="empty"><p>Nenhuma refeição do plano para este tipo de dia.</p></div>'}
        ${X.map(extraRow).join('')}
        <button class="row" data-act="refNova"><span class="badge-ic p">${I('plus', 20)}</span><div class="grow"><div class="ttl">Comi fora do plano</div><div class="meta">Um lanche, um jantar fora: busque os alimentos</div></div></button></div>
      <p class="small muted" style="margin:8px 20px 0">O ✓ marca que seguiu o plano. O lápis registra o que comeu de verdade: mais, menos ou outra coisa.</p>
      ${pr && p < pr.conta && meals.length ? `<div class="card soft"><div class="row-flex">${I('sparkle', 20)}<b>Para a missão contar</b></div><p class="small" style="margin-top:4px">Faltam ${pr.conta - p} g. ${p + resto >= pr.conta ? `As refeições que faltam no plano somam ${resto} g: seguindo o plano, a missão conta.` : `Mesmo seguindo o plano, faltam ${pr.conta - p - resto} g para chegar a ${pr.conta} g.`}</p></div>` : ''}
      ${semN.length > 1 ? `${sec('Últimos 7 dias')}<div class="card">${barChart(sem.map((x) => ({ v: x.n ? x.n[0] : 0, l: wd(x.d).slice(0, 3), c: 'var(--a-nut)', dim: !x.n })), { target: metaK, label: 'Calorias comidas nos últimos 7 dias', values: (v) => (v ? fmtInt(v) : '') })}
        <p class="small muted num" style="margin:6px 0 0">Proteína: ${sem.map((x) => (x.n ? `${fmtInt(x.n[1])}` : '—')).join(' · ')} g</p></div>` : ''}
      <p class="small muted" style="margin:14px 20px">${agua ? `Água: meta de ${n1(agua)} L por dia. ` : ''}Comer abaixo da faixa não dá XP: a meta é acertar o alvo, não comer menos.${ver ? ` ${esc(ver)}.` : ''}</p>`,
  };
}

// Uma refeição: o sugerido pelo plano em cima, o que você comeu embaixo, com quantidades e o total contra o plano.
function rfTotais(f, m) {
  const r = AL.soma(f).map((v) => Math.round(v)), s = m ? planB(m).map((v) => Math.round(v)) : null, L = ['kcal', 'Proteína', 'Carboidrato', 'Gordura'];
  return `<div class="grid4">${L.map((l, i) => { const d = s ? r[i] - s[i] : 0; return `<div><div class="small muted">${l}</div><div class="mid num">${fmtInt(r[i])}${i ? '<span class="small muted"> g</span>' : ''}</div>${s ? `<div class="small muted num">${d ? `${d > 0 ? '+' : '−'}${fmtInt(Math.abs(d))} do plano` : 'igual ao plano'}</div>` : ''}</div>`; }).join('')}</div>`;
}
const fiMeta = (it) => { const r = AL.macros(it); return `${g0(r[0])} kcal · P ${g0(r[1])} g`; };
function fiRow(it, j) {
  const pl = !!it.pl, nome = pl ? 'Porção do plano' : it.n, q = pl ? it.x : it.q, u = pl ? '×' : it.u === 'porção' ? (q === 1 ? 'porção' : 'porções') : it.u || 'g';
  return `<div class="row fi"><div class="grow"><div class="ttl ellip">${esc(nome)}</div><div class="meta num" id="fi-m-${j}">${fiMeta(it)}</div></div>
    <input class="qty" type="text" inputmode="decimal" value="${esc(String(q).replace('.', ','))}" data-in="fiq" data-arg="${j}" aria-label="Quantidade de ${esc(nome)}${pl ? ', em vezes o plano' : ` em ${esc(u)}`}"><span class="small muted fiu">${esc(u)}</span>
    <button class="iconbtn" data-act="fiTirar" data-arg="${j}" aria-label="Tirar ${esc(nome)}">${I('x', 20)}</button></div>`;
}
function Refeicao() {
  const id = S.refEd, m = id ? planoHoje().find((x) => x.id === id) : null, v = id ? mVal(S.meals[id]) : null, extra = !!(id && id.startsWith(K_X) && v && v !== true);
  const back = backbar('saude/dieta', 'Dieta');
  if (!m && !extra) return { title: 'Refeição', html: `${back}${hdr('Refeição')}${empty('utensils', 'Refeição não encontrada', 'O dia pode ter virado, ou ela foi apagada no outro aparelho.', '#/saude/dieta', 'Voltar à dieta')}` };
  const f = v === true ? [planoItem(m)] : v ? v.f : [], temPlano = f.some((it) => it.pl);
  const nome = extra ? (typeof v.n === 'string' && v.n) || 'Refeição' : m.nome;
  return {
    title: nome,
    html: `${back}${hdr(esc(nome), extra ? 'Fora do plano' : `${m.hora ? `${esc(m.hora)} · ` : ''}${v === true ? 'seguiu o plano' : v ? 'ajustada' : 'ainda não registrada'}`)}
      ${extra ? `<div class="card"><label class="field" style="margin:0"><span>Nome</span><input class="input" data-in="rfnome" value="${esc(nome)}" maxlength="40" autocomplete="off"></label>
        <label class="field"><span>Hora</span><input class="input" type="time" data-in="rfhora" value="${esc(typeof v.h === 'string' ? v.h : '')}"></label></div>`
        : `${sec('Sugerido pelo plano')}<div class="card"><p style="margin:0">${txtBr(m.itens) || '—'}</p><p class="small muted num" style="margin:6px 0 0">${macroTxt(planB(m))}</p>
        ${v === true ? '' : `<div class="btnrow"><button class="btn line" data-act="rfPlano">${I('check', 18)} Comi o plano</button></div>`}</div>`}
      ${sec('O que você comeu')}
      <div class="card tight">${f.map(fiRow).join('') || '<p class="small muted" style="padding:12px 0">Nada ainda. Adicione o que comeu, ou use a porção do plano e ajuste.</p>'}
        <button class="row" data-act="foodAdd"><span class="badge-ic p">${I('plus', 20)}</span><div class="grow"><div class="ttl">Adicionar alimento</div><div class="meta">Tabela TACO, seus recentes ou produtos de marca</div></div></button>
        ${m && !temPlano ? `<button class="row" data-act="rfPorcao"><span class="badge-ic">${I('utensils', 20)}</span><div class="grow"><div class="ttl">Porção do plano</div><div class="meta">Comeu parte do plano? Entra como 1 ×, ajuste para ½ ou 1,5</div></div></button>` : ''}</div>
      <div class="card" id="rf-tot">${rfTotais(f, m)}</div>
      <div class="btnrow" style="margin:4px 16px"><a class="btn" href="#/saude/dieta" data-act="rfPronto">Pronto</a>${v ? `<button class="btn ghost" data-act="rfLimpa">${extra ? 'Apagar esta refeição' : 'Não comi'}</button>` : ''}</div>
      <p class="small muted" style="margin:14px 20px">Valores por 100 g da Tabela TACO (NEPA/UNICAMP) ou do rótulo no Open Food Facts. A quantidade é do alimento pronto como você escolheu (cozido, cru, grelhado).</p>`,
  };
}

// Escolher um alimento: recentes, TACO (no aparelho) e, ao tocar em Buscar, produtos do Open Food Facts.
let FS = null;
const porTxt = (a) => `${a.b[0] != null ? `${g0(a.b[0])} kcal` : '— kcal'} · P ${a.b[1] != null ? n1(a.b[1]).replace(',0', '') : '—'} g por ${a.por === 1 ? 'porção' : `100 ${a.u || 'g'}`}`;
function foodSheet() {
  FS = { q: '', off: null, list: [], sel: null, novo: false };
  openSheet('Adicionar alimento', `<div id="fs-body">${fsBusca()}</div>`, 'fs', '#fs-q');
}
const fsBusca = () => `<label class="field" style="margin-top:0"><span>Buscar</span><input class="input" id="fs-q" data-in="fsq" value="${esc(FS.q)}" placeholder="ex.: arroz, frango, whey ou código de barras" autocomplete="off" type="search" enterkeyhint="search"></label>
  <div id="fs-res" aria-live="polite">${fsRes()}</div>`;
function fsRes() {
  const q = FS.q.trim(), nq = AL.norm(q), R = recentes(), cod = AL.ehCodigo(q);
  const rec = (q ? R.filter((a) => nq.split(' ').every((w) => AL.norm(a.n).includes(w))) : R).slice(0, q ? 8 : 20);
  const tac = q && !cod ? AL.buscarTaco(q, 25).filter((a) => !rec.some((r) => r.s === a.s)) : [], off = Array.isArray(FS.off) ? FS.off : [];
  FS.list = [...off, ...rec, ...tac];
  const row = (a, i) => `<button class="row" data-act="fsPick" data-arg="${i}"><div class="grow"><div class="ttl ellip">${esc(a.n)}</div><div class="meta num">${esc(porTxt(a))}</div></div>${I('plus', 20, 'class="ic muted"')}</button>`;
  let i = 0;
  const bloco = (t, L) => (L.length ? `<div class="xs muted b" style="margin:12px 0 2px">${t}</div>${L.map((a) => row(a, i++)).join('')}` : (i += L.length, ''));
  const offSt = FS.off === 'busy' ? `<p class="small muted" role="status">${I('refresh', 16, 'style="display:inline;vertical-align:-3px"')} Buscando no Open Food Facts…</p>`
    : FS.off && FS.off.err ? `<p class="small" role="alert">${esc(FS.off.err)}</p>` : Array.isArray(FS.off) && !off.length ? `<p class="small muted">Nada no Open Food Facts para “${esc(q)}”.</p>` : '';
  return `<div class="btnrow" style="margin-top:4px">${q && FS.off !== 'busy' ? `<button class="btn line sm" data-act="fsOff">${I('search', 18)} ${cod ? 'Buscar o código' : 'Buscar marcas'}</button>` : ''}<button class="btn ghost sm" data-act="fsNovo">${I('plus', 18)} Criar alimento</button></div>
    ${offSt}${bloco('Produtos (Open Food Facts)', off)}${bloco(q ? 'Seus recentes' : 'Recentes', rec)}${bloco('Tabela TACO', tac)}
    ${q && !rec.length && !tac.length && !off.length && FS.off == null ? `<p class="small muted" style="margin:12px 0 0">${cod ? 'Código de barras: toque em Buscar o código.' : 'Nada na tabela TACO com esse nome. Tente outra palavra, busque em produtos de marca ou crie o alimento.'}</p>` : ''}
    ${!q && !rec.length ? '<p class="small muted" style="margin:8px 0 0">Digite o alimento. Os que você usar ficam aqui como recentes.</p>' : ''}
    ${q ? '<p class="xs muted" style="margin-top:10px">Produtos de marca vêm do Open Food Facts, uma base aberta feita por voluntários com os rótulos: precisa de internet.</p>' : ''}`;
}
const fsUpd = () => { const el = document.getElementById('fs-res'); if (el && FS) el.innerHTML = fsRes(); };
const numBr = (s) => { const v = parseFloat(String(s || '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
function fsQtd(a) {
  const q0 = Number(a.q) > 0 ? a.q : a.sv || (a.por === 1 ? 1 : 100), u = a.por === 1 ? 'porções' : a.u || 'g';
  return `<div><b>${esc(a.n)}</b><div class="small muted num">${esc(porTxt(a))}${a.g && a.g !== 'Open Food Facts' ? ` · ${esc(a.g)}` : ''}</div></div>
    <label class="field"><span>Quantidade (${esc(u)})</span><input class="input" id="fs-qt" data-in="fsqt" inputmode="decimal" value="${esc(String(q0).replace('.', ','))}" autocomplete="off" data-autofocus></label>
    <div class="picks">${AL.rapidas(a).map(([v, l]) => `<button type="button" class="pick" data-act="fsQ" data-arg="${v}">${esc(l)}</button>`).join('')}</div>
    <p class="small num" id="fs-prev" aria-live="polite" style="margin-top:10px">${fsPrev(a, q0)}</p>
    <div class="btnrow"><button class="btn" data-act="fsOk">Adicionar</button><button class="btn ghost" data-act="fsVolta">Voltar</button></div>`;
}
const fsPrev = (a, q) => (numBr(q) > 0 ? `= ${macroTxt(AL.macros(AL.item(a, numBr(q))))}` : 'Digite a quantidade.');
function fsNovoHtml() {
  const n = (id, l, ph) => `<label class="field"><span>${l}</span><input class="input" id="${id}" inputmode="decimal" placeholder="${ph}" autocomplete="off"></label>`;
  return `<label class="field" style="margin-top:0"><span>Nome</span><input class="input" id="fn-n" maxlength="60" autocomplete="off" value="${esc(FS.q)}" placeholder="ex.: Marmita do restaurante" data-autofocus></label>
    ${radios('Os valores são de', 'fn-por', ['100', '1'], '100', { 100: '100 g', 1: '1 porção' })}
    <div class="grid2">${n('fn-k', 'Calorias (kcal)', '0')}${n('fn-p', 'Proteína (g)', '0')}${n('fn-c', 'Carboidrato (g)', '0')}${n('fn-g', 'Gordura (g)', '0')}</div>
    <p class="small" id="fn-err" role="alert"></p>
    <div class="btnrow"><button class="btn" data-act="fsCriar">Continuar</button><button class="btn ghost" data-act="fsVolta">Voltar</button></div>`;
}
const fsBody = (h, foco) => { const el = document.getElementById('fs-body'); if (!el) return; el.innerHTML = h; (el.querySelector(foco || '[data-autofocus]') || el.querySelector('input'))?.focus({ preventScroll: true }); };
function recentes() {
  return Object.keys(S.lastSets).filter((k) => k.startsWith(K_A)).map((k) => { const v = LS(k); return v && typeof v.n === 'string' && Array.isArray(v.b) ? { ...v, s: k.slice(K_A.length) } : null; })
    .filter(Boolean).sort((a, b) => (b.t || 0) - (a.t || 0));
}
function lembrar(a, q) {
  const s = String(a.s || `m${D.slug(a.n)}`).slice(0, 40);
  S.lastSets[K_A + s] = { n: a.n, b: a.b, u: a.u || 'g', por: a.por || 100, q, t: Date.now(), ...(a.sv ? { sv: a.sv } : {}) };
}

const refTxt = (e) => { const u = e.u ? ` ${esc(e.u)}` : ''; return e.lo != null && e.hi != null ? `Referência: ${fmtNum(e.lo)} a ${fmtNum(e.hi)}${u}` : e.hi != null ? `Referência: até ${fmtNum(e.hi)}${u}` : e.lo != null ? `Referência: a partir de ${fmtNum(e.lo)}${u}` : ''; };
function refBar(e) {
  const v = e.v, lo = e.lo ?? null, hi = e.hi ?? null; if (!Number.isFinite(v) || (lo == null && hi == null)) return '';
  const a = Math.min(lo ?? v, hi ?? v, v), b = Math.max(lo ?? v, hi ?? v, v), pad = (b - a || Math.abs(b) || 1) * 0.2, L = a - pad, sp = b + pad - L;
  const okL = lo != null ? ((lo - L) / sp) * 100 : 0, okR = hi != null ? ((hi - L) / sp) * 100 : 100;
  return `<div class="ref" aria-hidden="true"><span class="ok" style="left:${pct(okL)};right:${pct(100 - okR)}"></span><span class="mk" style="left:${pct(((v - L) / sp) * 100)}"></span></div>`;
}
const exVal = (e) => (Number.isFinite(e.v) ? `${fmtNum(e.v)}${e.u ? ' ' + esc(e.u) : ''}` : esc(e.txt || '—'));
const exFlag = (e) => (!Number.isFinite(e.v) || (e.lo == null && e.hi == null) ? '' : e.hi != null && e.v > e.hi ? '<span class="flag hi">acima</span>' : e.lo != null && e.v < e.lo ? '<span class="flag lo">abaixo</span>' : '<span class="flag">na faixa</span>');
const CAMPOS = [['peso', 'Peso', 'kg'], ['gordura', 'Gordura', '%'], ['cintura', 'Cintura', 'cm'], ['abdomen', 'Abdômen', 'cm'], ['peito', 'Peito', 'cm'], ['ombros', 'Ombros', 'cm'], ['pescoco', 'Pescoço', 'cm'], ['quadril', 'Quadril', 'cm'], ['bicepsD', 'Bíceps dir.', 'cm'], ['bicepsE', 'Bíceps esq.', 'cm'], ['antebracoD', 'Antebraço dir.', 'cm'], ['antebracoE', 'Antebraço esq.', 'cm'], ['coxaD', 'Coxa dir.', 'cm'], ['coxaE', 'Coxa esq.', 'cm'], ['panturrilhaD', 'Panturrilha dir.', 'cm'], ['panturrilhaE', 'Panturrilha esq.', 'cm']];
function Exames() {
  const H = D.SAUDE;
  if (!H) return { title: 'Exames e medidas', html: `${backbar('saude', 'Saúde')}${hdr('Exames e medidas')}${semSaude()}` };
  const med = H.medidas, M = med[med.length - 1], metas = D.metas();
  let medH;
  if (!M) medH = `<div class="card"><p class="small muted" style="margin:0">Nenhuma medida no Supabase.</p></div>`;
  else {
    const ant = (k) => { for (let i = med.length - 2; i >= 0; i--) if (fin(med[i][k]) != null) return med[i]; return null; };
    const kp = CAMPOS.filter(([k]) => fin(M[k]) != null).map(([k, n, u]) => { const a = ant(k), m = fin(Number(metas[k])); return `<div class="kpi"><span>${n}</span><b>${n1(M[k])} ${u}</b><small>${a ? `${M[k] <= a[k] ? '−' : '+'}${n1(Math.abs(M[k] - a[k]))} desde ${dQuando(dayAt(a.d))}` : 'primeira medida'}${m != null ? ` · meta ${n1(m)}` : ''}</small></div>`; }).join('');
    const rc = fin(M.cintura) != null && H.altura ? M.cintura / H.altura : null;
    medH = `<div class="card"><div class="small muted" style="margin-bottom:8px">${dAno(dayAt(M.d))}${M.fonte ? ` · ${esc(M.fonte)}` : ''}</div><div class="grid2" style="margin:0">${kp}</div>
      ${rc != null ? `<p class="small muted" style="margin-top:10px">Cintura ÷ altura: <b class="num" style="color:var(--ink)">${rc.toFixed(2).replace('.', ',')}</b> (alvo abaixo de 0,50).</p>` : ''}${M.notas ? `<p class="small muted" style="margin-top:6px">${txtBr(M.notas)}</p>` : ''}</div>`;
  }
  const ult = examesUltimos(), ultD = H.exames.length ? H.exames[H.exames.length - 1].d : null, cats = {};
  ult.forEach((e) => { const c = e.cat || 'Outros'; (cats[c] = cats[c] || []).push(e); });
  const row = (e) => `<button class="row" style="display:block;padding:12px 0;width:100%;text-align:left" data-act="exame" data-arg="${esc(e.n)}"><div class="row-flex"><span class="ttl grow" style="white-space:normal">${esc(e.n)}</span><b class="num">${exVal(e)}</b>${exFlag(e)}</div>${refBar(e)}<div class="xs muted" style="margin-top:4px">${[refTxt(e), e.d !== ultD ? `de ${dAno(dayAt(e.d))}` : ''].filter(Boolean).join(' · ')}</div></button>`;
  const exH = ult.length ? Object.keys(cats).sort((a, b) => a.localeCompare(b, 'pt-BR')).map((c) => `${sec(esc(c))}<div class="card tight">${cats[c].sort((a, b) => a.n.localeCompare(b.n, 'pt-BR')).map(row).join('')}</div>`).join('') : `<div class="card"><p class="small muted" style="margin:0">Nenhum exame no Supabase.</p></div>`;
  const resumo = (m) => [fin(m.peso) != null ? `${n1(m.peso)} kg` : '', fin(m.cintura) != null ? `cintura ${n1(m.cintura)} cm` : '', fin(m.gordura) != null ? `gordura ${n1(m.gordura)}%` : ''].filter(Boolean).join(' · ') || esc(m.fonte || 'medida');
  return {
    title: 'Exames e medidas',
    html: `${backbar('saude', 'Saúde')}${hdr('Exames e medidas', 'Valores e a referência do laboratório. Não é diagnóstico.')}
      ${sec('Última medida')}${medH}
      ${sec('Exames', ultD ? `<span class="small muted">último em ${dAno(dayAt(ultD))}</span>` : '')}
      <p class="small muted" style="margin:0 20px">O resultado mais recente de cada marcador. Toque para ver o histórico.</p>
      ${exH}
      ${med.length > 1 ? `${sec('Medidas anteriores', `<span class="small muted num">${med.length} no total</span>`)}<div class="card tight">${med.slice(0, -1).slice(-12).reverse().map((m) => `<div class="row"><span class="badge-ic">${I('scale', 20)}</span><div class="grow"><div class="ttl">${dAno(dayAt(m.d))}</div><div class="meta">${resumo(m)}</div></div></div>`).join('')}</div>` : ''}
      <p class="small muted" style="margin:14px 20px">${esc(H.fonte || '')}${H.fonte ? '. ' : ''}Medidas e exames novos ainda não entram pelo app: os do Supabase foram copiados uma vez.</p>`,
  };
}

// ---------- Dados reais ----------
const realDate = () => new Date(D.REAL.geradoEm + 'T12:00');
let realOk = null;
const justLoaded = () => { if (realOk === null) { try { realOk = !!sessionStorage.getItem('painel-real-ok'); sessionStorage.removeItem('painel-real-ok'); } catch { realOk = false; } } return realOk; };
const fromSB = () => !!(D.REAL && D.REAL.origem === 'supabase');
const hhmm = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const syncDate = () => (D.REAL && D.REAL.sincronizadoEm ? new Date(D.REAL.sincronizadoEm) : null);
const fmtSync = () => { const t = syncDate(); return t && !isNaN(t) ? `${dShort(t)} às ${hhmm(t)}` : dShort(realDate()); };
const realLine = () => (!D.REAL ? '' : fromSB()
  ? `<p class="small muted" style="margin:0 20px 6px">${I('lock', 14, 'style="display:inline;vertical-align:-2px"')} Open Finance de ${fmtSync()}, com cópia neste aparelho. <a href="#/dinheiro/sincronizar">${syncBusy ? 'Atualizando…' : 'Ver conexão'}</a></p>`
  : `<p class="small muted" style="margin:0 20px 6px">${I('lock', 14, 'style="display:inline;vertical-align:-2px"')} Seus dados de ${dShort(realDate())}, só neste aparelho. <a href="#/dinheiro/importar">Atualizar</a></p>`);
function plMes(pl) {
  if (!D.REAL) return '';
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
      // Contas marcadas como pagas em outros dados não valem para este arquivo (os gastos anotados à mão ficam).
      // Com a nuvem, as marcações são do Open Finance dos outros aparelhos: ficam.
      if (!nvEntrou()) { S.paid = {}; S.paidAmt = {}; S.paidAt = {}; S.card = 0; save(); }
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
    ${(D.REAL.aClassificar || []).length ? `<h3 style="margin:16px 0 6px">Pix de terceiros para classificar</h3><div class="card tight" style="margin:0">${D.REAL.aClassificar.slice(0, 8).map((x) => `<div class="row"><div class="grow"><div class="ttl ellip">${esc(x.nome)}</div><div class="meta">${x.n} lançamento${x.n > 1 ? 's' : ''}</div></div><div class="amt num small">${x.entradas ? `+${brl0(x.entradas)}` : ''}${x.entradas && x.saidas ? '<br>' : ''}${x.saidas ? `−${brl0(x.saidas)}` : ''}</div></div>`).join('')}</div>${podeCat() ? '<button class="btn block" style="margin-top:12px" data-act="lfF" data-arg="classificar!">Classificar agora</button>' : ''}` : ''}`);
}

// Gastos do último mês fechado, como vieram (os anotados à mão são deste mês e aparecem em "Registrados à mão").
const cats = () => D.CATS;
function Dinheiro() {
  const exp = S.expenses.length ? `${sec('Registrados à mão', '<span class="small muted">ligados ao extrato quando ele chegar</span>')}<div class="card tight">${S.expenses.slice().reverse().map(expRow).join('')}</div>` : '';
  if (!D.REAL) {
    return { title: 'Dinheiro', html: `${hdr('Dinheiro', `${cap(monLong(diaNow()))} · pessoa física`)}${netbar()}${semDinheiro()}${exp}
      ${sec('Mais')}<a class="card cardlink" href="#/dinheiro/importar"><span class="badge-ic">${I('upload')}</span><div class="grow"><b>Open Finance e arquivo</b><div class="small muted">Login no Supabase ou o painel-dados.json do seu computador</div></div>${I('chevR', 24, 'class="ic chev"')}</a>` };
  }
  const M = money(), SV = D.SAVINGS;
  const up = bills().filter((b) => !b.pago && b.met !== 'Cartão' && D.diffDays(b.due, diaNow()) <= 7);
  const C = cats(), rest = D.CATS_REST, tot = C.reduce((a, c) => a + c.v, 0) + rest, top = Math.max(1, ...C.map((c) => c.v));
  const pl = plTotal();
  const reserva = SV.reservaMeses != null
    ? `<div class="row-flex">${I('shieldHalf', 22, 'class="ic" style="color:var(--a-pat)"')}<div class="grow"><b class="num">${n1(SV.reservaMeses)} de ${SV.reservaMeta} meses</b><div class="small muted">de gastos essenciais (${brl0(SV.essenciais)}/mês${SV.essLabel ? ` ${esc(SV.essLabel)}` : ''})</div></div></div><div style="margin-top:10px">${bar((SV.reservaMeses / SV.reservaMeta) * 100, 'var(--a-pat)', 'lg')}</div>
        <p class="small muted" style="margin-top:8px">Escudo da Reserva: cada aporte reforça o escudo e sobe o atributo Patrimônio.${SV.reservaMeses < SV.reservaMeta ? ` Faltam ${brl0((SV.reservaMeta - SV.reservaMeses) * SV.essenciais)} para ${SV.reservaMeta} meses.` : ''}</p>`
    : `<div class="row-flex">${I('shieldHalf', 22, 'class="ic" style="color:var(--a-pat)"')}<div class="grow"><b class="num">${brl0(SV.reserva)} guardados</b><div class="small muted">Sem o valor dos gastos essenciais na foto manual, os meses de reserva ficam sem número.</div></div></div>`;
  return {
    title: 'Dinheiro',
    html: `${hdr('Dinheiro', `${cap(monLong(diaNow()))} · pessoa física`, `<a class="iconbtn" href="#/dinheiro/importar" aria-label="Open Finance e arquivo">${I('upload')}</a>`)}${netbar()}${realLine()}
      <div class="card">
        <button class="cardhead" data-act="safe"><span class="row-flex"><span class="muted small">${livreLabel(M)}</span>${I('info', 18, 'class="ic right muted"')}</span>
        ${livreBig(M)}<span class="sr">Ver a conta.</span></button>
        <div class="kpis"><div class="kpi"><span>Em conta</span><b>${brlK(M.saldo)}</b></div>${fatKpi(M, M.fb && !M.fb.pago && M.fb.due ? `vence ${dShort(M.fb.due)}` : '')}<div class="kpi"><span>Patrimônio</span><b>${brlK(pl)}</b><small>${plMes(pl)}</small></div></div>
      </div>
      ${sec('Próximos 7 dias', '<a href="#/dinheiro/contas">Calendário</a>')}
      <div class="card tight">${up.length ? up.map((b) => `<button class="row" data-act="bill" data-arg="${esc(b.id)}"><span class="badge-ic">${I('receipt', 20)}</span><div class="grow"><div class="ttl ellip">${esc(b.n)}</div><div class="meta">${relDue(b)} · ${esc(b.met)}</div></div><div class="amt"><div class="num">${brl(b.v)}</div>${stChip(b.st)}</div></button>`).join('') : `<div class="empty"><p>Nada vence nos próximos 7 dias.</p></div>`}</div>
      ${sec('Reserva de emergência')}
      <div class="card">${reserva}</div>
      ${sec(D.CATS_TITLE, SV.taxa == null ? '' : `<span class="small muted num">poupança ${esc(SV.taxa)}% · meta ${SV.meta}%</span>`)}
      <div class="card">${C.map((c) => `<${fromSB() ? `button class="catbar" data-act="verGrupo" data-arg="${esc(c.n)}" aria-label="${esc(c.n)}: ${brl0(c.v)}. Ver lançamentos"` : 'div'} style="margin:10px 0"><div class="row-flex small"><span class="grow">${esc(c.n)}</span><b class="num">${brl0(c.v)}</b><span class="muted num" style="width:72px;text-align:right">${c.v > c.avg * 1.1 ? `${I('up', 14, 'style="display:inline;vertical-align:-2px"')} ${Math.round((c.v / c.avg - 1) * 100)}%` : 'na média'}</span></div>${bar((c.v / top) * 100, c.v > c.avg * 1.1 ? 'var(--xp-fill)' : 'var(--primary)')}</${fromSB() ? 'button' : 'div'}>`).join('')}
        ${C.length ? '' : '<div class="empty"><p>Ainda sem gastos no Open Finance.</p></div>'}
        <p class="small muted">Total ${brl0(tot)}${Math.abs(rest) >= 1 ? `, com ${rest > 0 ? '' : '−'}${brl0(Math.abs(rest))} de outras categorias e estornos` : ''}. Comparação com a média dos 6 meses anteriores. ${D.REAL.cartaoDetalhado ? 'As compras do cartão entram no mês em que a fatura vence.' : 'A fatura aparece numa linha só até as faturas do cartão chegarem.'}</p></div>
      ${exp}
      ${(D.REAL.pendentes || []).length ? `${sec('Para completar o painel')}<button class="card cardlink" data-act="pendentes"><span class="badge-ic">${I('target')}</span><div class="grow"><b>Faltam ${D.REAL.pendentes.length} itens</b><div class="small muted">${esc(D.REAL.pendentes.slice(0, 2).map((x) => x.n).join(', '))} e outros</div></div>${I('chevR', 24, 'class="ic chev"')}</button>` : ''}
      ${sec('Mais')}
      <a class="card cardlink" href="#/dinheiro/lancamentos"><span class="badge-ic">${I('file')}</span><div class="grow"><b>Lançamentos</b><div class="small muted">${podeCat() ? 'Trocar categoria e lançar à mão' : 'Busca por descrição, categoria e mês'}</div></div>${I('chevR', 24, 'class="ic chev"')}</a>
      ${podeCat() ? `<a class="card cardlink" href="#/dinheiro/categorias"><span class="badge-ic">${I('tag')}</span><div class="grow"><b>Plano de contas</b><div class="small muted">Categorias, tipos e suas regras</div></div>${I('chevR', 24, 'class="ic chev"')}</a>` : ''}
      <a class="card cardlink" href="#/dinheiro/cartoes"><span class="badge-ic">${I('card')}</span><div class="grow"><b>Cartões e faturas</b><div class="small muted">Limite, faturas pagas e lançamentos</div></div>${I('chevR', 24, 'class="ic chev"')}</a>
      <a class="card cardlink" href="#/dinheiro/patrimonio"><span class="badge-ic">${I('pie')}</span><div class="grow"><b>Patrimônio</b><div class="small muted">Balanço, evolução e alocação</div></div>${I('chevR', 24, 'class="ic chev"')}</a>
      <a class="card cardlink" href="#/dinheiro/importar"><span class="badge-ic">${I('upload')}</span><div class="grow"><b>Open Finance e arquivo</b><div class="small muted">${fromSB() ? `Open Finance de ${fmtSync()}` : `Seus dados de ${dShort(realDate())}`}</div></div>${I('chevR', 24, 'class="ic chev"')}</a>`,
  };
}
// Depois de paga, a fatura do mês sai de cena: o card mostra a próxima, que recebe os gastos novos no cartão.
const fatKpi = (M, sub = '') => (semCartao() ? '<div class="kpi"><span>Cartão</span><b>—</b><small>nenhum no Open Finance</small></div>' : M.fb.pago ? `<div class="kpi"><span>Próxima fatura</span><b>${brlK(M.proxima)}</b><small>a aberta já foi paga</small></div>` : `<div class="kpi"><span>Fatura aberta</span><b>${brlK(M.fatura)}</b>${sub ? `<small>${sub}</small>` : ''}</div>`);
const expRow = (x) => `<div class="row"><span class="badge-ic">${I(x.met === CARD ? 'card' : 'wallet', 20)}</span><div class="grow"><div class="ttl">${esc(x.cat)}</div><div class="meta">${dShort(dayAt(x.d))} · ${esc(cardName(x.met))}${x.met === CARD ? (x.fat === 'proxima' ? ', próxima fatura' : ', fatura aberta') : ''}</div></div><div class="amt num">${brl(x.v)}</div><button class="iconbtn" data-act="delExpense" data-arg="${esc(x.id)}" aria-label="Apagar gasto de ${brl(x.v)} em ${esc(x.cat.toLowerCase())}">${I('x')}</button></div>`;
function plTotal() { const a = D.BALANCE.ativo.flatMap((g) => g.itens).reduce((s, i) => s + i[1], 0); const p = D.BALANCE.passivo.flatMap((g) => g.itens).reduce((s, i) => s + i[1], 0); return a - p; }

function Contas() {
  if (!D.REAL) return { title: 'Contas a pagar', html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Contas a pagar')}${semDinheiro()}` };
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
    html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Contas a pagar', `${brl0(tot)} no mês · ${brl0(pago)} já pagos${noCartao ? ` · ${noCartao} no cartão, dentro da fatura` : ''}`)}
      <div class="card"><div class="row-flex"><button class="iconbtn" data-act="calnav" data-arg="-1" aria-label="Mês anterior">${I('chevL')}</button><b class="grow" style="text-align:center">${cap(monLong(m0))}</b><button class="iconbtn" data-act="calnav" data-arg="1" aria-label="Próximo mês">${I('chevR')}</button></div>
        <div class="cal">${cells}</div>
        <div class="legend" style="margin-top:8px"><span><i class="dot-pago" style="width:8px;height:8px;border-radius:50%"></i>paga</span><span><i class="dot-agendado" style="width:8px;height:8px;border-radius:50%"></i>agendada</span><span><i class="dot-avencer" style="width:8px;height:8px;border-radius:50%"></i>a vencer</span><span><i class="dot-atrasado" style="width:8px;height:8px;border-radius:50%"></i>atrasada</span></div></div>
      <div class="hscroll" role="group" aria-label="Filtrar contas">${F.map(([k, l]) => `<button class="pick" aria-pressed="${S.billFilter === k}" data-act="billf" data-arg="${k}">${l}</button>`).join('')}</div>
      ${S.calSel ? `<div class="sec"><h2>${dShort(new Date(S.calSel + 'T12:00'))}</h2><button class="link" data-act="calsel" data-arg="${S.calSel}">Ver o mês todo</button></div>` : ''}
      <div class="card tight">${list.length ? list.map((b) => `<button class="row" data-act="bill" data-arg="${esc(b.id)}"><span class="badge-ic">${I(b.cat === 'Cartão' ? 'card' : b.cat === 'Transporte' ? 'car' : b.cat === 'Investimento' ? 'trend' : 'receipt', 20)}</span><div class="grow"><div class="ttl ellip">${esc(b.n)}</div><div class="meta">${relDue(b)} · ${b.met === 'Cartão' ? `no ${esc(card0())}, entra na fatura` : esc(b.met || '')}</div></div><div class="amt"><div class="num">${brl(b.v)}</div>${stChip(b.st)}</div></button>`).join('') : `<div class="empty"><span class="badge-ic">${I('receipt')}</span><p>Nenhuma conta com esse filtro.</p></div>`}</div>
      <p class="small muted" style="margin:14px 20px">Pagar até o vencimento dá +15 XP. ${fromSB() ? 'As contas vêm do Open Finance: as recorrentes que aparecem no extrato e a fatura do cartão.' : 'As contas vêm do arquivo do Painel.'}</p>`,
  };
}

function CartoesReal() {
  if (!D.CARDS.length) return { title: 'Cartões e faturas', html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Cartões e faturas', esc((D.REAL.notas || {}).cartoes || ''))}${realLine()}<div class="card"><div class="empty"><span class="badge-ic">${I('card', 28)}</span><b>Nenhum cartão ${fromSB() ? 'no Open Finance' : 'nos seus dados'}</b><p>${fromSB() ? 'Quando um cartão for conectado no Meu Pluggy, ele aparece aqui depois da próxima sincronização.' : 'O arquivo carregado não traz cartões.'}</p></div></div>` };
  const i = Math.min(S.card, D.CARDS.length - 1), k = D.CARDS[i].real, now = diaNow();
  const usado = k.usado || 0, lim = Number(k.limite) || 0, pc = lim ? (usado / lim) * 100 : 0;
  let vdate = null;
  if (k.vence) { vdate = new Date(now.getFullYear(), now.getMonth(), k.vence); if (vdate < D.startOfDay(now)) vdate = new Date(now.getFullYear(), now.getMonth() + 1, k.vence); }
  const P = k.pagamentos || [], tot = P.reduce((a, p) => a + p.v, 0), med = P.length ? P.slice(-3).reduce((a, p) => a + p.v, 0) / Math.min(3, P.length) : 0;
  const pd = (p) => new Date(p.d + 'T12:00');
  // Open Finance: cada fatura vencida vem com a data do pagamento quando ele aparece no extrato (pagoEm).
  const lastPaid = (p) => (!p.vence ? `Última, paga em ${dShort(pd(p))}` : p.pagoEm ? `Última, venceu em ${dShort(pd(p))} e foi paga em ${dShort(new Date(p.pagoEm + 'T12:00'))}` : `Última, venceu em ${dShort(pd(p))}. O pagamento ainda não apareceu no extrato.`);
  const refU = (k.refUsado || '').replace(/^(\d{4})-(\d{2}).*/, (_, y, m) => `${m}/${y.slice(2)}`);
  const N = D.REAL.notas || {};
  // Open Finance: compras do cartão (sem os pagamentos da fatura), da mais nova para a mais antiga.
  const LA = (D.REAL.transacoes || []).filter((x) => x.conta && x.conta === k.id && x.tipo !== 'transferencia');
  const nL = LA.length, L = LA.slice(-25).reverse();
  return {
    title: 'Cartões e faturas',
    html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Cartões e faturas', esc(N.cartoes || 'Limite e pagamentos pelos seus arquivos'))}${realLine()}
      <div class="seg" role="group" aria-label="Escolher cartão" style="margin:4px 16px 0">${D.CARDS.map((x, j) => `<button aria-pressed="${i === j}" data-act="card" data-arg="${j}">${esc(x.n.replace('Cartão ', ''))}</button>`).join('')}</div>
      <div class="card"><div class="row-flex"><span class="small muted grow">Limite usado${refU ? ` em ${esc(refU)}` : ''}</span><b class="num">${lim ? `${brl0(usado)} de ${brl0(lim)}` : brl0(usado)}</b></div><div style="margin-top:8px">${bar(pc, pc > 50 ? 'var(--xp-fill)' : 'var(--primary)', 'lg')}</div>
        <p class="small muted" style="margin-top:8px">${lim ? `Disponível ${brl0(lim - usado)}.` : 'O banco não informa o limite.'}${k.faturaAtual && k.faturaAtual.v != null ? ` Fatura que vence em ${dShort(new Date(k.faturaAtual.vence + 'T12:00'))}: ${brl(k.faturaAtual.v)}.` : vdate ? ` Vence todo dia ${esc(k.vence)}; a próxima em ${dShort(vdate)} (${rel(vdate)}).` : ''}</p></div>
      ${P.length ? `${sec(P.some((p) => p.vence && !p.pagoEm) ? 'Faturas anteriores' : 'Faturas pagas')}<div class="card"><div class="small muted">${lastPaid(P[P.length - 1])}</div><div class="big">${brl(P[P.length - 1].v)}</div>
        <div class="kpis"><div class="kpi"><span>Média 3 meses</span><b>${brlK(med)}</b></div><div class="kpi"><span>No período</span><b>${brlK(tot)}</b></div><div class="kpi"><span>Maior</span><b>${brlK(Math.max(...P.map((p) => p.v)))}</b></div></div>
        <div style="margin-top:12px">${barChart(P.slice(-10).map((p) => ({ v: p.v, l: mon(pd(p)), c: 'var(--a-pat)' })), { label: `Faturas por mês, de ${brl0(P[Math.max(0, P.length - 10)].v)} a ${brl0(P[P.length - 1].v)}`, values: (v) => (v ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : '') })}</div></div>` : ''}
      ${sec(L.length ? 'Últimos lançamentos' : 'Lançamentos', L.length ? `<span class="small muted">${L.length} de ${nL}</span>` : '')}
      ${L.length ? `<div class="card tight">${L.map((x) => { const inner = `<div class="grow"><div class="ttl ellip">${esc(x.desc || 'Lançamento')}</div><div class="meta">${dShort(new Date(x.d + 'T12:00'))} · ${esc(x.cat || '')}${x.man ? ' (sua)' : ''}${x.fat ? ` · fatura de ${mon(new Date(x.fat + 'T12:00'))}` : ''}</div></div><div class="amt num">${x.v > 0 ? `+${brl(x.v)}` : brl(-x.v)}</div>`; return podeCat() && x.id ? `<button class="row" data-act="tx" data-arg="${esc(x.id)}">${inner}</button>` : `<div class="row">${inner}</div>`; }).join('')}</div>` : `<div class="card"><div class="empty"><span class="badge-ic">${I('file', 28)}</span><b>${usado || P.length ? 'Faltam as faturas' : 'Sem uso'}</b><p>${usado || P.length ? `${esc(k.faturas || '')}. Com elas o Painel separa mercado, restaurante, assinaturas e parcelas.` : `Nenhuma compra neste cartão. Limite livre de ${brl0(k.limite)}.`}</p>${usado || P.length ? '<a class="btn" href="#/dinheiro/importar">Como enviar</a>' : ''}</div></div>`}`,
  };
}

function Cartoes() {
  if (!D.REAL) return { title: 'Cartões e faturas', html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Cartões e faturas')}${semDinheiro()}` };
  return CartoesReal();
}
// ---------- Lançamentos, categorias e plano de contas (Open Finance) ----------
// Trocar a categoria de um lançamento (só ele, ou ele e os parecidos com uma regra no banco), lançar à mão o que não
// passa pelo Open Finance (dinheiro, outro banco) e cuidar do plano de contas. Tudo grava no Supabase, só a conta
// dona; depois o app lê o fin_painel de novo para os totais por categoria saírem do banco.
const TIPOS = { despesa: 'Despesa', receita: 'Receita', transferencia: 'Transferência', investimento: 'Investimento', divida: 'Dívida', rateio: 'Rateio', terceiros: 'Terceiros', pj: 'Empresas (PJ)', receber: 'A receber', bem: 'Bem' };
const planoCats = () => (D.REAL && Array.isArray(D.REAL.categorias) ? D.REAL.categorias : []);
const podeCat = () => fromSB() && !!SB.session() && Array.isArray(D.REAL.categorias);
const grupoDe = (n) => String(n || '').split(':')[0].trim();
const subDe = (n) => { const i = String(n || '').indexOf(':'); return i < 0 ? '' : String(n).slice(i + 1).trim(); };
const ehCartao = (x) => !x.m && (D.REAL.cartoes || []).some((c) => c.id === x.conta);
const contaTipoTx = (x) => (x.m ? null : ehCartao(x) ? 'CREDIT' : 'BANK');
function contaNomeTx(x) {
  if (x.m) return x.cn || 'À mão';
  const k = (D.REAL.cartoes || []).find((c) => c.id === x.conta); if (k) return k.n;
  const c = (D.REAL.contas || []).find((y) => y.id === x.conta); return c ? `${c.inst || ''} ${c.n ? c.n.toLowerCase() : ''}`.trim() : 'Conta';
}
const txById = (id) => ((D.REAL && D.REAL.transacoes) || []).find((x) => x.id === id);
const valTx = (x) => (x.v > 0 ? `+${brl(x.v)}` : brl(-x.v));
const dTx = (x) => dShort(new Date(x.d + 'T12:00'));
// Texto sugerido para achar os parecidos: a descrição sem números, datas e parcelas.
const sugereTexto = (s) => String(s || '').replace(/\(?\d+\s*\/\s*\d+\)?/g, ' ').replace(/[\d][\d.,/:-]*/g, ' ').replace(/[*#|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
// A regra guardada é uma expressão regular; a do app é o texto com espaços flexíveis.
const regraTexto = (p) => String(p || '').replace(/\\s\+/g, ' ').replace(/\\(.)/g, '$1');
const FINMSG = {
  categoria_existe: 'Já existe uma categoria com esse nome.', categoria_nao_existe: 'Essa categoria não está mais no plano. Atualize e tente de novo.',
  categoria_do_sistema: 'O Painel usa essa categoria nas contas (fatura, transferências): ela não muda de nome nem de tipo.',
  categoria_em_uso: 'Essa categoria ainda tem lançamentos ou regras. Para tirá-la, junte com outra.', nome_invalido: 'Digite um nome de até 80 letras.',
  texto_curto: 'Digite pelo menos 3 letras da descrição.', lancamento_nao_existe: 'Esse lançamento não está mais no banco. Atualize e tente de novo.',
  valor_invalido: 'Digite o valor, por exemplo 45,90.', descricao_vazia: 'Escreva uma descrição.', categoria_obrigatoria: 'Lançamento feito à mão precisa de categoria.',
};
const finMsg = (e) => FINMSG[e && e.code] || sbMsg(e);
// Lê o fin_painel de novo depois de gravar (espera uma leitura em andamento acabar).
async function finRecarregar() {
  for (let i = 0; syncBusy && i < 120; i++) await new Promise((r) => setTimeout(r, 250));
  await syncNow(false);
  render(true);
}
let finBusy = false;
async function finGrava(passos, ok) {
  if (finBusy) return false;
  finBusy = true;
  sheetRoot.querySelectorAll('[data-fin]').forEach((b) => b.setAttribute('aria-disabled', 'true'));
  try {
    const r = await passos();
    finBusy = false;
    closeSheet();
    toast(`${I('check', 18)} <span>${ok(r)}</span>`, '', 3600);
    finRecarregar();
    return true;
  } catch (e) {
    finBusy = false;
    sheetRoot.querySelectorAll('[data-fin]').forEach((b) => b.removeAttribute('aria-disabled'));
    toast(esc(plain(finMsg(e))), 'warn', 6000);
    return false;
  }
}

// Lista de lançamentos: busca, filtros e um mês.
let LF = { q: '', f: 'todos', mes: '', cat: '', n: 60 };
const LF_F = [['todos', 'Todos'], ['classificar', 'A classificar'], ['man', 'Escolhidos por você'], ['m', 'Feitos à mão']];
function lfFiltra() {
  const q = normq(LF.q), T = (D.REAL && D.REAL.transacoes) || [];
  return T.filter((x) => (!LF.mes || x.d.startsWith(LF.mes))
    && (!LF.cat || x.cat === LF.cat || grupoDe(x.cat) === LF.cat)
    && (LF.f === 'todos' || (LF.f === 'classificar' && /classificar|sem categoria/i.test(x.cat || '')) || (LF.f === 'man' && x.man) || (LF.f === 'm' && x.m))
    && (!q || q.split(' ').every((w) => normq(`${x.desc || ''} ${x.cat || ''} ${contaNomeTx(x)} ${Math.abs(x.v).toFixed(2).replace('.', ',')}`).includes(w))))
    .slice().reverse();
}
const txRow = (x) => {
  const meta = `${esc(x.cat || '')}${x.man ? ' (sua)' : ''} · ${dTx(x)} · ${esc(contaNomeTx(x))}`;
  const inner = `<div class="grow"><div class="ttl ellip">${esc(x.desc || 'Lançamento')}</div><div class="meta ellip">${meta}</div></div><div class="amt num">${valTx(x)}</div>`;
  return podeCat() && x.id ? `<button class="row" data-act="tx" data-arg="${esc(x.id)}">${inner}</button>` : `<div class="row">${inner}</div>`;
};
function lfLista() {
  const L = lfFiltra(), V = L.slice(0, LF.n);
  const sai = L.filter((x) => x.v < 0).reduce((a, x) => a - x.v, 0), ent = L.filter((x) => x.v > 0).reduce((a, x) => a + x.v, 0);
  return `<p class="small muted" style="margin:6px 20px">${L.length} lançamento${L.length === 1 ? '' : 's'}${L.length ? ` · saídas ${brl0(sai)} · entradas ${brl0(ent)}` : ''}</p>
    ${V.length ? `<div class="card tight">${V.map(txRow).join('')}</div>` : `<div class="card"><p class="small muted" style="margin:0">Nenhum lançamento com esse filtro.</p></div>`}
    ${L.length > V.length ? `<div style="margin:0 16px"><button class="btn line block" data-act="lfMais">Mostrar mais ${Math.min(60, L.length - V.length)}</button></div>` : ''}`;
}
function Lancamentos() {
  if (!D.REAL) return { title: 'Lançamentos', html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Lançamentos')}${semDinheiro()}` };
  const T = D.REAL.transacoes || [], meses = [...new Set(T.map((x) => x.d.slice(0, 7)))].sort().reverse();
  const ncl = T.filter((x) => /classificar|sem categoria/i.test(x.cat || '')).length;
  const aviso = !fromSB() ? '<p class="small muted" style="margin:0 20px 8px">Trocar categoria e lançar à mão funcionam com o Open Finance (login no Supabase).</p>'
    : !Array.isArray(D.REAL.categorias) ? '<p class="small muted" style="margin:0 20px 8px">Para trocar categorias pelo app, o banco precisa da atualização desta versão (migração reclassificar).</p>' : '';
  return {
    title: 'Lançamentos',
    html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Lançamentos', podeCat() ? 'Toque num lançamento para trocar a categoria' : `${T.length} lançamentos`, podeCat() ? `<button class="iconbtn" data-act="manNovo" aria-label="Lançar à mão">${I('plus')}</button>` : '')}${aviso}
      <div class="card"><label class="field" style="margin:0"><span>Buscar</span><input class="input" id="lfq" data-in="lfq" value="${esc(LF.q)}" placeholder="descrição, categoria ou valor" autocomplete="off" type="search"></label>
        <div class="picks" role="radiogroup" aria-label="Filtro" style="margin-top:10px">${LF_F.map(([k, l]) => `<button type="button" class="pick" role="radio" aria-checked="${LF.f === k}" tabindex="${LF.f === k ? 0 : -1}" data-act="lfF" data-arg="${k}">${l}${k === 'classificar' && ncl ? ` (${ncl})` : ''}</button>`).join('')}</div>
        <div class="row-flex" style="margin-top:10px;gap:8px"><label class="grow"><span class="sr">Mês</span><select class="input" data-in="lfmes" aria-label="Mês"><option value="">Todos os meses</option>${meses.map((m) => `<option value="${m}"${m === LF.mes ? ' selected' : ''}>${cap(monLong(new Date(m + '-15T12:00')))} ${m.slice(0, 4)}</option>`).join('')}</select></label></div>
        ${LF.cat ? `<p class="small" style="margin:10px 0 0">Categoria: <b>${esc(LF.cat)}</b> <button class="link" data-act="lfCat" data-arg="">Tirar</button></p>` : ''}</div>
      <div id="lflist" aria-live="polite">${lfLista()}</div>
      ${podeCat() ? `<p class="small muted" style="margin:14px 20px">O + lança à mão o que não passa pelo Open Finance: dinheiro vivo, outro banco. <a href="#/dinheiro/categorias">Plano de contas</a></p>` : ''}`,
  };
}

// Escolher categoria: busca no plano; sem busca, as mais usadas primeiro. Dá para criar uma nova pelo nome digitado.
function catOpcoes(q, atual, act) {
  const P = planoCats(), t = normq(q);
  let L = P.filter((c) => c.n !== atual && (!t || t.split(' ').every((w) => normq(c.n).includes(w))));
  L = L.sort((a, b) => (b.q90 || 0) - (a.q90 || 0) || (b.q || 0) - (a.q || 0) || a.n.localeCompare(b.n, 'pt-BR')).slice(0, t ? 40 : 12);
  const novo = q.trim().length >= 2 && !P.some((c) => normq(c.n) === t);
  return `${novo ? `<button class="row" data-act="${act}" data-arg="+${esc(q.trim())}"><span class="badge-ic p">${I('plus', 20)}</span><div class="grow"><div class="ttl ellip">Criar “${esc(q.trim())}”</div><div class="meta">Categoria nova no plano de contas</div></div></button>` : ''}${L.map((c) => `<button class="row" data-act="${act}" data-arg="${esc(c.n)}"><div class="grow"><div class="ttl ellip">${esc(c.n)}</div><div class="meta">${TIPOS[c.tipo] || esc(c.tipo)}${c.q ? ` · ${c.q} lançamento${c.q === 1 ? '' : 's'}` : ''}</div></div></button>`).join('')}${!novo && !L.length ? '<p class="small muted" style="padding:12px 0">Nenhuma categoria com esse nome.</p>' : ''}${!t ? '<p class="xs muted" style="padding:8px 0 0">As mais usadas. Busque para ver todas ou criar uma.</p>' : ''}`;
}

// Folha do lançamento: escolher a categoria; depois, só ele ou também os parecidos.
let TX = null;
function txSheet(id) {
  const x = txById(id); if (!x) return;
  TX = { id, cat: null, novo: false, q: '', par: false, txt: sugereTexto(x.desc), prev: null, prevKey: '' };
  txRender('#tx-q');
}
function txRender(focusSel) {
  const x = txById(TX.id); if (!x) { closeSheet(); return; }
  const topo = `<p class="small muted" style="margin:0">${dTx(x)} · ${esc(contaNomeTx(x))} · <b class="num" style="color:var(--ink)">${valTx(x)}</b></p>
    <p class="small" style="margin:6px 0 0">Categoria: <b>${esc(x.cat || '')}</b>${x.man ? ` <span class="muted">(escolhida por você; a automática seria ${esc(x.auto || 'outra')})</span>` : x.m ? ' <span class="muted">(lançado à mão)</span>' : ' <span class="muted">(automática)</span>'}</p>`;
  if (!TX.cat) {
    openSheet(esc(x.desc || 'Lançamento'), `${topo}
      <label class="field" style="margin-top:12px"><span>Nova categoria</span><input class="input" id="tx-q" data-in="txq" value="${esc(TX.q)}" placeholder="Buscar ou criar" autocomplete="off" type="search"></label>
      <div class="tight" id="tx-cats" aria-live="polite" style="margin-top:6px">${catOpcoes(TX.q, x.cat, 'txCat')}</div>
      ${x.man || x.m ? `<div class="btnrow">${x.man ? `<button class="btn line" data-fin data-act="txAuto">Voltar para a automática</button>` : ''}${x.m ? `<button class="btn line" data-act="manEditar" data-arg="${esc(x.id)}">${I('edit', 18)} Editar</button><button class="btn ghost" data-fin data-act="manApagar" data-arg="${esc(x.id)}">Apagar</button>` : ''}</div>` : ''}`, 'tx', focusSel);
    return;
  }
  const ct = contaTipoTx(x), onde = `${x.v < 0 ? 'saídas' : 'entradas'} ${ct === 'CREDIT' ? 'nos cartões' : 'nas contas'}`;
  openSheet(esc(x.desc || 'Lançamento'), `${topo}
    <p style="margin:12px 0 0">Para <b>${esc(TX.cat)}</b>${TX.novo ? ' <span class="chip p">nova</span>' : ''} <button class="link" data-act="txVolta">Trocar</button></p>
    ${x.m ? '' : `${radios('Aplicar a', 'tx-alc', ['so', 'par'], TX.par ? 'par' : 'so', { so: 'Só este', par: 'Este e os parecidos' })}
    ${TX.par ? `<label class="field"><span>Descrição contém</span><input class="input" id="tx-txt" data-in="txtxt" value="${esc(TX.txt)}" autocomplete="off" maxlength="60"></label>
      <div id="tx-prev" aria-live="polite" class="small">${txPrevHtml()}</div>
      <p class="xs muted" style="margin-top:6px">Vale para as ${onde} com esse texto, as que já estão aqui e as que chegarem. Lançamentos com categoria escolhida por você ficam como estão. A regra aparece no Plano de contas, onde dá para apagar.</p>` : ''}`}
    <button class="btn block" style="margin-top:16px" data-fin data-act="txSalvar">Salvar</button>`, 'tx', focusSel);
  if (TX.par) txPrevBusca();
}
function txPrevHtml() {
  const p = TX.prev;
  if (!p) return '<p class="muted" style="margin:8px 0 0">Contando os parecidos…</p>';
  if (p.err) return `<p class="muted" style="margin:8px 0 0">${esc(plain(finMsg(p.err)))}</p>`;
  const cats = Object.entries(p.cats || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, n]) => `${esc(c)} (${n})`).join(', ');
  return `<p style="margin:8px 0 0"><b>${p.n} lançamento${p.n === 1 ? '' : 's'}</b> com esse texto${cats ? `, hoje em ${cats}` : ''}.${p.manuais ? ` ${p.manuais} escolhido${p.manuais === 1 ? '' : 's'} por você fica${p.manuais === 1 ? '' : 'm'} como está.` : ''}</p>${(p.ex || []).length ? `<div class="tight" style="margin-top:4px">${p.ex.map((e) => `<div class="row" style="min-height:0;padding:6px 0"><div class="grow"><div class="xs ellip">${esc(e.desc || '')}</div></div><div class="xs num muted">${dShort(new Date(e.d + 'T12:00'))} · ${e.v > 0 ? '+' : ''}${brl(Math.abs(e.v))}</div></div>`).join('')}</div>` : ''}`;
}
let txPrevT = null;
function txPrevBusca() {
  const x = txById(TX.id); if (!x || !TX.par) return;
  const key = `${TX.txt}|${contaTipoTx(x)}|${x.v < 0}`;
  if (key === TX.prevKey) return;
  clearTimeout(txPrevT);
  TX.prev = null; const el = document.getElementById('tx-prev'); if (el) el.innerHTML = txPrevHtml();
  txPrevT = setTimeout(async () => {
    const T = TX; if (!T) return;
    T.prevKey = key;
    if (T.txt.trim().length < 3) T.prev = { err: { code: 'texto_curto' } };
    else {
      try { T.prev = await SB.fin('fin_parecidos', { p_texto: T.txt, p_conta_tipo: contaTipoTx(x), p_sentido: x.v < 0 ? 'saida' : 'entrada' }); }
      catch (e) { T.prev = { err: e }; }
    }
    if (TX !== T || T.prevKey !== key) return;
    const el2 = document.getElementById('tx-prev'); if (el2) el2.innerHTML = txPrevHtml();
  }, 450);
}
function txSalvar() {
  const x = txById(TX.id); if (!x || !TX.cat) return;
  const T = TX, par = T.par && !x.m, tipoNovo = x.v < 0 ? 'despesa' : 'receita';
  if (par && T.txt.trim().length < 3) { toast(FINMSG.texto_curto, 'warn'); document.getElementById('tx-txt')?.focus(); return; }
  finGrava(async () => {
    let cat = T.cat;
    if (T.novo) cat = (await SB.fin('fin_categoria_salvar', { p_antigo: null, p_nome: cat, p_tipo: tipoNovo })).nome;
    if (par) return { cat, r: await SB.fin('fin_regra_criar', { p_texto: T.txt.trim(), p_categoria: cat, p_conta_tipo: contaTipoTx(x), p_sentido: x.v < 0 ? 'saida' : 'entrada', p_id: x.id }) };
    await SB.fin('fin_recategorizar', { p_id: x.id, p_categoria: cat });
    x.cat = cat; if (!x.m) { x.man = true; } // a lista já mostra a troca; o resto chega na próxima leitura
    return { cat };
  }, ({ cat, r }) => `${r ? `${r.n} lançamento${r.n === 1 ? '' : 's'} em` : 'Agora em'} ${esc(cat)}.${T.novo ? ` Categoria nova como ${TIPOS[tipoNovo].toLowerCase()}; dá para mudar no Plano de contas.` : ''}`).then((ok) => { if (ok) TX = null; });
}

// Lançamento feito à mão: dinheiro vivo ou conta fora do Open Finance. Fica no Supabase e entra nos gastos do mês.
let MN = null;
function manSheet(id) {
  const x = id ? txById(id) : null;
  const P = planoCats().slice().sort((a, b) => a.n.localeCompare(b.n, 'pt-BR'));
  const desp = planoCats().filter((c) => c.tipo === 'despesa').sort((a, b) => (b.q90 || 0) - (a.q90 || 0))[0];
  MN = { id: x ? x.id : null };
  const cat = x ? x.cat : desp ? desp.n : (P[0] || {}).n, contas = [...new Set(['Dinheiro', ...((D.REAL.transacoes || []).filter((y) => y.m && y.cn).map((y) => y.cn))])];
  const grupos = [...new Set(P.map((c) => grupoDe(c.n)))];
  openSheet(x ? 'Editar lançamento' : 'Lançar à mão', `<label class="field"><span>Valor</span><input class="input" id="mn-v" inputmode="decimal" placeholder="R$ 0,00" style="font-size:24px;font-weight:750" data-autofocus value="${x ? esc(Math.abs(x.v).toFixed(2).replace('.', ',')) : ''}"></label>
    ${radios('É', 'mn-sent', ['saida', 'entrada'], x && x.v > 0 ? 'entrada' : 'saida', { saida: 'Saída', entrada: 'Entrada' })}
    <label class="field"><span>Descrição</span><input class="input" id="mn-desc" maxlength="140" autocomplete="off" value="${x ? esc(x.desc || '') : ''}" placeholder="ex.: feira, corte de cabelo"></label>
    <label class="field"><span>Categoria</span><select class="input" id="mn-cat">${grupos.map((g) => `<optgroup label="${esc(g)}">${P.filter((c) => grupoDe(c.n) === g).map((c) => `<option value="${esc(c.n)}"${c.n === cat ? ' selected' : ''}>${esc(c.n)}</option>`).join('')}</optgroup>`).join('')}</select></label>
    <div class="row-flex" style="gap:8px"><label class="field grow"><span>Data</span><input class="input" id="mn-d" type="date" value="${x ? x.d : D.iso(diaNow())}" max="${D.iso(D.addDays(diaNow(), 366))}"></label>
      <label class="field grow"><span>Conta</span><input class="input" id="mn-conta" list="mn-contas" maxlength="40" autocomplete="off" value="${esc(x ? x.cn || 'Dinheiro' : 'Dinheiro')}"><datalist id="mn-contas">${contas.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label></div>
    <button class="btn block" style="margin-top:16px" data-fin data-act="manSalvar">Salvar</button>
    <p class="xs muted" style="margin-top:8px">Fica no Supabase e entra nos gastos do mês pela data. Não mexe no saldo das contas do Open Finance.</p>`, 'mn');
}
function manSalvar() {
  const v = parseMoney(document.getElementById('mn-v').value), desc = document.getElementById('mn-desc').value.trim();
  const cat = document.getElementById('mn-cat').value, d = document.getElementById('mn-d').value, conta = document.getElementById('mn-conta').value.trim() || 'Dinheiro';
  const sent = sheetRoot.querySelector('[aria-labelledby="mn-sent"] [aria-checked="true"]')?.dataset.val || 'saida';
  if (!(v > 0 && v < 1e7)) { toast(FINMSG.valor_invalido, 'warn'); document.getElementById('mn-v').focus(); return; }
  if (!desc) { toast(FINMSG.descricao_vazia, 'warn'); document.getElementById('mn-desc').focus(); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { toast('Escolha a data.', 'warn'); document.getElementById('mn-d').focus(); return; }
  const id = MN && MN.id, val = Math.round((sent === 'saida' ? -v : v) * 100) / 100;
  finGrava(() => SB.fin('fin_manual_salvar', { p_id: id, p_data: d, p_desc: desc, p_valor: val, p_categoria: cat, p_conta: conta }),
    () => `${id ? 'Lançamento alterado' : 'Lançado'}: ${brl(Math.abs(val))} em ${esc(cat)}.`).then((ok) => { if (ok) MN = null; });
}

// Plano de contas: categorias por grupo, com tipo e uso; renomear, juntar, mudar o tipo, criar e apagar.
let PCq = '';
function pcLista() {
  const t = normq(PCq), P = planoCats().filter((c) => !t || t.split(' ').every((w) => normq(`${c.n} ${TIPOS[c.tipo] || ''}`).includes(w)));
  const G = {}; P.forEach((c) => { (G[grupoDe(c.n)] = G[grupoDe(c.n)] || []).push(c); });
  const gs = Object.keys(G).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (!gs.length) return '<div class="card"><p class="small muted" style="margin:0">Nenhuma categoria com esse nome.</p></div>';
  return gs.map((g) => `${sec(esc(g), `<span class="small muted num">${G[g].reduce((a, c) => a + (c.q || 0), 0)}</span>`)}<div class="card tight">${G[g].sort((a, b) => a.n.localeCompare(b.n, 'pt-BR')).map((c) => `<button class="row" data-act="pcCat" data-arg="${esc(c.n)}"><div class="grow"><div class="ttl ellip">${esc(subDe(c.n) || c.n)}</div><div class="meta">${TIPOS[c.tipo] || esc(c.tipo)} · ${c.q ? `${c.q} lançamento${c.q === 1 ? '' : 's'}` : 'sem lançamentos'}${c.sis ? ' · do sistema' : ''}</div></div>${c.sis ? I('lock', 16, 'class="ic muted"') : ''}</button>`).join('')}</div>`).join('');
}
function PlanoContas() {
  if (!podeCat()) return { title: 'Plano de contas', html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Plano de contas')}${fromSB() && SB.session() ? '<div class="card"><p class="small muted" style="margin:0">O banco ainda não tem o plano de contas. Ele chega com a atualização desta versão (migração reclassificar).</p></div>' : semDinheiro()}` };
  const R = D.REAL.regras || [];
  return {
    title: 'Plano de contas',
    html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Plano de contas', `${planoCats().length} categorias · o grupo é o que vem antes dos dois-pontos`, `<button class="iconbtn" data-act="pcNova" aria-label="Criar categoria">${I('plus')}</button>`)}
      <div class="card"><label class="field" style="margin:0"><span>Buscar</span><input class="input" id="pcq" data-in="pcq" value="${esc(PCq)}" placeholder="ex.: moradia, transporte" autocomplete="off" type="search"></label></div>
      <div id="pclist" aria-live="polite">${pcLista()}</div>
      ${sec('Suas regras', `<span class="small muted num">${R.length}</span>`)}
      <p class="small muted" style="margin:0 20px 6px">Descrição com o texto vira a categoria, nos lançamentos que já estão aqui e nos próximos. As de cima passam na frente.</p>
      <div class="card tight">${R.length ? R.map((r) => `<div class="row"><div class="grow"><div class="ttl ellip">“${esc(regraTexto(r.p))}”</div><div class="meta ellip">${esc(r.c)}${r.s ? ` · ${r.s === 'saida' ? 'saídas' : 'entradas'}` : ''}${r.ct ? ` ${r.ct === 'CREDIT' ? 'no cartão' : 'na conta'}` : ''}</div></div><button class="iconbtn" data-act="regraApagar" data-arg="${r.id}" aria-label="Apagar a regra ${esc(regraTexto(r.p))}">${I('x')}</button></div>`).join('') : '<div class="empty"><p>Nenhuma regra sua ainda. Elas nascem quando você troca a categoria de um lançamento e escolhe “Este e os parecidos”.</p></div>'}</div>`,
  };
}
function pcSheet(nome) {
  const c = nome ? planoCats().find((x) => x.n === nome) : null;
  if (nome && !c) return;
  const outras = planoCats().filter((x) => x.n !== nome).sort((a, b) => a.n.localeCompare(b.n, 'pt-BR'));
  openSheet(c ? esc(c.n) : 'Nova categoria', `${c && c.sis ? '<p class="small muted" style="margin:0 0 8px">O Painel usa esta categoria nas contas (fatura, transferências ou padrão das regras): o nome e o tipo ficam como estão. Dá para juntar outras nela.</p>' : ''}
    <label class="field"><span>Nome</span><input class="input" id="pc-nome" maxlength="80" autocomplete="off" value="${c ? esc(c.n) : ''}" placeholder="Grupo: detalhe, ex.: Moradia: diarista"${c && c.sis ? ' readonly' : ''}${c ? '' : ' data-autofocus'}></label>
    ${c && c.sis ? `<p class="small">Tipo: <b>${TIPOS[c.tipo] || esc(c.tipo)}</b></p>` : radios('Tipo', 'pc-tipo', Object.keys(TIPOS), c ? c.tipo : 'despesa', TIPOS)}
    <p class="xs muted" style="margin-top:4px">Despesa e dívida entram nos gastos do mês. Transferência, investimento, terceiros, rateio, PJ, a receber e bem ficam fora.</p>
    ${c && !c.sis ? '<p class="xs muted" style="margin-top:4px">Renomear leva junto os lançamentos, as regras e as contas fixas que usam esta categoria. Com o nome de outra que já existe, as duas viram uma.</p>' : ''}
    <button class="btn block" style="margin-top:14px" data-fin data-act="pcSalvar" data-arg="${c ? esc(c.n) : ''}"${c && c.sis ? ' hidden' : ''}>Salvar</button>
    ${c && !c.sis ? `<label class="field" style="margin-top:18px"><span>Juntar com</span><select class="input" id="pc-junta"><option value="">Escolha a categoria que fica</option>${outras.map((x) => `<option value="${esc(x.n)}">${esc(x.n)}</option>`).join('')}</select></label>
      <button class="btn line block" style="margin-top:8px" data-fin data-act="pcJuntar" data-arg="${esc(c.n)}">Juntar e tirar ${esc(c.n)}</button>` : ''}
    ${c ? `<div class="btnrow"><button class="btn line" data-act="pcVer" data-arg="${esc(c.n)}">Ver lançamentos (${c.q || 0})</button>${!c.sis && !c.q ? `<button class="btn ghost" data-fin data-act="pcApagar" data-arg="${esc(c.n)}">Apagar</button>` : ''}</div>` : ''}`, 'pc');
}
// Categoria do extrato que ainda pede classificação recebe a do gasto rápido ligado a ele (fila: grava depois da leitura).
const RECAT = [];
async function aplicarRecat() {
  if (!RECAT.length || !podeCat()) return;
  const L = RECAT.splice(0); let n = 0;
  for (const r of L) { try { await SB.fin('fin_recategorizar', { p_id: r.id, p_categoria: r.cat }); n++; } catch { /* fica a categoria do banco */ } }
  if (n) finRecarregar();
}

function Patrimonio() {
  if (!D.REAL) return { title: 'Patrimônio', html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Patrimônio')}${semDinheiro()}` };
  const A = D.BALANCE.ativo, P = D.BALANCE.passivo;
  const ta = A.flatMap((g) => g.itens).reduce((s, i) => s + i[1], 0), tp = P.flatMap((g) => g.itens).reduce((s, i) => s + i[1], 0), pl = ta - tp;
  const ser = D.netWorthSeries();
  ser.push({ d: realDate(), v: pl });
  const L = ser.length - 1, hasSer = L >= 1, sg = (v) => `${v >= 0 ? '+' : '−'}${brl0(Math.abs(v))}`, N = (D.REAL && D.REAL.notas) || {};
  const colors = ['var(--a-foc)', 'var(--a-pat)', 'var(--a-vig)'];
  const gsum = A.map((g) => g.itens.reduce((s, i) => s + i[1], 0));
  // Fatias só das partes positivas (um saldo negativo na conta não vira fatia negativa nem passa de 100%).
  const gpos = gsum.map((v) => Math.max(0, v)), tpos = gpos.reduce((a, b) => a + b, 0), share = (i) => (tpos > 0 ? (gpos[i] / tpos) * 100 : 0);
  const table = (side, label, tot) => `<table class="bp"><caption class="sr">${label}</caption>${side.map((g) => `<tr><th colspan="2">${g.g}</th></tr>${g.itens.map(([n, v]) => `<tr><td>${esc(n)}</td><td>${brl0(v)}</td></tr>`).join('')}`).join('')}<tr class="tot"><td>Total ${label.toLowerCase()}</td><td>${brl0(tot)}</td></tr></table>`;
  return {
    title: 'Patrimônio',
    html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Patrimônio', fromSB() ? `Open Finance de ${dShort(realDate())}, mais a foto manual` : `Foto de ${dShort(realDate())}, com os seus arquivos`)}${realLine()}
      <div class="card"><div class="small muted">Patrimônio líquido</div><div class="big">${brl0(pl)}</div><div class="small muted">${hasSer ? `${sg(ser[L].v - ser[L - 1].v)} desde o fim de ${mon(ser[L - 1].d)}${L >= 2 ? ` · ${sg(ser[L].v - ser[0].v)} desde o fim de ${mon(ser[0].d)}` : ''}` : 'Ainda sem a série mensal: a evolução aparece depois da primeira foto manual.'}</div>
        ${!hasSer ? '' : lineChart(ser.map((x) => x.v), { area: true, label: `Patrimônio líquido desde o fim de ${mon(ser[0].d)}, de ${brl0(ser[0].v)} para ${brl0(pl)}`, fmt: (v) => Math.round(v / 1000) + 'k', labels: [[0, mon(ser[0].d)], ...(L >= 2 ? [[Math.round(L / 2), mon(ser[Math.round(L / 2)].d)]] : []), [L, 'hoje']] })}
        ${N.serie ? `<p class="xs muted" style="margin-top:8px">${esc(N.serie)}</p>` : ''}</div>
      <div class="seg" role="group" aria-label="Formato" style="margin:6px 16px 0"><button aria-pressed="${S.bp === 'resumo'}" data-act="bp" data-arg="resumo">Resumo</button><button aria-pressed="${S.bp === 'balanco'}" data-act="bp" data-arg="balanco">Balanço patrimonial</button></div>
      ${S.bp === 'resumo' ? `<div class="card"><b>Onde está o ativo</b><div class="stack" aria-hidden="true">${gsum.map((v, i) => `<i style="--c:${colors[i]};width:${share(i).toFixed(1)}%"></i>`).join('')}</div>
          ${A.map((g, i) => `<div class="row-flex small" style="margin-top:10px"><span class="k" style="width:10px;height:10px;border-radius:3px;background:${colors[i]}"></span><span class="grow">${g.g}</span><b class="num">${brl0(gsum[i])}</b><span class="muted num" style="width:44px;text-align:right">${gsum[i] < 0 ? '—' : `${Math.round(share(i))}%`}</span></div>`).join('')}</div>
        <div class="grid2"><div class="card"><div class="small muted">Ativo</div><div class="mid">${brlK(ta)}</div></div><div class="card"><div class="small muted">Passivo</div><div class="mid">${brlK(tp)}</div></div></div>
        ${D.SAVINGS && D.SAVINGS.taxa != null ? `<div class="card soft"><div class="row-flex">${I('trend', 20)}<b class="grow">Taxa de poupança</b><b class="num">${esc(D.SAVINGS.taxa)}%</b></div></div>` : ''}`
        : `<div class="card">${table(A, 'Ativo', ta)}</div><div class="card">${table(P, 'Passivo', tp)}<table class="bp"><tr class="tot"><td>Patrimônio líquido</td><td>${brl0(pl)}</td></tr></table></div>`}
      ${D.REAL ? `<p class="small muted" style="margin:14px 20px">${esc(N.balanco || '')} ${(D.REAL.participacoes || []).length ? 'Empresas só pela sua participação; as contas delas ficam fora.' : 'Só pessoa física: as empresas ficam fora.'}</p>${(D.REAL.pendentes || []).length ? `<div style="margin:0 16px"><button class="btn line block" data-act="pendentes">Ver o que falta (${D.REAL.pendentes.length})</button></div>` : ''}` : ''}`,
  };
}

function Importar() {
  const sbSub = SB.session() ? (fromSB() ? `Bancos e cartões de ${fmtSync()}. Não precisa mais do arquivo.` : syncBusy ? 'Buscando os dados…' : syncErr ? sbMsg(syncErr) : 'Ainda sem dados neste aparelho. Toque para buscar.') : 'Bancos e cartões chegam sozinhos, sem arquivo. Login com código no e-mail.';
  const ofCard = `${sec('Open Finance')}<a class="card cardlink" href="#/dinheiro/sincronizar"><span class="badge-ic">${I('link')}</span><div class="grow"><b>${SB.session() ? (fromSB() ? 'Conectado pelo Supabase' : 'Entrou no Supabase') : 'Entrar para sincronizar'}</b><div class="small muted">${sbSub}</div></div>${I('chevR', 24, 'class="ic chev"')}</a>`;
  // O arquivo continua disponível até os dados do Open Finance chegarem de fato.
  const fileCard = fromSB() ? '' : `${sec('Arquivo do computador')}<div class="card"><div class="row-flex"><span class="badge-ic">${I('lock', 20)}</span><div class="grow"><b>${D.REAL ? 'Carregados neste aparelho' : 'Carregar o arquivo do Painel'}</b><div class="small muted">${D.REAL ? `Arquivo de ${dShort(realDate())}: ${(D.REAL.transacoes || []).length} lançamentos, ${(D.REAL.contas || []).length} contas e ${(D.REAL.cartoes || []).length} cartões.` : 'O painel-dados.json é gerado no seu computador a partir dos seus extratos. Ele é lido aqui e não sai deste aparelho.'}</div></div></div>
      ${realErr ? '<p class="small" style="color:var(--danger);margin-top:8px">O arquivo salvo neste aparelho não abriu. Carregue de novo.</p>' : ''}
      ${justLoaded() ? `<p class="small" style="margin-top:8px">${I('check', 16, 'style="display:inline;vertical-align:-3px;color:var(--primary)"')} Pronto. <a href="#/dinheiro">Ver em Dinheiro</a></p>` : ''}
      <label class="btn ${D.REAL ? 'line ' : ''}block filebtn" style="margin-top:12px"><input type="file" accept=".json,application/json" data-in="realfile">${I('upload', 20)} ${D.REAL ? 'Trocar pelo arquivo novo' : 'Escolher painel-dados.json'}</label>
      ${D.REAL ? '<button class="btn ghost block" style="margin-top:8px" data-act="realClear">Apagar deste aparelho</button>' : ''}
      ${SB.session() ? '<p class="xs muted" style="margin-top:8px">Com o login, a próxima leitura do Open Finance substitui o arquivo.</p>' : ''}</div>`;
  return { title: 'Open Finance e arquivo', html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Open Finance e arquivo', 'O Open Finance é o caminho principal; o arquivo do Painel serve até ele chegar.')}${ofCard}${fileCard}
    <p class="small muted" style="margin:14px 20px">Extratos e faturas avulsos (OFX, CSV, PDF) ainda não entram pelo app.</p>` };
}

// ---------- Open Finance pelo Supabase ----------
const pend0 = SB.pending();
// busy: '' | 'send' | 'verify'. code e email guardam o que foi digitado, para não sumir quando a tela é redesenhada.
const LG = { email: (pend0 || {}).email || '', step: pend0 ? 'code' : 'email', busy: '', msg: '', note: '', code: '' };
let syncBusy = false, syncErr = null, busyShown = false, leaving = false, nvSaindo = false;
// A nuvem: lê ao abrir, ao voltar para o app e a cada minuto com a tela aberta; sobe 2 s depois de cada mudança e
// na hora em que o app sai da tela.
const aparelhoNome = () => { const u = navigator.userAgent; return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : 'Navegador'; };
const NVK = 'painel-nuvem-v1';
let nvRender = 0;
if (NUV) {
  NV = NUV.criarNuvem({
    chave: NVK, getS: () => S, D0: defaults, ligada: () => !!SB.session() && !leaving, epoca: () => SB.currentEpoch(),
    ler: (rev) => SB.lerEstado(rev), salvar: (doc, base, ap, ka) => SB.salvarEstado(doc, base, ap, ka), rotulo: aparelhoNome,
    // Chegou mudança do outro aparelho: o estado novo passa pela mesma conferência do que é lido do armazenamento.
    fechar: (s, velhos) => fecharVelhos(s, velhos),
    aoAplicar: () => {
      S = arruma(sane(S));
      if (!isoOk(S.day)) S.day = D.iso(diaNow());
      chama(S); saveLocal();
      clearTimeout(nvRender);
      nvRender = setTimeout(() => {
        if (S.onboarded && current() === 'onboarding') go('#/hoje', true);
        else if (!virando) render(true);
      }, 0);
    },
    aoStatus: () => { if (sheetRoot.querySelector('.sheet')) return; for (const sel of ['#nv-card', '#aj-nv']) if (main.querySelector(sel)) swapPart(sel); },
  });
}
// Este aparelho está com a nuvem: tem login e já juntou os dados dele com os de lá.
const nvJunto = () => !!(NV && nuvemOn() && NV.entrou());
// Este aparelho já juntou com a nuvem, mesmo com a sessão vencida agora: o que mudar aqui vai para lá no próximo login.
const nvEntrou = () => !!(NV && NV.entrou());
const nvPuxar = (ms = 0) => { if (NV && nuvemOn() && !virando && Date.now() - NV.lido() >= ms) NV.puxar(); };
const RESEND_MS = 60000; // o Supabase só manda outro código para o mesmo e-mail depois de 60 s
const resendWait = () => { const p = SB.pending(); return p ? Math.max(0, RESEND_MS - (Date.now() - p.at)) : 0; };
const SBMSG = {
  offline: 'Sem internet agora. Tente de novo quando conectar.',
  timeout: 'O Supabase demorou para responder. Tente de novo.',
  email_invalido: 'Esse e-mail não parece completo.',
  email_address_invalid: 'Esse e-mail não parece completo.',
  validation_failed: 'Esse e-mail não parece completo.',
  email_address_not_authorized: 'O Supabase só manda código para o e-mail da sua conta no Supabase. Use esse e-mail.',
  over_email_send_rate_limit: 'O Supabase limita os e-mails de código. Espere um pouco e peça de novo.',
  over_request_rate_limit: 'Muitas tentativas seguidas. Espere um minuto.',
  http_429: 'Muitas tentativas seguidas. Espere um minuto.',
  signup_disabled: 'Este e-mail não tem acesso ao Painel.',
  otp_disabled: 'Este e-mail não tem acesso ao Painel.',
  user_not_found: 'Este e-mail não tem acesso ao Painel.',
  otp_expired: 'Código errado ou vencido. Confira o último e-mail ou peça outro.',
  codigo_curto: 'Digite os 6 dígitos do e-mail.',
  sessao_expirada: 'A sessão acabou. Entre de novo com um código.',
  sem_sessao: 'Entre de novo com um código.',
  nao_e_dono: 'Esta conta entrou, mas não é a dona dos dados.',
  // O link e o código do e-mail são o mesmo código: abrir o link gasta o código. O link só entra no navegador que pediu o e-mail.
  link_de_outro_aparelho: 'Este link abriu num navegador diferente daquele em que você pediu o e-mail, e já não vale. Peça outro e abra o link no mesmo navegador do Painel, ou digite o código, se o e-mail trouxer um.',
  link_invalido: 'O link do e-mail veio incompleto. Peça outro e tente de novo.',
  ja_conectado: 'Este aparelho já está conectado com outra conta. Para trocar, saia primeiro.',
  access_denied: 'O link do e-mail venceu ou já foi usado. Peça outro.',
};
function sbMsg(e) {
  const c = e && e.code;
  if (c === 'over_email_send_rate_limit') { const m = /(\d+)\s*second/.exec((e && e.message) || ''); if (m) return `O Supabase limita os e-mails de código. Espere ${m[1]} segundos e peça de novo.`; }
  return SBMSG[c] || `Não deu certo${c ? ` (${esc(String(c).slice(0, 40))})` : ''}. Tente de novo.`;
}
const nvErrMsg = (e) => (!e ? '' : e.code === 'offline' ? 'Sem internet: fica salvo aqui e sobe quando a internet voltar.' : e.code === 'timeout' ? 'A nuvem demorou para responder. Fica salvo aqui e sobe na próxima vez.' : e.code === 'doc_grande' ? 'Os registros passaram do tamanho que a nuvem aceita.' : SESSAO_NV.includes(e.code) ? sbMsg(e) : `A nuvem não gravou: ${sbMsg(e)}`);
const SESSAO_NV = ['sessao_expirada', 'sem_sessao', 'nao_e_dono'];
const plain = (h) => String(h).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const dataKey = (R) => { try { return JSON.stringify({ ...R, lidoEm: 0 }); } catch { return ''; } };
// Sem a saúde no aparelho também busca, uma vez por abertura: se ela falhar, volta ao intervalo normal de 10 min.
const staleSync = () => !fromSB() || !D.REAL.lidoEm || (!D.SAUDE && !saudeErr) || !(Date.now() - Date.parse(D.REAL.lidoEm) < 10 * 60000);
const SESSAO = ['sessao_expirada', 'sem_sessao', 'nao_e_dono'];
async function syncNow(manual) {
  if (syncBusy || leaving || !SB.session()) return false;
  syncBusy = true; syncErr = null; busyShown = false;
  if (manual || current() === 'dinheiro/sincronizar') render(true);
  const ep = SB.currentEpoch(), mudou = () => leaving || ep !== SB.currentEpoch();
  let err = null, changed = false;
  try {
    const R = await SB.fetchPainel();
    // Saiu (ou entrou com outra conta) durante a leitura: o resultado não vale mais.
    if (mudou()) { syncBusy = false; if (!leaving) render(true); return false; }
    const before = D.REAL ? dataKey(D.REAL) : '', novo = !fromSB();
    D.useReal(R); // valida antes de gravar
    realErr = null;
    try { localStorage.setItem(REALK, JSON.stringify(R)); } catch { /* sem espaço: segue só na memória */ }
    // Contas marcadas como pagas no arquivo não valem para o Open Finance (os gastos registrados à mão ficam).
    // Com a nuvem, as marcações vieram de um aparelho que já usa o Open Finance: ficam.
    if (novo && !nvEntrou()) { S.paid = {}; S.paidAmt = {}; S.paidAt = {}; S.card = 0; }
    pruneReal(); save();
    changed = before !== dataKey(R);
  } catch (e) { err = e; }
  // Saúde pela mesma sessão. Uma falha aqui não desfaz o dinheiro: fica a última cópia.
  if (!mudou() && SB.session() && !(err && SESSAO.includes(err.code))) {
    try {
      const H = await SB.fetchSaude();
      if (mudou()) { syncBusy = false; if (!leaving) render(true); return false; }
      const before = saudeRaw ? dataKey(saudeRaw) : '';
      D.useSaude(H); saudeRaw = H; saudeErr = null;
      try { localStorage.setItem(SAUDEK, JSON.stringify(H)); } catch { /* sem espaço: segue só na memória */ }
      changed = changed || before !== dataKey(H);
    } catch (e) { saudeErr = e; if (!err && SESSAO.includes(e.code)) err = e; }
  }
  syncBusy = false;
  if (leaving) return false;
  if (err) {
    syncErr = err;
    // A sessão acabou: volta ao login, sem mensagem velha, com o motivo quando o Supabase recusou a sessão.
    if (!SB.session()) { LG.busy = ''; LG.note = ''; LG.code = ''; LG.step = SB.pending() ? 'code' : 'email'; LG.msg = err.code === 'sessao_expirada' ? sbMsg(err) : ''; }
    render(true);
    // Um canal só: na tela da conexão o erro aparece nela (e é lido uma vez); nas outras, num aviso.
    if (current() === 'dinheiro/sincronizar') announce(plain(sbMsg(err)));
    else if (manual || err.code === 'sessao_expirada') toast(esc(plain(sbMsg(err))), 'warn', 6000);
    return false;
  }
  if (manual || busyShown || changed) render(true);
  if (RECAT.length) setTimeout(aplicarRecat, 0);
  if (manual) toast(saudeErr ? `${I('cloudCheck', 18)} Dinheiro de ${fmtSync()} carregado. A saúde não veio desta vez.` : `${I('cloudCheck', 18)} Dinheiro e saúde de ${fmtSync()} carregados.`, saudeErr ? 'warn' : '', saudeErr ? 6000 : 2600);
  return true;
}
// Erro do login: o foco vai para o campo, que lê o erro pela descrição dele; o aviso falado só entra quando o foco não chegou lá.
function sayErr(sel) { render(true, sel); const f = main.querySelector(sel); if (!f || document.activeElement !== f) announce(plain(LG.msg)); }
async function sbSend(addr, resend = false) {
  if (LG.busy || leaving) return;
  LG.busy = 'send'; LG.msg = ''; LG.note = ''; LG.email = String(addr || '').trim(); render(true);
  try {
    LG.email = await SB.sendCode(LG.email);
    LG.busy = ''; LG.step = 'code'; LG.code = '';
    LG.note = resend ? `Código novo enviado às ${hhmm(new Date())}. Use só o do último e-mail.` : '';
    render(true, '#sb-code');
    announce(resend ? LG.note : `Código enviado para ${LG.email}.`);
  } catch (e) { LG.busy = ''; LG.msg = sbMsg(e); sayErr(LG.step === 'code' ? '#sb-code' : '#sb-email'); }
}
async function sbVerify(code) {
  if (LG.busy || leaving) return;
  LG.code = String(code || ''); LG.busy = 'verify'; LG.msg = ''; LG.note = ''; render(true);
  try {
    await SB.verifyCode(LG.email, code);
    nvPuxar(0); // primeira vez na nuvem: junta o que este aparelho tem com o que já está lá
    LG.busy = ''; LG.step = 'email'; LG.msg = ''; LG.code = '';
    render(true, 'h1'); // o formulário some: o foco vai para o título da tela
    const ok = await syncNow(false);
    if (ok) toast(`${I('cloudCheck', 18)} Entrou. Seus dados de dinheiro e saúde estão no Painel.`, '', 6000);
  } catch (e) {
    LG.busy = ''; LG.msg = sbMsg(e);
    if (e.code === 'otp_expired') LG.code = '';
    sayErr('#sb-code');
  }
}
const saudeConta = () => { const H = D.SAUDE, n = (a, um, v) => `${a.length} ${a.length === 1 ? um : v}`; return [n(H.fichas, 'ficha', 'fichas'), n(H.refeicoes, 'refeição', 'refeições'), n(H.medidas, 'medida', 'medidas'), n(H.exames, 'exame', 'exames')].join(', ') + (H.plano ? ' e o plano de treino' : ''); };
const saudeLine = () => (syncBusy && !D.SAUDE ? 'Buscando a saúde…' : saudeErr ? `A saúde não veio na última leitura: ${sbMsg(saudeErr)}` : D.SAUDE ? `Saúde: ${D.SAUDE.lidoEm && !isNaN(Date.parse(D.SAUDE.lidoEm)) ? `lida em ${dShort(new Date(D.SAUDE.lidoEm))} às ${hhmm(new Date(D.SAUDE.lidoEm))}` : 'lida'}. Plano, fichas, dieta, medidas e exames vêm do Supabase.` : 'Saúde ainda não lida neste aparelho.');
// Ocupado: o botão continua focável (aria-disabled) para o foco do teclado e do leitor de tela não cair no começo da página.
const busyAttr = (b) => (b ? ' aria-disabled="true"' : '');
// Seus registros na nuvem: o mesmo cartão em Sincronizar (nv-card) e uma linha em Ajustes (aj-nv), trocados a cada mudança.
function nvLinha() {
  if (!NV) return { t: 'Esta cópia do app ainda não tem a nuvem. Recarregue com internet para atualizar.', st: 'avencer', chip: 'Atualizar' };
  if (!SB.session()) return { t: 'Entre com o seu e-mail para salvar check-ins, treinos, tarefas, gastos e XP na nuvem.', st: 'avencer', chip: 'Entrar' };
  const i = NV.info(), off = !navigator.onLine;
  if (nvSaindo) return { t: 'Salvando na nuvem antes de sair…', st: 'avencer', chip: 'Salvando' };
  if (i.ocupado && !i.entrou) return { t: 'Juntando o que está neste aparelho com o que já está na nuvem…', st: 'avencer', chip: 'Juntando' };
  if (i.ocupado) return { t: 'Sincronizando…', st: 'avencer', chip: 'Sincronizando' };
  if (i.erro && (!i.entrou || i.pendente)) return { t: `${i.entrou ? 'Há mudanças daqui esperando para subir. ' : 'Ainda não juntou com a nuvem. '}${nvErrMsg(i.erro)}`, st: 'atrasado', chip: 'Pendente' };
  if (!i.entrou) return { t: off ? 'Sem internet: junta com a nuvem quando a internet voltar.' : 'Ainda não juntou com a nuvem.', st: 'avencer', chip: 'Pendente' };
  if (i.pendente) return { t: off ? 'Sem internet: as mudanças daqui sobem quando a internet voltar.' : 'Há mudanças daqui esperando para subir.', st: 'avencer', chip: 'Pendente' };
  const t = i.em ? new Date(i.em) : null;
  return { t: t && !isNaN(t) ? `Tudo na nuvem. Última gravação ${dShort(t)} às ${hhmm(t)}.` : 'Tudo na nuvem.', st: 'pago', chip: 'Na nuvem' };
}
// Atalho do iPhone: o token aparece uma vez só, na memória desta tela (nunca no armazenamento); o banco guarda o hash.
const AT = { token: null, busy: false, err: null, pend: 0 };
const ATALHO_NOME = 'Painel Sync';
function atalhoCard() {
  const AE = atalhoEm(), off = !navigator.onLine, ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const st = (n, t) => `${n}: ${t ? `recebida ${haQuanto(t)} (${dShort(new Date(t))} às ${hhmm(new Date(t))})` : 'ainda não recebida'}`;
  const tok = AT.token ? `<div class="at-tok">
      <div class="field"><span id="at-url-l">Endereço (URL), nos dois Obter Conteúdo do URL</span><div class="row-flex"><input class="input" id="at-url" readonly aria-labelledby="at-url-l" value="${esc(SB.ATALHO_URL)}" spellcheck="false"><button class="btn line" data-act="atCopy" data-arg="url" aria-label="Copiar o endereço">Copiar</button></div></div>
      <div class="field"><span id="at-tok-l">Cabeçalho Authorization (valor)</span><div class="row-flex"><input class="input" id="at-tok" readonly aria-labelledby="at-tok-l" value="Bearer ${esc(AT.token)}" spellcheck="false" autocomplete="off"><button class="btn line" data-act="atCopy" data-arg="tok" aria-label="Copiar o cabeçalho com o token">Copiar</button></div></div>
      <p class="xs" style="color:var(--warn);margin-top:6px">${I('lock', 14, 'style="display:inline;vertical-align:-2px"')} O token só aparece agora. Cole no atalho e não mande para ninguém: quem tem o token consegue mandar dados falsos para a sua saúde e trocar a agenda que veio do atalho. Ele não abre o resto do Painel. Se vazar, gere outro: o antigo para na hora.</p></div>` : '';
  return `<div class="card" id="at-card"><div class="row-flex"><span class="badge-ic${AE.saude || AE.agenda ? ' p' : ''}">${I('heart', 20)}</span><div class="grow"><b>Atalho do iPhone</b><div class="small muted">Apple Health e agenda do Calendário</div></div></div>
    <p class="small muted" style="margin-top:8px">${esc(st('Saúde', AE.saude))}.<br>${esc(st('Agenda', AE.agenda))}.</p>
    <p class="small muted" style="margin-top:6px">O atalho “${ATALHO_NOME}” do app Atalhos manda sono, passos, peso, VFC, frequência de repouso, energia ativa, minutos de exercício e os eventos do Calendário (iCloud e Google). Roda sozinho quando você abre o app escolhido no iPhone, sem pagar nada. Treinos não passam.</p>
    ${tok}${AT.err ? `<p class="small" style="color:var(--danger);margin-top:8px">${sbMsg(AT.err)}</p>` : ''}
    <div class="btnrow" style="margin-top:12px"><button class="btn${AT.token ? ' line' : ''}" data-act="atGen"${off ? ' disabled' : busyAttr(AT.busy)}>${I('lock', 20)} ${AT.busy ? 'Gerando…' : off ? 'Sem internet' : AE.token || AT.token || AE.saude || AE.agenda ? 'Gerar outro token' : 'Gerar token'}</button>${ios ? `<a class="btn line" href="shortcuts://run-shortcut?name=${encodeURIComponent(ATALHO_NOME)}" data-act="atRun">${I('refresh', 20)} Rodar o atalho</a>` : ''}</div>
    <details class="at-how" style="margin-top:12px"><summary class="small">Como montar o atalho, em resumo</summary><ol class="small muted">
      <li>No app Atalhos, crie um atalho com o nome exato <b>${ATALHO_NOME}</b>.</li>
      <li>Agenda: Buscar Eventos do Calendário (hoje, últimos 2 dias ou próximos 15, com “Qualquer”), Repetir com Cada com um Dicionário de t, ini, fim, dia, cal e loc, e Obter Conteúdo do URL: POST, JSON com v 1, tipo agenda e eventos = Repetir Resultados.</li>
      <li>Depois um Nada e as buscas de Saúde (sono, passos e energia por dia, peso, FC de repouso, VFC), cada uma seguida de Nada, e o segundo Obter Conteúdo do URL com tipo saude e as listas de datas e valores.</li>
      <li>Nos dois, o cabeçalho Authorization com o valor copiado acima. Por fim, Mostrar Notificação com a resposta: ela começa com OK, AVISO ou ERRO.</li>
      <li>Em Automação: ao abrir o Calendário (ou outro app que você abre todo dia), Executar Imediatamente. O Saúde só é lido com o iPhone desbloqueado.</li></ol></details></div>`;
}
function nvCard() {
  const L = nvLinha(), busy = !!(NV && NV.info().ocupado), off = !navigator.onLine;
  return `<div class="card" id="nv-card"><div class="row-flex"><span class="badge-ic${L.st === 'pago' ? ' p' : ''}">${I('cloudCheck', 20)}</span><div class="grow"><b>Seus registros na nuvem</b><div class="small muted" role="status">${esc(L.t)}</div></div></div>
    <p class="small muted" style="margin-top:8px">Check-ins, treinos, tarefas, gastos anotados, contas marcadas, conquistas e XP ficam no Supabase, iguais no celular e no computador. Perdeu o celular? Entre com o mesmo e-mail no aparelho novo e tudo volta. Tema e telas abertas continuam só em cada aparelho.</p>
    ${NV && SB.session() ? `<button class="btn line block" style="margin-top:12px" data-act="nvSync"${off || leaving || nvSaindo ? ' disabled' : busyAttr(busy)}>${I('refresh', 20)} ${busy ? 'Sincronizando…' : off ? 'Sem internet' : 'Sincronizar agora'}</button>` : ''}</div>`;
}
function Sincronizar() {
  const s = SB.session(), R = fromSB() ? D.REAL : null, off = !navigator.onLine;
  // Erro ligado ao campo (aria-describedby) e lido uma vez por announce(), não a cada redesenho.
  const err = LG.msg ? `<p class="small" id="sb-err" style="color:var(--danger);margin-top:8px">${LG.msg}</p>` : '';
  const inv = LG.msg ? ' aria-invalid="true" aria-describedby="sb-err"' : '';
  const note = LG.note ? `<p class="small" style="margin-top:8px">${I('check', 16, 'style="display:inline;vertical-align:-3px;color:var(--primary)"')} ${esc(LG.note)}</p>` : '';
  const sair = (t) => `<div style="margin:10px 16px"><button class="btn ghost block" data-act="sbLogout"${busyAttr(leaving || nvSaindo)}>${leaving ? 'Saindo…' : nvSaindo ? 'Salvando na nuvem…' : t}</button></div>`;
  let body;
  if (leaving) {
    body = `<div class="card"><div class="row-flex"><span class="badge-ic">${I('lock', 20)}</span><div class="grow"><b>Saindo…</b><div class="small muted">A sessão e os dados deste aparelho já foram apagados. Falta avisar o Supabase.</div></div></div></div>`;
  } else if (!s) {
    const w = resendWait();
    body = LG.step === 'code'
      ? `<form class="card" data-form="sbVerify" novalidate>
          <p class="small muted" style="margin:0">Mandamos um e-mail para <b>${esc(LG.email)}</b>. Se ele trouxer um código, digite os números aqui (vale por uma hora). Se trouxer só um link, abra o e-mail neste mesmo navegador e toque nele.</p>
          <label class="field"><span>Código do e-mail</span><input class="input num" id="sb-code" name="code" data-in="sbcode" value="${esc(LG.code)}" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" required style="font-size:24px;letter-spacing:4px;font-weight:700"${inv}></label>
          ${err}${note}
          <button class="btn block" style="margin-top:12px" type="submit" id="sb-go"${off ? ' disabled' : busyAttr(LG.busy)}>${LG.busy === 'verify' ? 'Conferindo…' : off ? 'Sem internet' : 'Entrar'}</button>
          <div class="btnrow" style="margin-top:8px"><button class="btn ghost" type="button" id="sb-resend" data-act="sbResend"${(w && !LG.busy) || off ? ' disabled' : busyAttr(LG.busy)}>${LG.busy === 'send' ? 'Enviando…' : w ? `Mandar outro em ${Math.ceil(w / 1000)} s` : 'Mandar outro'}</button><button class="btn ghost" type="button" data-act="sbOtherEmail"${busyAttr(LG.busy)}>Trocar e-mail</button></div>
          <p class="xs muted" style="margin-top:10px">Chegou só um link, sem número? No Supabase, o modelo do e-mail ainda não mostra o código.</p></form>`
      : `<form class="card" data-form="sbSend" novalidate>
          <p class="small muted" style="margin:0">Entre com o e-mail da sua conta no Supabase. Chega um código de 6 dígitos; não tem senha. Entrando, o que você registra aqui também vai para a nuvem, e o que já está lá vem para este aparelho.</p>
          <label class="field"><span>E-mail</span><input class="input" id="sb-email" name="email" data-in="sbemail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" required value="${esc(LG.email)}"${inv}></label>
          ${err}
          <button class="btn block" style="margin-top:12px" type="submit" id="sb-go"${off ? ' disabled' : busyAttr(LG.busy)}>${LG.busy === 'send' ? 'Enviando…' : off ? 'Sem internet' : 'Receber código'}</button></form>`;
    if (D.REAL && !fromSB()) body += `<p class="small muted" style="margin:10px 20px">Até entrar, o Painel continua com o arquivo de ${dShort(realDate())}.</p>`;
    else if (fromSB()) body += `<p class="small muted" style="margin:10px 20px">A última leitura, de ${fmtSync()}, continua neste aparelho até você entrar de novo.</p>`;
  } else if (syncErr && syncErr.code === 'nao_e_dono') {
    body = `<div class="card"><div class="row-flex"><span class="badge-ic">${I('lock', 20)}</span><div class="grow"><b>Esta conta não lê os dados</b><div class="small muted">${esc(SB.email() || '')}</div></div></div>
        <p class="small muted" style="margin-top:8px">O login deu certo, mas o banco de dados do Painel só libera a leitura para a conta dona. Se este é o seu e-mail, ele ainda precisa ser liberado lá.</p>
        <button class="btn line block" style="margin-top:12px" data-act="sbSync"${off || leaving ? ' disabled' : busyAttr(syncBusy)}>${I('refresh', 20)} ${syncBusy ? 'Buscando…' : 'Tentar de novo'}</button></div>
      ${sair('Sair desta conta')}`;
  } else {
    const C = (R && R.conexoes) || [];
    body = `<div class="card"><div class="row-flex"><span class="badge-ic p">${I('cloudCheck', 20)}</span><div class="grow"><b>Conectado</b><div class="small muted ellip">${esc(SB.email() || '')}</div></div></div>
        <p class="small muted" style="margin-top:8px">${R ? `Bancos sincronizados em ${fmtSync()}. O Open Finance atualiza sozinho uma vez por dia, de manhã.` : syncBusy ? 'Buscando os seus dados…' : D.REAL ? `Ainda sem dados do Open Finance. Até chegarem, o Painel usa o arquivo de ${dShort(realDate())}.` : 'Ainda sem dados neste aparelho.'}</p>
        <p class="small muted" style="margin-top:6px">${saudeLine()}</p>
        ${syncErr ? `<p class="small" style="color:var(--danger);margin-top:8px">${sbMsg(syncErr)}</p>` : ''}
        <button class="btn block" style="margin-top:12px" data-act="sbSync"${off || leaving ? ' disabled' : busyAttr(syncBusy)}>${I('refresh', 20)} ${syncBusy ? 'Buscando…' : off ? 'Sem internet' : 'Buscar de novo'}</button></div>
      ${nvCard()}
      ${atalhoCard()}
      ${C.length ? `${sec('Conexões')}<div class="card tight">${C.map((c) => { const t = c.sinc ? new Date(c.sinc) : null, ok = c.status === 'SUCCESS' && !c.erro; return `<div class="row"><span class="badge-ic">${I('bank', 20)}</span><div class="grow"><div class="ttl">${esc(c.inst || 'Banco')}</div><div class="meta">${t ? `Atualizado ${dShort(t)} às ${hhmm(t)}` : 'Sem data'}${c.consentimento ? ` · consentimento até ${new Date(c.consentimento + 'T12:00').toLocaleDateString('pt-BR')}` : ''}</div></div><span class="chip st-${ok ? 'pago' : 'atrasado'}">${ok ? 'OK' : 'Atenção'}</span></div>`; }).join('')}</div>` : ''}
      ${R || D.SAUDE ? `${sec('Neste aparelho')}<div class="card">${R ? `<p class="small muted" style="margin:0">${(R.transacoes || []).length} lançamentos, ${(R.contas || []).length} contas e ${(R.cartoes || []).length} cartões. Ações, carro, financiamento e participações vêm da foto manual${R.snapshotEm ? ` de ${dShort(new Date(R.snapshotEm + 'T12:00'))}` : ''}.</p>` : ''}${D.SAUDE ? `<p class="small muted" style="margin:${R ? '8px' : '0'} 0 0">Saúde: ${saudeConta()}.</p>` : ''}</div>` : ''}
      ${sair('Sair e apagar os dados deste aparelho')}`;
  }
  return { title: 'Sincronizar', html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Sincronizar', 'Seus registros na nuvem, dinheiro (Open Finance) e saúde pelo Supabase, com login só seu.')}${netbar()}${body}
    <p class="xs muted" style="margin:14px 20px">${I('lock', 14, 'style="display:inline;vertical-align:-2px"')} Só a conta dona lê os dados. A sessão fica só neste aparelho.</p>` };
}

function Agenda() {
  const day = diaNow(), { s, key } = todaySession(), ref = missao(), mb = ref !== 't1' ? bills().find((b) => b.id === ref && !b.pago) : null;
  const nowHM = hmAgora();
  const T = top3(), tk = S.dayType || D.tipoDia(key), meals = D.SAUDE ? D.refeicoes(tk) : [];
  const chips = (x) => ((x.chips || []).length ? `<div class="parse" style="margin-top:2px">${x.chips.map((c) => `<span class="chip" style="min-height:22px;font-size:12px">${esc(c)}</span>`).join('')}</div>` : '');
  const top = T.map((x, i) => `<div class="quest ${x.done ? 'done' : ''}"><button class="qcheck" aria-pressed="${!!x.done}" data-act="doneTop" data-arg="${esc(x.id)}" aria-label="${esc(x.t)}: ${x.done ? 'feito' : 'marcar como feito'}">${I('check', 28)}</button><div class="grow"><div class="t">${esc(x.t)}</div><div class="d">${(x.done ? x.doneAs === 'missao' : i === 0 && ref === 't1' && !S.quests.missao) ? `Top ${i + 1} · é a Missão de hoje (+20 XP)` : `Top ${i + 1} · +10 XP`}</div>${chips(x)}</div>${x.done ? '' : `<button class="iconbtn" data-act="topInbox" data-arg="${esc(x.id)}" aria-pressed="true" aria-label="Tirar ${esc(x.t)} do Top 3" style="color:var(--xp)">${I('star')}</button>`}</div>`).join('');
  const items = [
    { h: '—', t: s.tipo ? s.nome : 'Sem sessão no plano', d: s.tipo ? `${s.resumo || ''} · do plano` : s.resumo || '', c: 'var(--a-for)' },
    ...(mb ? [{ h: '—', t: `Pagar ${mb.n.split(' · ')[0].toLowerCase()}`, d: `${brl(mb.v)} · ${relDue(mb)}`, c: 'var(--danger)' }] : []),
    ...S.inbox.filter((x) => x.quando === S.day && !x.done).map((x) => ({ h: hm(x.hora) || '—', t: x.t, d: x.top === S.day ? 'Top 3' : 'tarefa', c: 'var(--a-foc)' })),
    ...eventosDe(S.day).map((e) => ({ h: evH(e, S.day) || '—', t: e.t, d: evSub(e, S.day) || 'agenda', c: 'var(--ev)' })),
    ...meals.map((m) => ({ h: hm(m.hora) || '—', t: m.nome, d: `${m.hora ? `${m.hora} · ` : ''}${fmtInt(m.kcal)} kcal · ${fmtInt(m.p)} g de proteína`, c: 'var(--a-nut)' })),
  ].sort((a, b) => (a.h === '—' && b.h !== '—' ? -1 : b.h === '—' && a.h !== '—' ? 1 : a.h.localeCompare(b.h)));
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = D.addDays(diaNow(), i), q = D.planFor(d), ss = D.sessao(q), id = D.iso(d), bs = bills().filter((b) => D.iso(b.due) === id && !b.pago);
    const ts = S.inbox.filter((x) => x.quando === id && !x.done), ev = eventosDe(id);
    return `<div class="row"><div style="width:52px"><b>${i === 0 ? 'Hoje' : wd(d)}</b><div class="xs muted num">${dShort(d)}</div></div><div class="grow small"><div>${esc(ss.tipo ? ss.nome : '—')}</div>${ev.map((e) => `<div class="ev"><span class="k" style="--c:var(--ev)" aria-hidden="true"></span>${evH(e, id) ? `${esc(evH(e, id))} · ` : ''}${esc(e.t)}</div>`).join('')}${bs.map((b) => `<div class="muted">${esc(b.n)} · ${brl(b.v)}</div>`).join('')}${ts.map((x) => `<div class="muted">${x.hora ? `${esc(hm(x.hora) || x.hora)} · ` : ''}${esc(x.t)}</div>`).join('')}</div></div>`;
  }).join('');
  const caixa = S.inbox.filter((x) => x.top !== S.day && !x.done);
  return {
    title: 'Agenda',
    html: `${hdr('Agenda', dLong(day))}${netbar()}
      <div class="card"><label class="field" style="margin:0"><span>Anotar</span><div class="row-flex"><input class="input" id="inbox" placeholder="ex.: pagar IPVA dia 10 R$ 820 #financas" data-in="inbox" autocomplete="off" value="${esc(S.inboxDraft)}"><button class="btn" data-act="addInbox" aria-label="Anotar">${I('plus')}</button></div></label>
        <div class="parse" id="parse" aria-hidden="true"></div><p class="xs muted">Entende datas (amanhã, sexta, dia 10), horários (às 9h), #área, !prioridade e valores em R$.</p></div>
      <div class="seg" role="group" aria-label="Visão" style="margin:10px 16px 0"><button aria-pressed="${S.agView === 'hoje'}" data-act="agview" data-arg="hoje">Hoje</button><button aria-pressed="${S.agView === 'semana'}" data-act="agview" data-arg="semana">Próximos 7 dias</button></div>
      ${S.agView === 'hoje' ? `${sec('Top 3 de hoje', `<span class="small muted num">${T.length}/3</span>`)}<div class="card tight">${top || `<div class="empty"><p>Toque na estrela de uma tarefa da caixa de entrada para pôr no Top 3. A primeira é a Missão do dia.</p></div>`}</div>
        ${sec('Linha do dia')}<div class="card tight timeline">${items.map((x) => { const past = x.h !== '—' && x.h < nowHM; return `<div class="tl ${past ? 'past' : ''}"><span class="h">${x.h === '—' ? 'Hoje' : x.h}</span><span class="bul" style="--c:${x.c}"></span><div class="grow"><div class="t">${esc(x.t)}${past ? '<span class="sr"> (já passou)</span>' : ''}</div><div class="meta small muted">${esc(x.d)}</div></div></div>`; }).join('')}</div>`
        : `${sec('Próximos 7 dias')}<div class="card tight">${week}</div>`}
      ${sec('Caixa de entrada', `<span class="small muted num">${caixa.length} ite${caixa.length === 1 ? 'm' : 'ns'}</span>`)}
      <div class="card tight">${caixa.length ? caixa.map((x) => `<div class="row"><button class="iconbtn" data-act="topInbox" data-arg="${esc(x.id)}" aria-pressed="false" aria-label="Pôr ${esc(x.t)} no Top 3">${I('star')}</button><div class="grow"><div class="ttl" style="white-space:normal">${esc(x.t)}</div>${chips(x)}</div><button class="iconbtn" data-act="doneInbox" data-arg="${esc(x.id)}" aria-label="Concluir ${esc(x.t)}">${I('check')}</button></div>`).join('') : `<div class="empty"><p>Caixa vazia. Anote acima o que precisa fazer.</p></div>`}</div>
      <p class="small muted" style="margin:14px 20px">${I('calendar', 16, 'style="display:inline;vertical-align:-3px"')} ${atalhoEm().agenda ? `Eventos do Calendário do iPhone (iCloud e Google) recebidos ${haQuanto(atalhoEm().agenda)} pelo atalho Painel Sync.` : 'Os eventos do Calendário do iPhone (iCloud e Google) entram pelo atalho Painel Sync: veja em <a href="#/dinheiro/sincronizar">Sincronizar</a>. Até lá, a linha do dia mostra o plano de treino, as refeições, as contas e as suas tarefas.'}</p>`,
  };
}

function Ficha() {
  const L = lvl(S.xp), sk = streakNow(), cons = consistency(), AT = attrs(), nome = nomeDe();
  const vals = AT.filter((a) => a.v != null), avg = vals.length ? Math.round(vals.reduce((a, x) => a + x.v, 0) / vals.length) : null;
  const B = boss(), CQ = conquistas();
  const prox = L.L < 5 ? 5 : L.L < 10 ? 10 : L.L < 15 ? 15 : L.L < 20 ? 20 : L.L < 25 ? 25 : 30;
  return {
    title: 'Ficha',
    html: `${hdr('Ficha', 'Você é o personagem principal', `<a class="iconbtn" href="#/ajustes" aria-label="Integrações e ajustes">${I('sliders')}</a>`)}
      <div class="card"><div class="row-flex" style="gap:14px"><div class="avatar" style="width:64px;height:64px;font-size:26px;border-radius:20px" aria-hidden="true">${inicial()}<span class="lv">${L.L}</span></div>
        <div class="grow"><div class="mid">${nome ? esc(nome) : '<a href="#/ajustes">Pôr o seu nome</a>'}</div><div class="small muted">Nível ${L.L} · ${titleFor(L.L)}${S.bossWon ? ' · Guardião da Noite' : ''}${L.L < 30 ? ` · próximo título no nível ${prox}` : ''}</div></div></div>
        <div style="margin-top:12px"><div class="row-flex small"><span class="grow">XP para o nível ${L.L + 1}</span><b class="num">${L.into} / ${L.need}</b></div>${bar((L.into / L.need) * 100, null, 'xp lg')}</div>
        <div class="kpi" style="margin-top:14px"><span>Consistência em 28 dias</span><b style="font-size:28px">${pctTxt(cons)}</b><small>Dias com check-in desde ${dShort(dayAt(S.since))}${D.diffDays(diaNow(), dayAt(S.since)) >= 27 ? ' (janela de 28 dias)' : ''}. É o número que mais importa: um dia ruim mexe pouco nele.</small></div>
        <button class="kpi chama" data-act="chama"><span>Chama</span><b>${S.pausa ? `${I('pause', 20)} em pausa` : `${I('flame', 20)} ${sk} dia${sk === 1 ? '' : 's'}`}</b><small>${S.pausa ? 'Modo Pausa ligado: a Chama está congelada.' : brasaFree() ? '1 brasa livre: uma falta nesta semana não apaga a Chama.' : `Brasa usada em ${dShort(dayAt(S.brasaAt))}. Volta em ${dShort(D.addDays(dayAt(S.brasaAt), 7))}.`} Recorde: ${diasTxt(Math.max(S.best, sk))}.</small>${I('info', 18, 'class="ic chev"')}</button></div>
      ${sec('Atributos', `<span class="small muted num">média ${avg ?? '—'} · pelo que você registra</span>`)}
      <div class="card tight">${AT.map((a) => `<button class="attr" style="--c:${a.cor}" data-act="attr" data-arg="${a.k}" aria-label="${a.nome}: ${a.v == null ? 'sem dados ainda' : `${a.v} de 100, nota ${rank(a.v)}${a.d == null ? '' : `, ${a.d >= 0 ? 'subiu' : 'caiu'} ${Math.abs(a.d)} em 7 dias`}`}. Ver como subir"><span class="code">${a.k}</span><span class="nm">${a.nome}</span>${bar(a.v || 0, a.cor)}<span class="val">${a.v ?? '—'}<span class="rank">${rank(a.v)}</span><small>${a.v == null ? 'sem dados' : deltaTxt(a.d)}</small></span></button>`).join('')}</div>
      ${sec('Chefe do mês')}
      <div class="card"><div class="row-flex">${I('crown', 24, 'class="ic" style="color:var(--a-rec)"')}<div class="grow"><b>${B.nome}</b><div class="small muted">${B.regra}</div></div></div>
        ${B.won ? `<div class="done-line" style="margin-top:12px"><span class="tick">${I('check', 20)}</span><div class="grow"><b>Vencido neste mês</b><div class="small muted">+500 XP e o título “Guardião da Noite”. Um chefe novo chega no dia 1º.</div></div></div>` : `<div style="margin-top:12px"><div class="row-flex small"><span class="grow">Vida do chefe</span><b class="num">${B.hp} / ${B.max}</b><span class="muted num">· faltam ${B.faltam} dias</span></div>${bar((B.hp / B.max) * 100, 'var(--a-rec)', 'lg')}</div>`}
        ${B.won ? '' : `<p class="small muted" style="margin-top:8px">${B.hoje ? 'A noite de hoje já foi um golpe. ' : ''}Começa cada mês com ${B.start} de ${B.max} (o primeiro golpe é seu). Vencer dá +500 XP e o título “Guardião da Noite”. Se ele fugir, nada se perde.</p>`}</div>
      ${sec('Missões da semana', `<span class="small muted">bônus de +${D.WEEKLY_BONUS} XP ao fechar as duas</span>`)}
      <div class="card">${weekly().map((q) => `<div style="margin:10px 0"><div class="row-flex"><b class="small grow">${q.t}</b><span class="chip xp">${q.ok ? 'feita' : `${q.xp} XP`}</span></div><div class="small muted">${q.d}</div><div class="row-flex" style="margin-top:6px"><div class="grow">${bar(q.of ? (q.p / q.of) * 100 : 0)}</div><span class="small muted num">${q.p}/${q.of ?? '—'}${q.un ? ' ' + q.un : ''}</span></div></div>`).join('')}</div>
      ${sec('Conquistas', `<span class="small muted num">${CQ.filter((a) => a.ok).length}/${CQ.length}</span>`)}
      <div class="card"><div class="ach">${CQ.map((a) => `<div class="${a.ok ? '' : 'off'}"><div class="medal">${I(a.ic, 26)}</div><b>${a.n}</b><div class="muted">${a.ok ? `${a.d} · ${dShort(dayAt(S.conq[a.k]))}` : esc(a.p)}</div></div>`).join('')}</div></div>`,
  };
}

function Ajustes() {
  const ss = SB.session(), H = D.SAUDE, NL = nvLinha(), AE = atalhoEm();
  const integ = [
    ['bank', 'Open Finance (Meu Pluggy)', 'Bancos e cartões pelo Supabase. O Pluggy atualiza uma vez por dia, de manhã.', ss ? (fromSB() ? `Lido ${fmtSync()}` : 'Entrou, sem dados') : 'Entrar', ss && fromSB() ? 'pago' : 'avencer', true],
    ['cloudCheck', 'Seus registros na nuvem', esc(NL.t), NL.chip, NL.st, true, 'aj-nv'],
    ['heart', 'Saúde no Supabase', H ? `${esc(H.fonte || 'Plano, fichas, dieta, medidas e exames')}. Só a sua conta lê.` : 'Plano, fichas, dieta, medidas e exames, só para a sua conta.', H ? 'Conectado' : ss ? 'Sem dados' : 'Entrar', H ? 'pago' : 'avencer', true],
    ['health', 'Apple Health', AE.saude ? 'Sono, passos, peso, VFC, frequência de repouso, energia ativa e minutos de exercício pelo atalho do iPhone. Treinos não passam.' : 'Sono, passos, peso, VFC e frequência de repouso pelo atalho Painel Sync do iPhone, sem pagar nada. Até lá, o sono vem do check-in.', AE.saude ? cap(haQuanto(AE.saude)) : 'Não conectado', AE.saude ? (recente(AE.saude) ? 'pago' : 'avencer') : 'avencer', true],
    ['calendar', 'Agenda do iPhone', AE.agenda ? 'Eventos do Calendário do iPhone, com as agendas do iCloud e do Google, pelo mesmo atalho.' : 'Os eventos do Calendário do iPhone (iCloud e Google) entram pelo mesmo atalho. Até lá, a linha do dia mostra o plano, as refeições, as contas e as tarefas.', AE.agenda ? cap(haQuanto(AE.agenda)) : 'Não conectada', AE.agenda ? (recente(AE.agenda) ? 'pago' : 'avencer') : 'avencer', true],
    ['pulse', 'Strava', 'Fora do plano: a API exige assinatura.', 'Não usar', 'atrasado'],
  ];
  return {
    title: 'Integrações e ajustes',
    html: `${backbar('ficha', 'Ficha')}${hdr('Integrações e ajustes')}
      ${sec('Integrações')}<div class="card tight">${integ.map(([ic, n, d, st, cls, link, id]) => { const inner = `<span class="badge-ic">${I(ic, 20)}</span><div class="grow"><div class="ttl">${n}</div><div class="meta" style="white-space:normal">${d}</div></div><span class="chip st-${cls}">${st}</span>`; return link ? `<a class="row"${id ? ` id="${id}"` : ''} href="#/dinheiro/sincronizar">${inner}</a>` : `<div class="row">${inner}</div>`; }).join('')}</div>
      ${sec('Você')}<div class="card"><label class="field" style="margin:0"><span>Como quer ser chamado</span><input class="input" id="aj-nome" data-in="nome" value="${esc(S.nome || '')}" autocomplete="given-name" maxlength="30"></label><p class="xs muted" style="margin-top:6px">${nvJunto() ? 'Vai para a nuvem junto com o resto.' : 'Fica neste aparelho e, depois do login, na nuvem.'}</p></div>
      ${sec('Notificações')}<div style="margin:10px 16px"><button class="btn line block" data-act="testNotif">${I('bell', 20)} Testar notificação</button><p class="xs muted" style="margin-top:6px">Os lembretes automáticos ainda não existem: por enquanto, só o teste e o número de missões no ícone. No iPhone, funciona com o Painel na Tela de Início.</p></div>
      ${sec('Aparência')}<div class="card"><div class="seg" role="group" aria-label="Tema">${[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, l]) => `<button aria-pressed="${S.theme === k}" data-act="theme" data-arg="${k}">${l}</button>`).join('')}</div></div>
      ${sec('Pausa')}<div class="card tight"><div class="row"><div class="grow"><div class="ttl">Modo Pausa</div><div class="meta" style="white-space:normal">Doente ou viajando: congela a Chama e tira os dias da consistência.</div></div><button class="switch" role="switch" aria-checked="${S.pausa}" data-act="pausa" aria-label="Modo Pausa"></button></div></div>
      ${sec('Dados e privacidade')}<div class="card tight">
        <div class="row"><span class="badge-ic">${I('lock', 20)}</span><div class="grow"><div class="ttl">Seus dados</div><div class="meta" style="white-space:normal">${nvJunto() ? 'O que você registra (check-ins, treinos, tarefas, gastos, XP) fica neste aparelho e na nuvem do Supabase, igual no celular e no computador.' : 'O que você registra (check-ins, treinos, tarefas, gastos, XP) fica só neste aparelho até você entrar em Sincronizar; aí vai também para a nuvem.'} Dinheiro e saúde vêm do Supabase, que só a sua conta lê, e a última leitura fica guardada aqui para abrir sem internet.</div></div></div>
        <button class="row" data-act="exportar"><span class="badge-ic">${I('upload', 20)}</span><div class="grow"><div class="ttl">Exportar o que está neste aparelho</div><div class="meta">Um arquivo JSON com XP, check-ins, treinos e tarefas</div></div>${I('chevR', 20, 'class="ic muted"')}</button>
        <button class="row" data-act="restartOnb"><span class="badge-ic">${I('sparkle', 20)}</span><div class="grow"><div class="ttl">Ver as boas-vindas de novo</div></div>${I('chevR', 20, 'class="ic muted"')}</button>
        <button class="row" data-act="resetLocal"><span class="badge-ic">${I('refresh', 20)}</span><div class="grow"><div class="ttl">${nvEntrou() ? 'Recomeçar do zero' : 'Recomeçar neste aparelho'}</div><div class="meta">${nvEntrou() ? 'Apaga XP, check-ins, treinos e marcações aqui e na nuvem. Dinheiro e saúde não mudam.' : 'Apaga XP, check-ins, treinos e marcações daqui. O Supabase não muda.'}</div></div></button></div>
      <p class="xs muted" style="margin:14px 20px">Painel ${VERSION}.</p>`,
  };
}

function Onboarding() {
  const st = Math.min(S.onbStep || 0, 2), total = 3;
  const dots = `<p class="sr">Passo ${st + 1} de ${total}</p><div class="dots" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<i class="${i <= st ? 'on' : ''}"></i>`).join('')}</div>`;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  let body = '';
  if (st === 0) {
    body = `<div class="big-ic">${I('shield', 40)}</div><h1 tabindex="-1">Seu painel. Você é o personagem principal.</h1>
      <p class="lead">Saúde, dinheiro e tarefas num lugar só. Cada coisa que você faz no dia vira XP e sobe seus atributos. Os números começam do zero e crescem com o que você registra.</p>
      <label class="field"><span>Como quer ser chamado?</span><input class="input" id="onb-nome" data-in="nome" value="${esc(S.nome || '')}" autocomplete="given-name" maxlength="30"></label>
      <div class="foot"><button class="btn block" data-act="onbNext">Começar</button>${SB.session() ? '' : '<button class="btn ghost block" data-act="onbRestore">Já uso o Painel: entrar e trazer meus dados</button>'}</div>`;
  } else if (st === 1) {
    body = `<div class="big-ic">${I('squarePlus', 40)}</div><h1 tabindex="-1">Coloque na Tela de Início</h1><p class="lead">Assim o Painel abre como app e funciona sem internet.</p>
      ${standalone ? `<div class="card soft" style="margin:20px 0 0"><div class="row-flex">${I('check', 22)}<b>Já está instalado.</b></div></div>` : ios ? `<ol class="steps"><li><span class="n">1</span><span>Toque em ${I('share', 18, 'style="display:inline;vertical-align:-3px"')} <b>Compartilhar</b> no Safari</span></li><li><span class="n">2</span><span>Escolha <b>Adicionar à Tela de Início</b></span></li><li><span class="n">3</span><span>Abra o Painel pelo ícone novo</span></li></ol>` : `<ol class="steps"><li><span class="n">1</span><span>No iPhone, abra este endereço no <b>Safari</b></span></li><li><span class="n">2</span><span>Toque em ${I('share', 18, 'style="display:inline;vertical-align:-3px"')} <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b></span></li><li><span class="n">3</span><span>No computador, use o ícone de instalar na barra de endereço</span></li></ol>${deferredPrompt ? '<button class="btn line block" style="margin-top:12px" data-act="install">Instalar neste aparelho</button>' : ''}`}
      ${ios && !standalone ? `<p class="small muted" style="margin-top:14px">No iPhone as notificações só funcionam no app instalado. Depois de adicionar, abra o Painel pelo ícone novo: ele pergunta por lá.</p>` : ''}
      <div class="foot">${ios && !standalone ? `<button class="btn block" data-act="onbDone">Concluir e abrir pelo ícone</button><button class="btn ghost block" data-act="onbDone">Continuar no Safari por enquanto</button>` : `<button class="btn block" data-act="onbNext">${standalone ? 'Continuar' : 'Já fiz isso'}</button><button class="btn ghost block" data-act="onbNext">Depois</button>`}</div>`;
  } else {
    const canNotify = 'Notification' in window;
    body = `<div class="big-ic">${I('bell', 40)}</div><h1 tabindex="-1">Notificações</h1><p class="lead">Com a permissão, o ícone do Painel mostra quantas missões faltam hoje. Lembretes automáticos ainda não existem.</p>
      ${canNotify ? '' : '<p class="small muted" style="margin-top:14px">Este navegador não mostra notificações. No iPhone, elas funcionam no app instalado na Tela de Início.</p>'}
      <div class="foot">${canNotify ? `<button class="btn block" data-act="enableNotif">Permitir</button><button class="btn ghost block" data-act="onbDone">Agora não</button>` : '<button class="btn block" data-act="onbDone">Concluir</button>'}</div>`;
  }
  return { title: 'Boas-vindas', chrome: 'bare', html: `<div class="onb">${dots}${body}</div>` };
}

const ROUTES = {
  onboarding: Onboarding, hoje: Hoje, saude: Saude, 'saude/treino': Treino, 'saude/treino-editar': EditarTreino, 'saude/exercicios': Exercicios, 'saude/campanha': Campanha, 'saude/dieta': Dieta, 'saude/refeicao': Refeicao, 'saude/exames': Exames,
  dinheiro: Dinheiro, 'dinheiro/contas': Contas, 'dinheiro/cartoes': Cartoes, 'dinheiro/patrimonio': Patrimonio, 'dinheiro/importar': Importar, 'dinheiro/sincronizar': Sincronizar,
  'dinheiro/lancamentos': Lancamentos, 'dinheiro/categorias': PlanoContas,
  agenda: Agenda, ficha: Ficha, ajustes: Ajustes,
};
const TAB_OF = (r) => (r.startsWith('saude') ? 'saude' : r.startsWith('dinheiro') ? 'dinheiro' : r === 'agenda' ? 'agenda' : ['ficha', 'ajustes'].includes(r) ? 'ficha' : 'hoje');
// Navegação lateral no computador.
const NAV = [
  ['Hoje', [['hoje', 'Hoje', 'sun']]],
  ['Saúde', [['saude', 'Visão geral', 'heart'], ['saude/treino', 'Treino', 'dumbbell'], ['saude/exercicios', 'Exercícios', 'search'], ['saude/campanha', 'Plano de treino', 'target'], ['saude/dieta', 'Dieta do dia', 'utensils'], ['saude/exames', 'Exames e medidas', 'flask']]],
  ['Dinheiro', [['dinheiro', 'Visão geral', 'wallet'], ['dinheiro/contas', 'Contas a pagar', 'receipt'], ['dinheiro/cartoes', 'Cartões e faturas', 'card'], ['dinheiro/patrimonio', 'Patrimônio', 'pie'], ['dinheiro/lancamentos', 'Lançamentos', 'file'], ['dinheiro/categorias', 'Plano de contas', 'tag'], ['dinheiro/sincronizar', 'Sincronizar', 'link']]],
  ['Assessor', [['agenda', 'Agenda e tarefas', 'calendar']]],
  ['Personagem', [['ficha', 'Ficha do personagem', 'shield'], ['ajustes', 'Integrações e ajustes', 'sliders']]],
];

// ---------- Folhas (bottom sheets) ----------
// Chave estável de um controle, para devolver o foco depois que a tela é redesenhada.
function focusKey(el) {
  if (!el || el === document.body || !el.isConnected) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.tagName === 'H1' && main.contains(el)) return 'h1';
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


function safeSheet() {
  const M = money();
  openSheet(M.livre < 0 ? 'Falta para as contas' : 'Livre para gastar', `<p class="small muted" style="margin:0 0 8px">Até o fim do mês, ${dShort(M.payday)} (${rel(M.payday)}).</p>
    <table class="bp"><tr><td>Saldo em conta</td><td>${brl(M.saldo)}</td></tr>
    <tr><td>− Contas até ${dShort(M.payday)} (${M.due.length})<div class="xs muted">${M.due.map((b) => esc(b.n.split(' · ')[0])).join(', ') || 'nenhuma'}</div></td><td>${brl(-M.contas)}</td></tr>
    ${semCartao() ? '' : `<tr><td>− Fatura do ${esc(card0())}${M.faturaAntes ? `, vence ${dShort(M.fb.due)}` : M.fb.pago ? ', já paga' : `: vence ${dShort(M.fb.due)}, depois do fim do mês`}</td><td>${brl(-M.faturaAntes)}</td></tr>`}
    <tr class="tot"><td>${M.livre < 0 ? 'Falta' : 'Livre'}</td><td>${brl(M.livre)}</td></tr></table>
    <p class="small muted" style="margin-top:12px">Pagar uma conta não muda esse número: sai do saldo e da lista ao mesmo tempo. ${semCartao() ? '' : M.fb.pago ? 'A fatura aberta já foi paga: compras novas no cartão vão para a próxima e não mexem neste número.' : 'Gastar no cartão reduz, porque aumenta a fatura que vence antes do fim do mês.'} Use “Registrar → Gasto” para ver.</p>`);
}
function energiaSheet() {
  const h = sleepNow(), Z = zoneOf(h), P = D.SAUDE && D.SAUDE.plano, regras = P ? P.lista('sono') : [];
  openSheet('Energia', `<div class="row-flex">${ring(h == null ? 0 : lin(h, 4, 8), Z, 72, h == null ? '—' : hShort(h))}<div><b class="zpill zone-${Z}">${ZNAME[Z]}</b><p class="small muted">${h == null ? 'Sem check-in hoje.' : `${hTxt(h)} de sono, pelo check-in de hoje.`} Nunca aumenta nem diminui XP.</p></div></div>
    <div class="card tight" style="margin:14px 0 0">${[['verde', '7 h ou mais', 'Treino completo, como no plano.'], ['amarelo', 'De 6 a 7 h', 'Mesmo treino, com uma série a menos por exercício.'], ['vermelho', 'Menos de 6 h', 'Só caminhada leve ou mobilidade, com o mesmo XP.']].map(([z, r, t]) => `<div class="row zone-${z}"><span class="zpill" style="width:86px">${ZNAME[z]}</span><div class="grow"><div class="ttl small">${r}</div><div class="meta" style="white-space:normal">${t}</div></div></div>`).join('')}</div>
    ${regras.length ? `<h3 class="small muted" style="margin:16px 0 4px;text-transform:uppercase;letter-spacing:.06em">Do seu plano</h3><ul class="small" style="padding-left:20px;margin:0">${regras.map((x) => `<li style="margin:4px 0">${txtBr(x)}</li>`).join('')}</ul>` : ''}
    <p class="xs muted" style="margin-top:10px">A zona vem só das horas de sono. ${atalhoEm().saude ? 'O Apple Health já marca o sono no check-in; variabilidade cardíaca e frequência de repouso aparecem na Saúde.' : 'Com o atalho do iPhone, o Apple Health marca o sono no check-in.'}</p>`);
}
function attrSheet(k) {
  const a = attrs().find((x) => x.k === k); if (!a) return;
  openSheet(`${a.k} · ${a.nome}`, `<div style="--c:${a.cor}"><div class="row-flex"><div class="big" style="color:var(--c)">${a.v ?? '—'}</div><span class="rank" style="width:32px;height:32px;font-size:15px">${rank(a.v)}</span><span class="small muted right">${a.v == null ? 'sem dados ainda' : deltaTxt(a.d)}</span></div><div style="margin-top:8px">${bar(a.v || 0, a.cor, 'lg')}</div></div>
    <h3 class="small muted" style="margin:16px 0 4px;text-transform:uppercase;letter-spacing:.06em">O que mede</h3><p>${a.mede}</p>
    <h3 class="small muted" style="margin:16px 0 4px;text-transform:uppercase;letter-spacing:.06em">Como subir</h3><ul style="padding-left:20px;margin:0">${a.subir.map((s) => `<li style="margin:4px 0">${s}</li>`).join('')}</ul>
    <p class="small muted" style="margin-top:14px">Fonte: ${a.fonte}. A conta começa no primeiro dia de uso, com no mínimo 7 dias. Notas: S ≥ 90 · A ≥ 75 · B ≥ 60 · C ≥ 40 · D ≥ 20.</p>`);
}
function billSheet(id) {
  const b = bills().find((x) => x.id === id); if (!b) return;
  openSheet(esc(b.n), `<div class="big">${brl(b.v)}</div><div class="row-flex" style="margin-top:6px">${stChip(b.st)}<span class="small muted">${relDue(b)}</span></div>
    <table class="bp" style="margin-top:12px"><tr><td>Forma de pagamento</td><td>${esc(b.met || '')}</td></tr><tr><td>Categoria</td><td>${esc(b.cat || '')}</td></tr></table>
    ${b.pago ? `<p class="small muted" style="margin-top:14px">${b.met === 'Cartão' ? `Cobrada no ${esc(card0())}: entra na fatura, que é a conta a pagar.` : b.porExtrato ? 'Paga: o pagamento já apareceu no extrato.' : 'Marcada como paga por você. Sai da marcação quando o extrato mostrar o pagamento.'}</p>${S.paid[b.id] ? `<div class="btnrow"><button class="btn line" data-act="unpayBill" data-arg="${esc(b.id)}">${I('refresh', 20)} Desfazer pagamento</button></div>` : ''}` : `<div class="btnrow"><button class="btn" data-act="payBill" data-arg="${esc(b.id)}" data-autofocus>${I('check', 20)} Marcar como paga</button></div><p class="xs muted" style="margin-top:8px">${b.st === 'atrasado' ? 'Venceu, então não dá os +15 XP de conta em dia. Marcar agora tira a conta da lista.' : 'Paga até o vencimento: +15 XP.'}${b.id === missao() && !S.quests.missao ? ' É a Missão de hoje: +20 XP.' : ''}</p>`}`);
}
function examSheet(n) {
  const L = ((D.SAUDE && D.SAUDE.exames) || []).filter((e) => e.n === n); if (!L.length) return;
  const last = L[L.length - 1], nums = L.filter((e) => Number.isFinite(e.v));
  openSheet(esc(n), `${last.cat || last.lab ? `<p class="small muted" style="margin:0">${[last.cat, last.lab].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
    ${nums.length >= 2 ? timeChart(nums.map((e) => ({ d: dayAt(e.d), v: e.v })), { label: `${n}: de ${fmtNum(nums[0].v)} para ${fmtNum(nums[nums.length - 1].v)}`, fmt: fmtNum, color: 'var(--a-rec)' }) : ''}
    <table class="bp" style="margin-top:12px">${L.slice().reverse().map((e) => `<tr><td>${dAno(dayAt(e.d))}${refTxt(e) ? `<div class="xs muted">${refTxt(e)}</div>` : ''}${e.notas ? `<div class="xs muted">${esc(e.notas)}</div>` : ''}</td><td>${exVal(e)} ${exFlag(e)}</td></tr>`).join('')}</table>
    <p class="xs muted" style="margin-top:10px">Referência do laboratório de cada data. Não é diagnóstico.</p>`, 'exs');
}
function quickAdd() {
  const items = [['openCheckin', 'Check-in', 'scale'], ['nav:saude/treino', 'Treino', 'dumbbell'], ['nav:saude/dieta', 'Refeição', 'utensils'], ['expense', 'Gasto', 'wallet'], ['task', 'Tarefa ou nota', 'note'], ['nav:dinheiro/contas', 'Contas', 'receipt']];
  openSheet('Registrar', `<div class="qa">${items.map(([a, l, ic]) => `<button data-act="qa" data-arg="${a}">${I(ic)}<span>${l}</span></button>`).join('')}</div>`, 'qa');
}
const radios = (label, id, opts, sel, labels = {}) => `<div class="field"><span id="${id}">${label}</span><div class="picks" role="radiogroup" aria-labelledby="${id}">${opts.map((c) => `<button type="button" class="pick" role="radio" aria-checked="${c === sel}" tabindex="${c === sel ? 0 : -1}" data-act="radio" data-arg="${esc(c)}" data-val="${esc(c)}">${esc(labels[c] || c)}</button>`).join('')}</div></div>`;
// Com o plano de contas no banco, as categorias de despesa mais usadas nos últimos 90 dias; as outras num seletor.
function expenseCats() {
  const P = planoCats().filter((c) => c.tipo === 'despesa' && !/classificar|^estornos$/i.test(c.n));
  if (!P.length) return { top: ['Mercado', 'Alimentação fora', 'Transporte', 'Saúde', 'Lazer', 'Compras'], resto: [] };
  const ord = P.slice().sort((a, b) => (b.q90 || 0) - (a.q90 || 0) || (b.q || 0) - (a.q || 0) || a.n.localeCompare(b.n, 'pt-BR'));
  const top = ord.slice(0, 8).map((c) => c.n);
  return { top, resto: ord.slice(8).map((c) => c.n).sort((a, b) => a.localeCompare(b, 'pt-BR')) };
}
function expenseSheet() {
  const { top: cats, resto } = expenseCats();
  openSheet('Gasto rápido', `<label class="field"><span>Valor</span><input class="input" id="ex-v" inputmode="decimal" placeholder="R$ 0,00" style="font-size:24px;font-weight:750" data-autofocus value="${esc(S.draftExpense)}"></label>
    ${radios('Categoria', 'ex-cat', cats, cats[0])}
    ${resto.length ? `<label class="field" style="margin-top:-4px"><span class="sr">Outra categoria</span><select class="input" id="ex-cat-outra" data-in="excat" aria-label="Outra categoria"><option value="">Outra categoria…</option>${resto.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label>` : ''}
    ${semCartao() ? radios('Pago com', 'ex-met', ['Pix', 'Dinheiro'], 'Pix') : radios('Pago com', 'ex-met', [CARD, 'Pix', 'Dinheiro'], CARD, { [CARD]: card0() })}
    <button class="btn block" style="margin-top:16px" data-act="saveExpense">Salvar gasto</button><p class="xs muted" style="margin-top:8px">${S.paid.fatura && !semCartao() ? `No ${esc(card0())} vai para a próxima fatura (a aberta já foi paga) e não muda o “livre para gastar”. Pix e dinheiro saem do saldo na hora.` : 'Entra na hora no “livre para gastar”.'} Quando o extrato chegar, o lançamento é ligado a este gasto e não duplica.${podeCat() ? ' Em dinheiro, fica também nos lançamentos do Supabase.' : ''}</p>`, 'ex');
}
function chamaSheet() {
  const sk = streakNow();
  openSheet('Chama', `<div class="row-flex">${I('flame', 28, 'class="ic flame"')}<div class="big">${sk} dia${sk === 1 ? '' : 's'}</div></div>
    <p class="small" style="margin-top:8px">Dias seguidos com check-in. Recorde: ${diasTxt(Math.max(S.best, sk))}.</p>
    <table class="bp" style="margin-top:12px"><tr><td>Brasa (1 falta livre a cada 7 dias)</td><td>${brasaFree() ? 'disponível' : `volta em ${dShort(D.addDays(dayAt(S.brasaAt), 7))}`}</td></tr><tr><td>Modo Pausa (doente ou viajando)</td><td>${S.pausa ? 'ligado' : 'desligado'}</td></tr></table>
    <p class="small muted" style="margin-top:12px">Se você faltar e tiver brasa, a Chama não apaga: fica âmbar no dia seguinte. Sem brasa, ela recomeça do zero, mas XP e nível nunca caem. A consistência em 28 dias é o número principal porque um dia ruim mexe pouco nela.</p>
    <div class="btnrow"><a class="btn line" href="#/ajustes" data-act="closeSheetNav">${I('pause', 20)} Modo Pausa em Ajustes</a></div>`);
}
function confirmSheet(title, text, yes, yesArg, no = 'Continuar') {
  openSheet(title, `<p class="small">${text}</p><div class="btnrow"><button class="btn" data-act="${yes}" data-arg="${yesArg}">Concluir assim mesmo</button><button class="btn ghost" data-act="closeSheet" data-autofocus>${no}</button></div>`, 'cf');
}

// ---------- Ações ----------
const newId = (p) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const A = {
  sbSync: () => syncNow(true),
  sbResend: () => { if (!resendWait()) sbSend(LG.email, true); },
  sbOtherEmail: () => { if (LG.busy) return; LG.step = 'email'; LG.msg = ''; LG.note = ''; LG.code = ''; SB.clearPending(); render(true, '#sb-email'); },
  // Sair: nada que esteja em andamento (leitura ou renovação da sessão) pode gravar de volta depois disso.
  // Com a nuvem: antes sobe o que falta deste aparelho; depois apaga daqui também os seus registros (estão na nuvem).
  sbLogout: async () => {
    if (leaving || nvSaindo) return;
    const naNuvem = !!(NV && NV.entrou());
    if (!confirm(naNuvem ? 'Sair deste aparelho? A sessão e a cópia dos seus dados daqui são apagadas. Na nuvem fica tudo, para entrar de novo aqui ou em outro aparelho.' : 'Sair deste aparelho? A sessão e a cópia do dinheiro e da saúde daqui são apagadas. No Supabase nada muda.')) return;
    let nv = 'fora';
    if (naNuvem) {
      nvSaindo = true; render(true); announce('Salvando na nuvem antes de sair…');
      nv = await NV.sair();
      nvSaindo = false;
      if (nv === 'pendente' && !confirm('As últimas mudanças deste aparelho ainda não chegaram à nuvem (sem internet?). Sair assim mesmo e perder essas mudanças?')) { render(true); return; }
    }
    leaving = true; NV?.parar(); render(true); announce('Saindo…');
    try { localStorage.removeItem(REALK); localStorage.removeItem(SAUDEK); } catch { /* nada a apagar */ }
    if (nv === 'fora') { S.paid = {}; S.paidAmt = {}; S.paidAt = {}; saveLocal(); }
    else {
      // Fica só o tema: o resto volta da nuvem quando você entrar de novo.
      S = Object.assign(defaults(), { theme: S.theme, onboarded: true, day: D.iso(diaNow()), since: D.iso(diaNow()) }); bossMonth(S); saveLocal();
      NV.esquecer();
    }
    const r = await SB.signOut();
    try { sessionStorage.setItem('painel-saiu', r === true || r === 'ok' ? '1' : r === 'sem-rede' ? 'sem-rede' : 'erro'); if (nv !== 'fora') sessionStorage.setItem('painel-saiu-nuvem', '1'); } catch { /* sem aviso depois */ }
    location.reload();
  },
  nvSync: async () => {
    if (!NV || !nuvemOn() || leaving) return;
    const r = await NV.puxar();
    const i = NV.info();
    if (r === 'ok') toast(`${I('cloudCheck', 18)} Seus registros estão na nuvem.`);
    else if (r === 'erro') toast(esc(plain(nvErrMsg(i.erro))), 'warn', 6000);
    else if (r === 'pendente') toast('Ainda falta subir uma parte. Tente de novo em instantes.', 'warn', 5000);
  },
  // Token novo do atalho: desliga o anterior. Fica só na memória desta tela, para copiar uma vez.
  atGen: async () => {
    if (AT.busy || !SB.session()) return;
    // O cartão pode não saber se já existe um token (saúde ainda não lida neste aparelho): pergunta do mesmo jeito.
    const AE = atalhoEm(), ja = AE.token || AT.token || AE.saude || AE.agenda;
    if ((ja || !D.SAUDE) && !confirm(ja ? 'Gerar outro token? O atalho com o token antigo para de funcionar até você colar o novo nos dois Obter Conteúdo do URL.' : 'Gerar um token? Se o atalho do iPhone já usa um, ele para de funcionar até você colar o novo nos dois Obter Conteúdo do URL.')) return;
    AT.busy = true; AT.err = null; render(true);
    try {
      const t = await SB.novoToken();
      if (typeof t !== 'string' || !/^[0-9a-f]{32,}$/.test(t)) throw Object.assign(new Error('resposta'), { code: 'resposta' });
      AT.token = t; AT.busy = false; render(true, '#at-tok');
      announce('Token gerado. Copie agora: ele só aparece esta vez.');
    } catch (e) { AT.busy = false; AT.err = e; render(true); }
  },
  atCopy: async (k) => {
    const v = k === 'url' ? SB.ATALHO_URL : AT.token ? `Bearer ${AT.token}` : '';
    if (!v) return;
    try { await navigator.clipboard.writeText(v); toast(`${I('check', 18)} ${k === 'url' ? 'Endereço copiado' : 'Cabeçalho copiado'}`); }
    catch { const el = document.getElementById(k === 'url' ? 'at-url' : 'at-tok'); el?.focus(); el?.select(); toast('Não deu para copiar sozinho: o texto ficou selecionado para você copiar.', 'warn', 4200); }
  },
  // Abre o atalho no app Atalhos; ao voltar para o Painel, busca a saúde e a agenda de novo.
  atRun: () => { AT.pend = Date.now(); },
  onbRestore: () => { S.onboarded = true; S.onbStep = 0; save(); go('#/dinheiro/sincronizar', true); },
  closeSheet: () => closeSheet(),
  closeSheetNav: (_, el, e) => { const href = el?.getAttribute?.('href'); if (href) { e.preventDefault(); navFromSheet(href); } else closeSheet(true, false); },
  back: (_, el, e) => { e.preventDefault(); history.back(); },
  quest: (k) => {
    if (k === 'missao') {
      // Conta: pagar ou desfazer sempre pela folha da conta. Top 1: marca a tarefa, com o mesmo XP de qualquer lugar.
      const ref = missao();
      if (ref !== 't1') {
        const b = bills().find((x) => x.id === ref);
        if (b && b.pago && !S.paid[ref]) { setQuest('missao', !S.quests.missao); render(true); return; } // paga fora do app
        billSheet(ref); return;
      }
      const t = top1();
      if (t && t.done && t.doneAs !== 'missao' && !S.quests.missao) { t.doneAs = 'missao'; S.xp = Math.max(0, S.xp - 10); setQuest('missao', true); render(true); return; }
      if (t) { A.doneTop(t.id); return; }
      toast('Escolha o Top 1 na Agenda: toque na estrela de uma tarefa.', '', 4200); go('#/agenda'); return;
    }
    if (k === 'corpo' && !S.quests.corpo) S.corpoKey = corpoDefault();
    if (k === 'comb') S.combByMeals = false;
    setQuest(k, !S.quests[k]); render(true);
  },
  wstep: (d) => {
    const el = document.getElementById('ci-w'), lw = lastWeight();
    const cur = parseFloat((el.value || '').replace(',', '.')), base = Number.isFinite(cur) ? cur : lw ? lw.v : 80;
    el.value = n1(Math.max(30, Math.min(250, base + (Number.isFinite(cur) ? parseFloat(d) : 0)))); pesoRasc = el.value;
  },
  sleep: (v, el) => {
    S.sleep = parseFloat(v);
    el.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]').forEach((b) => { const on = b === el; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
    if (S.checkin) S.checkin.s = S.sleep;
    save(); if (S.checkin) { render(true); setTimeout(checkBoss, 600); }
  },
  saveCheckin: () => {
    const el = document.getElementById('ci-w'), raw = (el?.value || '').trim(), w = raw ? parseFloat(raw.replace(',', '.')) : null;
    if (w != null && !(w > 30 && w < 250)) { toast('Confira o peso: use algo como 82,5, ou deixe vazio.'); el?.focus(); return; }
    if (fin(S.sleep) == null && ahPick() != null) S.sleep = ahPick(); // a opção que já veio marcada pelo Apple Health
    if (fin(S.sleep) == null) { toast('Escolha as horas de sono.'); sheetRoot.querySelector('#sheet [role="radio"][tabindex="0"]')?.focus() || main.querySelector('[role="radio"][tabindex="0"]')?.focus(); return; }
    const first = !S.checkin; S.checkin = { w, s: S.sleep }; if (w != null) S.weight = w; pesoRasc = null;
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
  closeDay: () => { S.closed = true; save(); toast(`${I('moon', 18)} Dia fechado. Bom descanso.`); render(true, '#ev-t'); },
  theme: (k) => { S.theme = k; save(); applyTheme(); render(true); renderChrome(); },
  energia: () => energiaSheet(),
  safe: () => safeSheet(),
  attr: (k) => attrSheet(k),
  bill: (id) => billSheet(id),
  exame: (n) => examSheet(n),
  chama: () => chamaSheet(),
  payBill: (id) => {
    const b = bills().find((x) => x.id === id); if (!b || b.pago) return;
    S.paid[id] = true; S.paidAmt[id] = b.v; S.paidAt[id] = { m: D.iso(diaNow()).slice(0, 7), t: new Date().toISOString(), due: D.iso(b.due), n: billName(b), xp: b.st !== 'atrasado' ? 15 : 0 };
    lastFocusKey = focusKey(lastFocus) || lastFocusKey;
    closeSheet(true);
    if (b.st !== 'atrasado') addXP(15, 'Conta paga em dia'); else { touch(); toast(`${I('check', 18)} Conta marcada como paga`); }
    if (id === missao()) setQuest('missao', true);
    render(true);
  },
  unpayBill: (id) => {
    if (!S.paid[id]) return;
    const at = S.paidAt[id];
    const xp = at && Number.isFinite(at.xp) ? at.xp : 0; // o que foi dado ao marcar (marcação de antes do XP zerado: nada)
    delete S.paid[id]; delete S.paidAmt[id]; delete S.paidAt[id];
    if (id === 'fatura') S.expenses.forEach((x) => { if (x.fat === 'proxima') x.fat = 'aberta'; }); // sem pagamento, voltam para a fatura aberta
    S.xp = Math.max(0, S.xp - xp);
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
    const sec = parseInt(el.dataset.rest, 10) || 90;
    unlockAudio();
    if (st.ok) { S.rest = { end: Date.now() + sec * 1000 }; announce(`Série concluída. Descanso de ${sec >= 120 && sec % 60 === 0 ? sec / 60 + ' minutos' : sec + ' segundos'} iniciado.`); } else S.rest = null;
    touch(); render(true);
  },
  skipRest: () => { S.rest = null; save(); render(true, '.restbar .btn'); },
  startWorkout: () => { if (!S.wStart) S.wStart = Date.now(); save(); toast(`${I('timer', 18)} Cronômetro iniciado`); render(true); },
  finishWorkout: (k, el, e, force) => {
    const sel = k, { key, p } = todaySession();
    const cut = ['amarelo', 'vermelho'].includes(zoneNow()), FL = FORCA.has(sel) || isP(sel) ? fichaList(sel, p) : null, ck = isP(sel) ? 'F' : sel;
    if (FL && FL.list.length && !force && setsDone(sel, FL.list, cut) === 0) {
      confirmSheet('Concluir sem séries marcadas?', 'Nenhuma série foi marcada como feita. Se você treinou e só não marcou, pode concluir assim mesmo: o treino conta como feito, sem cargas guardadas.', 'finishForce', sel, 'Continuar treino');
      return;
    }
    const fromSheet = !!history.state?.sheet; closingByPop = true; closeSheet(true, false); closingByPop = false;
    // Cargas da sessão: a última de cada exercício vira a base da próxima sugestão; recorde só depois da primeira vez.
    let pr = false;
    if (FL) {
      FL.list.forEach((ex, j) => {
        const feitos = []; for (let i = 0; i < 8; i++) { const st = S.sets[setKey(sel, j, ex, i)]; if (st && st.ok) feitos.push(st); }
        if (!feitos.length) return;
        const kg = Math.max(...feitos.map((x) => x.kg || 0)), reps = feitos.map((x) => x.reps || 0);
        S.lastSets[ex.id] = { kg, reps, d: S.day, n: ex.nome };
        S.lastSets[`${ex.id}@${S.day}`] = { kg, reps }; // histórico de cargas
        const b = Math.max(...feitos.map((x) => (x.kg > 0 && x.reps > 0 ? e1rm(x.kg, x.reps) : 0))), prev = S.best1rm[ex.id];
        if (b > 0) { if (prev != null && b > prev + 0.01) pr = true; if (prev == null || b > prev) S.best1rm[ex.id] = b; }
      });
      Object.keys(S.sets).forEach((x) => { if (x.startsWith(sel + '-')) delete S.sets[x]; });
    }
    const minutos = sel === 'Z2' ? z2Min() : 0;
    S.rest = null; S.wStart = null;
    const label = sel === 'REST' ? 'Mobilidade feita' : sel === 'REC' ? 'Recuperação feita' : sel === 'LIVRE' ? 'Treino feito' : isP(sel) ? `${FL.ss.nome} concluído` : `${sessOf(p, sel).nome} concluído${sel !== key && key !== 'LIVRE' ? ' (reposição)' : ''}`;
    if (!S.quests.corpo) {
      S.corpoKey = ck; setQuest('corpo', true, label);
      if (sel === 'Z2') S.corpoMin = minutos;
      if (pr && !S.prToday) { S.prToday = true; setTimeout(() => addXP(25, 'Recorde pessoal'), 800); }
    } else {
      // Já ganhou o XP de hoje: a sessão feita (não a recuperação) é a que conta na semana.
      if (['REC', 'REST', 'LIVRE'].includes(S.corpoKey) && !['REC', 'REST'].includes(sel)) { S.corpoKey = ck; S.corpoMin = minutos; setTimeout(checkWeekly, 600); }
      toast(`${label}. O XP de treino é de uma sessão por dia${pr ? '; o recorde fica guardado' : ''}.`, '', 3600);
    }
    // Volta para o Hoje sem deixar o treino concluído no caminho do “voltar”.
    save();
    if (fromSheet) { afterPop = () => go('#/hoje', true); history.back(); } else go('#/hoje', true);
  },
  finishForce: (k) => A.finishWorkout(k, null, null, true),
  // Treinos seus, fichas editadas e a base de exercícios.
  wOutros: () => outrosSheet(),
  tAbrir: (id) => { if (!treinoP(id)) return; S.wSel = `P:${id}`; save(); closeSheet(true, false); if (current() !== 'saude/treino') go('#/saude/treino'); else render(false); },
  tMontar: () => {
    let t = meusTreinos().find((x) => x.dia === S.day);
    if (!t) { t = { id: newId('m'), nome: `Treino de ${dShort(diaNow())}`, ex: [], dia: S.day }; putT(t); }
    S.wSel = `P:${t.id}`; save();
    if (current() !== 'saude/treino') { closeSheet(true, false); go('#/saude/treino'); setTimeout(() => { if (!t.ex.length) pickSheet('add', S.wSel); }, 60); return; }
    render(false);
    if (t.ex.length) closeSheet(); else pickSheet('add', S.wSel); // folha encadeada: já abre a busca
  },
  tNovo: () => nomeSheet('tCriar', '', ''),
  tCriar: () => {
    const nome = (document.getElementById('tn-nome')?.value || '').trim().slice(0, 40); if (!nome) { document.getElementById('tn-nome')?.focus(); return; }
    const t = { id: newId('t'), nome, ex: [] }; putT(t); S.wSel = `P:${t.id}`; S.edAlvo = S.wSel; save();
    closeSheet(true, false); go('#/saude/treino-editar'); setTimeout(() => pickSheet('add', S.edAlvo, null, true), 60);
  },
  tSalvar: (id) => { const t = treinoP(id); if (t) nomeSheet('tGuardar', id, /^Treino de \d/.test(t.nome) ? '' : t.nome); },
  tGuardar: (id) => {
    const t = treinoP(id), nome = (document.getElementById('tn-nome')?.value || '').trim().slice(0, 40); if (!t) return; if (!nome) { document.getElementById('tn-nome')?.focus(); return; }
    putT({ ...t, nome, dia: null }); save(); closeSheet(); render(true); toast(`${I('check', 18)} ${esc(nome)} guardado em Outros`);
  },
  tApagar: (id) => {
    const t = treinoP(id); if (!t || !confirm(`Apagar o treino “${t.nome}”? O histórico de cargas dos exercícios fica.`)) return;
    delete S.lastSets[K_T + id]; if (S.wSel === `P:${id}`) S.wSel = null; S.edAlvo = null; save(); go('#/saude/treino', true); toast('Treino apagado');
  },
  edAbrir: (k, el) => { S.edAlvo = k; save(); if (el.tagName !== 'A') go('#/saude/treino-editar'); },
  edMove: (a) => {
    const [j, d] = a.split(':').map(Number), sel = S.edAlvo, b = fichaList(sel, plan()).base, i = j + d;
    if (!b[j] || !b[i]) return; [b[j], b[i]] = [b[i], b[j]]; setBase(sel, b); save(); render(true, `[data-act="edMove"][data-arg="${i}:${d}"]`);
  },
  edDel: (a) => {
    const j = +a, sel = S.edAlvo, b = fichaList(sel, plan()).base; if (!b[j]) return;
    const [x] = b.splice(j, 1); setBase(sel, b); save(); render(true); toast(`${esc(x.n)} saiu ${isP(sel) ? 'do treino' : 'da ficha'}`);
  },
  edReset: (sel) => {
    const f = fichaList(sel, plan()).f; if (!f || !confirm(`Voltar à ficha original do Treino ${sel}? As suas mudanças nela são desfeitas; as cargas ficam.`)) return;
    delete S.lastSets[K_F + fKey(f)]; save(); render(true); toast('Ficha original de volta');
  },
  trocarEx: (a) => { const m = /^(.+):(\d+)(:ficha)?$/.exec(a); if (m) pickSheet('troca', m[1], +m[2], !!m[3]); },
  exAdd: (a) => { const m = /^(.+?)(:ficha)?$/.exec(a); if (m) pickSheet('add', m[1], null, !!m[2]); },
  pkPick: (i) => { const x = PK && PK.res[+i]; if (x) pkAplicar(x.nome, x.p); },
  pkNovo: () => {
    if (!PK) return; const q = PK.q.trim().replace(/\s+/g, ' ').slice(0, 60), id = D.slug(q); if (!id) return;
    const nome = cap(q); S.lastSets[K_E + id] = { n: nome }; pkAplicar(nome, PRESC);
  },
  pkDesfaz: () => { if (!PK) return; delete S.sets[`${K_S}${PK.sel}-${PK.j}`]; PK = null; save(); closeSheet(); render(true); },
  exVer: (id) => exSheet(id),
  exGrupo: (g) => { exGrupo = GRUPOS.includes(g) ? g : ''; document.querySelectorAll('.exgrupos .pick').forEach((b) => { const on = b.dataset.arg === exGrupo; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; }); document.getElementById('exlist').innerHTML = exLista(); },
  exNovo: () => openSheet('Novo exercício', `<label class="field"><span>Nome</span><input class="input" id="exn-nome" maxlength="60" autocomplete="off" placeholder="ex.: Remada cavalinho" data-autofocus></label>
    <button class="btn block" style="margin-top:16px" data-act="exCriar">Criar</button><p class="xs muted" style="margin-top:8px">Entra na sua base para trocar ou adicionar nos treinos.</p>`, 'exn', '#exn-nome'),
  exCriar: () => {
    const q = (document.getElementById('exn-nome')?.value || '').trim().replace(/\s+/g, ' ').slice(0, 60), id = D.slug(q); if (!id) { document.getElementById('exn-nome')?.focus(); return; }
    if (!biblioteca().some((x) => x.id === id)) S.lastSets[K_E + id] = { n: cap(q) };
    save(); closeSheet(); render(true); toast(`${I('check', 18)} ${esc(cap(q))} na base`);
  },
  exTirar: (id) => { delete S.lastSets[K_E + id]; save(); closeSheet(); render(true); },
  daytype: (k) => { if (!D.DIAS[k]) return; S.dayType = k; combMeals(); save(); render(true); },
  // O ✓ marca que seguiu o plano (ou desmarca). Numa refeição ajustada abre o registro, para não perder o que você anotou.
  meal: (id) => {
    const v = S.meals[id];
    if (mVal(v) && v !== true) { A.refEd(id); return; }
    if (v) S.meals[id] = false; else { S.meals[id] = true; mealXp(id); }
    combMeals(); save(); render(true);
  },
  refEd: (id) => { if (!id) return; S.refEd = id; save(); go('#/saude/refeicao'); },
  refNova: () => { const id = K_X + Date.now().toString(36); S.meals[id] = { n: 'Lanche', h: hmAgora() === '24:00' ? '' : hmAgora(), f: [] }; S.refEd = id; save(); go('#/saude/refeicao'); },
  rfPlano: () => { const id = S.refEd; if (!planoHoje().some((m) => m.id === id)) return; S.meals[id] = true; mealXp(id); combMeals(); save(); go('#/saude/dieta', true); toast(`${I('check', 18)} Seguiu o plano`); },
  rfPorcao: () => { const id = S.refEd, m = planoHoje().find((x) => x.id === id), f = itensDe(id); if (!m || !f) return; f.unshift(planoItem(m)); mealXp(id); combMeals(); save(); render(true); },
  fiTirar: (j) => {
    const id = S.refEd, f = itensDe(id); if (!f || !f[+j]) return;
    f.splice(+j, 1);
    if (!f.length && !id.startsWith(K_X)) S.meals[id] = false; // sem nada: volta a não registrada
    combMeals(); save(); render(true);
  },
  rfLimpa: () => {
    const id = S.refEd; if (!id) return;
    if (id.startsWith(K_X)) delete S.meals[id]; else S.meals[id] = false;
    combMeals(); save(); go('#/saude/dieta', true);
  },
  rfPronto: () => {
    const id = S.refEd, v = id && S.meals[id];
    if (id && id.startsWith(K_X) && mVal(v) && !v.f.length) delete S.meals[id]; // refeição fora do plano vazia não fica
    combMeals(); save();
  },
  foodAdd: () => foodSheet(),
  fsPick: (i) => { const a = FS && FS.list[+i]; if (!a) return; FS.sel = a; fsBody(fsQtd(a), '#fs-qt'); document.getElementById('fs-qt')?.select(); },
  fsQ: (v) => { const el = document.getElementById('fs-qt'); if (!el || !FS?.sel) return; el.value = String(v).replace('.', ','); document.getElementById('fs-prev').innerHTML = fsPrev(FS.sel, el.value); },
  fsVolta: () => { if (!FS) return; FS.sel = null; FS.novo = false; fsBody(fsBusca(), '#fs-q'); },
  fsNovo: () => { if (!FS) return; FS.novo = true; fsBody(fsNovoHtml(), '#fn-n'); },
  fsCriar: () => {
    const nome = (document.getElementById('fn-n')?.value || '').trim().replace(/\s+/g, ' ').slice(0, 60), err = document.getElementById('fn-err');
    const v = ['k', 'p', 'c', 'g'].map((k) => numBr(document.getElementById(`fn-${k}`)?.value));
    if (!nome) { err.textContent = 'Dê um nome ao alimento.'; document.getElementById('fn-n')?.focus(); return; }
    if (v.every((x) => x == null) || v.some((x) => x != null && (x < 0 || x > 5000))) { err.textContent = 'Preencha ao menos as calorias ou a proteína, com números de 0 a 5000.'; return; }
    const por = document.querySelector('#fs [aria-labelledby="fn-por"] [aria-checked="true"]')?.dataset.val === '1' ? 1 : 100;
    FS.sel = { n: nome, b: v.map((x) => (x == null ? 0 : x)), u: por === 1 ? 'porção' : 'g', por, s: `m${D.slug(nome)}`.slice(0, 40) }; FS.novo = false;
    fsBody(fsQtd(FS.sel), '#fs-qt');
  },
  fsOk: () => {
    const a = FS && FS.sel, q = numBr(document.getElementById('fs-qt')?.value), id = S.refEd;
    if (!a) return;
    if (!(q > 0) || q > 5000) { document.getElementById('fs-prev').textContent = 'Digite uma quantidade maior que zero.'; document.getElementById('fs-qt')?.focus(); return; }
    const f = itensDe(id); if (!f) { closeSheet(); render(true); return; }
    f.push(AL.item(a, q)); lembrar(a, q); mealXp(id); combMeals(); save(); FS = null; closeSheet(); render(true); toast(`${I('check', 18)} ${esc(curto(a.n))} registrado`);
  },
  fsOff: () => {
    if (!FS || FS.off === 'busy') return;
    const q = FS.q.trim(); if (!q) return;
    const me = FS; me.off = 'busy'; fsUpd();
    AL.buscarOff(q).then((L) => { if (FS === me && me.q.trim() === q) { me.off = L; fsUpd(); } }).catch((e) => { if (FS === me && me.q.trim() === q) { me.off = { err: e.message }; fsUpd(); } });
  },
  card: (i) => { S.card = +i; save(); render(true); },
  bp: (k) => { S.bp = k; save(); render(true); },
  calnav: (d) => { S.calOff += +d; S.calSel = null; save(); render(true); },
  calsel: (id) => { S.calSel = S.calSel === id ? null : id; save(); render(true); },
  billf: (k) => { S.billFilter = k; save(); render(true); },
  agview: (k) => { S.agView = k; save(); render(true); },
  // Estrela: põe ou tira uma tarefa do Top 3 de hoje (no máximo 3).
  topInbox: (id) => {
    const x = S.inbox.find((y) => y.id === id); if (!x || x.done) return;
    if (x.top === S.day) { x.top = null; x.topAt = null; }
    else { if (top3().length >= 3) { toast('O Top 3 já está cheio. Conclua ou tire uma tarefa.', '', 3600); return; } x.top = S.day; x.topAt = Date.now(); }
    save(); render(true, `[data-act="topInbox"][data-arg="${CSS.escape(id)}"]`);
  },
  // Concluir uma tarefa do Top 3: +10 XP, ou a Missão (+20) quando é o Top 1. Fica na lista até a virada do dia.
  doneTop: (id) => {
    const x = S.inbox.find((y) => y.id === id); if (!x) return;
    const on = !x.done;
    if (on) {
      // Vale como foi marcada: a Missão (Top 1) ou +10 do Top 3. Trocar a ordem depois não muda o que ela deu.
      const isMissao = missao() === 't1' && top1() && top1().id === id && !S.quests.missao;
      x.done = S.day; x.doneAs = isMissao ? 'missao' : 'top';
      if (isMissao) setQuest('missao', true); else addXP(10, 'Top 3: um a menos');
    } else {
      const as = x.doneAs; x.done = null; x.doneAs = null;
      if (as === 'missao') setQuest('missao', false); else { S.xp = Math.max(0, S.xp - 10); touch(); }
    }
    render(true);
  },
  addInbox: () => {
    const el = document.getElementById('inbox'); const v = el.value.trim(); if (!v) { el.focus(); return; }
    const p = parseInbox(v), tm = p.chips.find((c) => c.k === 'time');
    S.inbox.unshift({ id: newId('n'), o: Date.now(), t: p.title || v, chips: p.chips.map((c) => c.t), quando: p.date ? D.iso(p.date) : null, hora: tm ? tm.t : null }); S.inboxDraft = ''; touch();
    toast(`${I('inbox', 18)} Anotado na caixa de entrada`);
    render(true, '#inbox');
  },
  doneInbox: (id) => {
    const i = S.inbox.findIndex((x) => x.id === id); if (i < 0) return;
    S.inbox.splice(i, 1);
    // Tarefas pequenas valem pouco e têm teto, para não inflar o placar (o Top 3 é o que conta).
    if (S.inboxXp < 5) { S.inboxXp += 1; addXP(2, 'Tarefa concluída'); } else { touch(); toast(`${I('check', 18)} Tarefa concluída`); }
    const rest = S.inbox.filter((x) => x.top !== S.day && !x.done);
    render(true, rest.length ? `[data-act="doneInbox"][data-arg="${CSS.escape(rest[Math.min(i, rest.length - 1)].id)}"]` : '#inbox');
  },
  pausa: () => { S.pausa = !S.pausa; save(); toast(S.pausa ? `${I('pause', 18)} Modo Pausa ligado. A Chama fica congelada e os dias saem da consistência.` : 'Modo Pausa desligado'); render(true); },
  testNotif: () => testNotif(),
  enableNotif: async () => { await testNotif(true); A.onbDone(); },
  restartOnb: () => { S.onbStep = 0; save(); location.hash = '#/onboarding'; },
  pendentes: () => pendentesSheet(),
  realClear: () => { if (!confirm('Apagar os seus dados de dinheiro deste aparelho? O arquivo no seu computador continua lá.')) return; try { localStorage.removeItem(REALK); } catch { /* nada a apagar */ } if (!nvEntrou()) { S.paid = {}; S.paidAmt = {}; S.paidAt = {}; save(); } location.reload(); },
  resetLocal: () => {
    if (!confirm(nvEntrou() ? 'Recomeçar do zero? XP, check-ins, treinos, tarefas, gastos anotados e marcações são apagados aqui e na nuvem: o outro aparelho também zera. Ficam os treinos seus, as fichas editadas e os exercícios criados. Dinheiro e saúde do Supabase não mudam.' : 'Recomeçar neste aparelho? XP, check-ins, treinos, tarefas, gastos anotados e marcações daqui são apagados. Ficam os treinos seus, as fichas editadas e os exercícios criados. O Supabase não muda.')) return;
    const keep = { theme: S.theme, onboarded: true, nome: S.nome, lastSets: Object.fromEntries(Object.entries(S.lastSets).filter(([k, v]) => k.startsWith(K_F) || k.startsWith(K_E) || k.startsWith(K_A) || (k.startsWith(K_T) && !(v && v.dia)))) };
    S = Object.assign(defaults(), keep, { day: D.iso(diaNow()), since: D.iso(diaNow()) }); bossMonth(S); save();
    toast(nvEntrou() ? 'Recomeçado do zero, aqui e na nuvem' : 'Recomeçado neste aparelho'); if (current() !== 'hoje') go('#/hoje', true); else render(false); renderChrome();
  },
  exportar: () => {
    try {
      const blob = new Blob([JSON.stringify({ app: 'Painel', versao: VERSION, exportadoEm: new Date().toISOString(), estado: S }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `painel-aparelho-${D.iso(new Date())}.json`;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast(`${I('check', 18)} Arquivo baixado`);
    } catch { toast('Não consegui gerar o arquivo neste navegador.', 'warn', 4000); }
  },
  onbNext: () => { S.onbStep = Math.min(2, (S.onbStep || 0) + 1); save(); render(false, 'h1'); },
  onbDone: () => { const first = !S.onboarded; S.onboarded = true; S.onbStep = 0; save(); try { navigator.storage?.persist?.(); } catch { /* opcional */ } go('#/hoje', true); if (first) setTimeout(() => toast(`${I('star')} <span>Tudo pronto. Faça o primeiro check-in.</span>`, 'lvl', 3600), 400); },
  install: async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; render(true); },
  radio: (_, el) => {
    const g = el.closest('[role="radiogroup"]');
    g.querySelectorAll('[role="radio"]').forEach((b) => { const on = b === el; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
    if (g.getAttribute('aria-labelledby') === 'tx-alc' && TX) { TX.par = el.dataset.val === 'par'; txRender('[aria-labelledby="tx-alc"] [aria-checked="true"]'); }
    if (g.getAttribute('aria-labelledby') === 'ex-cat') { const s = document.getElementById('ex-cat-outra'); if (s) s.value = ''; }
  },
  // Lançamentos, categorias e plano de contas.
  tx: (id) => txSheet(id),
  txCat: (c) => { if (!TX) return; TX.novo = c.startsWith('+'); TX.cat = TX.novo ? c.slice(1).trim() : c; txRender(TX.novo || txById(TX.id)?.m ? null : '[aria-labelledby="tx-alc"] [aria-checked="true"]'); },
  txVolta: () => { if (!TX) return; TX.cat = null; TX.novo = false; txRender('#tx-q'); },
  txSalvar: () => { if (TX) txSalvar(); },
  txAuto: () => { const x = TX && txById(TX.id); if (!x) return; finGrava(() => SB.fin('fin_recategorizar', { p_id: x.id, p_categoria: null }), (r) => `De volta para a automática: ${esc(r.cat)}.`).then((ok) => { if (ok) TX = null; }); },
  manNovo: () => { if (podeCat()) manSheet(null); },
  manEditar: (id) => manSheet(id),
  manSalvar: () => manSalvar(),
  manApagar: (id) => { const x = txById(id); if (!x) return; if (!confirm(`Apagar “${x.desc}” de ${brl(Math.abs(x.v))}?`)) return; finGrava(() => SB.fin('fin_manual_apagar', { p_id: id }), () => 'Lançamento apagado.').then((ok) => { if (ok) TX = null; }); },
  lfF: (k) => { const nav = k.endsWith('!'); LF = { ...LF, f: k.replace('!', ''), n: 60, ...(nav ? { q: '', mes: '', cat: '' } : {}) }; if (nav) navFromSheet('#/dinheiro/lancamentos'); else render(true, `[data-act="lfF"][data-arg="${k}"]`); },
  lfCat: (c) => { LF = { ...LF, cat: c || '', n: 60 }; render(true, '#lfq'); },
  lfMais: () => { LF.n += 60; document.getElementById('lflist').innerHTML = lfLista(); },
  verGrupo: (g) => { LF = { q: '', f: 'todos', mes: '', cat: g, n: 60 }; go('#/dinheiro/lancamentos'); },
  pcCat: (n) => pcSheet(n),
  pcNova: () => pcSheet(null),
  pcVer: (n) => { LF = { q: '', f: 'todos', mes: '', cat: n, n: 60 }; navFromSheet('#/dinheiro/lancamentos'); },
  pcSalvar: (antigo) => {
    const nome = document.getElementById('pc-nome').value.trim(), tipo = sheetRoot.querySelector('[aria-labelledby="pc-tipo"] [aria-checked="true"]')?.dataset.val || null;
    if (!nome) { toast(FINMSG.nome_invalido, 'warn'); document.getElementById('pc-nome').focus(); return; }
    finGrava(() => SB.fin('fin_categoria_salvar', { p_antigo: antigo || null, p_nome: nome, p_tipo: tipo }),
      (r) => (!antigo ? `Categoria ${esc(r.nome)} criada.` : r.juntou ? `${esc(antigo)} juntou com ${esc(r.nome)}.` : r.nome !== antigo ? `Agora é ${esc(r.nome)}, com os lançamentos e as regras.` : `${esc(r.nome)}: ${TIPOS[r.tipo].toLowerCase()}.`));
  },
  pcJuntar: (antigo) => {
    const alvo = document.getElementById('pc-junta').value;
    if (!alvo) { toast('Escolha a categoria que fica.', 'warn'); document.getElementById('pc-junta').focus(); return; }
    if (!confirm(`Juntar ${antigo} com ${alvo}? Os lançamentos e as regras de ${antigo} passam para ${alvo}, e ${antigo} sai do plano.`)) return;
    finGrava(() => SB.fin('fin_categoria_salvar', { p_antigo: antigo, p_nome: alvo, p_tipo: null }), (r) => `${esc(antigo)} juntou com ${esc(r.nome)}.`);
  },
  pcApagar: (n) => finGrava(() => SB.fin('fin_categoria_apagar', { p_nome: n }), () => `${esc(n)} saiu do plano.`),
  regraApagar: (id) => {
    const r = (D.REAL.regras || []).find((x) => String(x.id) === String(id)); if (!r) return;
    if (!confirm(`Apagar a regra “${regraTexto(r.p)}” → ${r.c}? Os lançamentos voltam para a categoria automática (os escolhidos por você ficam).`)) return;
    finGrava(() => SB.fin('fin_regra_apagar', { p_id: Number(id) }), () => 'Regra apagada.');
  },
  qa: (a) => { if (a.startsWith('nav:')) navFromSheet('#/' + a.slice(4)); else if (a === 'openCheckin') A.openCheckin(); else if (a === 'expense') expenseSheet(); else if (a === 'task') { S.agView = 'hoje'; navFromSheet('#/agenda'); setTimeout(() => document.getElementById('inbox')?.focus(), 80); } },
  saveExpense: () => {
    const el = document.getElementById('ex-v'); const v = parseMoney(el.value);
    if (!(v > 0 && v < 100000)) { toast('Digite o valor, por exemplo 45,90'); el.focus(); return; }
    const pick = (id) => sheetRoot.querySelector(`[aria-labelledby="${id}"] [aria-checked="true"]`)?.dataset.val;
    const outra = document.getElementById('ex-cat-outra')?.value;
    const x = { id: newId('x'), v: Math.round(v * 100) / 100, cat: outra || pick('ex-cat') || expenseCats().top[0] || 'Mercado', met: pick('ex-met') || (semCartao() ? 'Pix' : CARD), d: D.iso(diaNow()), t: new Date().toISOString() };
    x.ja = sameDebits(x.v, x.d); // lançamentos do mesmo valor que já estavam no extrato não são este gasto
    if (x.met === CARD) x.fat = S.paid.fatura ? 'proxima' : 'aberta'; // fatura já paga: o gasto novo vai para a próxima
    S.expenses.push(x); S.draftExpense = ''; touch(); closeSheet(true);
    // Dinheiro vivo não aparece em extrato nenhum: vira lançamento à mão no Supabase, para ficar nos gastos do mês.
    if (x.met === 'Dinheiro' && podeCat() && planoCats().some((c) => c.n === x.cat)) {
      SB.fin('fin_manual_salvar', { p_id: null, p_data: x.d, p_desc: `Gasto rápido: ${x.cat}`, p_valor: -x.v, p_categoria: x.cat, p_conta: 'Dinheiro' })
        .then((mid) => { const y = S.expenses.find((e) => e.id === x.id); if (y) { y.mid = mid; touch(); } else SB.fin('fin_manual_apagar', { p_id: mid }).catch(() => {}); finRecarregar(); })
        .catch((e) => toast(`O gasto ficou neste aparelho, mas não entrou nos lançamentos: ${esc(plain(finMsg(e)))}`, 'warn', 6000));
    }
    toast(`${I('check', 18)} <span>${brl(x.v)} em ${esc(x.cat.toLowerCase())}.${D.REAL ? ` Livre: ${brl0(money().livre)}.` : ''}</span><button class="link" data-act="delExpense" data-arg="${x.id}">Desfazer</button>`, '', 6000);
    render(true);
  },
  delExpense: (id, el) => {
    const i = S.expenses.findIndex((x) => x.id === id); if (i < 0) return;
    const fromToast = !!el?.closest('.toast');
    const y = S.expenses[i];
    if (y.met === CARD && (y.fat || 'aberta') === 'aberta' && S.paid.fatura) { toast('Esse gasto está na fatura que você já marcou como paga. Para apagar, desfaça o pagamento da fatura primeiro.', '', 4200); return; }
    const [x] = S.expenses.splice(i, 1); touch();
    if (x.mid) SB.fin('fin_manual_apagar', { p_id: x.mid }).then(() => finRecarregar()).catch(() => toast('O gasto saiu daqui, mas o lançamento em dinheiro continua no Supabase. Apague em Lançamentos.', 'warn', 6000));
    if (fromToast) el.closest('.toast').remove();
    toast(`${I('refresh', 18)} Gasto de ${brl(x.v)} apagado.${D.REAL ? ` Livre: ${brl0(money().livre)}.` : ''}`);
    render(true);
    if (fromToast) restFocus();
  },
  reload: () => location.reload(),
  updClose: () => { document.getElementById('upd')?.remove(); app.classList.remove('has-upd'); fitRestbar(); restFocus(); },
  voltar: (r, el, e) => { e?.preventDefault(); if (navStack[hIdx - 1]) history.back(); else go('#/' + r, true); },
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
  const opts = { body: 'Notificação de teste do Painel. Os lembretes automáticos ainda não existem.', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'teste' };
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) await reg.showNotification('Painel', opts); else new Notification('Painel', opts); toast(`${I('bell', 18)} Notificação enviada`); } catch { toast('Não foi possível mostrar a notificação aqui.'); }
}

function parseInbox(txt) {
  // Limites de palavra que entendem acentos (o \b do JavaScript não entende "amanhã" ou "às").
  const W = (src) => new RegExp(`(?<![\\p{L}\\d])(?:${src})(?![\\p{L}\\d])`, 'iu');
  const chips = []; let t = txt; let amount = null; let date = null;
  const take = (m) => { t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length); };
  const am = t.match(/R\$\s?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i);
  if (am) { amount = parseFloat(am[1].replace(/\./g, '').replace(',', '.')); chips.push({ t: brl(amount), k: 'money' }); take(am); }
  const tags = [...t.matchAll(/#([\p{L}\d_]+)/gu)];
  tags.forEach((m) => chips.push({ t: '#' + m[1], k: 'tag' }));
  tags.reverse().forEach(take); // de trás para a frente, para as posições valerem
  const pr = t.match(/!([1-3])/); if (pr) { chips.push({ t: `prioridade ${pr[1]}`, k: 'pr' }); take(pr); }
  const now = diaNow();
  // "todo dia 10", "toda segunda": tarefas que se repetem ainda não existem, então vale só a próxima data.
  const rec = t.match(/(?<![\p{L}\d])tod[oa]s?\s+(?:as\s+|os\s+)?(?=dia\s+\d|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)/iu);
  if (rec) take(rec);
  const dm = t.match(W('hoje|depois de amanh[ãa]|amanh[ãa]'));
  const dmy = t.match(W('(\\d{1,2})/(\\d{1,2})'));
  const dd = t.match(W('dia\\s+(\\d{1,2})'));
  const dw = t.match(W('(domingo|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado)s?(?:-feira)?'));
  const days = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const noMes = (y, m, d) => new Date(y, m, Math.min(d, new Date(y, m + 1, 0).getDate())); // dia 31 em abril → 30/04
  const dmyOk = dmy && +dmy[1] >= 1 && +dmy[1] <= 31 && +dmy[2] >= 1 && +dmy[2] <= 12, ddOk = dd && +dd[1] >= 1 && +dd[1] <= 31;
  if (dm) { const w = dm[0].toLowerCase(); date = D.addDays(now, w === 'hoje' ? 0 : w.startsWith('depois') ? 2 : 1); take(dm); }
  else if (dmyOk) { date = noMes(now.getFullYear(), +dmy[2] - 1, +dmy[1]); if (date < D.startOfDay(now)) date = noMes(now.getFullYear() + 1, +dmy[2] - 1, +dmy[1]); take(dmy); }
  else if (ddOk) { date = noMes(now.getFullYear(), now.getMonth(), +dd[1]); if (date < D.startOfDay(now)) date = noMes(now.getFullYear(), now.getMonth() + 1, +dd[1]); take(dd); }
  else if (dw) { const name = dw[1].toLowerCase().replace('terca', 'terça').replace('sabado', 'sábado'); let k = (days.indexOf(name) - now.getDay() + 7) % 7; if (k === 0) k = 7; date = D.addDays(now, k); take(dw); }
  if (date) chips.unshift({ t: `${D.diffDays(date, now) <= 1 ? cap(rel(date)) : wd(date)}, ${dShort(date)}`, k: 'date' });
  const tm = t.match(W('(?:às|as)\\s+(\\d{1,2})(?:[:h](\\d{2}))?h?|(\\d{1,2})[:h](\\d{2})|(\\d{1,2})h'));
  if (tm) { const hh = tm[1] || tm[3] || tm[5], mm = tm[2] || tm[4] || '00'; if (+hh < 24 && +mm < 60) { chips.splice(date ? 1 : 0, 0, { t: `${hh.padStart(2, '0')}:${mm}`, k: 'time' }); take(tm); } }
  const title = t.replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
  return { title: title ? cap(title) : '', chips, amount, date };
}

// ---------- Entradas ----------
let parseT = null;
const setVal = (el) => { const k = el.dataset.arg, st = S.sets[k] || {}; if (el.dataset.in === 'setkg') st.kg = parseFloat(el.value.replace(',', '.')) || 0; else st.reps = parseInt(el.value, 10) || 0; S.sets[k] = st; save(); };
document.addEventListener('input', (e) => {
  if (e.target.id === 'ex-v') { S.draftExpense = e.target.value; save(); }
  const el = e.target.closest('[data-in]'); if (!el) return;
  if (el.dataset.in === 'sbcode') { LG.code = el.value; return; }
  if (el.dataset.in === 'sbemail') { LG.email = el.value; return; }
  if (el.dataset.in === 'nome') { S.nome = el.value.trim().slice(0, 30); save(); return; }
  if (el.dataset.in === 'weight') { pesoRasc = el.value; return; }
  if (el.dataset.in === 'setkg' || el.dataset.in === 'setreps') setVal(el);
  if (el.dataset.in === 'fsq' && FS) { FS.q = el.value; FS.off = null; fsUpd(); return; }
  if (el.dataset.in === 'fsqt' && FS?.sel) { document.getElementById('fs-prev').innerHTML = fsPrev(FS.sel, el.value); return; }
  if (el.dataset.in === 'fiq') {
    const f = itensDe(S.refEd), j = +el.dataset.arg, it = f && f[j], v = numBr(el.value); if (!it || !(v >= 0) || v > 5000) return;
    if (it.pl) it.x = Math.round(v * 100) / 100; else it.q = Math.round(v * 10) / 10;
    combMeals(); save();
    const m = document.getElementById(`fi-m-${j}`); if (m) m.textContent = fiMeta(it);
    const t = document.getElementById('rf-tot'); if (t) t.innerHTML = rfTotais(f, planoHoje().find((x) => x.id === S.refEd));
    return;
  }
  if (el.dataset.in === 'rfnome' || el.dataset.in === 'rfhora') {
    const v = S.meals[S.refEd]; if (!S.refEd || !S.refEd.startsWith(K_X) || !mVal(v) || v === true) return;
    if (el.dataset.in === 'rfnome') { const n = el.value.trim().replace(/\s+/g, ' ').slice(0, 40); if (n) v.n = n; } else v.h = /^\d\d:\d\d$/.test(el.value) ? el.value : '';
    save(); return;
  }
  if (el.dataset.in === 'pkq' && PK) { PK.q = el.value; document.getElementById('pk-res').innerHTML = pkRes(); return; }
  if (el.dataset.in === 'exq') { exBusca = el.value; document.getElementById('exlist').innerHTML = exLista(); return; }
  if (el.dataset.in === 'lfq') { LF.q = el.value; LF.n = 60; document.getElementById('lflist').innerHTML = lfLista(); return; }
  if (el.dataset.in === 'pcq') { PCq = el.value; document.getElementById('pclist').innerHTML = pcLista(); return; }
  if (el.dataset.in === 'txq' && TX) { TX.q = el.value; const x = txById(TX.id); document.getElementById('tx-cats').innerHTML = catOpcoes(TX.q, x && x.cat, 'txCat'); return; }
  if (el.dataset.in === 'txtxt' && TX) { TX.txt = el.value; txPrevBusca(); return; }
  if (el.dataset.in === 'edp') { const sel = S.edAlvo, b = fichaList(sel, plan()).base, j = +el.dataset.arg; if (b[j]) { b[j].p = el.value; if (setBase(sel, b)) save(); } return; }
  if (el.dataset.in === 'tnome' && isP(S.edAlvo)) { const t = treinoP(S.edAlvo.slice(2)), n = el.value.trim().slice(0, 40); if (t && n) { putT({ ...t, nome: n }); save(); } return; }
  if (el.dataset.in === 'inbox') {
    S.inboxDraft = el.value; save();
    const p = parseInbox(el.value); document.getElementById('parse').innerHTML = el.value.trim() ? [`<span class="chip p">${esc(p.title || '…')}</span>`, ...p.chips.map((c) => `<span class="chip">${esc(c.t)}</span>`)].join('') : '';
    clearTimeout(parseT); if (el.value.trim() && p.chips.length) parseT = setTimeout(() => announce(`Entendido: ${[p.title, ...p.chips.map((c) => c.t)].filter(Boolean).join(', ')}`), 1200);
  }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-in]'); if (!el) return;
  if (el.dataset.in === 'setkg' || el.dataset.in === 'setreps') setVal(el);
  if (el.dataset.in === 'realfile' && el.files?.length) { loadRealFile(el.files[0]); el.value = ''; }
  if (el.dataset.in === 'lfmes') { LF.mes = el.value; LF.n = 60; document.getElementById('lflist').innerHTML = lfLista(); }
  if (el.dataset.in === 'excat') { if (el.value) sheetRoot.querySelectorAll('[aria-labelledby="ex-cat"] [role="radio"]').forEach((b) => { b.setAttribute('aria-checked', 'false'); }); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'inbox') { e.preventDefault(); A.addInbox(); } });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !FS) return;
  if (e.target.id === 'fs-q') { e.preventDefault(); if (FS.list.length === 1) A.fsPick('0'); else if (!FS.list.length || AL.ehCodigo(FS.q.trim())) A.fsOff(); else e.target.blur(); }
  else if (e.target.id === 'fs-qt') { e.preventDefault(); A.fsOk(); }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  if (f.querySelector('[type="submit"][aria-disabled="true"]')) return;
  if (f.dataset.form === 'sbSend') sbSend(f.elements.email.value);
  if (f.dataset.form === 'sbVerify') sbVerify(f.elements.code.value);
});
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
  if (t.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; } // ocupado: o botão só guarda o foco
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
const VERSION = '0.9.0';
function current() { const h = location.hash.replace(/^#\/?/, ''); return ROUTES[h] ? h : 'hoje'; }
const TOP = ['hoje', 'saude', 'dinheiro', 'agenda', 'ficha'];
const TITLES = { onboarding: 'Boas-vindas', hoje: 'Hoje', saude: 'Saúde', 'saude/treino': 'Treino', 'saude/treino-editar': 'Editar treino', 'saude/exercicios': 'Exercícios', 'saude/campanha': 'Plano', 'saude/dieta': 'Dieta', 'saude/refeicao': 'Refeição', 'saude/exames': 'Exames', dinheiro: 'Dinheiro', 'dinheiro/contas': 'Contas', 'dinheiro/cartoes': 'Cartões', 'dinheiro/patrimonio': 'Patrimônio', 'dinheiro/importar': 'Open Finance e arquivo', 'dinheiro/sincronizar': 'Sincronizar', 'dinheiro/lancamentos': 'Lançamentos', 'dinheiro/categorias': 'Plano de contas', agenda: 'Agenda', ficha: 'Ficha', ajustes: 'Ajustes' };
let lastRoute = null, curTab = 'hoje', shownIdx = null;
function render(keep, focusSel) {
  if (syncBusy) busyShown = true; // a tela mostra "Buscando…": no fim da leitura ela é desenhada de novo
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
  }
  let scr;
  try { scr = ROUTES[r](); } catch (err) {
    console.error(err);
    scr = { title: 'Erro', html: `${hdr('Algo deu errado')}<div class="card"><p class="lead">Esta tela não abriu com o que está salvo neste aparelho.</p><p class="small muted" style="margin-top:8px">${nvEntrou() ? 'Recomeçar apaga o progresso (XP, check-ins, marcações) aqui e na nuvem.' : 'Recomeçar apaga só o progresso guardado aqui (XP, check-ins, marcações).'} Dinheiro e saúde do Supabase voltam na próxima sincronização.</p><button class="btn block" style="margin-top:12px" data-act="resetLocal">${nvEntrou() ? 'Recomeçar do zero' : 'Recomeçar neste aparelho'}</button></div>` };
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
// Navegação lateral (tela larga): as mesmas telas das abas, com as subtelas à vista.
function renderChrome() {
  const r = current();
  const side = document.querySelector('.side');
  if (!side) return;
  const sfk = side.contains(document.activeElement) ? focusKey(document.activeElement) : null;
  side.innerHTML = `<div class="brand"><img src="icons/icon-192.png" alt="">Painel</div>
    ${NAV.map(([g, items]) => `<h2>${g}</h2><nav aria-label="${g}">${items.map(([k, l, ic]) => `<a href="#/${k}" ${k === r ? 'aria-current="page"' : ''}>${I(ic, 18)}${l}</a>`).join('')}</nav>`).join('')}`;
  if (sfk) side.querySelector(sfk)?.focus({ preventScroll: true });
}
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
  // Contagem até poder pedir outro código (o Supabase recusa antes de 60 s).
  const rs = document.getElementById('sb-resend');
  if (rs && !LG.busy) { const w = resendWait(), off = !navigator.onLine, t = w ? `Mandar outro em ${Math.ceil(w / 1000)} s` : 'Mandar outro'; rs.disabled = !!w || off; if (rs.textContent !== t) rs.textContent = t; }
}, 500);

window.addEventListener('online', () => { render(true); nvPuxar(0); if (SB.session() && staleSync()) syncNow(false); });
window.addEventListener('offline', () => { render(true); });
// Troca só um pedaço da tela (sem perder o que está sendo digitado em outro campo).
function swapPart(sel) {
  let scr; try { scr = ROUTES[current()](); } catch { return; }
  const t = document.createElement('template'); t.innerHTML = scr.html;
  const n = t.content.querySelector(sel), o = main.querySelector(sel);
  if (!n || !o) { render(true); return; }
  const had = o.contains(document.activeElement);
  o.replaceWith(n); fitRestbar();
  if (had) (n.matches('button, a[href]') ? n : n.querySelector('button, a[href]'))?.focus({ preventScroll: true });
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
  if (document.visibilityState !== 'visible') { NV?.enviarJa(); return; } // o iPhone pode fechar o app logo depois
  if (!checkDay()) nvPuxar(5000);
  keepAwake();
  if (AT.pend && Date.now() - AT.pend < 5 * 60000 && SB.session()) { AT.pend = 0; syncNow(false); setTimeout(() => syncNow(false), 8000); return; }
  if (SB.session() && staleSync()) syncNow(false);
  try { (await navigator.serviceWorker?.getRegistration())?.update(); } catch { /* offline */ }
});
window.addEventListener('pageshow', (e) => { if (e.persisted && !checkDay()) nvPuxar(5000); });
window.addEventListener('pagehide', () => { NV?.enviarJa(); });
// A cada minuto: o dia virou? Com a tela aberta, o outro aparelho mudou algo?
setInterval(() => { if (!checkDay() && document.visibilityState === 'visible') nvPuxar(55000); }, 60000);
document.getElementById('fab').addEventListener('click', quickAdd);
document.querySelector('.tabbar').addEventListener('click', (e) => {
  const a = e.target.closest('a.tab'); if (!a) return; e.preventDefault();
  const href = a.getAttribute('href'), r = href.replace(/^#\/?/, '');
  if (current() === r) { main.scrollTo({ top: 0 }); return; }
  go(href, true); // troca de aba não empilha histórico; de uma subtela para a aba dela, volta
});

applyTheme();
const STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// No iPhone o app instalado tem armazenamento próprio: a primeira abertura pelo ícone começa as boas-vindas lá.
if (!S.onboarded && (!location.hash || STANDALONE)) go('#/onboarding', true);
// Voltou do app de e-mail com um código pedido há pouco: abre direto na etapa do código.
else if (!hashLogin && !SB.session() && SB.pending() && current() === 'hoje') go('#/dinheiro/sincronizar', true);
if (pruneReal()) save();
render(false);
renderChrome();
if (!checkDay()) nvPuxar(0); // com a nuvem e o dia velho, checkDay lê a nuvem antes de virar
if (hashLogin && hashLogin !== 'ok') {
  // Com sessão, o aviso não cabe no formulário de login (que não aparece): vai num aviso passageiro.
  if (SB.session()) toast(hashLogin === 'ja_conectado' ? esc(SBMSG.ja_conectado) : 'Esse link do e-mail já não valia, mas este aparelho continua conectado.', 'warn', 7000);
  else { LG.msg = sbMsg({ code: hashLogin }); LG.step = SB.pending() ? 'code' : 'email'; render(true); announce(plain(LG.msg)); }
}
try {
  const saiu = sessionStorage.getItem('painel-saiu');
  if (saiu) {
    const nuv = sessionStorage.getItem('painel-saiu-nuvem') ? ' Seus registros continuam na nuvem.' : '';
    sessionStorage.removeItem('painel-saiu'); sessionStorage.removeItem('painel-saiu-nuvem');
    toast((saiu === '1' ? 'Saiu deste aparelho. A sessão e os dados daqui foram apagados.' : saiu === 'sem-rede' ? 'Saiu e apagou os dados deste aparelho. Sem internet, a sessão não foi encerrada no Supabase.' : 'Saiu e apagou os dados deste aparelho. O Supabase não confirmou o fim da sessão lá.') + nuv, saiu === '1' ? '' : 'warn', 6000);
  }
} catch { /* sem sessão da aba */ }
if (SB.session() && (hashLogin === 'ok' || staleSync())) syncNow(false).then((ok) => { if (ok && hashLogin === 'ok') toast(`${I('cloudCheck', 18)} Entrou. Seus dados de dinheiro e saúde estão no Painel.`, '', 5000); });
// Outra aba, ou o app instalado e o navegador no Android, mexeram na sessão ou nos dados.
SB.onChange((what) => {
  // Saiu ou entrou outra conta: a tela, os dados e as marcações desta aba não valem mais.
  if (what === 'saiu' || what === 'entrou') { location.reload(); return; }
  render(true);
});
window.addEventListener('storage', (e) => {
  // Outra aba gravou o estado (contas pagas, gastos, missões): esta passa a usar o mesmo, em vez de gravar o antigo por cima.
  if (e.key === KEY && e.newValue) { S = load(); render(true); return; }
  if (e.key === SAUDEK) {
    if (!e.newValue) { location.reload(); return; }
    try { const H = JSON.parse(e.newValue); D.useSaude(H); saudeRaw = H; saudeErr = null; render(true); } catch { /* fica com o que já está na tela */ }
    return;
  }
  if (e.key !== REALK) return;
  if (!e.newValue) { location.reload(); return; } // dados apagados em outra aba (saída ou "apagar deste aparelho")
  // Quem gravou os dados já ajustou e gravou o estado; aqui só na memória, até o estado dela chegar.
  try { D.useReal(JSON.parse(e.newValue)); realErr = null; pruneReal(); render(true); } catch { /* fica com o que já está na tela */ }
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const hadController = !!navigator.serviceWorker.controller;
  // O app termina de abrir depois do evento load (espera o sync.js): registra na hora se ele já passou.
  const reg = () => navigator.serviceWorker.register('sw.js').catch(() => {});
  if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg, { once: true });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showUpdate(); });
}
