// Dados do Painel. Nada pessoal fica neste arquivo: o dinheiro vem do Open Finance (função fin_painel do Supabase) ou
// do painel-dados.json carregado no aparelho; a saúde (plano, fichas, dieta, medidas, exames, o diário com o Apple
// Health e a agenda do iPhone, que chegam pelo atalho) vem da função saude_painel do Supabase. A cópia fica só no
// navegador. Sem dados, as telas ficam vazias e dizem de onde eles vêm.

export const DAY = 864e5;
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = startOfDay(d); x.setDate(x.getDate() + n); return x; };
export const iso = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
export const diffDays = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / DAY);
export const dayOf = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const isoOk = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);
const num = (v) => (v == null || v === '' ? null : Number.isFinite(+v) ? +v : null);

// ---------- Personagem ----------
export const PROFILE = { nome: '' }; // o nome fica só no aparelho (Ajustes → Nome)

// Atributos de 0 a 100. O valor é calculado no app a partir do que você registra (e do Open Finance, no Patrimônio).
export const ATTRS = [
  { k: 'FOR', nome: 'Força', cor: 'var(--a-for)', mede: 'Treinos de força feitos nos últimos 28 dias, contra os do plano (3 por semana).', subir: ['Fazer os treinos A, B e C da semana.', 'Concluir o treino no app (ou marcar Corpo no Hoje).'], fonte: 'Treinos registrados no app' },
  { k: 'VIG', nome: 'Vigor', cor: 'var(--a-vig)', mede: 'Minutos de cardio na zona 2 nos últimos 28 dias, contra a meta do plano (2 cardios por semana).', subir: ['Fazer os 2 cardios da semana no tempo do plano.'], fonte: 'Cardios registrados no app (os treinos do Apple Health não passam pelo atalho)' },
  { k: 'REC', nome: 'Recuperação', cor: 'var(--a-rec)', mede: 'Noites com 7 h ou mais de sono nos últimos 14 dias.', subir: ['7 h ou mais de sono.', 'Fazer o check-in da manhã com as horas de sono.'], fonte: 'Check-in da manhã' },
  { k: 'NUT', nome: 'Nutrição', cor: 'var(--a-nut)', mede: 'Dias com a missão Combustível (proteína na meta) nos últimos 14 dias.', subir: ['Proteína na meta todo dia.', 'Comer abaixo da faixa não conta: a meta é acertar, não comer menos.'], fonte: 'Missão Combustível e refeições marcadas' },
  { k: 'PAT', nome: 'Patrimônio', cor: 'var(--a-pat)', mede: 'Meses de gastos essenciais cobertos pela reserva, contra a meta de 6 meses.', subir: ['Aporte mensal na reserva até 6 meses de gastos essenciais.', 'Pagar a fatura inteira, sempre.'], fonte: 'Open Finance (Supabase)' },
  { k: 'FOC', nome: 'Foco', cor: 'var(--a-foc)', mede: 'Dias com a Missão cumprida (a conta mais urgente ou o Top 1) nos últimos 14 dias.', subir: ['Escolher só 3 prioridades por dia.', 'Pagar as contas até o vencimento.'], fonte: 'Missão do dia, Top 3 e contas pagas no app' },
];

export const ACHIEVEMENTS = [
  { k: 'primeiro', n: 'Primeiro passo', d: 'Primeiro check-in', ic: 'check' },
  { k: 'chama', n: 'Chama acesa', d: '7 dias seguidos de check-in', ic: 'flame' },
  { k: 'semana', n: 'Semana no Plano', d: '4 de 5 sessões numa semana, com 2 de força', ic: 'target' },
  { k: 'contador', n: 'Contador de si', d: 'Primeira leitura do Open Finance', ic: 'upload' },
  { k: 'dez', n: 'Dez sessões', d: '10 treinos de força registrados', ic: 'dumbbell' },
  { k: 'escudo', n: 'Escudo de 3 meses', d: 'Reserva cobre 3 meses', ic: 'shieldHalf' },
  { k: 'pulmao', n: 'Pulmão de aço', d: '300 min de zona 2 em 28 dias', ic: 'pulse' },
];

