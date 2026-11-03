// Dados FICTÍCIOS para o wireframe. Nada aqui é dado real de saúde ou finanças.
// Os dados reais nunca entram neste arquivo: useReal() recebe o arquivo que a pessoa carrega no próprio aparelho.
// As datas são geradas a partir de "hoje" para o protótipo parecer vivo.

export const DAY = 864e5;
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = startOfDay(d); x.setDate(x.getDate() + n); return x; };
export const iso = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
export const diffDays = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / DAY);

function rng(seed) { // mulberry32: ruído determinístico para os gráficos
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- Personagem ----------
export const PROFILE = { nome: 'Yuri', metaPeso: 82.0, alturaCm: 180 };
export const XP_START = 2650;

export const ATTRS = [
  { k: 'FOR', nome: 'Força', v: 42, d: +3, cor: 'var(--a-for)', mede: 'Cargas estimadas (1RM) dos 4 exercícios-âncora contra as suas metas, mais quantos treinos de força você fez em 28 dias.', subir: ['Bater as séries e subir a carga pela progressão dupla.', '12 treinos de força em 28 dias valem 25% do atributo.'], fonte: 'Registro de treino no app' },
  { k: 'VIG', nome: 'Vigor', v: 35, d: +5, cor: 'var(--a-vig)', mede: 'Minutos em zona 2 nos últimos 28 dias, VO2máx do relógio e média de passos em 14 dias.', subir: ['2 cardios de 40 min por semana na zona 2 (80 min).', 'Média de 7 mil passos por dia.'], fonte: 'Apple Health (via Atalho)' },
  { k: 'REC', nome: 'Recuperação', v: 58, d: -2, cor: 'var(--a-rec)', mede: 'Horas de sono na última semana e regularidade do horário de dormir em 14 dias.', subir: ['Deitar no mesmo horário, com variação de até 45 min.', '7 h ou mais de sono.'], fonte: 'Apple Health + check-in' },
  { k: 'NUT', nome: 'Nutrição', v: 71, d: +4, cor: 'var(--a-nut)', mede: 'Dias com proteína na meta e calorias dentro de ±10% do alvo do dia, em 14 dias.', subir: ['Proteína na meta em 6 de 7 dias.', 'Comer abaixo da faixa não conta: a meta é acertar, não comer menos.'], fonte: 'Missão Combustível + cardápio' },
  { k: 'PAT', nome: 'Patrimônio', v: 64, d: +1, cor: 'var(--a-pat)', mede: 'Meses de reserva, taxa de poupança em 3 meses, ausência de rotativo ou cheque especial e crescimento do patrimônio contra a meta do ano.', subir: ['Aporte mensal na reserva até 6 meses de gastos essenciais.', 'Pagar a fatura inteira, sempre.'], fonte: 'Extratos importados' },
  { k: 'FOC', nome: 'Foco', v: 77, d: +6, cor: 'var(--a-foc)', mede: 'Top 3 do dia cumpridos no prazo (14 dias), contas pagas em dia (90 dias) e revisões semanais (4 semanas).', subir: ['Escolher só 3 prioridades por dia.', 'Fazer a revisão de domingo (10 min).'], fonte: 'Agenda, tarefas e contas' },
];

export const ACHIEVEMENTS = [
  { n: 'Primeiro passo', d: 'Primeiro check-in', ok: true, ic: 'check' },
  { n: 'Chama acesa', d: '7 dias seguidos de check-in', ok: true, ic: 'flame' },
  { n: 'Semana no Plano', d: '4 de 5 sessões numa semana', ok: true, ic: 'target' },
  { n: 'Contador de si', d: 'Primeira importação de extrato', ok: true, ic: 'upload' },
  { n: 'Dez sessões', d: '10 treinos registrados', ok: false, p: '7/10', ic: 'dumbbell' },
  { n: 'Escudo de 3 meses', d: 'Reserva cobre 3 meses', ok: true, ic: 'shieldHalf' },
  { n: 'Pulmão de aço', d: '300 min de zona 2 em 28 dias', ok: false, p: '185/300', ic: 'pulse' },
  { n: 'Pronto para o tatame', d: 'Libera o BJJ: critérios de condicionamento', ok: false, p: 'Ato IV', ic: 'lock' },
];

// Missões da semana. O progresso (p) é calculado no app a partir do plano e do que foi feito hoje.
export const Z2_WEEK_MIN = 80; // 2 cardios de 40 min por semana no Ato I
export const WEEKLY = [
  { id: 'plano', t: 'Semana no Plano', d: '4 das 5 sessões da semana, com 2 de força', of: 4, xp: 150 },
  { id: 'cerco', t: 'Cerco aeróbico', d: `Zona 2 por ${Z2_WEEK_MIN} min na semana (2 × 40)`, of: Z2_WEEK_MIN, xp: 100, un: 'min' },
  { id: 'revisao', t: 'Revisão de domingo', d: 'Contas, Top 3 e categorias em 10 min', of: 1, xp: 100 },
];
export const WEEKLY_BONUS = 50;

// Chefe do mês: 20 golpes de vida; começa com 18 (90%), e cada noite boa é um golpe.
export const BOSS = { nome: 'Senhor da Madrugada', regra: 'Uma noite com 7 h ou mais de sono e deitar até 45 min do seu horário-alvo conta como um golpe.', start: 18, max: 20, alt: 'Dragão da Fatura' };

// ---------- Plano de 24 semanas ----------
export const ANCHOR = new Date(2026, 9, 26); // segunda, 26/10/2026
export const ACTS = [
  { n: 'I', nome: 'Fundação', foco: 'Adaptação' },
  { n: 'II', nome: 'Construção', foco: 'Hipertrofia' },
  { n: 'III', nome: 'Intensificação', foco: 'Força' },
  { n: 'IV', nome: 'Pico', foco: 'Condicionamento' },
];
const WEEKMAP = ['A', 'Z2', 'B', 'REST', 'C', 'Z2', 'REST']; // seg..dom
export const DOW = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export function planFor(date) {
  const days = diffDays(date, ANCHOR);
  const dow = (startOfDay(date).getDay() + 6) % 7;
  const tipo = WEEKMAP[dow];
  if (days < 0) return { week: 0, act: ACTS[0], tipo: 'REST', dow, pre: true };
  const week = Math.floor(days / 7) + 1;
  if (week > 24) return { week: 24, act: ACTS[3], tipo: 'REST', dow, fim: true };
  const ai = Math.ceil(week / 6) - 1;
  return { week, act: ACTS[ai], actIndex: ai, tipo, dow, deload: week % 6 === 0 };
}

export const SESSION = {
  A: { nome: 'Treino A', resumo: 'Agachamento, supino e remada', min: 55 },
  B: { nome: 'Treino B', resumo: 'Terra romeno, desenvolvimento e puxada', min: 55 },
  C: { nome: 'Treino C', resumo: 'Búlgaro, supino inclinado e remada baixa', min: 50 },
  Z2: { nome: 'Cardio zona 2', resumo: '40 min a 125–140 bpm', min: 40 },
  REST: { nome: 'Descanso ativo', resumo: 'Caminhada leve ou mobilidade 15 min', min: 20 },
};

// séries anteriores: [kg, [reps por série]]
export const WORKOUTS = {
  A: [
    { id: 'agach', nome: 'Agachamento livre', alvo: '3 × 8–10', rr: [8, 10], rir: 2, rest: 120, kg: 60, reps: [10, 10, 10], inc: 2.5 },
    { id: 'supino', nome: 'Supino reto', alvo: '3 × 8–10', rr: [8, 10], rir: 2, rest: 120, kg: 50, reps: [10, 9, 8], inc: 2.5 },
    { id: 'remada', nome: 'Remada curvada', alvo: '3 × 10–12', rr: [10, 12], rir: 2, rest: 90, kg: 45, reps: [12, 12, 12], inc: 2.5 },
    { id: 'pelvica', nome: 'Elevação pélvica', alvo: '3 × 10–12', rr: [10, 12], rir: 2, rest: 90, kg: 70, reps: [12, 11, 10], inc: 5 },
  ],
  B: [
    { id: 'rdl', nome: 'Terra romeno', alvo: '3 × 8–10', rr: [8, 10], rir: 2, rest: 120, kg: 60, reps: [10, 10, 9], inc: 2.5 },
    { id: 'desenv', nome: 'Desenvolvimento com halteres', alvo: '3 × 8–10', rr: [8, 10], rir: 2, rest: 90, kg: 16, reps: [10, 10, 10], inc: 2 },
    { id: 'puxada', nome: 'Puxada frontal', alvo: '3 × 10–12', rr: [10, 12], rir: 2, rest: 90, kg: 50, reps: [12, 11, 11], inc: 5 },
    { id: 'leg', nome: 'Leg press 45°', alvo: '3 × 10–12', rr: [10, 12], rir: 2, rest: 90, kg: 140, reps: [12, 12, 12], inc: 10 },
    { id: 'rosca', nome: 'Rosca direta', alvo: '2 × 10–12', rr: [10, 12], rir: 1, rest: 60, kg: 12, reps: [12, 12], inc: 1 },
  ],
  C: [
    { id: 'bulg', nome: 'Agachamento búlgaro (cada perna)', alvo: '3 × 8–10', rr: [8, 10], rir: 2, rest: 90, kg: 14, reps: [10, 10, 10], inc: 2 },
    { id: 'incl', nome: 'Supino inclinado com halteres', alvo: '3 × 8–10', rr: [8, 10], rir: 2, rest: 90, kg: 20, reps: [9, 9, 8], inc: 2 },
    { id: 'rbaixa', nome: 'Remada baixa', alvo: '3 × 10–12', rr: [10, 12], rir: 2, rest: 90, kg: 50, reps: [12, 12, 11], inc: 5 },
    { id: 'flex', nome: 'Mesa flexora', alvo: '3 × 10–12', rr: [10, 12], rir: 2, rest: 60, kg: 35, reps: [12, 12, 12], inc: 5 },
  ],
};

// Progressão dupla: se bateu o topo da faixa em todas as séries, sobe a carga; senão, mesma carga e +1 repetição.
export function suggestion(ex) {
  const top = ex.reps.every((r) => r >= ex.rr[1]);
  return top ? { kg: ex.kg + ex.inc, reps: ex.rr[0], txt: `Subir para ${fmtKg(ex.kg + ex.inc)} kg` } : { kg: ex.kg, reps: Math.min(ex.rr[1], Math.max(...ex.reps)), txt: 'Manter a carga e buscar +1 repetição' };
}
export const fmtKg = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: v % 1 ? 1 : 0, maximumFractionDigits: 1 });

