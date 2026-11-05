// Os seus registros na nuvem (Supabase): o mesmo estado no celular e no computador, e de volta num aparelho novo.
// O estado vira entradas [quando, aparelho, valor em JSON ou null, dia]. Na junção de dois aparelhos ganha, em cada
// entrada, o valor mais novo, com cinco exceções: o primeiro dia (since) fica o mais antigo na primeira vez de dois
// aparelhos, o dia atual (day) o mais novo, os recordes o maior, no histórico um dia com check-in vence a pausa, que
// vence a falta, e o registro de um dia (dias) junta o que cada aparelho anotou.
// Apagar vira uma entrada sem valor (lápide), para o outro aparelho também apagar; a lápide some em 60 dias, e um
// aparelho que passou mais tempo que isso sem ver a nuvem fica com a cópia dela no lugar da sua.
// O que é do dia (check-in, missões, séries, refeições) leva o dia junto: o de um dia que já virou não volta como dia
// atual. Se só um lado tinha esse dia, ele volta para o app fechar (histórico e registro do dia) em vez de sumir.
// O XP é a soma das parcelas de cada aparelho, e cada um só mexe na sua: o mesmo ponto nunca conta duas vezes.
// Fica só neste aparelho: tema, rascunhos, cronômetro do treino, filtros e telas abertas.
// Na primeira vez de um aparelho, o que ele já tinha entra com uma marca de tempo baixa (abaixo de qualquer data real),
// maior para quem tem mais XP: na dúvida vence o aparelho mais usado, e qualquer mudança de verdade vence as duas.

export const ESCALAR = ['nome', 'onboarded', 'pausa', 'streak', 'brasaAt', 'since', 'day', 'best', 'bossSeed', 'bossMonth', 'bossWon', 'bossWonDay',
  'weight', 'checkin', 'sleep', 'perfect', 'closed', 'missaoRef', 'corpoKey', 'corpoMin', 'combByMeals', 'dayType', 'inboxXp', 'prToday'];
export const MAPA = ['quests', 'sets', 'meals', 'mealXp', 'qxp', 'hist', 'dias', 'semXp', 'conq', 'good', 'best1rm', 'lastSets', 'paid', 'paidAmt', 'paidAt'];
export const LISTA = ['inbox', 'expenses'];
export const CONJ = ['txUsados'];
// Zerados na virada do dia.
export const DIARIO = new Set(['checkin', 'sleep', 'perfect', 'closed', 'missaoRef', 'corpoKey', 'corpoMin', 'combByMeals', 'dayType', 'inboxXp', 'prToday',
  'quests', 'sets', 'meals', 'mealXp', 'qxp']);
const LAPIDE_MS = 60 * 864e5;
export const BASE_MAX = 1e11; // Date.now() já passa de 1,6e12

const ESC = new Set(ESCALAR), MAP = new Set(MAPA), LIS = new Set(LISTA), CON = new Set(CONJ);
export const campo = (k) => { const m = /^[A-Za-z0-9]+/.exec(k); return m ? m[0] : ''; };
const diario = (k) => DIARIO.has(campo(k));

// JSON com as chaves em ordem: o mesmo valor dá sempre o mesmo texto, em qualquer aparelho.
export function js(v) {
  if (v === undefined || typeof v === 'function') return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(js).join(',')}]`;
  return `{${Object.keys(v).filter((k) => v[k] !== undefined && typeof v[k] !== 'function').sort().map((k) => `${JSON.stringify(k)}:${js(v[k])}`).join(',')}}`;
}

// O estado em entradas chave → JSON. Fica de fora o que é igual ao padrão (um aparelho novo não apaga nada).
export function achatar(S, D0) {
  const m = new Map();
  for (const f of ESCALAR) { const v = S[f]; if (v === undefined) continue; const j = js(v); if (j !== js(D0[f])) m.set(f, j); }
  for (const f of MAPA) {
    const o = S[f], d = D0[f] || {};
    if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
    for (const k of Object.keys(o)) { const v = o[k]; if (v === undefined) continue; const j = js(v); if (k in d && j === js(d[k])) continue; m.set(`${f}|${k}`, j); }
  }
  for (const f of LISTA) for (const x of Array.isArray(S[f]) ? S[f] : []) if (x && typeof x === 'object' && x.id != null && x.id !== '') m.set(`${f}#${x.id}`, js(x));
  for (const f of CONJ) for (const v of Array.isArray(S[f]) ? S[f] : []) if (typeof v === 'string') m.set(`${f}*${v}`, '1');
  return m;
}