// Missões da semana. O progresso vem dos treinos registrados; a meta de zona 2 vem do plano.
export const WEEKLY = [
  { id: 'plano', t: 'Semana no Plano', d: '4 das 5 sessões da semana, com 2 de força', of: 4, xp: 150 },
  { id: 'cerco', t: 'Cerco aeróbico', d: 'Os 2 cardios da semana na zona 2', xp: 100, un: 'min' },
];
export const WEEKLY_BONUS = 50;

// Chefe do mês: 20 golpes de vida; começa com 18 (90%), e cada noite boa é um golpe.
export const BOSS = { nome: 'Senhor da Madrugada', regra: 'Uma noite com 7 h ou mais de sono (pelo check-in) conta como um golpe.', start: 18, max: 20 };

export const DOW = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

// ---------- Saúde (Supabase: saude_painel, formato painel-saude/1) ----------
export let SAUDE = null;
const lista = (x) => (Array.isArray(x) ? x : x == null || x === '' ? [] : [x]);
const byDate = (a) => (Array.isArray(a) ? a.filter((x) => x && isoOk(x.d)) : []).slice().sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
// Valida e organiza antes de trocar: dados com defeito não deixam a tela meio nova, meio velha.
export function useSaude(H) {
  if (!H || H.schema !== 'painel-saude/1') throw new Error('dados de saúde em outro formato');
  const perfil = H.perfil && typeof H.perfil === 'object' ? H.perfil : {};
  const P = perfil.plano;
  let plano = null;
  if (P && isoOk(P.inicio) && Array.isArray(P.semana) && P.semana.length === 7) {
    const blocos = (Array.isArray(P.blocos) ? P.blocos : []).filter((b) => b && num(b.de) && num(b.ate)).map((b) => ({ ...b, n: num(b.n), de: +b.de, ate: +b.ate })).sort((a, b) => a.de - b.de);
    const cardio = (Array.isArray(P.cardio) ? P.cardio : []).filter((c) => c && num(c.de) && num(c.ate)).map((c) => ({ ...c, de: +c.de, ate: +c.ate }));
    plano = { ...P, ini: dayOf(P.inicio), semanas: num(P.semanas) || 24, blocos, cardio, deload: (Array.isArray(P.deload) ? P.deload : []).map(Number), lista: (k) => (Array.isArray(P[k]) ? P[k].filter((x) => typeof x === 'string') : []) };
  }
  SAUDE = {
    lidoEm: H.lidoEm || null, fonte: typeof perfil.fonte === 'string' ? perfil.fonte : '', foco: typeof perfil.foco === 'string' ? perfil.foco : '',
    metas: perfil.metas && typeof perfil.metas === 'object' ? perfil.metas : {}, plano, altura: num(H.altura),
    fichas: Array.isArray(H.fichas) ? H.fichas.filter((f) => f && f.treino).map((f) => ({ ...f, exercicios: lista(f.exercicios).filter((e) => e && typeof e === 'object'), observacoes: lista(f.observacoes).filter((x) => typeof x === 'string') })) : [],
    refeicoes: Array.isArray(H.refeicoes) ? H.refeicoes.filter((r) => r && r.refeicao) : [],
    diario: byDate(H.diario), medidas: byDate(H.medidas), exames: byDate(H.exames), treinos: byDate(H.treinos),
    historico: (Array.isArray(H.historico) ? H.historico : []).filter((h) => h && isoOk(h.mes)),
    agenda: agendaDe(H.agenda),
    atalhoEm: { saude: quando(H.atalhoEm && H.atalhoEm.saude), agenda: quando(H.atalhoEm && H.atalhoEm.agenda), token: quando(H.atalhoEm && H.atalhoEm.token) },
  };
}
// Agenda do Calendário do iPhone (iCloud e Google), pelo atalho: d e ate são os dias (ate inclusive), h e fim os horários
// de Brasília (null no dia inteiro).
const quando = (v) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? v : null);
const hmOk = (v) => (typeof v === 'string' && /^\d\d:\d\d$/.test(v) ? v : null);
const txt = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
function agendaDe(A) {
  return (Array.isArray(A) ? A : []).filter((e) => e && isoOk(e.d) && txt(e.t, 200)).map((e) => {
    const d = e.d.slice(0, 10), ate = isoOk(e.ate) && e.ate.slice(0, 10) >= d ? e.ate.slice(0, 10) : d, diaTodo = e.diaTodo === true;
    return { d, ate, diaTodo, h: diaTodo ? null : hmOk(e.h), fim: diaTodo ? null : hmOk(e.fim), t: txt(e.t, 200), cal: txt(e.cal, 60), local: txt(e.local, 120) };
  }).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : (a.h || '') < (b.h || '') ? -1 : (a.h || '') > (b.h || '') ? 1 : 0));
}
export const metas = () => (SAUDE && SAUDE.metas) || {};
export function clearSaude() { SAUDE = null; }