// ---------- Dieta ----------
export const DAYTYPES = {
  forte: { nome: 'Dia forte', kcal: 2800, quando: 'Treino A (pernas pesadas)' },
  treino: { nome: 'Dia de treino', kcal: 2400, quando: 'Treinos B e C' },
  leve: { nome: 'Dia leve', kcal: 2150, quando: 'Cardio e descanso' },
};
export const PROT = { meta: 170, conta: 153 }; // conta = 90% da meta
export const dayTypeFor = (tipo) => (tipo === 'A' ? 'forte' : tipo === 'B' || tipo === 'C' ? 'treino' : 'leve');
export const MEALS = [
  { id: 'cafe', nome: 'Café da manhã', hora: '07:30', itens: 'Ovos mexidos, pão integral, fruta', kcal: 520, p: 38 },
  { id: 'almoco', nome: 'Almoço', hora: '12:30', itens: 'Arroz, feijão, frango grelhado, salada', kcal: 720, p: 52 },
  { id: 'lanche', nome: 'Lanche pré-treino', hora: '16:30', itens: 'Iogurte, aveia, banana', kcal: 380, p: 30 },
  { id: 'jantar', nome: 'Jantar', hora: '20:00', itens: 'Carne magra, batata, legumes', kcal: 650, p: 45 },
  { id: 'ceia', nome: 'Ceia', hora: '22:00', itens: 'Chá e castanhas', kcal: 130, p: 5 },
];