const nova = (M, agora) => (M.hlc = Math.max(agora, (M.hlc || 0) + 1));
// Registra no documento local o que mudou no estado desde o último registro. Devolve true se mudou algo.
export function registrar(S, M, D0, agora = Date.now()) {
  const cur = achatar(S, D0), dia = typeof S.day === 'string' ? S.day : null;
  let ts = 0, mudou = false;
  const ent = (k, v) => { ts = ts || nova(M, agora); return diario(k) ? [ts, M.dev, v, dia] : [ts, M.dev, v]; };
  for (const [k, v] of cur) {
    const e = M.e[k];
    if (!e || e[2] !== v || (diario(k) && e[3] !== dia)) { M.e[k] = ent(k, v); mudou = true; }
  }
  // A lápide de uma entrada do dia que ficou de um dia anterior (a virada limpou) leva o dia dela: assim não disputa com
  // o que o outro aparelho já anotou no dia novo.
  for (const k of Object.keys(M.e)) if (M.e[k][2] !== null && !cur.has(k)) {
    const o = M.e[k][3];
    M.e[k] = diario(k) && typeof o === 'string' && o !== dia ? [ts = ts || nova(M, agora), M.dev, null, o] : ent(k, null);
    mudou = true;
  }
  // A parcela de XP deste aparelho é o que falta para chegar ao total que ele mostra.
  const n = (Number.isFinite(S.xp) ? S.xp : 0) - (Number.isFinite(M.ox) ? M.ox : 0), c = M.x[M.dev];
  if (!c || c[0] !== n) { ts = ts || nova(M, agora); M.x[M.dev] = [n, ts]; mudou = true; }
  return mudou;
}

// A primeira vez deste aparelho: tudo o que ele tem entra com a marca baixa w.
export function marcarBase(S, M, D0, somaNuvem) {
  const xp = Number.isFinite(S.xp) ? Math.max(0, S.xp) : 0, w = 1 + Math.min(Math.round(xp), BASE_MAX - 2), dia = typeof S.day === 'string' ? S.day : null;
  M.e = {};
  for (const [k, v] of achatar(S, D0)) M.e[k] = diario(k) ? [w, M.dev, v, dia] : [w, M.dev, v];
  // O XP fica o maior dos dois (o deste aparelho ou o da nuvem), nunca a soma: o mesmo dia pode estar nos dois.
  M.x = { [M.dev]: [Math.max(0, xp - (somaNuvem || 0)), w] };
  M.ox = somaNuvem || 0;
}

const prio = (v) => (v === '1' ? 2 : v === '"p"' ? 1 : 0);
const igual = (a, b) => a === b || (!!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]);
const lww = (a, b) => (a[0] !== b[0] ? (a[0] > b[0] ? a : b) : a[1] !== b[1] ? (String(a[1]) > String(b[1]) ? a : b) : String(a[2]) >= String(b[2]) ? a : b);
const objeto = (j) => { try { const v = JSON.parse(j); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } };
export function vence(k, a, b) {
  if (!a) return b;
  if (!b) return a;
  const f = campo(k), va = a[2], vb = b[2];
  if (va !== null && vb !== null && va !== vb) {
    // O primeiro dia fica o mais antigo só entre duas primeiras vezes; depois (Recomeçar do zero) vale o mais novo.
    if (f === 'since' && a[0] < BASE_MAX && b[0] < BASE_MAX) return va <= vb ? a : b;
    if (f === 'day') return va >= vb ? a : b;
    if (f === 'best' || f === 'best1rm') { const x = +va, y = +vb; if (Number.isFinite(x) && Number.isFinite(y) && x !== y) return x > y ? a : b; }
    if (f === 'hist' && prio(va) !== prio(vb)) return prio(va) > prio(vb) ? a : b;
    // O registro de um dia feito em dois aparelhos (check-in num, treino no outro) junta os dois.
    if (f === 'dias') {
      const oa = objeto(va), ob = objeto(vb);
      if (oa && ob) { const n = lww(a, b), u = n === a ? { ...ob, ...oa } : { ...oa, ...ob }; return [n[0], n[1], js(u)]; }
    }
  }
  return lww(a, b);
}
const okEnt = (e) => Array.isArray(e) && e.length >= 3 && Number.isFinite(e[0]) && (e[2] === null || typeof e[2] === 'string');
export function docOk(doc) {
  const e = {}, x = {};
  if (doc && typeof doc === 'object' && doc.e && typeof doc.e === 'object') for (const k of Object.keys(doc.e)) if (campo(k) && okEnt(doc.e[k])) e[k] = doc.e[k];
  if (doc && typeof doc === 'object' && doc.x && typeof doc.x === 'object') for (const d of Object.keys(doc.x)) { const c = doc.x[d]; if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) x[d] = c; }
  return { e, x };
}
const diaDe = (e) => { try { const v = e && e.day && e.day[2] !== null ? JSON.parse(e.day[2]) : null; return typeof v === 'string' ? v : null; } catch { return null; } };