const TIPOS = ['A', 'B', 'C', 'Z2', 'REST'];
// O dia no plano: semana, bloco, sessão. tipo null quando não há plano (sem dados, antes do início ou depois do fim).
export function planFor(date) {
  const dow = (startOfDay(date).getDay() + 6) % 7;
  const P = SAUDE && SAUDE.plano;
  if (!P) return { none: true, week: 0, tipo: null, dow, bloco: null };
  const days = diffDays(date, P.ini);
  if (days < 0) return { pre: true, week: 0, tipo: null, dow, bloco: P.blocos[0] || null };
  const week = Math.floor(days / 7) + 1;
  // Plano concluído: sem semana atual (week 0), para nenhuma tela mostrar a última como se ainda estivesse nela.
  if (week > P.semanas) {
    const ub = P.blocos[P.blocos.length - 1] || null; // fichas e volume do último bloco, para quem segue treinando
    return { fim: true, week: 0, ultima: P.semanas, tipo: null, dow, bloco: null, ultimoBloco: ub, semBloco: ub ? ub.ate - ub.de + 1 : 0 };
  }
  const t = String(P.semana[dow] || '').toUpperCase();
  const bloco = P.blocos.find((b) => week >= b.de && week <= b.ate) || null;
  return { week, tipo: TIPOS.includes(t) ? t : 'REST', dow, bloco, deload: P.deload.includes(week), semBloco: bloco ? week - bloco.de + 1 : week };
}
const fichaDe = (tipo, bloco) => {
  const F = (SAUDE && SAUDE.fichas) || [];
  if (tipo === 'Z2') return F.find((f) => /cardio/i.test(f.treino)) || null;
  if (tipo === 'REST') return F.find((f) => /descanso/i.test(f.treino)) || null;
  return F.find((f) => f.treino === tipo && (!bloco || f.bloco === bloco.n)) || null;
};
// Minutos de cardio da semana pelo plano ("20–25 min" → 20 para contar, o texto inteiro para mostrar).
export function cardioMin(week) {
  const P = SAUDE && SAUDE.plano; if (!P) return null;
  const c = P.cardio.find((x) => week >= x.de && week <= x.ate); if (!c) return null;
  const m = /(\d+)/.exec(String(c.min || ''));
  return m ? { min: +m[1], txt: String(c.min), nota: c.nota || '' } : null;
}
// A sessão de um dia do plano, com a ficha do bloco.
export function sessao(q) {
  if (!q || !q.tipo) {
    const nome = q && q.fim ? 'Plano concluído' : q && q.pre ? 'Plano ainda não começou' : 'Sem plano de treino';
    const resumo = q && q.pre ? `Começa em ${SAUDE.plano.inicio.split('-').reverse().join('/')}` : q && q.fim ? `As ${SAUDE.plano.semanas} semanas terminaram` : 'O plano vem do Supabase quando você entra';
    return { tipo: null, nome, resumo, min: 0, ficha: null };
  }
  const f = fichaDe(q.tipo, q.bloco || q.ultimoBloco);
  if (q.tipo === 'Z2') { const c = cardioMin(q.week || q.ultima); return { tipo: 'Z2', nome: 'Cardio zona 2', resumo: c ? `${c.txt} na zona 2` : (f && f.resumo) || 'Zona 2', min: c ? c.min : 0, ficha: f, cardio: c }; }
  if (q.tipo === 'REST') return { tipo: 'REST', nome: 'Descanso ativo', resumo: (f && f.resumo) || 'Descanso', min: 0, ficha: f };
  return { tipo: q.tipo, nome: `Treino ${q.tipo}`, resumo: (f && f.resumo) || (q.bloco ? `Bloco ${q.bloco.n}: ${q.bloco.nome}` : ''), min: 0, ficha: f };
}