// ---------- Corpo ----------
export function weightSeries(n = 42) {
  const r = rng(7); const out = []; let base = 88.6;
  for (let i = n - 1; i >= 0; i--) { base -= 0.052; out.push({ d: addDays(new Date(), -i), w: +(base + (r() - 0.5) * 1.1).toFixed(1) }); }
  out[out.length - 1].w = 86.4;
  let t = out[0].w; for (const p of out) { t = t + 0.1 * (p.w - t); p.t = +t.toFixed(2); } // média móvel exponencial (Hacker's Diet)
  return out;
}
export function sleepSeries() { const r = rng(3); return Array.from({ length: 7 }, (_, i) => ({ d: addDays(new Date(), i - 6), h: +(6.1 + r() * 1.9).toFixed(1) })); }

export const MEASURES = [
  { n: 'Cintura', v: 94.5, u: 'cm', prev: 96.0 },
  { n: 'Peito', v: 104.0, u: 'cm', prev: 104.5 },
  { n: 'Braço', v: 36.5, u: 'cm', prev: 36.0 },
  { n: 'Coxa', v: 58.0, u: 'cm', prev: 58.5 },
];
export const EXAMS = {
  quando: 'maio/2026', lab: 'Laboratório fictício',
  itens: [
    { n: 'Glicemia de jejum', v: 92, u: 'mg/dL', lo: 70, hi: 99 },
    { n: 'Hemoglobina glicada', v: 5.4, u: '%', lo: 4.0, hi: 5.6 },
    { n: 'Colesterol LDL', v: 138, u: 'mg/dL', lo: 0, hi: 130 },
    { n: 'Colesterol HDL', v: 46, u: 'mg/dL', lo: 40, hi: 90 },
    { n: 'Triglicerídeos', v: 128, u: 'mg/dL', lo: 0, hi: 150 },
    { n: 'Vitamina D', v: 24, u: 'ng/mL', lo: 30, hi: 60 },
    { n: 'TSH', v: 2.1, u: 'mUI/L', lo: 0.4, hi: 4.0 },
  ],
  historico: ['nov/2025', 'fev/2025', 'ago/2024'],
};

