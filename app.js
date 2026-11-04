// Painel. JavaScript puro, sem dependências, roteamento por hash.
// Só dados seus: dinheiro do Open Finance (Supabase) ou do arquivo do Painel, saúde do Supabase (saude_painel) e o que
// você registra aqui. A cópia fica só neste navegador; o repositório não guarda dado pessoal nenhum.
import { I } from './icons.js';
import * as D from './data.js';
// Se o aparelho ainda guarda só os arquivos de uma versão sem o sync.js (sem internet, antes da atualização
// terminar), o app abre sem o login em vez de ficar em branco.
const sbOff = async () => { const e = new Error('offline'); e.code = 'offline'; throw e; };
const SB_OFF = { consumeHash: () => null, session: () => null, email: () => null, pending: () => null, clearPending() {}, currentEpoch: () => 0, onChange() {}, sendCode: sbOff, verifyCode: sbOff, fetchPainel: sbOff, fetchSaude: sbOff, signOut: async () => 'ok' };
// Antes da espera abaixo: o navegador pode oferecer a instalação enquanto o sync.js ainda chega.
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; try { if (current() === 'onboarding') render(true); } catch { /* ainda abrindo */ } });
const SB = await import('./sync.js').catch(() => SB_OFF);

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
function defaults() {
  return {
    v: 2, xp: 0, since: null, nome: '', onboarded: false, onbStep: 0, theme: 'system',
    day: null, checkin: null, quests: { corpo: false, comb: false, missao: false }, perfect: false, closed: false,
    sets: {}, meals: {}, wSel: null, wStart: null, rest: null,
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
function logHoje(s) {
  const e = {};
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
  const e = logHoje(s); if (e) s.dias[s.day] = e;
  for (let i = 1; i < gap; i++) { const d = D.iso(D.addDays(prev, i)); if (!(d in s.hist)) s.hist[d] = s.pausa ? 'p' : 0; }
  for (let i = 0; i < gap; i++) {
    const d = D.iso(D.addDays(prev, i)), v = s.hist[d];
    if (v === 1) { s.streak += 1; s.best = Math.max(s.best, s.streak); }
    else if (v === 'p') { /* pausa congela a Chama */ }
    else if (s.streak > 0 && (!s.brasaAt || D.diffDays(dayAt(d), dayAt(s.brasaAt)) >= 7)) s.brasaAt = d; // 1 falta livre a cada 7 dias
    else s.streak = 0; // a Chama recomeça (sem Chama acesa, a brasa fica guardada); XP nunca cai
  }
  s.best = Math.max(s.best, s.streak);
  Object.keys(s.hist).forEach((d) => { if (D.diffDays(dayAt(today), dayAt(d)) > 60) delete s.hist[d]; });
  Object.keys(s.dias).forEach((d) => { if (D.diffDays(dayAt(today), dayAt(d)) > 400) delete s.dias[d]; });
  Object.keys(s.semXp).forEach((d) => { if (D.diffDays(dayAt(today), dayAt(d)) > 60) delete s.semXp[d]; });
  s.inbox = s.inbox.filter((x) => !x.done); // tarefas concluídas saem na virada
  Object.assign(s, { checkin: null, sleep: null, quests: { corpo: false, comb: false, missao: false }, perfect: false, closed: false, sets: {}, meals: {}, wStart: null, rest: null, dayType: null, wSel: null, missaoRef: null, corpoKey: null, corpoMin: 0, combByMeals: false, mealXp: {}, inboxXp: 0, prToday: false, qxp: {} });
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
  if (out.wSel && !['A', 'B', 'C', 'Z2', 'REST'].includes(out.wSel)) out.wSel = null;
  if (out.rest && !(out.rest.end > 0)) out.rest = null;
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
  s.inbox.forEach((x, i) => { if (!x.id) x.id = `n${i}${Date.now().toString(36)}`; });
  const rolled = !!s.day && s.day !== today;
  if (rolled) rollover(s, today);
  s.day = today;
  bossMonth(s);
  s.expenses.forEach((x, i) => { if (x && !x.id) x.id = `x${i}${Date.now().toString(36)}`; });
  if (rolled || mig || fresh) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); if (mig) localStorage.removeItem(OLDKEY); } catch { /* modo privado */ }
  }
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
// O app instalado no iPhone volta da memória sem recarregar: confere a virada do dia ao voltar.
function checkDay() {
  const t = D.iso(diaNow()); if (S.day === t) return false;
  rollover(S, t); S.day = t; bossMonth(S); pruneReal(); save(); setTimeout(checkBoss, 1200); closeSheet(true, false); toast(`${I('sun', 18)} Novo dia. Missões zeradas.`); render(false); return true;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* modo privado: segue sem salvar */ } }
const touch = save;