// Exercício da ficha → séries e faixa de repetições. "2–3 × 12–15": 2 séries nas 2 primeiras semanas do bloco, depois 3.
// Semana de deload: no máximo 2 séries.
export const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
export function exercicio(e, q) {
  const p = String(e.prescricao || '');
  const m = /^\s*(\d+)(?:\s*[–-]\s*(\d+))?\s*[×x]\s*(.*)$/i.exec(p);
  let series = 1, reps = p;
  if (m) { series = m[2] && q && q.semBloco > 2 ? +m[2] : +m[1]; reps = m[3]; }
  if (q && q.deload) series = Math.min(series, 2);
  const r = /(\d+)(?:\s*[–-]\s*(\d+))?/.exec(reps);
  const rr = r ? [+r[1], +(r[2] || r[1])] : null;
  const perna = /(\d+)\s*(?:kg|lb)?\s*por\s+(perna|lado)/i.test(p);
  const inc = /agach|terra|leg|búlg|bulg|stiff|pélv|pelv|afundo|panturr|flexora|extensora/i.test(e.nome || '') ? 2.5 : 1;
  return { id: slug(e.nome), nome: e.nome || 'Exercício', alvo: p, series: Math.max(1, Math.min(8, series)), rr, perna, carga: num(e.carga), inc };
}
// Descanso entre séries pela orientação da ficha ("Descanso: 60–90 s", "2–3 min"): o maior número.
export function descanso(f) {
  const m = /descanso:\s*(\d+)(?:\s*[–-]\s*(\d+))?\s*(s|min)/i.exec((f && f.orientacao) || '');
  if (!m) return 90;
  const v = +(m[2] || m[1]);
  return Math.max(30, Math.min(300, m[3].toLowerCase() === 'min' ? v * 60 : v));
}
// Progressão dupla: bateu o topo da faixa em todas as séries da última vez, sobe a carga; senão, mesma carga e +1 repetição.
export function suggestion(ex, last) {
  if (!last || !Array.isArray(last.reps) || !last.reps.length || !(last.kg > 0) || !ex.rr) return null;
  const top = last.reps.every((r) => r >= ex.rr[1]);
  return top ? { kg: last.kg + ex.inc, reps: ex.rr[0], txt: `Subir para ${fmtKg(last.kg + ex.inc)} kg` } : { kg: last.kg, reps: Math.min(ex.rr[1], Math.max(...last.reps) + 1), txt: 'Manter a carga e buscar +1 repetição' };
}
export const fmtKg = (v) => (Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: v % 1 ? 1 : 0, maximumFractionDigits: 1 }) : '');

// ---------- Dieta ----------
// Os tipos de dia do plano alimentar. Cardio conta como dia de treino; descanso é descanso; refeed você escolhe.
export const DIAS = { treino: 'Treino', descanso: 'Descanso', refeed: 'Refeed' };
export const tipoDia = (tipo) => (tipo === 'REST' ? 'descanso' : 'treino');
export function refeicoes(k) {
  const L = (SAUDE && SAUDE.refeicoes) || [], nome = DIAS[k];
  return L.filter((r) => Array.isArray(r.tipos) && r.tipos.includes(nome)).map((r) => ({ id: slug(r.refeicao), nome: r.refeicao, hora: r.horario || '', itens: r.alimentos || '', kcal: num(r.kcal) || 0, p: num(r.p) || 0, c: num(r.c) || 0, g: num(r.g) || 0, versao: r.versao || '' }));
}
export const kcalDia = (k) => { const K = metas().kcal; return K && num(K[k]) ? num(K[k]) : null; };
export function prot() { const m = num(metas().proteina); return m ? { meta: m, conta: Math.round(m * 0.9) } : null; } // conta = 90% da meta