// ---------- Dinheiro ----------
export let ACCOUNTS = [
  { n: 'Conta principal', inst: 'Banco Alfa', v: 4180.55 },
  { n: 'Conta digital', inst: 'Banco Beta', v: 2050.10 },
];
// Salário cai daqui a 14 dias (data relativa, para a demonstração funcionar em qualquer dia).
// "Livre para gastar" é calculado no app: saldo − contas até o pagamento − fatura que vence antes dele.
export let SAFE = { saldo: 6230.65, paydayOff: 14, salario: 9200.00 };

// faturaExtra: gastos no Cartão Alfa registrados na demonstração, que aumentam a fatura aberta.
export function bills(paid = {}, faturaExtra = 0, t = new Date()) {
  if (REAL) return realBills(paid, faturaExtra, t);
  const base = [
    { id: 'academia', n: 'Academia', v: 129.90, day: 1, met: 'Cartão', pago: true, cat: 'Saúde' },
    { id: 'stream', n: 'Streaming', v: 55.90, day: 2, met: 'Cartão', pago: true, cat: 'Assinaturas' },
    { id: 'seguro', n: 'Seguro auto · parcela 4/10', v: 312.40, off: -1, met: 'Boleto (DDA)', cat: 'Transporte' },
    { id: 'internet', n: 'Internet', v: 119.90, off: 1, met: 'Boleto', cat: 'Moradia' },
    { id: 'energia', n: 'Energia', v: 218.35, off: 3, met: 'Débito automático', auto: true, cat: 'Moradia' },
    { id: 'celular', n: 'Celular', v: 64.99, off: 5, met: 'Débito automático', auto: true, cat: 'Moradia' },
    { id: 'veiculo', n: 'Parcela do veículo · 18/48', v: 1480.00, off: 8, met: 'Boleto', cat: 'Transporte' },
    { id: 'fatura', n: 'Fatura Cartão Alfa', v: 2915.40, off: 13, met: 'Débito em conta', cat: 'Cartão' },
    { id: 'agua', n: 'Água', v: 96.10, off: 15, met: 'Pix Automático', auto: true, cat: 'Moradia' },
    { id: 'aporte', n: 'Aporte da reserva', v: 500.00, off: 2, met: 'Pix programado', auto: true, cat: 'Investimento' },
  ];
  return base.map((b) => {
    // contas já pagas caem nos primeiros dias do mês atual (sem passar de hoje)
    const due = b.day ? new Date(t.getFullYear(), t.getMonth(), Math.min(b.day, t.getDate())) : addDays(t, b.off);
    const isPaid = b.pago || !!paid[b.id];
    const st = isPaid ? 'pago' : b.off < 0 ? 'atrasado' : b.auto ? 'agendado' : 'avencer';
    const v = b.id === 'fatura' ? Math.round((b.v + faturaExtra) * 100) / 100 : b.v;
    return { ...b, v, due, st, pago: isPaid };
  }).sort((a, b) => a.due - b.due);
}
export const ST = { pago: 'Pago', agendado: 'Agendado', avencer: 'A vencer', atrasado: 'Atrasado' };