// Junta o documento local (L) com o da nuvem (R). local: a nuvem precisa receber o resultado; remoto: o aparelho
// precisa aplicar o resultado. velhos: o que um dos lados ainda tinha de um dia anterior ao dia juntado, que nenhum
// aparelho fechou ({ dia: { chave: entrada } }); o app fecha esse dia (histórico, registro do dia) em vez de perder.
export function juntar(L, R, agora = Date.now()) {
  const e = {}, x = {}, velhos = {};
  const dia = diaDe({ day: vence('day', L.e.day, R.e.day) });
  // Do dia juntado vence o mais novo; o de outro dia não disputa (nem a lápide de uma virada mais nova de outro dia).
  const doDia = (k, a) => {
    if (!a || !diario(k) || a[3] === dia) return a;
    if (a[2] !== null && dia && typeof a[3] === 'string' && a[3] < dia) { const V = (velhos[a[3]] = velhos[a[3]] || {}); if (!V[k] || lww(V[k], a) === a) V[k] = a; }
    return undefined;
  };
  for (const k of new Set([...Object.keys(L.e), ...Object.keys(R.e)])) {
    const v = vence(k, doDia(k, L.e[k]), doDia(k, R.e[k]));
    if (v && !(v[2] === null && v[0] < agora - LAPIDE_MS)) e[k] = v;
  }
  for (const d of new Set([...Object.keys(L.x), ...Object.keys(R.x)])) {
    const a = L.x[d], b = R.x[d];
    x[d] = !a ? b : !b ? a : a[1] !== b[1] ? (a[1] > b[1] ? a : b) : a[0] >= b[0] ? a : b;
  }
  const dif = (A) => {
    const ks = new Set([...Object.keys(A.e), ...Object.keys(e)]);
    for (const k of ks) if (!igual(A.e[k], e[k])) return true;
    const ds = new Set([...Object.keys(A.x), ...Object.keys(x)]);
    for (const d of ds) if (!igual(A.x[d], x[d])) return true;
    return false;
  };
  return { e, x, velhos, local: dif(R), remoto: dif(L) };
}

const somaXP = (x) => Object.values(x).reduce((a, c) => a + (Number.isFinite(c[0]) ? c[0] : 0), 0);
const copia = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
// Põe no estado o que o documento diz (o que é só deste aparelho fica como está). Devolve o XP dos outros aparelhos.
export function aplicar(S, e, x, D0, dev) {
  const dia = diaDe(e);
  for (const f of ESCALAR) S[f] = copia(D0[f]);
  for (const f of MAPA) S[f] = { ...copia(D0[f] || {}) };
  const L = { inbox: [], expenses: [] }, C = { txUsados: [] };
  for (const k of Object.keys(e)) {
    const en = e[k];
    if (!en || en[2] === null || (diario(k) && en[3] !== dia)) continue;
    let v; try { v = JSON.parse(en[2]); } catch { continue; }
    const f = campo(k), s = k.charAt(f.length), r = k.slice(f.length + 1);
    if (!s && ESC.has(f)) S[f] = v;
    else if (s === '|' && MAP.has(f)) S[f][r] = v;
    else if (s === '#' && LIS.has(f)) { if (v && typeof v === 'object' && !Array.isArray(v)) L[f].push(v); }
    else if (s === '*' && CON.has(f)) C[f].push(r);
  }
  const id = (a, b) => String(a.id).localeCompare(String(b.id));
  S.inbox = L.inbox.sort((a, b) => (Number(b.o) || 0) - (Number(a.o) || 0) || id(a, b)); // a mais nova em cima
  S.expenses = L.expenses.sort((a, b) => String(a.t || a.d || '').localeCompare(String(b.t || b.d || '')) || id(a, b));
  S.txUsados = C.txUsados.sort();
  const total = somaXP(x);
  S.xp = Math.max(0, total);
  return total - ((x[dev] && x[dev][0]) || 0);
}