// ---------- Dinheiro ----------
// Tudo começa vazio: os números chegam pelo Open Finance (ou pelo arquivo do Painel) em useReal().
export let ACCOUNTS = [];
export let SAFE = { saldo: 0 };
export let CARDS = [];
export let CATS = [];
export let SAVINGS = null;
export let BALANCE = { ativo: [], passivo: [] };
export function bills(paid = {}, faturaExtra = 0, t = new Date()) { return REAL ? realBills(paid, faturaExtra, t) : []; }
export const ST = { pago: 'Pago', agendado: 'Agendado', avencer: 'A vencer', atrasado: 'Atrasado' };
export function netWorthSeries() { return REAL ? (REAL.serieMensal || []).filter((x) => x && isoOk(x.mes + '-01') && Number.isFinite(x.pl)).map((x) => ({ d: new Date(+x.mes.slice(0, 4), +x.mes.slice(5, 7) - 1, 1), v: x.pl })) : []; }

// Formato painel-financas/1: vem da função fin_painel do Supabase (depois do login) ou do painel-dados.json
// gerado no computador e carregado em Importar. A cópia fica só neste navegador; nada vai para o repositório.
export let REAL = null;
export let CATS_TITLE = 'Gastos';
export let CATS_REST = 0; // parte do total do mês que não está nas 8 linhas (outras categorias e estornos)
const ym = (d) => iso(d).slice(0, 7);
const sum = (a) => a.reduce((s, x) => s + x, 0);
const r2 = (v) => Math.round(v * 100) / 100;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const mesCurto = (k) => `${MESES[+k.slice(5, 7) - 1]}/${k.slice(2, 4)}`;

// Renda irregular: a conta do "livre para gastar" vai até o fim do mês.
export function payday(t) { return new Date(t.getFullYear(), t.getMonth() + 1, 0); }