export let CARDS = [
  { n: 'Cartão Alfa', fim: '4821', limite: 12000, fecha: 6, vence: 13,
    faturas: { fechada: { v: 3120.85, st: 'Paga' }, aberta: { v: 2915.40 }, proxima: { v: 1240.00 } },
    futuro: [1240, 980, 860, 610, 420, 260] },
  { n: 'Cartão Beta', fim: '0937', limite: 4500, fecha: 18, vence: 25,
    faturas: { fechada: { v: 412.30, st: 'Paga' }, aberta: { v: 286.70 }, proxima: { v: 0 } },
    futuro: [0, 0, 0, 0, 0, 0] },
];
export function cardTx(t = new Date()) {
  if (REAL) return [];
  const L = [
    [0, 'Supermercado Bairro', 'Mercado', 286.42],
    [0, 'Padaria Central', 'Alimentação fora', 23.50],
    [-1, 'Posto Avenida', 'Transporte', 210.00],
    [-1, 'App de delivery', 'Alimentação fora', 68.90],
    [-2, 'Loja de esportes', 'Compras', 89.90, '3/10'],
    [-3, 'Farmácia', 'Saúde', 74.35],
    [-4, 'Notebook', 'Compras', 412.50, '7/12'],
    [-4, 'App de transporte', 'Transporte', 31.20],
    [-6, 'Restaurante Japonês', 'Alimentação fora', 164.00],
    [-7, 'Streaming', 'Assinaturas', 55.90],
    [-8, 'Supermercado Bairro', 'Mercado', 341.18],
  ];
  return L.map(([o, n, c, v, parc]) => ({ d: addDays(t, o), n, c, v, parc }));
}
export let CATS = [
  { n: 'Moradia e contas', v: 1890, avg: 1860 },
  { n: 'Mercado', v: 1120, avg: 1050 },
  { n: 'Alimentação fora', v: 840, avg: 690 },
  { n: 'Transporte', v: 610, avg: 640 },
  { n: 'Compras', v: 520, avg: 480 },
  { n: 'Saúde', v: 420, avg: 410 },
  { n: 'Lazer', v: 380, avg: 450 },
  { n: 'Assinaturas', v: 190, avg: 190 },
];
const RESERVA = 14300;
export let SAVINGS = { taxa: 18, meta: 20, reserva: RESERVA, essenciais: 4200, reservaMeses: +(RESERVA / 4200).toFixed(1), reservaMeta: 6 };

export let BALANCE = {
  ativo: [
    { g: 'Circulante', itens: [['Caixa e contas', 6230.65], ['Reserva (CDB liquidez diária)', RESERVA], ['Valores a receber', 3000]] },
    { g: 'Investimentos', itens: [['Ações e FIIs', 38900], ['Tesouro IPCA+', 31700], ['Cripto', 2150]] },
    { g: 'Não circulante', itens: [['FGTS', 18300], ['Veículo (tabela FIPE)', 98000]] },
  ],
  passivo: [
    { g: 'Curto prazo', itens: [['Fatura aberta', 2915.40], ['Parcelas futuras no cartão', 4370]] },
    { g: 'Longo prazo', itens: [['Financiamento do veículo (saldo devedor)', 61200]] },
  ],
};
export function netWorthSeries() { if (REAL) return (REAL.serieMensal || []).map((x) => ({ d: new Date(+x.mes.slice(0, 4), +x.mes.slice(5, 7) - 1, 1), v: x.pl })); const r = rng(11); let v = 128400; return Array.from({ length: 12 }, (_, i) => { v += 900 + r() * 1300; const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 11 + i); return { d, v: Math.round(v) }; }); }

export const IMPORT_PREVIEW = [
  { d: -2, n: 'PIX ENVIADO JOAO S', v: -150.00, c: 'Transferência', conf: 'regra' },
  { d: -2, n: 'COMPRA CARTAO SUPERMERC BAIRRO', v: -286.42, c: 'Mercado', conf: 'regra' },
  { d: -3, n: 'RENDIMENTOS CDB', v: 41.87, c: 'Rendimentos', conf: 'regra' },
  { d: -4, n: 'PAGTO ELETRON TRIBUTO', v: -96.10, c: 'Moradia', conf: 'sugerida' },
  { d: -5, n: 'COMPRA CARTAO POSTO AV', v: -210.00, c: 'Transporte', conf: 'duplicada' },
  { d: -16, n: 'TED RECEBIDA SALARIO', v: 9200.00, c: 'Salário', conf: 'regra' },
];

