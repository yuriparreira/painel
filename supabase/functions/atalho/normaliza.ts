// Lê o corpo que o atalho do iPhone (app Atalhos) manda. O formato muda com a versão do iOS e com o idioma do
// aparelho, então tudo aqui é tolerante: datas em ISO 8601 ou escritas em português, números com vírgula decimal,
// listas que chegam como texto (uma por linha) ou como listas de verdade, estágios do sono com nomes em português
// ou inglês. O que não dá para ler sai da conta e vira um aviso; nada vazio vira zero.

export type Amostra = { tipo: string; ini: string; fim: string; est?: string; fonte?: string; valor?: number };
export type Dia = { tipo: string; dia: string; valor: number };
export type Evento = { titulo: string; inicio: string; fim: string; dia_todo: boolean; calendario: string | null; local: string | null };
export type Dados = {
  tipo: string;
  amostras: Amostra[];
  dias: Dia[];
  sono_corte: string | null; // início da janela que o atalho leu: a noite cortada por ele não conta
  eventos?: Evento[];
  janela?: { de: string; ate: string };
  avisos: string[];
};

const OFF = '-03:00'; // Brasília, sem horário de verão desde 2019
const H = 3600e3;
export const diaLocal = (t: number) => new Date(t - 3 * H).toISOString().slice(0, 10);
const somaDias = (iso: string, n: number) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 24 * H).toISOString().slice(0, 10);
const meiaNoite = (iso: string) => Date.parse(`${iso}T00:00:00${OFF}`);
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------- Datas ----------
const MESES: Record<string, number> = {
  jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12,
};
const p2 = (n: number | string) => String(n).padStart(2, '0');
function montar(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): number | null {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && hh >= 0 && hh <= 24 && mm >= 0 && mm < 60 && ss >= 0 && ss < 61)) return null;
  const t = Date.parse(`${y}-${p2(m)}-${p2(d)}T${p2(hh === 24 ? 0 : hh)}:${p2(mm)}:${p2(Math.min(ss, 59))}${OFF}`);
  return Number.isFinite(t) ? t + (hh === 24 ? 24 * H : 0) : null;
}
// Devolve o instante em ms, ou null. aprox = true quando veio sem fuso (vale o de Brasília) ou escrito por extenso.
// Fora de 2000 a 2100 não é data de verdade (e quebraria a conversão para texto).
const T0 = Date.UTC(2000, 0, 1), T1 = Date.UTC(2100, 0, 1);
export function data(v: unknown): { t: number; aprox: boolean } | null {
  const r = dataBruta(v);
  return r && r.t >= T0 && r.t < T1 ? r : null;
}
function dataBruta(v: unknown): { t: number; aprox: boolean } | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 1e9 ? { t: v > 1e12 ? v : v * 1000, aprox: false } : null;
  const s = v.trim().replace(/ | /g, ' ');
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})$/i.exec(s);
  if (m) {
    const z = m[7].toUpperCase() === 'Z' ? 'Z' : m[7].length === 5 ? `${m[7].slice(0, 3)}:${m[7].slice(3)}` : m[7];
    const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}${z}`);
    return Number.isFinite(t) ? { t, aprox: false } : null;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) { const t = montar(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); return t == null ? null : { t, aprox: true }; }
  // 04/11/2026 19:55, 04/11/2026, 19:55:10
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[,\s]+(?:às\s+)?(\d{1,2})[:h](\d{2})(?::(\d{2}))?)?$/i.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const t = montar(y, +m[2], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return t == null ? null : { t, aprox: true };
  }
  // 4 de nov. de 2026 19:55 · 4 de novembro de 2026 às 19:55 · 4 nov 2026 19:55 · Nov 4, 2026 at 7:55 PM
  const x = semAcento(s.toLowerCase()).replace(/\s+/g, ' ');
  m = /^(\d{1,2})(?: de)? ([a-z]{3})[a-z]*\.?(?: de)? (\d{4})(?:,? (?:as |a |at )?(\d{1,2})[:h](\d{2})(?::(\d{2}))? ?(am|pm)?)?$/.exec(x)
    || (() => { const k = /^([a-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})(?:,? (?:at )?(\d{1,2}):(\d{2})(?::(\d{2}))? ?(am|pm)?)?$/.exec(x); return k ? [k[0], k[2], k[1], k[3], k[4], k[5], k[6], k[7]] as unknown as RegExpExecArray : null; })();
  if (m && MESES[m[2]]) {
    let hh = +(m[4] || 0);
    if (m[7] === 'pm' && hh < 12) hh += 12;
    if (m[7] === 'am' && hh === 12) hh = 0;
    const t = montar(+m[3], MESES[m[2]], +m[1], hh, +(m[5] || 0), +(m[6] || 0));
    return t == null ? null : { t, aprox: true };
  }
  return null;
}
const isoDe = (t: number) => new Date(t).toISOString();

// ---------- Números ----------
type Pref = 'int' | 'dec';
const FAIXA: Record<string, [number, number, Pref]> = {
  // Totais do dia: 1.234 ou 1,234 é milhar (1 kcal no dia não acontece); 523,4 continua decimal.
  passos: [0, 100000, 'int'], kcal: [0, 10000, 'int'], exerc: [0, 1440, 'int'],
  peso: [25, 350, 'dec'], fcr: [25, 150, 'dec'], vfc: [1, 400, 'dec'],
};
export function numero(v: unknown, tipo: string): number | null {
  const [lo, hi, pref] = FAIXA[tipo] || [-Infinity, Infinity, 'dec'];
  const ok = (n: number) => Number.isFinite(n) && n >= lo && n <= hi;
  if (typeof v === 'number') return ok(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.trim().toLowerCase().replace(/ | |\s/g, '');
  let fator = 1;
  if (/lb$|libras?$/.test(s)) fator = 0.45359237;
  if (/kj$/.test(s)) fator = 1 / 4.184;
  s = s.replace(/[a-zçãé/]+$/i, '');
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const cand: number[] = [];
  const temV = s.includes(','), temP = s.includes('.');
  if (temV && temP) {
    const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const mil = dec === ',' ? '.' : ',';
    cand.push(Number(s.split(mil).join('').replace(dec, '.')));
  } else if (temV) {
    if (/^-?\d{1,3}(,\d{3})+$/.test(s) && pref === 'int') cand.push(Number(s.replace(/,/g, '')));
    cand.push(Number(s.replace(',', '.')));
  } else if (temP) {
    const milhar = /^-?\d{1,3}(\.\d{3})+$/.test(s);
    if (milhar && pref === 'int') cand.push(Number(s.replace(/\./g, '')));
    cand.push(Number(s));
    if (milhar && pref !== 'int') cand.push(Number(s.replace(/\./g, '')));
  } else cand.push(Number(s));
  for (const n of cand) { const r = n * fator; if (ok(r)) return r; }
  return null;
}

// ---------- Sono ----------
export function estagio(v: unknown): string {
  const s = semAcento(String(v ?? '').toLowerCase()).trim();
  if (/^\d$/.test(s)) return ['inbed', 'asleep', 'awake', 'core', 'deep', 'rem'][+s] || '?';
  if (/profund|deep/.test(s)) return 'deep';
  if (/essencial|core|leve|light/.test(s)) return 'core';
  if (/\brem\b/.test(s)) return 'rem';
  if (/acordad|despert|awake/.test(s)) return 'awake';
  if (/cama|bed|deitad/.test(s)) return 'inbed';
  if (/dorm|asleep|adormec|sono|especificad|unspecified/.test(s)) return 'asleep';
  return '?';
}
export function booleano(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null;
  const s = semAcento(String(v ?? '').toLowerCase()).trim();
  if (['true', '1', 'yes', 'sim', 'verdadeiro', 's', 'y', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'nao', 'falso', 'n', 'off'].includes(s)) return false;
  return null;
}

// ---------- Listas ----------
export function lista(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'number') return [String(v)];
  if (typeof v !== 'string' || !v.trim()) return [];
  const L = v.split(/\r?\n/).map((x) => x.trim());
  if (L.length && L[L.length - 1] === '') L.pop();
  return L;
}
// Texto com registros separados por § e campos por ¦ (alternativa quando as listas não chegam alinhadas).
const linhas = (v: unknown): string[][] => (typeof v === 'string' && v.includes('¦') ? v.split(/\r?\n?§/).map((r) => r.trim()).filter(Boolean).map((r) => r.split('¦').map((x) => x.trim())) : []);

type Bruto = { ini: unknown; fim?: unknown; v?: unknown; f?: unknown };
// Junta um grupo vindo como listas paralelas, lista de objetos ou texto com § e ¦.
function grupo(c: Record<string, unknown>, g: string, chIni: string, comFim: boolean, avisos: string[]): Bruto[] {
  const lin = linhas(c[`${g}_linhas`]);
  if (lin.length) return lin.map((r) => (comFim ? { ini: r[0], fim: r[1], v: r[2], f: r[3] } : { ini: r[0], v: r[1] }));
  const obj = Array.isArray(c[g]) ? (c[g] as unknown[]).map((o) => (typeof o === 'string' ? (() => { try { return JSON.parse(o); } catch { return null; } })() : o)).filter((o) => o && typeof o === 'object') as Record<string, unknown>[] : [];
  if (obj.length) return obj.map((o) => ({ ini: o.ini ?? o.inicio ?? o.start, fim: o.fim ?? o.end, v: o.v ?? o.valor ?? o.value ?? o.est, f: o.f ?? o.fonte ?? o.source }));
  const ini = lista(c[`${g}_${chIni}`]);
  if (!ini.length) return [];
  const fim = comFim ? lista(c[`${g}_fim`]) : [];
  const v = lista(c[`${g}_${comFim ? 'est' : 'v'}`]);
  const f = lista(c[`${g}_fonte`]);
  const n = ini.length;
  if (v.length !== n || (comFim && fim.length !== n) || (f.length && f.length !== n)) {
    avisos.push(`${g}: listas desalinhadas (${[n, comFim ? fim.length : null, v.length, f.length || null].filter((x) => x != null).join('/')})`);
    return [];
  }
  return ini.map((x, i) => ({ ini: x, fim: comFim ? fim[i] : undefined, v: v[i], f: f.length ? f[i] : '' }));
}

const PONTOS = ['peso', 'fcr', 'vfc'], TOTAIS = ['passos', 'kcal', 'exerc'];
const CAL_IGNORAR = ['aniversarios', 'birthdays', 'sugestoes da siri', 'siri suggestions'];

// ---------- Agenda ----------
function eventosBrutos(c: Record<string, unknown>): { L: Record<string, unknown>[]; erro: string | null } | null {
  const lin = linhas(c.eventos_linhas);
  if (lin.length) return { L: lin.map((r) => ({ t: r[0], ini: r[1], fim: r[2], dia: r[3], cal: r[4], loc: r.slice(5).join(' ¦ ') })), erro: null };
  if (!('eventos' in c) && !('eventos_linhas' in c)) return null;
  let v: unknown = c.eventos ?? c.eventos_linhas;
  if (v == null || v === '') return { L: [], erro: null };
  if (typeof v === 'string') {
    const s = v.trim();
    try { v = JSON.parse(s.startsWith('{') ? `[${s}]` : s); } catch {
      // Campo Texto em vez de Matriz: o Atalhos junta os Dicionários um por linha.
      try { v = s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).map((x) => JSON.parse(x)); } catch { return { L: [], erro: 'eventos: não é uma lista' }; }
    }
  }
  if (Array.isArray(v)) {
    const L = v.map((o) => (typeof o === 'string' ? (() => { try { return JSON.parse(o); } catch { return null; } })() : o));
    if (L.some((o) => !o || typeof o !== 'object')) return { L: [], erro: 'eventos: item que não é um evento' };
    return { L: L as Record<string, unknown>[], erro: null };
  }
  if (v && typeof v === 'object') return { L: [v as Record<string, unknown>], erro: null };
  return { L: [], erro: 'eventos: formato desconhecido' };
}
// Texto de uma linha, sem os caracteres que o banco recusa (NUL e metade de um par UTF-16, que derrubariam a chamada).
export const limpo = (v: string) => v.replace(/\u0000/g, '').replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '');
const txt = (v: unknown, n: number) => limpo(String(v ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, n));

export function normalizar(c: Record<string, unknown>, agora = Date.now(), ignorar: string[] = CAL_IGNORAR): Dados | { erro: string } {
  const avisos: string[] = [];
  const out: Dados = { tipo: 'tudo', amostras: [], dias: [], sono_corte: null, avisos };
  // Onde começou a leitura do atalho (todas as buscas da Saúde usam a mesma janela): o dia do sono mais antigo ou do
  // primeiro total do dia que veio (passos vêm todo dia). O peso e a frequência ficam de fora: podem vir de mais longe.
  let corte = Infinity;
  let aprox = 0, invalidas = 0;
  const quando = (v: unknown) => { const d = data(v); if (!d) { invalidas++; return null; } if (d.aprox) aprox++; return d.t; };
  const hoje = diaLocal(agora);
  const limite = agora + 2 * 24 * H;

  // Saúde
  const sono = grupo(c, 'sono', 'ini', true, avisos);
  const desconhecidos = new Set<string>();
  for (const s of sono) {
    const ini = quando(s.ini), fim = quando(s.fim);
    if (ini == null || fim == null || fim < ini || ini > limite) continue;
    const est = estagio(s.v);
    if (est === '?') desconhecidos.add(txt(s.v, 30));
    out.amostras.push({ tipo: 'sono', ini: isoDe(ini), fim: isoDe(fim), est, fonte: txt(s.f, 120) });
    corte = Math.min(corte, ini);
  }
  if (desconhecidos.size) avisos.push(`sono: estágios desconhecidos (${[...desconhecidos].slice(0, 3).map((x) => `"${x}"`).join(', ')})`);
  for (const g of PONTOS) {
    for (const s of grupo(c, g, 'em', false, avisos)) {
      const ini = quando(s.ini); if (ini == null || ini > limite) continue;
      const v = numero(s.v, g); if (v == null) { if (String(s.v ?? '').trim()) avisos.push(`${g}: valor fora da faixa (${txt(s.v, 20)})`); continue; }
      out.amostras.push({ tipo: g, ini: isoDe(ini), fim: isoDe(ini), fonte: txt(s.f, 120), valor: Math.round(v * 100) / 100 });
    }
  }
  for (const g of TOTAIS) {
    const porDia = new Map<string, number>();
    for (const s of grupo(c, g, 'dia', false, avisos)) {
      const ini = quando(s.ini); if (ini == null || ini > limite) continue;
      const v = numero(s.v, g); if (v == null) { if (String(s.v ?? '').trim()) avisos.push(`${g}: valor fora da faixa (${txt(s.v, 20)})`); continue; }
      const d = diaLocal(ini + 60e3); // 23:59:59 do dia anterior por arredondamento ainda é o dia certo
      porDia.set(d, Math.max(porDia.get(d) || 0, v));
      if (d <= hoje) corte = Math.min(corte, meiaNoite(d));
    }
    porDia.forEach((v, d) => { if (d <= hoje) out.dias.push({ tipo: g, dia: d, valor: Math.round(v * 10) / 10 }); });
  }
  if (Number.isFinite(corte)) out.sono_corte = isoDe(meiaNoite(diaLocal(corte)));
  // A mesma amostra duas vezes (dois apps, ou datas sem segundos) vira uma só: o banco grava cada uma uma vez.
  const vistas = new Map<string, Amostra>();
  for (const a of out.amostras) vistas.set([a.tipo, a.ini, a.fim, a.est || '', a.fonte || ''].join('|'), a);
  out.amostras = [...vistas.values()];

  // Agenda
  let ev = eventosBrutos(c);
  // Eventos ilegíveis junto com a saúde: a saúde grava e a agenda fica como estava.
  if (ev && ev.erro) { if (out.amostras.length || out.dias.length) { avisos.push(`${ev.erro}; a agenda não mudou`); ev = null; } else return { erro: ev.erro }; }
  if (ev) {
    const de = meiaNoite(somaDias(hoje, -1)), ate = meiaNoite(somaDias(hoje, 15));
    const vistos = new Set<string>();
    const L: Evento[] = [];
    for (const o of ev.L) {
      const titulo = txt(o.t ?? o.titulo ?? o.title, 200);
      const cal = txt(o.cal ?? o.calendario ?? o.calendar, 100);
      if (!titulo) continue;
      if (cal && ignorar.includes(semAcento(cal.toLowerCase()))) continue;
      const ini = quando(o.ini ?? o.inicio ?? o.start);
      if (ini == null) continue;
      const fv = o.fim ?? o.end;
      let fim = fv == null || fv === '' ? null : quando(fv); // sem fim: termina quando começa
      if (fim == null || fim < ini) fim = ini;
      let diaTodo = booleano(o.dia ?? o.diaTodo ?? o.allDay);
      if (diaTodo == null) {
        const li = new Date(ini - 3 * H), lf = new Date(fim - 3 * H);
        const zero = li.getUTCHours() === 0 && li.getUTCMinutes() === 0;
        const fimOk = (lf.getUTCHours() === 23 && lf.getUTCMinutes() === 59) || (lf.getUTCHours() === 0 && lf.getUTCMinutes() === 0 && fim > ini);
        diaTodo = zero && fimOk && fim - ini >= 23 * H + 59 * 60e3;
      }
      if (fim <= de || ini >= ate) continue;
      const k = `${titulo}|${ini}|${fim}|${cal}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      L.push({ titulo, inicio: isoDe(ini), fim: isoDe(fim), dia_todo: !!diaTodo, calendario: cal || null, local: txt(String(o.loc ?? o.local ?? o.location ?? '').replace(/\s*[\r\n]+\s*/g, ', '), 200) || null });
    }
    out.eventos = L;
    out.janela = { de: isoDe(de), ate: isoDe(ate) };
  }

  const temSaude = out.amostras.length > 0 || out.dias.length > 0;
  const t = String(c.tipo ?? '').toLowerCase();
  out.tipo = ['agenda', 'saude', 'tudo', 'treino'].includes(t) ? t : ev && temSaude ? 'tudo' : ev ? 'agenda' : 'saude';
  if (aprox) avisos.push(`${aprox} data${aprox > 1 ? 's' : ''} sem fuso ou por extenso`);
  if (invalidas) avisos.push(`${invalidas} data${invalidas > 1 ? 's' : ''} que não deu para ler`);
  return out;
}