function realBills(paid, faturaExtra, t) {
  const tx = REAL.transacoes || [], mes = ym(t), hoje = startOfDay(t), corte = REAL.geradoEm;
  const dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  // Conta de valor fixo também se acha pelo valor exato: um débito na conta do mesmo valor, perto do vencimento, que
  // o banco ainda não classificou na categoria dela (débito agendado, descrição diferente). Cada débito vale para uma
  // conta só, e nunca um que já está na categoria de outra conta.
  const bancos = new Set((REAL.contas || []).map((c) => c.id).filter(Boolean)), usados = new Set();
  const cats = new Set((REAL.contasPagar || []).map((b) => b.txCat).filter(Boolean));
  // Cada conta do arquivo diz qual categoria do extrato a quita (txCat); a do cartão principal vem com fatura: true.
  return (REAL.contasPagar || []).filter((b) => b.v != null && !b.flex).map((b) => {
    const id = b.fatura ? 'fatura' : b.id;
    // Fatura do Open Finance: vem com o vencimento exato (venceEm) e, se o pagamento já apareceu, com a data dele (pagoEm).
    const due = b.venceEm ? dayOf(b.venceEm) : new Date(t.getFullYear(), t.getMonth(), Math.min(b.dia, dim));
    // txValor: a fatura só conta como paga quando o pagamento bate o valor (dois cartões pagos no mesmo mês).
    // Fatura do Open Finance (venceEm): quem acha o pagamento é o banco de dados (pagoEm), para Contas e Cartões concordarem.
    let hit = b.pagoEm || b.venceEm ? null : b.txCat ? tx.find((x) => x.d.startsWith(mes) && x.cat === b.txCat && x.v < 0 && (b.txValor == null || Math.abs(-x.v - b.txValor) < 1)) : null;
    if (!hit && !b.pagoEm && !b.venceEm && b.txCat && !b.estimado && b.v >= 1) {
      const d0 = iso(addDays(due, -7)), d1 = iso(addDays(due, 10));
      hit = tx.find((x) => x.v < 0 && Math.abs(-x.v - b.v) < 0.01 && x.d >= d0 && x.d <= d1 && bancos.has(x.conta) && !usados.has(x) && !cats.has(x.cat) && x.tipo !== 'transferencia') || null;
    }
    if (hit) usados.add(hit);
    const porExtrato = !!hit || !!b.pagoEm;
    const isPaid = porExtrato || !!paid[id];
    let v = hit ? -hit.v : b.v;
    if (id === 'fatura' && !porExtrato) v = r2(v + faturaExtra);
    const auto = /autom/i.test(b.met);
    const st = isPaid ? 'pago' : due < hoje && iso(due) <= corte ? 'atrasado' : auto ? 'agendado' : 'avencer';
    let n = b.n + (b.estimado && !hit ? ' · valor médio' : '');
    const P = b.passivo && (REAL.passivos || []).find((p) => p.id === b.passivo);
    if (P && P.prazo) { const k = P.pagas + (hit ? 0 : 1) + Math.max(0, (t.getFullYear() - +corte.slice(0, 4)) * 12 + t.getMonth() + 1 - +corte.slice(5, 7)); n = `${b.n} · ${Math.min(k, P.prazo)}/${P.prazo}`; }
    return { id, n, v: r2(v), due, st, pago: isPaid, porExtrato, met: b.met, cat: b.cat, auto, hitTx: hit || null };
  }).sort((a, b) => a.due - b.due);
}