const maxTs = (R, agora) => {
  let m = 0;
  for (const v of Object.values(R.e)) if (v[0] > m && v[0] < agora + 864e5) m = v[0];
  for (const c of Object.values(R.x)) if (c[1] > m && c[1] < agora + 864e5) m = c[1];
  return m;
};
const novoDev = () => { try { return crypto.randomUUID().slice(0, 8); } catch { return Math.random().toString(36).slice(2, 10); } };
const metaOk = (m) => !!(m && typeof m === 'object' && typeof m.dev === 'string' && m.e && typeof m.e === 'object' && m.x && typeof m.x === 'object');

// O que o app entrega: chave do armazenamento, o estado atual (getS), os valores padrão (D0), se há login (ligada),
// a época da sessão (muda ao sair ou entrar), ler(rev) e salvar(doc, base, aparelho, keepalive) do Supabase,
// aoAplicar() quando a nuvem trouxe mudanças, aoStatus() quando o estado da sincronização muda e rotulo().
export function criarNuvem(o) {
  const st = { ocupado: false, erro: null, lido: 0, parado: false, on: false };
  let timer = null, cadeia = Promise.resolve(), voando = null;
  const ls = () => o.armazem || localStorage;
  const lerMeta = () => { try { const m = JSON.parse(ls().getItem(o.chave) || 'null'); const ok = metaOk(m); st.on = ok && !!m.on; return ok ? m : null; } catch { return null; } };
  const gravarMeta = (M) => { st.on = !!M.on; try { ls().setItem(o.chave, JSON.stringify(M)); return true; } catch { return false; } };
  const novaMeta = () => ({ v: 1, dev: novoDev(), rev: 0, e: {}, x: {}, ox: 0, hlc: 0, on: false, sujo: false, em: null });
  const trava = (fn) => (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request ? navigator.locks.request('painel-nuvem', fn) : fn());
  const fila = (fn) => { const p = cadeia.then(fn, fn); cadeia = p.catch(() => {}); return p; };
  lerMeta();
  const status = () => { try { o.aoStatus && o.aoStatus(); } catch { /* quem ouve trata */ } };
  // Longe da nuvem por mais tempo do que as lápides duram (o que foi apagado no outro aparelho pode já não ter lápide lá).
  const longe = (m) => !!(m && m.on && Number.isFinite(m.visto) && Date.now() - m.visto > LAPIDE_MS - 2 * 864e5);

  // Um envio na saída da tela (enviarJa) pode ter registrado e gravado no armazenamento enquanto um ciclo esperava a
  // rede: o que ele anotou deste aparelho entra na cópia do ciclo, para o ciclo não gravar por cima uma versão sem isso
  // (e para um desfazer feito logo depois ganhar dele).
  function absorver(M) {
    const N = lerMeta(); if (!N || !N.on || N.dev !== M.dev) return;
    for (const k of Object.keys(N.e)) { const a = M.e[k], b = N.e[k]; if (b[1] === M.dev && (!a || b[0] > a[0])) { M.e[k] = b; M.sujo = true; } }
    const c = N.x[M.dev]; if (c && (!M.x[M.dev] || c[1] > M.x[M.dev][1])) { M.x[M.dev] = c; M.sujo = true; }
    M.hlc = Math.max(M.hlc || 0, N.hlc || 0);
    if (Number.isFinite(N.feito)) M.feito = Math.max(Number.isFinite(M.feito) ? M.feito : 0, N.feito);
  }

  function fundir(M, r, base = false) {
    const S = o.getS(), D0 = o.D0(), agora = Date.now();
    if (!base) registrar(S, M, D0, agora); // o que mudou aqui durante a espera também entra (na primeira vez já entrou)
    const R = docOk(r.doc), J = juntar({ e: M.e, x: M.x }, R, agora);
    M.e = J.e; M.x = J.x; M.rev = Number(r.rev) || 0; M.visto = agora;
    M.hlc = Math.max(M.hlc || 0, maxTs(R, agora));
    // O que a junção tem e a nuvem ainda não (inclusive um registro do dia juntado dos dois aparelhos, que leva a marca
    // do outro): sai da lista quando um envio dá certo.
    M.sobe = {}; for (const k of Object.keys(J.e)) if (!igual(J.e[k], R.e[k])) M.sobe[k] = 1;
    // A nuvem já tem tudo o que está aqui (mesmo que a resposta de um envio tenha se perdido).
    if (!J.local) M.feito = Math.max(Number.isFinite(M.feito) ? M.feito : 0, M.hlc, BASE_MAX);
    if (J.remoto) M.ox = aplicar(S, J.e, J.x, D0, M.dev);
    // Um dia que ficou para trás sem ninguém fechar (check-in de ontem que só um lado tinha) vira histórico aqui.
    let fechou = false;
    if (o.fechar && Object.keys(J.velhos).length) { try { fechou = !!o.fechar(S, J.velhos); } catch { /* fica sem fechar */ } }
    if (J.remoto || fechou) o.aoAplicar();
    M.sujo = J.local;
    // O app pode ter ajustado o estado ao aplicar (formatos, mês do chefe, Chama): fica registrado agora.
    if ((J.remoto || fechou) && registrar(o.getS(), M, D0)) M.sujo = true;
  }

  async function ciclo(puxar, keepalive) {
    if (st.parado || !o.ligada()) return 'desligada';
    const ep = o.epoca();
    const saiu = () => st.parado || ep !== o.epoca() || !o.ligada();
    return trava(async () => {
      if (saiu()) return 'desligada';
      st.ocupado = true; status();
      try {
        let M = lerMeta() || novaMeta(), r = null, base = false;
        const volta = longe(M);
        if (volta) { M.on = false; M.rev = 0; } // lê a nuvem inteira e junta como na primeira vez (abaixo)
        if (!M.on) {
          r = await o.ler(null);
          if (saiu()) return 'desligada';
          st.lido = Date.now();
          const R = docOk(r && r.doc);
          const N = lerMeta();
          if (N && N.on && !longe(N)) M = N;
          if (!M.on && volta && Object.keys(R.e).length) {
            // De volta depois de muito tempo longe da nuvem: sai daqui o que a nuvem já recebeu (ela tem a versão certa;
            // senão o que foi apagado no outro aparelho voltaria daqui). Fica o que nunca chegou a subir: o anotado aqui
            // depois do último envio que deu certo (inclusive durante esta leitura) e o que a última junção não enviou.
            absorver(M); registrar(o.getS(), M, o.D0());
            const feito = Number.isFinite(M.feito) ? M.feito : 0, sobe = M.sobe || {}, agora = Date.now();
            for (const k of Object.keys(M.e)) {
              const en = M.e[k], c = R.e[k];
              if (!(en[1] === M.dev && en[0] > feito) && !sobe[k]) { delete M.e[k]; continue; }
              // Apagado aqui há mais tempo do que a lápide dura, e ainda vivo (mais velho) na nuvem: a lápide ganha
              // marca nova, senão a junção a descartaria e o item voltaria.
              if (en[2] === null && en[0] < agora - LAPIDE_MS && c && c[2] !== null && c[0] < en[0]) M.e[k] = [nova(M, agora), M.dev, null, ...en.slice(3)];
            }
            M.on = true; M.rev = 0; base = true;
          }
          else if (!M.on) { marcarBase(o.getS(), M, o.D0(), somaXP(R.x)); M.on = true; M.rev = 0; base = true; }
        } else {
          if (registrar(o.getS(), M, o.D0())) M.sujo = true;
          gravarMeta(M);
          if (puxar) {
            r = await o.ler(M.rev);
            if (saiu()) return 'desligada';
            st.lido = Date.now(); M.visto = st.lido;
            // Um envio na saída da tela pode ter registrado e gravado durante a leitura: entra aqui, e o estado também.
            absorver(M);
            if (registrar(o.getS(), M, o.D0())) M.sujo = true;
            if (r && r.mesmo && Number(r.rev) === M.rev) r = null;
          }
        }
        if (r) fundir(M, r, base);
        gravarMeta(M);
        for (let i = 0; i < 4 && M.sujo; i++) {
          registrar(o.getS(), M, o.D0());
          const doc = { v: 1, e: M.e, x: M.x };
          const marca = Math.max(M.hlc || 0, BASE_MAX);
          const res = await o.salvar(doc, M.rev, o.rotulo(), !!keepalive && JSON.stringify(doc).length < 48000);
          if (saiu()) return 'desligada';
          if (res && res.ok) {
            M.rev = Number(res.rev) || M.rev + 1; M.sujo = false; M.em = res.em || new Date().toISOString(); M.feito = marca; M.sobe = {};
            absorver(M);
            if (registrar(o.getS(), M, o.D0())) M.sujo = true; // mudou durante o envio: vai na próxima volta
          }
          else if (res && 'doc' in res) { absorver(M); fundir(M, res); }
          else throw Object.assign(new Error('resposta'), { code: 'resposta' });
          gravarMeta(M);
        }
        if (!M.sujo && !M.em && r) M.em = r.em || null;
        st.erro = null;
        return M.sujo ? 'pendente' : 'ok';
      } catch (e) {
        st.erro = e;
        return 'erro';
      } finally {
        st.ocupado = false; status();
      }
    });
  }

  const api = {
    // O estado mudou: sobe em 2 segundos (várias mudanças seguidas vão juntas).
    mudou() { if (st.parado || !o.ligada()) return; clearTimeout(timer); timer = setTimeout(() => { timer = null; fila(() => ciclo(false)); }, 2000); },
    // Lê a nuvem, junta e sobe o que faltar.
    puxar() { clearTimeout(timer); timer = null; return fila(() => ciclo(true)); },
    // Saindo da tela: sobe já, com keepalive quando cabe (o navegador termina o envio mesmo com o app fechado). O envio
    // sai neste mesmo evento, sem esperar a trava nem a fila: com a página descarregando, nada que fique para depois
    // roda. Se a nuvem mudou nesse meio tempo, o banco recusa (rev) e a próxima leitura junta.
    enviarJa() {
      if (st.parado || !o.ligada()) return Promise.resolve('desligada');
      clearTimeout(timer); timer = null;
      const M = lerMeta();
      if (!M || !M.on || longe(M)) return fila(() => ciclo(false, true));
      let mudou = false;
      try { mudou = registrar(o.getS(), M, o.D0()); } catch { return Promise.resolve('erro'); }
      if (!mudou && !M.sujo) return Promise.resolve('ok');
      if (!mudou && voando) return voando;
      M.sujo = true; gravarMeta(M);
      const doc = { v: 1, e: M.e, x: M.x }, base = M.rev, marca = M.hlc;
      let p;
      try { p = Promise.resolve(o.salvar(doc, base, o.rotulo(), JSON.stringify(doc).length < 48000)); } catch (e) { p = Promise.reject(e); }
      const v = p.then((res) => {
        // A nuvem mudou antes (rev): se a página ainda está aqui, o ciclo normal junta e grava de novo.
        if (res && !res.ok && 'doc' in res) return fila(() => ciclo(false));
        if (!res || !res.ok) return 'pendente';
        const N = lerMeta();
        if (!N || !N.on || N.rev !== base) return 'pendente';
        N.rev = Number(res.rev) || base + 1; N.em = res.em || new Date().toISOString();
        if (N.hlc === marca) { N.sujo = false; N.feito = Math.max(marca, BASE_MAX); N.sobe = {}; } // nada mudou aqui depois do envio
        gravarMeta(N); status();
        return N.sujo ? 'pendente' : 'ok';
      }, (e) => { st.erro = e; status(); return 'erro'; }).finally(() => { if (voando === v) voando = null; });
      voando = v;
      return v;
    },
    // Alguma mudança deste aparelho ainda não está na nuvem?
    pendente() {
      const M = lerMeta(); if (!M || !M.on) return false;
      const C = JSON.parse(JSON.stringify(M));
      return registrar(o.getS(), C, o.D0()) || !!C.sujo;
    },
    // Este aparelho já juntou os dados dele com a nuvem (lido do armazenamento na criação e a cada sincronização).
    entrou: () => st.on,
    lido: () => st.lido,
    info() { const M = lerMeta(); return { entrou: st.on, em: M && M.em, rev: M ? M.rev : 0, ocupado: st.ocupado, erro: st.erro, lido: st.lido, pendente: api.pendente() }; },
    // Para de sincronizar (saída da conta) e apaga o registro da nuvem deste aparelho.
    parar() { st.parado = true; clearTimeout(timer); timer = null; },
    esquecer() { st.on = false; try { ls().removeItem(o.chave); } catch { /* nada a apagar */ } },
    // Antes de sair: tenta subir o que falta. 'fora' (nunca entrou na nuvem), 'ok' ou 'pendente'.
    async sair(ms = 8000) {
      if (!api.entrou()) return 'fora';
      clearTimeout(timer); timer = null;
      try { await Promise.race([fila(() => ciclo(false)), new Promise((res) => setTimeout(res, ms))]); } catch { /* fica pendente */ }
      return api.pendente() ? 'pendente' : 'ok';
    },
  };
  return api;
}