// ---------- Regras do jogo ----------
const xpToNext = (L) => Math.round((70 * L ** 1.45) / 10) * 10;
function lvl(xp) { if (!Number.isFinite(xp) || xp < 0) xp = 0; let L = 1, acc = 0; for (;;) { const need = xpToNext(L); if (xp < acc + need) return { L, into: xp - acc, need }; acc += need; L++; } }
const titleFor = (L) => (L >= 30 ? 'Lenda' : L >= 25 ? 'Mestre' : L >= 20 ? 'Elite' : L >= 15 ? 'Veterano' : L >= 10 ? 'Combatente' : L >= 5 ? 'Aspirante' : 'Recruta');
const rank = (v) => (v == null ? '—' : v >= 90 ? 'S' : v >= 75 ? 'A' : v >= 60 ? 'B' : v >= 40 ? 'C' : v >= 20 ? 'D' : 'E');
const SLEEP = [['<5', 4.5], ['5', 5], ['6', 6], ['7', 7], ['8', 8], ['9+', 9]];
// Zona do dia pelas horas de sono do check-in: 7 h ou mais, treino completo; de 6 a 7 h, uma série a menos; menos de
// 6 h, só caminhada leve ou mobilidade. Sem check-in, sem zona. VFC e FC de repouso entram com o Apple Health.
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
      if (hit) { const k = K.get(hit); usados.add(k); S.txUsados.push(k); return false; }
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
function logDia(d) { const loc = d === S.day ? logHoje(S) : S.dias[d] || null; const n = notionDia(d); return loc && n ? { ...n, ...loc } : loc || n; }
// Primeiro dia com registro: o dia em que o app começou a contar, ou o primeiro do diário do Supabase, se for antes.
function inicio() { const c = [S.since, ...((D.SAUDE && D.SAUDE.diario) || []).map((x) => x.d)].filter(isoOk).sort()[0]; return c ? D.startOfDay(dayAt(c)) : D.startOfDay(diaNow()); }
const FORCA = new Set(['A', 'B', 'C']);

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
    if (e.k === 'Z2') { sess++; cardio++; z2 += e.z || 0; } else if (FORCA.has(e.k)) { sess++; forca++; } else if (e.k === 'LIVRE') sess++;
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
    const forca = A28.filter((e) => e && FORCA.has(e.k)).length, z2 = A28.reduce((a, e) => a + (e && e.k === 'Z2' ? e.z || 0 : 0), 0);
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
  const forca = dias.filter((e) => FORCA.has(e.k)).length, sk = Math.max(S.best, streakNow());
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
  return `<div class="netbar" role="status">${I('wifiOff', 20)}<span>Sem internet. O que você registrar fica salvo neste aparelho; dinheiro e saúde ficam com a última leitura.</span></div>`;
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

  // Linha do dia: o que já existe no Painel (agenda do Google ou da Apple ainda não conectada)
  const meals = D.SAUDE ? D.refeicoes(tk) : [];
  const slots = [
    { h: 'Hoje', t: corpo.t, c: 'var(--a-for)' },
    ...(mbill && !mbill.pago ? [{ h: 'Hoje', t: miss.t, c: 'var(--danger)' }] : []),
    ...top3().filter((x) => !x.done).map((x) => ({ h: hm(x.hora) || 'Top 3', t: x.t, c: 'var(--a-foc)' })),
    ...S.inbox.filter((x) => x.quando === S.day && x.top !== S.day && !x.done).map((x) => ({ h: hm(x.hora) || 'Hoje', t: x.t, c: 'var(--info)' })),
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
  const w = S.checkin ? S.checkin.w : null, s = S.checkin ? S.checkin.s : S.sleep, lw = lastWeight();
  return `<div class="ci-label">Peso <span class="src">${lw ? `último: ${n1(lw.v)} kg em ${dQuando(lw.d)}` : 'opcional'}</span></div>
    <div class="stepper"><button type="button" data-act="wstep" data-arg="-0.1" aria-label="Diminuir 100 gramas">${I('minus')}</button>
      <input id="ci-w" type="text" inputmode="decimal" value="${w != null ? n1(w) : ''}" placeholder="${lw ? n1(lw.v) : '—'}" aria-label="Peso em quilos, vazio se não se pesou" data-in="weight"><span class="u">kg</span>
      <button type="button" data-act="wstep" data-arg="0.1" aria-label="Aumentar 100 gramas">${I('plus')}</button></div>
    <div class="ci-label" id="sl-l">Sono, em horas <span class="src">Apple Health não conectado</span></div>
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
      ${sec('Peso', H ? '<a href="#/saude/exames">Medidas</a>' : '')}${peso}
      ${sec('Sono · 7 dias')}${sono}
      ${H ? planos : `${sec('Plano')}${semSaude()}`}
      <p class="small muted" style="margin:14px 20px">${I('note', 16, 'style="display:inline;vertical-align:-3px"')} ${H && H.fonte ? `${esc(H.fonte)}. ` : ''}Apple Health ainda não conectado: o sono vem do check-in.</p>`,
  };
}