// Uma linha para a notificação do iPhone. Os valores saem só do que veio nesta chamada (do banco, só as contagens): a
// resposta não mostra o que já estava guardado a quem só tem o token.
const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');
const milhar = (v: number) => Math.round(v).toLocaleString('pt-BR');
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
// A noite mais recente da chamada, contada como no banco: por fonte, trechos dormindo juntos (os que se sobrepõem
// contam uma vez), sessões separadas por mais de 3 h, pela data em que acordou; a fonte com estágios vence. Uma noite
// que começa nas 3 primeiras horas depois do corte pode ter sido cortada pela leitura e não conta.
export function noite(am: Amostra[], corte: string | null = null): { d: string; h: number } | null {
  const c0 = corte ? Date.parse(corte) : NaN;
  const por = new Map<string, [number, number][]>(), fases = new Set<string>();
  for (const a of am) {
    if (a.tipo !== 'sono') continue;
    const f = a.fonte || '';
    if (['core', 'deep', 'rem'].includes(a.est || '')) fases.add(f);
    if (!['core', 'deep', 'rem', 'asleep'].includes(a.est || '')) continue;
    const i = Date.parse(a.ini), e = Date.parse(a.fim);
    if (e > i) (por.get(f) || por.set(f, []).get(f)!).push([i, e]);
  }
  let melhor: { d: string; h: number; f: boolean } | null = null;
  por.forEach((L, f) => {
    L.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const m: [number, number][] = [];
    for (const [i, e] of L) { const u = m[m.length - 1]; if (u && i <= u[1]) u[1] = Math.max(u[1], e); else m.push([i, e]); }
    let ses: [number, number][] = [];
    const fecha = () => {
      if (!ses.length) return;
      const h = ses.reduce((t, [i, e]) => t + (e - i), 0) / H, d = diaLocal(ses[ses.length - 1][1]), c = { d, h, f: fases.has(f) };
      const cortada = Number.isFinite(c0) && ses[0][0] >= c0 && ses[0][0] < c0 + 3 * H;
      if (h >= 0.5 && !cortada && (!melhor || d > melhor.d || (d === melhor.d && (c.f !== melhor.f ? c.f : h > melhor.h)))) melhor = c;
      ses = [];
    };
    for (const x of m) { const u = ses[ses.length - 1]; if (u && x[0] - u[1] > 3 * H) fecha(); ses.push(x); }
    fecha();
  });
  return melhor ? { d: (melhor as { d: string }).d, h: (melhor as { h: number }).h } : null;
}
export function resposta(d: Dados, r: Record<string, unknown>, agora = Date.now()): string {
  const partes: string[] = [];
  if (d.eventos) partes.push(`agenda: ${d.eventos.length} evento${d.eventos.length === 1 ? '' : 's'}${d.janela ? ` (${dm(diaLocal(Date.parse(d.janela.de)))} a ${dm(diaLocal(Date.parse(d.janela.ate) - 1))})` : ''}`);
  if (d.tipo !== 'agenda') {
    const hoje = diaLocal(agora), ate = agora + 24 * H;
    const ultimo = (t: string) => d.amostras.filter((a) => a.tipo === t && typeof a.valor === 'number' && Date.parse(a.ini) <= ate).sort((x, y) => x.ini.localeCompare(y.ini)).pop();
    const passos = d.dias.filter((x) => x.tipo === 'passos' && x.dia <= hoje).sort((x, y) => x.dia.localeCompare(y.dia)).pop();
    const s = noite(d.amostras.filter((a) => Date.parse(a.ini) <= ate), d.sono_corte), peso = ultimo('peso'), vfc = ultimo('vfc'), fcr = ultimo('fcr');
    const nada = r && r.amostras === 0 && r.dias === 0;
    const itens = nada ? [] : [
      s ? `sono ${n1(s.h)} h (${dm(s.d)})` : null,
      passos ? `passos ${milhar(passos.valor)}${passos.dia === hoje ? '' : ` (${dm(passos.dia)})`}` : null,
      peso ? `peso ${n1(peso.valor as number)}` : null,
      vfc ? `VFC ${Math.round(vfc.valor as number)}` : null,
      fcr ? `FCR ${Math.round(fcr.valor as number)}` : null,
    ].filter(Boolean);
    partes.push(`saúde: ${itens.length ? itens.join(' · ') : d.amostras.length || d.dias.length ? (nada ? 'nada gravado (datas fora do período)' : 'gravado') : 'nada novo'}`);
  }
  const linha = `${d.avisos.length ? 'AVISO' : 'OK'} ${partes.join(' | ')}${d.avisos.length ? ` · ${d.avisos.slice(0, 2).join(' · ')}` : ''}`;
  return linha.length > 240 ? linha.slice(0, 237) + '…' : linha;
}