// ---------- Agenda ----------
export function events() {
  return [
    { h: '08:30', fim: '09:00', t: 'Reunião semanal', src: 'Google Agenda', k: 'ev' },
    { h: '12:30', fim: '13:30', t: 'Almoço com cliente', src: 'Google Agenda', k: 'ev' },
    { h: '15:00', fim: '15:45', t: 'Revisão de projeto', src: 'Google Agenda', k: 'ev' },
  ];
}
export const TOP3 = [
  { id: 't1', t: 'Enviar proposta revisada', area: 'Pessoal' },
  { id: 't2', t: 'Agendar check-up anual', area: 'Saúde' },
  { id: 't3', t: 'Separar informes para o IR', area: 'Finanças' },
];
export const INBOX = [
  { t: 'Comprar whey', chips: ['#saude'] },
  { t: 'Trocar óleo do carro', chips: ['sábado'] },
];
export const BEDTIME = '22:30';

// ---------- Dados reais (opcional) ----------
// O arquivo painel-dados.json é gerado no computador da pessoa, a partir dos extratos dela, e carregado
// em Importar. Fica só no armazenamento deste navegador; nada vai para o repositório nem para servidor.
export let REAL = null;
export let CATS_TITLE = 'Gastos · últimos 30 dias';
const ym = (d) => iso(d).slice(0, 7);
const sum = (a) => a.reduce((s, x) => s + x, 0);
const r2 = (v) => Math.round(v * 100) / 100;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (k) => `${MESES[+k.slice(5, 7) - 1]}/${k.slice(2, 4)}`;

// Dia do "pagamento" no modo real: renda irregular, então a conta vai até o fim do mês.
export function payday(t) { return REAL ? new Date(t.getFullYear(), t.getMonth() + 1, 0) : addDays(t, SAFE.paydayOff); }

function realBills(paid, faturaExtra, t) {
  const tx = REAL.transacoes || [], mes = ym(t), hoje = startOfDay(t), corte = REAL.geradoEm;
  const dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  // Cada conta do arquivo diz qual categoria do extrato a quita (txCat); a do cartão principal vem com fatura: true.
  return (REAL.contasPagar || []).filter((b) => b.v != null && !b.flex).map((b) => {
    const id = b.fatura ? 'fatura' : b.id;
    const due = new Date(t.getFullYear(), t.getMonth(), Math.min(b.dia, dim));
    const hit = b.txCat ? tx.find((x) => x.d.startsWith(mes) && x.cat === b.txCat && x.v < 0) : null;
    const isPaid = !!hit || !!paid[id];
    let v = hit ? -hit.v : b.v;
    if (id === 'fatura' && !hit) v = r2(v + faturaExtra);
    const auto = /autom/i.test(b.met);
    const st = isPaid ? 'pago' : due < hoje && iso(due) <= corte ? 'atrasado' : auto ? 'agendado' : 'avencer';
    let n = b.n + (b.estimado && !hit ? ' · valor médio' : '');
    const P = b.passivo && (REAL.passivos || []).find((p) => p.id === b.passivo);
    if (P && P.prazo) { const k = P.pagas + (hit ? 0 : 1) + Math.max(0, (t.getFullYear() - +corte.slice(0, 4)) * 12 + t.getMonth() + 1 - +corte.slice(5, 7)); n = `${b.n} · ${Math.min(k, P.prazo)}/${P.prazo}`; }
    return { id, n, v: r2(v), due, st, pago: isPaid, met: b.met, cat: b.cat, auto };
  }).sort((a, b) => a.due - b.due);
}