// Ficha do dia (ou da sessão escolhida) já convertida em exercícios com séries e faixa de repetições.
function fichaList(sel, p) {
  const ss = sessOf(p, sel), f = ss.ficha, q = { ...p, tipo: sel };
  return { ss, f, q, list: f && FORCA.has(sel) ? (f.exercicios || []).filter((e) => e && e.nome).map((e) => D.exercicio(e, q)) : [] };
}
const nSeries = (ex, cut) => (cut && ex.series > 1 ? ex.series - 1 : ex.series);
const setKey = (sel, j, ex, i) => `${sel}-${j}-${ex.id}-${i}`;
function Treino() {
  const tp = todaySession(), today = tp.key, p = tp.p, H = D.SAUDE;
  const sel = S.wSel || (today === 'LIVRE' ? 'A' : today);
  const Z = zoneNow(), isToday = sel === today, xpHoje = QXP().corpo;
  const xpNote = S.quests.corpo ? 'O XP de treino de hoje já foi ganho.' : isToday || today === 'LIVRE' ? `Vale +${xpHoje} XP.` : `Reposição: vale os +${xpHoje} XP do plano de hoje, nunca mais que isso.`;
  const elapsed = S.wStart ? Math.floor((Date.now() - S.wStart) / 1000) : 0;
  if (!H || !H.fichas.length) {
    return { title: 'Treino', chrome: 'focus', html: `${backbar('saude', 'Saúde')}${hdr('Treino', 'Sem fichas neste aparelho')}${semSaude()}
      <div class="card"><h3>Treinou mesmo assim?</h3><p class="lead">Marque como feito: ${S.quests.corpo ? 'o XP de treino de hoje já foi ganho' : `vale +${xpHoje} XP`} e conta na semana.</p><div class="btnrow"><button class="btn" data-act="finishWorkout" data-arg="LIVRE">${I('check', 20)} Fiz um treino</button></div></div>` };
  }
  const ss = sessOf(p, sel);
  const seg = `<div class="seg" role="group" aria-label="Escolher sessão" style="margin:4px 16px 0">${['A', 'B', 'C', 'Z2'].map((k) => `<button aria-pressed="${sel === k}" data-act="wsel" data-arg="${k}">${k === 'Z2' ? 'Cardio' : 'Treino ' + k}</button>`).join('')}</div>`;
  const sub = [isToday ? 'Hoje' : today === 'LIVRE' ? 'Fora do plano' : 'Prévia', p.bloco ? `Bloco ${p.bloco.n}: ${esc(p.bloco.nome)}` : '', p.week ? `semana ${p.week}` : '', p.deload ? 'deload' : ''].filter(Boolean).join(' · ');
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
  const { f, list } = fichaList(sel, p);
  if (!f || !list.length) return { title: esc(ss.nome), chrome: 'focus', html: `${head}${empty('dumbbell', 'Sem ficha para esta sessão', 'A ficha deste bloco não veio do Supabase. Confira em Sincronizar.', '#/dinheiro/sincronizar', 'Sincronizar')}` };
  const rest = D.descanso(f), cut = Z === 'amarelo' || Z === 'vermelho';
  const cards = list.map((ex, j) => {
    const last = S.lastSets[ex.id], sg = D.suggestion(ex, last), n = nSeries(ex, cut);
    const rows = Array.from({ length: n }, (_, i) => {
      const k = setKey(sel, j, ex, i), st = S.sets[k] || {};
      const kg = st.kg ?? (sg ? sg.kg : last ? last.kg : ex.carga), reps = st.reps ?? (sg ? sg.reps : ex.rr ? ex.rr[0] : null);
      return `<tr><td>${i + 1}</td><td><input type="text" inputmode="decimal" value="${kg ? D.fmtKg(kg) : ''}" placeholder="kg" aria-label="${esc(ex.nome)}, série ${i + 1}, carga em kg" data-in="setkg" data-arg="${k}"></td><td><input type="text" inputmode="numeric" value="${reps || ''}" aria-label="${esc(ex.nome)}, série ${i + 1}, repetições" data-in="setreps" data-arg="${k}"></td><td><button class="ok" aria-pressed="${!!st.ok}" data-act="set" data-arg="${k}" data-rest="${rest}" aria-label="Concluir série ${i + 1} de ${esc(ex.nome)}">${I('check', 24)}</button></td></tr>`;
    }).join('');
    const tip = last ? `Última vez: <b class="num">${last.kg ? `${D.fmtKg(last.kg)} kg × ` : ''}${last.reps.join(', ')}</b>${isoOk(last.d) ? ` em ${dShort(dayAt(last.d))}` : ''}.${sg ? ` ${sg.txt}.` : ''}` : 'Primeira vez com este exercício: anote a carga que usar.';
    return `<section class="ex" aria-label="${esc(ex.nome)}"><div class="row-flex"><h3 class="grow">${esc(ex.nome)}</h3><span class="chip num">${esc(ex.alvo)}</span></div>
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
      ${cards}${orient}
      <div class="restbar">${restOn ? `<div class="grow"><div class="xs" style="opacity:.75">Descanso</div><div class="t" id="restT" role="timer" aria-label="Descanso restante">${fmtT(Math.ceil((S.rest.end - Date.now()) / 1000))}</div></div><button class="btn sm" data-act="skipRest">Pular</button>` : `<div class="grow"><div class="xs" style="opacity:.75">Séries</div><div class="t num">${done}/${total}</div></div><button class="btn go" data-act="finishWorkout" data-arg="${sel}">Concluir treino</button>`}</div>`,
  };
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

function Dieta() {
  const H = D.SAUDE;
  if (!H || !H.refeicoes.length) return { title: 'Dieta', html: `${backbar('saude', 'Saúde')}${hdr('Dieta de hoje')}${H ? empty('utensils', 'Sem plano alimentar ativo', 'Nenhuma refeição ativa veio do Supabase.') : semSaude()}` };
  const { key } = todaySession(), tk = S.dayType || D.tipoDia(key), meals = D.refeicoes(tk), pr = D.prot(), kc = D.kcalDia(tk);
  const got = meals.filter((m) => S.meals[m.id]), p = Math.round(got.reduce((a, m) => a + m.p, 0)), k = Math.round(got.reduce((a, m) => a + m.kcal, 0));
  const planP = Math.round(meals.reduce((a, m) => a + m.p, 0)), planK = Math.round(meals.reduce((a, m) => a + m.kcal, 0));
  const resto = planP - p, ver = (meals[0] && meals[0].versao) || '', agua = fin(Number(D.metas().agua)), metaP = pr ? pr.meta : planP;
  return {
    title: 'Dieta',
    html: `${backbar('saude', 'Saúde')}${hdr('Dieta de hoje', `Dia de ${D.DIAS[tk].toLowerCase()} · ${S.dayType ? 'escolhido por você' : 'pelo plano de treino'}`)}
      <div class="seg" role="group" aria-label="Tipo de dia" style="margin:4px 16px 0">${Object.entries(D.DIAS).map(([id, t]) => `<button aria-pressed="${tk === id}" data-act="daytype" data-arg="${id}">${t}</button>`).join('')}</div>
      <div class="card"><div class="grid3">
        <div><div class="small muted">Proteína</div><div class="mid">${p}<span class="small muted"> / ${metaP} g</span></div>${bar(metaP ? (p / metaP) * 100 : 0, 'var(--a-nut)')}</div>
        <div><div class="small muted">Calorias</div><div class="mid">${fmtInt(k)}</div><div class="small muted">de ${fmtInt(kc || planK)}</div></div>
        <div><div class="small muted">Combustível</div><div class="mid">${pr ? (p >= pr.conta ? 'ok' : `${pr.conta - p} g`) : '—'}</div><div class="small muted">${pr ? (p >= pr.conta ? 'missão feita' : 'para a missão contar') : 'sem meta'}</div></div>
      </div></div>
      ${sec('Refeições do plano', `<span class="small muted num">${fmtInt(planK)} kcal · ${planP} g</span>`)}
      <div class="card tight">${meals.length ? meals.map((m) => `<div class="quest ${S.meals[m.id] ? 'done' : ''}"><button class="qcheck" aria-pressed="${!!S.meals[m.id]}" data-act="meal" data-arg="${esc(m.id)}" aria-label="${esc(m.nome)}: ${S.meals[m.id] ? 'comida' : 'marcar como comida'}">${I('check', 28)}</button><div class="grow"><div class="k num">${esc(m.hora)}</div><div class="t">${esc(m.nome)}</div><div class="d">${txtBr(m.itens)} · <span class="num">${fmtInt(m.kcal)} kcal · ${fmtInt(m.p)} g</span></div></div></div>`).join('') : '<div class="empty"><p>Nenhuma refeição para este tipo de dia.</p></div>'}</div>
      ${pr && p < pr.conta && meals.length ? `<div class="card soft"><div class="row-flex">${I('sparkle', 20)}<b>Para a missão contar</b></div><p class="small" style="margin-top:4px">Faltam ${pr.conta - p} g. ${p + resto >= pr.conta ? `As refeições que faltam no plano somam ${resto} g: seguindo o plano, a missão conta.` : `Mesmo seguindo o plano, faltam ${pr.conta - p - resto} g para chegar a ${pr.conta} g.`}</p></div>` : ''}
      <p class="small muted" style="margin:14px 20px">${agua ? `Água: meta de ${n1(agua)} L por dia. ` : ''}Comer abaixo da faixa não dá XP: a meta é acertar o alvo, não comer menos.${ver ? ` ${esc(ver)}.` : ''}</p>`,
  };
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
      S.paid = {}; S.paidAmt = {}; S.paidAt = {}; S.card = 0; save();
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
      <div class="card">${C.map((c) => `<div style="margin:10px 0"><div class="row-flex small"><span class="grow">${esc(c.n)}</span><b class="num">${brl0(c.v)}</b><span class="muted num" style="width:72px;text-align:right">${c.v > c.avg * 1.1 ? `${I('up', 14, 'style="display:inline;vertical-align:-2px"')} ${Math.round((c.v / c.avg - 1) * 100)}%` : 'na média'}</span></div>${bar((c.v / top) * 100, c.v > c.avg * 1.1 ? 'var(--xp-fill)' : 'var(--primary)')}</div>`).join('')}
        ${C.length ? '' : '<div class="empty"><p>Ainda sem gastos no Open Finance.</p></div>'}
        <p class="small muted">Total ${brl0(tot)}${Math.abs(rest) >= 1 ? `, com ${rest > 0 ? '' : '−'}${brl0(Math.abs(rest))} de outras categorias e estornos` : ''}. Comparação com a média dos 6 meses anteriores. ${D.REAL.cartaoDetalhado ? 'As compras do cartão entram no mês em que a fatura vence.' : 'A fatura aparece numa linha só até as faturas do cartão chegarem.'}</p></div>
      ${exp}
      ${(D.REAL.pendentes || []).length ? `${sec('Para completar o painel')}<button class="card cardlink" data-act="pendentes"><span class="badge-ic">${I('target')}</span><div class="grow"><b>Faltam ${D.REAL.pendentes.length} itens</b><div class="small muted">${esc(D.REAL.pendentes.slice(0, 2).map((x) => x.n).join(', '))} e outros</div></div>${I('chevR', 24, 'class="ic chev"')}</button>` : ''}
      ${sec('Mais')}
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
      ${L.length ? `<div class="card tight">${L.map((x) => `<div class="row"><div class="grow"><div class="ttl ellip">${esc(x.desc || 'Lançamento')}</div><div class="meta">${dShort(new Date(x.d + 'T12:00'))} · ${esc(x.cat || '')}${x.fat ? ` · fatura de ${mon(new Date(x.fat + 'T12:00'))}` : ''}</div></div><div class="amt num">${x.v > 0 ? `+${brl(x.v)}` : brl(-x.v)}</div></div>`).join('')}</div>` : `<div class="card"><div class="empty"><span class="badge-ic">${I('file', 28)}</span><b>${usado || P.length ? 'Faltam as faturas' : 'Sem uso'}</b><p>${usado || P.length ? `${esc(k.faturas || '')}. Com elas o Painel separa mercado, restaurante, assinaturas e parcelas.` : `Nenhuma compra neste cartão. Limite livre de ${brl0(k.limite)}.`}</p>${usado || P.length ? '<a class="btn" href="#/dinheiro/importar">Como enviar</a>' : ''}</div></div>`}`,
  };
}

function Cartoes() {
  if (!D.REAL) return { title: 'Cartões e faturas', html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Cartões e faturas')}${semDinheiro()}` };
  return CartoesReal();
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
let syncBusy = false, syncErr = null, busyShown = false, leaving = false;
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
    if (novo) { S.paid = {}; S.paidAmt = {}; S.paidAt = {}; S.card = 0; }
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
function Sincronizar() {
  const s = SB.session(), R = fromSB() ? D.REAL : null, off = !navigator.onLine;
  // Erro ligado ao campo (aria-describedby) e lido uma vez por announce(), não a cada redesenho.
  const err = LG.msg ? `<p class="small" id="sb-err" style="color:var(--danger);margin-top:8px">${LG.msg}</p>` : '';
  const inv = LG.msg ? ' aria-invalid="true" aria-describedby="sb-err"' : '';
  const note = LG.note ? `<p class="small" style="margin-top:8px">${I('check', 16, 'style="display:inline;vertical-align:-3px;color:var(--primary)"')} ${esc(LG.note)}</p>` : '';
  const sair = (t) => `<div style="margin:10px 16px"><button class="btn ghost block" data-act="sbLogout"${busyAttr(leaving)}>${leaving ? 'Saindo…' : t}</button></div>`;
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
          <p class="small muted" style="margin:0">Entre com o e-mail da sua conta no Supabase. Chega um código de 6 dígitos; não tem senha.</p>
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
      ${C.length ? `${sec('Conexões')}<div class="card tight">${C.map((c) => { const t = c.sinc ? new Date(c.sinc) : null, ok = c.status === 'SUCCESS' && !c.erro; return `<div class="row"><span class="badge-ic">${I('bank', 20)}</span><div class="grow"><div class="ttl">${esc(c.inst || 'Banco')}</div><div class="meta">${t ? `Atualizado ${dShort(t)} às ${hhmm(t)}` : 'Sem data'}${c.consentimento ? ` · consentimento até ${new Date(c.consentimento + 'T12:00').toLocaleDateString('pt-BR')}` : ''}</div></div><span class="chip st-${ok ? 'pago' : 'atrasado'}">${ok ? 'OK' : 'Atenção'}</span></div>`; }).join('')}</div>` : ''}
      ${R || D.SAUDE ? `${sec('Neste aparelho')}<div class="card">${R ? `<p class="small muted" style="margin:0">${(R.transacoes || []).length} lançamentos, ${(R.contas || []).length} contas e ${(R.cartoes || []).length} cartões. Ações, carro, financiamento e participações vêm da foto manual${R.snapshotEm ? ` de ${dShort(new Date(R.snapshotEm + 'T12:00'))}` : ''}.</p>` : ''}${D.SAUDE ? `<p class="small muted" style="margin:${R ? '8px' : '0'} 0 0">Saúde: ${saudeConta()}.</p>` : ''}</div>` : ''}
      ${sair('Sair e apagar os dados deste aparelho')}`;
  }
  return { title: 'Sincronizar', html: `${backbar('dinheiro', 'Dinheiro')}${hdr('Sincronizar', 'Dinheiro (Open Finance) e saúde pelo Supabase, com login só seu.')}${netbar()}${body}
    <p class="xs muted" style="margin:14px 20px">${I('lock', 14, 'style="display:inline;vertical-align:-2px"')} Só a conta dona lê os dados. A sessão e a última leitura ficam só neste aparelho.</p>` };
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
    ...meals.map((m) => ({ h: hm(m.hora) || '—', t: m.nome, d: `${m.hora ? `${m.hora} · ` : ''}${fmtInt(m.kcal)} kcal · ${fmtInt(m.p)} g de proteína`, c: 'var(--a-nut)' })),
  ].sort((a, b) => (a.h === '—' && b.h !== '—' ? -1 : b.h === '—' && a.h !== '—' ? 1 : a.h.localeCompare(b.h)));
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = D.addDays(diaNow(), i), q = D.planFor(d), ss = D.sessao(q), id = D.iso(d), bs = bills().filter((b) => D.iso(b.due) === id && !b.pago);
    const ts = S.inbox.filter((x) => x.quando === id && !x.done);
    return `<div class="row"><div style="width:52px"><b>${i === 0 ? 'Hoje' : wd(d)}</b><div class="xs muted num">${dShort(d)}</div></div><div class="grow small"><div>${esc(ss.tipo ? ss.nome : '—')}</div>${bs.map((b) => `<div class="muted">${esc(b.n)} · ${brl(b.v)}</div>`).join('')}${ts.map((x) => `<div class="muted">${x.hora ? `${esc(hm(x.hora) || x.hora)} · ` : ''}${esc(x.t)}</div>`).join('')}</div></div>`;
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
      <p class="small muted" style="margin:14px 20px">${I('calendar', 16, 'style="display:inline;vertical-align:-3px"')} A agenda do Google ou da Apple ainda não está conectada: a linha do dia mostra o plano de treino, as refeições, as contas e as suas tarefas.</p>`,
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
  const ss = SB.session(), H = D.SAUDE;
  const integ = [
    ['bank', 'Open Finance (Meu Pluggy)', 'Bancos e cartões pelo Supabase. O Pluggy atualiza uma vez por dia, de manhã.', ss ? (fromSB() ? `Lido ${fmtSync()}` : 'Entrou, sem dados') : 'Entrar', ss && fromSB() ? 'pago' : 'avencer', true],
    ['heart', 'Saúde no Supabase', H ? `${esc(H.fonte || 'Plano, fichas, dieta, medidas e exames')}. Só a sua conta lê.` : 'Plano, fichas, dieta, medidas e exames, só para a sua conta.', H ? 'Conectado' : ss ? 'Sem dados' : 'Entrar', H ? 'pago' : 'avencer', true],
    ['health', 'Apple Health', 'Sono, passos, treinos, VFC e frequência de repouso. Ainda não conectado: o sono vem do check-in.', 'Não conectado', 'avencer'],
    ['calendar', 'Agenda (Google ou Apple)', 'Ainda não conectada. A linha do dia mostra o plano, as refeições, as contas e as suas tarefas.', 'Não conectada', 'avencer'],
    ['pulse', 'Strava', 'Fora do plano: a API exige assinatura.', 'Não usar', 'atrasado'],
  ];
  return {
    title: 'Integrações e ajustes',
    html: `${backbar('ficha', 'Ficha')}${hdr('Integrações e ajustes')}
      ${sec('Integrações')}<div class="card tight">${integ.map(([ic, n, d, st, cls, link]) => { const inner = `<span class="badge-ic">${I(ic, 20)}</span><div class="grow"><div class="ttl">${n}</div><div class="meta" style="white-space:normal">${d}</div></div><span class="chip st-${cls}">${st}</span>`; return link ? `<a class="row" href="#/dinheiro/sincronizar">${inner}</a>` : `<div class="row">${inner}</div>`; }).join('')}</div>
      ${sec('Você')}<div class="card"><label class="field" style="margin:0"><span>Como quer ser chamado</span><input class="input" id="aj-nome" data-in="nome" value="${esc(S.nome || '')}" autocomplete="given-name" maxlength="30"></label><p class="xs muted" style="margin-top:6px">Fica só neste aparelho.</p></div>
      ${sec('Notificações')}<div style="margin:10px 16px"><button class="btn line block" data-act="testNotif">${I('bell', 20)} Testar notificação</button><p class="xs muted" style="margin-top:6px">Os lembretes automáticos ainda não existem: por enquanto, só o teste e o número de missões no ícone. No iPhone, funciona com o Painel na Tela de Início.</p></div>
      ${sec('Aparência')}<div class="card"><div class="seg" role="group" aria-label="Tema">${[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, l]) => `<button aria-pressed="${S.theme === k}" data-act="theme" data-arg="${k}">${l}</button>`).join('')}</div></div>
      ${sec('Pausa')}<div class="card tight"><div class="row"><div class="grow"><div class="ttl">Modo Pausa</div><div class="meta" style="white-space:normal">Doente ou viajando: congela a Chama e tira os dias da consistência.</div></div><button class="switch" role="switch" aria-checked="${S.pausa}" data-act="pausa" aria-label="Modo Pausa"></button></div></div>
      ${sec('Dados e privacidade')}<div class="card tight">
        <div class="row"><span class="badge-ic">${I('lock', 20)}</span><div class="grow"><div class="ttl">Seus dados</div><div class="meta" style="white-space:normal">O que você registra aqui (check-ins, treinos, tarefas, gastos) fica só neste aparelho. Dinheiro e saúde vêm do Supabase, que só a sua conta lê, e a última leitura fica guardada aqui para abrir sem internet.</div></div></div>
        <button class="row" data-act="exportar"><span class="badge-ic">${I('upload', 20)}</span><div class="grow"><div class="ttl">Exportar o que está neste aparelho</div><div class="meta">Um arquivo JSON com XP, check-ins, treinos e tarefas</div></div>${I('chevR', 20, 'class="ic muted"')}</button>
        <button class="row" data-act="restartOnb"><span class="badge-ic">${I('sparkle', 20)}</span><div class="grow"><div class="ttl">Ver as boas-vindas de novo</div></div>${I('chevR', 20, 'class="ic muted"')}</button>
        <button class="row" data-act="resetLocal"><span class="badge-ic">${I('refresh', 20)}</span><div class="grow"><div class="ttl">Recomeçar neste aparelho</div><div class="meta">Apaga XP, check-ins, treinos e marcações daqui. O Supabase não muda.</div></div></button></div>
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
      <div class="foot"><button class="btn block" data-act="onbNext">Começar</button></div>`;
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
  onboarding: Onboarding, hoje: Hoje, saude: Saude, 'saude/treino': Treino, 'saude/campanha': Campanha, 'saude/dieta': Dieta, 'saude/exames': Exames,
  dinheiro: Dinheiro, 'dinheiro/contas': Contas, 'dinheiro/cartoes': Cartoes, 'dinheiro/patrimonio': Patrimonio, 'dinheiro/importar': Importar, 'dinheiro/sincronizar': Sincronizar,
  agenda: Agenda, ficha: Ficha, ajustes: Ajustes,
};
const TAB_OF = (r) => (r.startsWith('saude') ? 'saude' : r.startsWith('dinheiro') ? 'dinheiro' : r === 'agenda' ? 'agenda' : ['ficha', 'ajustes'].includes(r) ? 'ficha' : 'hoje');
// Navegação lateral no computador.
const NAV = [
  ['Hoje', [['hoje', 'Hoje', 'sun']]],
  ['Saúde', [['saude', 'Visão geral', 'heart'], ['saude/treino', 'Treino', 'dumbbell'], ['saude/campanha', 'Plano de treino', 'target'], ['saude/dieta', 'Dieta do dia', 'utensils'], ['saude/exames', 'Exames e medidas', 'flask']]],
  ['Dinheiro', [['dinheiro', 'Visão geral', 'wallet'], ['dinheiro/contas', 'Contas a pagar', 'receipt'], ['dinheiro/cartoes', 'Cartões e faturas', 'card'], ['dinheiro/patrimonio', 'Patrimônio', 'pie'], ['dinheiro/sincronizar', 'Sincronizar', 'link']]],
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
    <p class="xs muted" style="margin-top:10px">Variabilidade cardíaca e frequência de repouso entram na conta quando o Apple Health for conectado.</p>`);
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
function expenseSheet() {
  const cats = ['Mercado', 'Alimentação fora', 'Transporte', 'Saúde', 'Lazer', 'Compras'];
  openSheet('Gasto rápido', `<label class="field"><span>Valor</span><input class="input" id="ex-v" inputmode="decimal" placeholder="R$ 0,00" style="font-size:24px;font-weight:750" data-autofocus value="${esc(S.draftExpense)}"></label>
    ${radios('Categoria', 'ex-cat', cats, 'Mercado')}
    ${semCartao() ? radios('Pago com', 'ex-met', ['Pix', 'Dinheiro'], 'Pix') : radios('Pago com', 'ex-met', [CARD, 'Pix', 'Dinheiro'], CARD, { [CARD]: card0() })}
    <button class="btn block" style="margin-top:16px" data-act="saveExpense">Salvar gasto</button><p class="xs muted" style="margin-top:8px">${S.paid.fatura && !semCartao() ? `No ${esc(card0())} vai para a próxima fatura (a aberta já foi paga) e não muda o “livre para gastar”. Pix e dinheiro saem do saldo na hora.` : 'Entra na hora no “livre para gastar”.'} Quando o extrato chegar, o lançamento é ligado a este gasto e não duplica.</p>`, 'ex');
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
  sbLogout: async () => {
    if (leaving) return;
    if (!confirm('Sair deste aparelho? A sessão e a cópia do dinheiro e da saúde daqui são apagadas. No Supabase nada muda.')) return;
    leaving = true; render(true); announce('Saindo…');
    try { localStorage.removeItem(REALK); localStorage.removeItem(SAUDEK); } catch { /* nada a apagar */ }
    S.paid = {}; S.paidAmt = {}; S.paidAt = {}; save();
    const r = await SB.signOut();
    try { sessionStorage.setItem('painel-saiu', r === true || r === 'ok' ? '1' : r === 'sem-rede' ? 'sem-rede' : 'erro'); } catch { /* sem aviso depois */ }
    location.reload();
  },
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
    el.value = n1(Math.max(30, Math.min(250, base + (Number.isFinite(cur) ? parseFloat(d) : 0))));
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
    if (fin(S.sleep) == null) { toast('Escolha as horas de sono.'); sheetRoot.querySelector('#sheet [role="radio"][tabindex="0"]')?.focus() || main.querySelector('[role="radio"][tabindex="0"]')?.focus(); return; }
    const first = !S.checkin; S.checkin = { w, s: S.sleep }; if (w != null) S.weight = w;
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
    const cut = ['amarelo', 'vermelho'].includes(zoneNow()), FL = FORCA.has(sel) ? fichaList(sel, p) : null;
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
        S.lastSets[ex.id] = { kg: Math.max(...feitos.map((x) => x.kg || 0)), reps: feitos.map((x) => x.reps || 0), d: S.day };
        const b = Math.max(...feitos.map((x) => (x.kg > 0 && x.reps > 0 ? e1rm(x.kg, x.reps) : 0))), prev = S.best1rm[ex.id];
        if (b > 0) { if (prev != null && b > prev + 0.01) pr = true; if (prev == null || b > prev) S.best1rm[ex.id] = b; }
      });
      Object.keys(S.sets).forEach((x) => { if (x.startsWith(sel + '-')) delete S.sets[x]; });
    }
    const minutos = sel === 'Z2' ? z2Min() : 0;
    S.rest = null; S.wStart = null;
    const label = sel === 'REST' ? 'Mobilidade feita' : sel === 'REC' ? 'Recuperação feita' : sel === 'LIVRE' ? 'Treino feito' : `${sessOf(p, sel).nome} concluído${sel !== key && key !== 'LIVRE' ? ' (reposição)' : ''}`;
    if (!S.quests.corpo) {
      S.corpoKey = sel; setQuest('corpo', true, label);
      if (sel === 'Z2') S.corpoMin = minutos;
      if (pr && !S.prToday) { S.prToday = true; setTimeout(() => addXP(25, 'Recorde pessoal'), 800); }
    } else {
      // Já ganhou o XP de hoje: a sessão feita (não a recuperação) é a que conta na semana.
      if (['REC', 'REST', 'LIVRE'].includes(S.corpoKey) && !['REC', 'REST'].includes(sel)) { S.corpoKey = sel; S.corpoMin = minutos; setTimeout(checkWeekly, 600); }
      toast(`${label}. O XP de treino é de uma sessão por dia${pr ? '; o recorde fica guardado' : ''}.`, '', 3600);
    }
    // Volta para o Hoje sem deixar o treino concluído no caminho do “voltar”.
    save();
    if (fromSheet) { afterPop = () => go('#/hoje', true); history.back(); } else go('#/hoje', true);
  },
  finishForce: (k) => A.finishWorkout(k, null, null, true),
  daytype: (k) => { if (!D.DIAS[k]) return; S.dayType = k; save(); render(true); },
  meal: (id) => {
    const { key } = todaySession(), meals = D.refeicoes(S.dayType || D.tipoDia(key)), pr = D.prot();
    S.meals[id] = !S.meals[id];
    const p = meals.filter((m) => S.meals[m.id]).reduce((a, m) => a + m.p, 0);
    // +3 XP por refeição só na primeira marcação do dia: desmarcar e marcar de novo não paga outra vez.
    if (S.meals[id] && !S.mealXp[id]) { S.mealXp[id] = true; addXP(3, 'Refeição registrada'); } else touch();
    if (pr) {
      if (p >= pr.conta && !S.quests.comb) setQuest('comb', true);
      else if (p < pr.conta && S.quests.comb && S.combByMeals) setQuest('comb', false);
      if (S.quests.comb && p >= pr.conta) S.combByMeals = true;
    }
    render(true);
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
    S.inbox.unshift({ id: newId('n'), t: p.title || v, chips: p.chips.map((c) => c.t), quando: p.date ? D.iso(p.date) : null, hora: tm ? tm.t : null }); S.inboxDraft = ''; touch();
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
  realClear: () => { if (!confirm('Apagar os seus dados de dinheiro deste aparelho? O arquivo no seu computador continua lá.')) return; try { localStorage.removeItem(REALK); } catch { /* nada a apagar */ } S.paid = {}; S.paidAmt = {}; S.paidAt = {}; save(); location.reload(); },
  resetLocal: () => {
    if (!confirm('Recomeçar neste aparelho? XP, check-ins, treinos, tarefas, gastos anotados e marcações daqui são apagados. O Supabase não muda.')) return;
    const keep = { theme: S.theme, onboarded: true, nome: S.nome };
    S = Object.assign(defaults(), keep, { day: D.iso(diaNow()), since: D.iso(diaNow()) }); bossMonth(S); save();
    toast('Recomeçado neste aparelho'); if (current() !== 'hoje') go('#/hoje', true); else render(false); renderChrome();
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
  radio: (_, el) => el.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]').forEach((b) => { const on = b === el; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; }),
  qa: (a) => { if (a.startsWith('nav:')) navFromSheet('#/' + a.slice(4)); else if (a === 'openCheckin') A.openCheckin(); else if (a === 'expense') expenseSheet(); else if (a === 'task') { S.agView = 'hoje'; navFromSheet('#/agenda'); setTimeout(() => document.getElementById('inbox')?.focus(), 80); } },
  saveExpense: () => {
    const el = document.getElementById('ex-v'); const v = parseMoney(el.value);
    if (!(v > 0 && v < 100000)) { toast('Digite o valor, por exemplo 45,90'); el.focus(); return; }
    const pick = (id) => sheetRoot.querySelector(`[aria-labelledby="${id}"] [aria-checked="true"]`)?.dataset.val;
    const x = { id: newId('x'), v: Math.round(v * 100) / 100, cat: pick('ex-cat') || 'Mercado', met: pick('ex-met') || (semCartao() ? 'Pix' : CARD), d: D.iso(diaNow()), t: new Date().toISOString() };
    x.ja = sameDebits(x.v, x.d); // lançamentos do mesmo valor que já estavam no extrato não são este gasto
    if (x.met === CARD) x.fat = S.paid.fatura ? 'proxima' : 'aberta'; // fatura já paga: o gasto novo vai para a próxima
    S.expenses.push(x); S.draftExpense = ''; touch(); closeSheet(true);
    toast(`${I('check', 18)} <span>${brl(x.v)} em ${esc(x.cat.toLowerCase())}.${D.REAL ? ` Livre: ${brl0(money().livre)}.` : ''}</span><button class="link" data-act="delExpense" data-arg="${x.id}">Desfazer</button>`, '', 6000);
    render(true);
  },
  delExpense: (id, el) => {
    const i = S.expenses.findIndex((x) => x.id === id); if (i < 0) return;
    const fromToast = !!el?.closest('.toast');
    const y = S.expenses[i];
    if (y.met === CARD && (y.fat || 'aberta') === 'aberta' && S.paid.fatura) { toast('Esse gasto está na fatura que você já marcou como paga. Para apagar, desfaça o pagamento da fatura primeiro.', '', 4200); return; }
    const [x] = S.expenses.splice(i, 1); touch();
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
  if (el.dataset.in === 'setkg' || el.dataset.in === 'setreps') setVal(el);
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
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'inbox') { e.preventDefault(); A.addInbox(); } });
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
const VERSION = '0.5.0';
function current() { const h = location.hash.replace(/^#\/?/, ''); return ROUTES[h] ? h : 'hoje'; }
const TOP = ['hoje', 'saude', 'dinheiro', 'agenda', 'ficha'];
const TITLES = { onboarding: 'Boas-vindas', hoje: 'Hoje', saude: 'Saúde', 'saude/treino': 'Treino', 'saude/campanha': 'Plano', 'saude/dieta': 'Dieta', 'saude/exames': 'Exames', dinheiro: 'Dinheiro', 'dinheiro/contas': 'Contas', 'dinheiro/cartoes': 'Cartões', 'dinheiro/patrimonio': 'Patrimônio', 'dinheiro/importar': 'Open Finance e arquivo', 'dinheiro/sincronizar': 'Sincronizar', agenda: 'Agenda', ficha: 'Ficha', ajustes: 'Ajustes' };
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
    scr = { title: 'Erro', html: `${hdr('Algo deu errado')}<div class="card"><p class="lead">Esta tela não abriu com o que está salvo neste aparelho.</p><p class="small muted" style="margin-top:8px">Recomeçar apaga só o progresso guardado aqui (XP, check-ins, marcações). Os dados do Supabase voltam na próxima sincronização.</p><button class="btn block" style="margin-top:12px" data-act="resetLocal">Recomeçar neste aparelho</button></div>` };
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

window.addEventListener('online', () => { render(true); if (SB.session() && staleSync()) syncNow(false); });
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
  if (SB.session() && staleSync()) syncNow(false);
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
// No iPhone o app instalado tem armazenamento próprio: a primeira abertura pelo ícone começa as boas-vindas lá.
if (!S.onboarded && (!location.hash || STANDALONE)) go('#/onboarding', true);
// Voltou do app de e-mail com um código pedido há pouco: abre direto na etapa do código.
else if (!hashLogin && !SB.session() && SB.pending() && current() === 'hoje') go('#/dinheiro/sincronizar', true);
if (pruneReal()) save();
render(false);
renderChrome();
if (hashLogin && hashLogin !== 'ok') {
  // Com sessão, o aviso não cabe no formulário de login (que não aparece): vai num aviso passageiro.
  if (SB.session()) toast(hashLogin === 'ja_conectado' ? esc(SBMSG.ja_conectado) : 'Esse link do e-mail já não valia, mas este aparelho continua conectado.', 'warn', 7000);
  else { LG.msg = sbMsg({ code: hashLogin }); LG.step = SB.pending() ? 'code' : 'email'; render(true); announce(plain(LG.msg)); }
}
try {
  const saiu = sessionStorage.getItem('painel-saiu');
  if (saiu) { sessionStorage.removeItem('painel-saiu'); toast(saiu === '1' ? 'Saiu deste aparelho. A sessão e os dados daqui foram apagados.' : saiu === 'sem-rede' ? 'Saiu e apagou os dados deste aparelho. Sem internet, a sessão não foi encerrada no Supabase.' : 'Saiu e apagou os dados deste aparelho. O Supabase não confirmou o fim da sessão lá.', saiu === '1' ? '' : 'warn', 6000); }
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