// Valida e calcula tudo antes de trocar: um arquivo ou leitura com defeito não deixa a tela meio real, meio vazia.
export function useReal(R) {
  if (!R || R.schema !== 'painel-financas/1') throw new Error('arquivo não é do Painel');
  if (typeof R.geradoEm !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(R.geradoEm)) throw new Error('arquivo sem data');
  const cx = (R.contas || []).filter((c) => c.saldo != null);
  const accounts = cx.map((c) => ({ n: c.n, inst: c.inst, v: c.saldo }));
  const saldo = r2(sum(cx.map((c) => c.saldo)));
  const safe = { saldo };
  const pag = (k) => (k.pagamentos || []).slice().sort((a, b) => (a.d < b.d ? -1 : 1));
  const cards = (R.cartoes || []).map((k, i) => {
    const p = pag(k), last = p[p.length - 1], fa = k.faturaAtual, fm = k.faturaMes;
    const aberta = fa && fa.v != null ? fa.v : i === 0 && R.faturaEstimada ? R.faturaEstimada : k.usado || 0;
    // Depois de paga a fatura do mês: a próxima já fechada, se o banco mandou e ela ainda não foi paga; senão o uso atual do cartão.
    const prox = fa && fm && fa.vence > fm.vence && fa.v != null && !fa.pagoEm ? { v: fa.v } : { v: k.usado || 0, deUso: true };
    return { n: k.n, limite: k.limite, vence: k.vence, faturas: { fechada: { v: last ? last.v : 0, st: 'Paga' }, aberta: { v: aberta }, proxima: prox }, real: { ...k, pagamentos: p } };
  });
  // Gastos do último mês fechado, com a fatura paga no mês como uma linha só (o detalhe vem das faturas).
  const meses = Object.keys(R.gastosPorMes || {}).sort(), ref = meses.filter((m) => m < R.geradoEm.slice(0, 7)).pop() || meses[meses.length - 1];
  // "Moradia: água" e "Moradia: celular" somam em "Moradia"; o arquivo pode mandar grupos próprios em gruposGasto.
  // Estornos entram negativos e descontam no total do mês.
  const G = R.gruposGasto || {}, grupo = (c) => G[c] || c.split(':')[0];
  const porGrupo = (m) => { const o = {}; Object.entries((R.gastosPorMes || {})[m] || {}).forEach(([c, v]) => { const g = grupo(c); o[g] = (o[g] || 0) + (Number(v) || 0); }); const f = (R.cartaoPorMes || {})[m]; if (f) o['Fatura do cartão (sem detalhe)'] = f; return o; };
  let cats = [], catsTitle = 'Gastos · ainda sem lançamentos', catsRest = 0;
  if (ref) {
    const atual = porGrupo(ref), ant = meses.filter((m) => m < ref).slice(-6).map(porGrupo);
    const nomes = new Set([...Object.keys(atual), ...ant.flatMap((o) => Object.keys(o))]);
    const all = [...nomes].map((n) => ({ n, v: r2(atual[n] || 0), avg: r2(ant.length ? sum(ant.map((o) => o[n] || 0)) / ant.length : atual[n] || 0) }));
    cats = all.filter((c) => c.v >= 0 && (c.v > 0.004 || c.avg > 0.004)).sort((a, b) => b.v - a.v).slice(0, 8);
    catsRest = r2(sum(Object.values(atual)) - sum(cats.map((c) => c.v)));
    catsTitle = R.cartaoDetalhado ? `Gastos de ${mesCurto(ref)} · conta e fatura que vence no mês` : `Gastos de ${mesCurto(ref)} · conta e fatura paga no mês`;
  }
  const caixinha = R.caixinha ? Math.max(0, r2(R.caixinha.aplicado - R.caixinha.resgatado)) : 0;
  // Sem os gastos essenciais na foto manual, os meses de reserva ficam sem número (nada de valor inventado).
  const ess = Number(R.essenciaisMes) > 0 ? Number(R.essenciaisMes) : null, reserva = r2(saldo + caixinha);
  const savings = { taxa: R.taxaPoupanca ?? null, meta: 20, reserva, essenciais: ess, reservaMeses: ess ? +(reserva / ess).toFixed(1) : null, reservaMeta: 6, essLabel: R.essenciaisLabel || '' };
  const inv = R.investimentosPorTipo || {}, invRef = R.investimentos && R.investimentos.data ? mesCurto(R.investimentos.data) : '';
  const insts = [...new Set(cx.map((c) => c.inst))];
  const circ = [[insts.length ? `Contas (${insts.join(', ')})` : 'Contas', saldo]];
  if (caixinha) circ.push(['Caixinha', caixinha]);
  (R.outrosAtivos || []).forEach((x) => circ.push([x.n, x.v]));
  (R.receber || []).forEach((x) => circ.push([`A receber: ${x.n}`, x.saldo]));
  const passivo = (R.passivos || []).filter((p) => p.saldoDevedor);
  const balance = {
    ativo: [
      { g: 'Circulante', itens: circ },
      { g: 'Investimentos', itens: [['Ações', inv['Ações'] || 0], ['ETFs', inv.ETF || 0], ['FIIs', inv.FII || 0]].filter((x) => x[1]).map(([n, v]) => [invRef ? `${n} (B3, ${invRef})` : `${n} (B3)`, v]) },
      { g: 'Não circulante', itens: [...(R.participacoes || []).map((p) => [`Participação: ${p.n} (${String(p.pct).replace('.', ',')}%)`, p.v]), ...(R.bens || []).map((b) => [`${b.n} (custo, até a FIPE)`, b.valor])] },
    ],
    passivo: [
      { g: 'Curto prazo', itens: passivo.filter((p) => !p.longo).map((p) => [p.n, p.saldoDevedor]) },
      { g: 'Longo prazo', itens: passivo.filter((p) => p.longo).map((p) => [p.prazo ? `${p.n}: ${p.restantes} de ${p.prazo} parcelas` : p.n, p.saldoDevedor]) },
    ],
  };
  REAL = R; ACCOUNTS = accounts; SAFE = safe; CARDS = cards; CATS = cats; CATS_TITLE = catsTitle; CATS_REST = catsRest; SAVINGS = savings; BALANCE = balance;
}