export function useReal(R) {
  if (!R || R.schema !== 'painel-financas/1') throw new Error('arquivo não é do Painel');
  REAL = R;
  const cx = (R.contas || []).filter((c) => c.saldo != null);
  ACCOUNTS = cx.map((c) => ({ n: c.n, inst: c.inst, v: c.saldo }));
  const saldo = r2(sum(cx.map((c) => c.saldo)));
  SAFE = { saldo, paydayOff: 0, salario: 0 };
  const pag = (k) => (k.pagamentos || []).slice().sort((a, b) => (a.d < b.d ? -1 : 1));
  CARDS = (R.cartoes || []).map((k, i) => {
    const p = pag(k), last = p[p.length - 1];
    const aberta = i === 0 && R.faturaEstimada ? R.faturaEstimada : k.usado || 0;
    return { n: k.n, fim: '', limite: k.limite, fecha: null, vence: k.vence, faturas: { fechada: { v: last ? last.v : 0, st: 'Paga' }, aberta: { v: aberta }, proxima: { v: 0 } }, futuro: [0, 0, 0, 0, 0, 0], real: { ...k, pagamentos: p } };
  });
  // Gastos do último mês fechado, com a fatura paga no mês como uma linha só (o detalhe vem das faturas).
  const meses = Object.keys(R.gastosPorMes || {}).sort(), ref = meses.filter((m) => m < R.geradoEm.slice(0, 7)).pop() || meses[meses.length - 1];
  // "Moradia: água" e "Moradia: celular" somam em "Moradia"; o arquivo pode mandar grupos próprios em gruposGasto.
  const G = R.gruposGasto || {}, grupo = (c) => G[c] || c.split(':')[0];
  const porGrupo = (m) => { const o = {}; Object.entries((R.gastosPorMes || {})[m] || {}).forEach(([c, v]) => { const g = grupo(c); o[g] = (o[g] || 0) + v; }); const f = (R.cartaoPorMes || {})[m]; if (f) o['Fatura do cartão (sem detalhe)'] = f; return o; };
  const atual = porGrupo(ref), ant = meses.filter((m) => m < ref).slice(-6).map(porGrupo);
  const nomes = new Set([...Object.keys(atual), ...ant.flatMap((o) => Object.keys(o))]);
  CATS = [...nomes].map((n) => ({ n, v: r2(atual[n] || 0), avg: r2(ant.length ? sum(ant.map((o) => o[n] || 0)) / ant.length : atual[n] || 0) })).filter((c) => c.v || c.avg).sort((a, b) => b.v - a.v).slice(0, 8);
  CATS_TITLE = `Gastos de ${mesCurto(ref)} · conta e fatura paga no mês`;
  const caixinha = R.caixinha ? Math.max(0, r2(R.caixinha.aplicado - R.caixinha.resgatado)) : 0;
  const ess = R.essenciaisMes || 5000, reserva = r2(saldo + caixinha);
  SAVINGS = { taxa: R.taxaPoupanca ?? null, meta: 20, reserva, essenciais: ess, reservaMeses: +(reserva / ess).toFixed(1), reservaMeta: 6, essLabel: R.essenciaisLabel || '' };
  const inv = R.investimentosPorTipo || {}, invRef = R.investimentos ? mesCurto(R.investimentos.data) : '';
  const insts = [...new Set(cx.map((c) => c.inst))];
  const circ = [[`Contas (${insts.join(', ')})`, saldo]];
  if (caixinha) circ.push(['Caixinha', caixinha]);
  (R.outrosAtivos || []).forEach((x) => circ.push([x.n, x.v]));
  (R.receber || []).forEach((x) => circ.push([`A receber: ${x.n}`, x.saldo]));
  const passivo = (R.passivos || []).filter((p) => p.saldoDevedor);
  BALANCE = {
    ativo: [
      { g: 'Circulante', itens: circ },
      { g: 'Investimentos', itens: [['Ações', inv['Ações'] || 0], ['ETFs', inv.ETF || 0], ['FIIs', inv.FII || 0]].filter((x) => x[1]).map(([n, v]) => [`${n} (B3, ${invRef})`, v]) },
      { g: 'Não circulante', itens: (R.bens || []).map((b) => [`${b.n} (custo, até a FIPE)`, b.valor]) },
    ],
    passivo: [
      { g: 'Curto prazo', itens: passivo.filter((p) => !p.longo).map((p) => [p.n, p.saldoDevedor]) },
      { g: 'Longo prazo', itens: passivo.filter((p) => p.longo).map((p) => [p.prazo ? `${p.n}: ${p.restantes} de ${p.prazo} parcelas` : p.n, p.saldoDevedor]) },
    ],
  };
}
