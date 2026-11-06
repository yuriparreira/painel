// Login por código no e-mail (Supabase Auth) e leitura dos dados reais pela função fin_painel do banco.
// O endereço e a chave publicável do projeto são públicos por desenho (a chave publicável é feita para ficar no
// navegador): quem protege os dados é o RLS do banco, que só deixa a conta dona ler. A sessão fica só neste aparelho;
// nada pessoal está neste arquivo.
export const SB_URL = 'https://ntbbpuqfpjvepykxzzpn.supabase.co';
const SB_KEY = 'sb_publishable_YVchv74ypU0YChO4jXW2ew_QeNvqSmT';
const SK = 'painel-sessao-v1'; // sessão (tokens) deste aparelho
const PK = 'painel-login-pendente-v1'; // e-mail que pediu código, para voltar do app de e-mail sem perder a etapa
const PEND_MS = 60 * 60 * 1000;

export class SyncError extends Error {
  constructor(code, msg, status) { super(msg || code); this.code = code; this.status = status; }
}

// get devolve undefined quando o armazenamento não abre (modo privado): aí não dá para saber o que outra aba fez.
const get = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return undefined; } };
const put = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const valid = (s) => !!(s && typeof s.access_token === 'string' && typeof s.refresh_token === 'string');
const fresh = (s) => valid(s) && s.expires_at * 1000 - Date.now() > 60000;

let sess = get(SK);
if (sess !== undefined && !valid(sess)) { if (sess) put(SK, null); sess = null; }
if (!valid(sess)) sess = null;
let disk = true; // a última gravação da sessão deu certo: o que está salvo é confiável
// Sobe a cada login e a cada saída: o que estava em andamento antes disso é descartado.
let epoch = 0;
function setSession(s) { sess = s; disk = put(SK, s); }
function endSession() { epoch++; setSession(null); }

export const session = () => sess;
export const email = () => (sess && sess.email) || null;
export const currentEpoch = () => epoch;
export function pending() {
  const p = get(PK);
  if (!p || typeof p.email !== 'string' || !(Date.now() - p.at < PEND_MS)) return null;
  return p;
}
export function clearPending() { put(PK, null); }

// Outra aba (ou o app instalado e o navegador no Android, que dividem o armazenamento) pode ter renovado ou
// encerrado a sessão. Devolve 'saiu', 'entrou', 'renovou' ou null, e avisa o app logo depois (fora desta chamada).
const subs = new Set();
export function onChange(fn) { subs.add(fn); }
function adoptDisk() {
  const what = readDisk();
  if (what) setTimeout(() => subs.forEach((fn) => { try { fn(what); } catch { /* quem ouve trata */ } }), 0);
  return what;
}
function readDisk() {
  if (!disk) return null;
  const d = get(SK);
  if (d === undefined) return null;
  if (!valid(d)) { if (sess) { endSession(); return 'saiu'; } return null; }
  if (!sess) { epoch++; sess = d; return 'entrou'; }
  if (d.uid !== sess.uid) { epoch++; sess = d; return 'entrou'; }
  if (d.refresh_token !== sess.refresh_token && d.expires_at >= sess.expires_at) { sess = d; return 'renovou'; }
  return null;
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === SK || e.key === null) adoptDisk(); });
  // Aba que voltou do cache do navegador ou do segundo plano pode ter perdido avisos de outra aba.
  window.addEventListener('pageshow', (e) => { if (e.persisted) adoptDisk(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') adoptDisk(); });
}

// Conteúdo do JWT, só para ler e-mail e validade (a assinatura quem confere é o servidor).
function claims(jwt) {
  try {
    const b = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const s = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
    return JSON.parse(decodeURIComponent(Array.from(s, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
  } catch { return {}; }
}
function fromTokens(t) {
  const c = claims(t.access_token);
  const exp = Number(t.expires_at) || Number(c.exp) || Math.floor(Date.now() / 1000) + (Number(t.expires_in) || 3600);
  return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: exp, email: (t.user && t.user.email) || c.email || null, uid: (t.user && t.user.id) || c.sub || null };
}

async function call(path, { method = 'POST', body, token, timeout = 20000, keepalive = false } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new SyncError('offline');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  let res, txt;
  try {
    const headers = { apikey: SB_KEY, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    res = await fetch(SB_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: ctl.signal, keepalive });
    txt = await res.text(); // o prazo vale também para a resposta que chega pela metade
  } catch {
    throw new SyncError(ctl.signal.aborted ? 'timeout' : 'offline');
  } finally { clearTimeout(t); }
  let j = null; try { j = txt ? JSON.parse(txt) : null; } catch { j = null; }
  if (!res.ok) {
    // As funções do banco recusam com raise exception '<código>': o PostgREST manda P0001 e o código na mensagem.
    // Qualquer raise exception com um código curto em minúsculas (P0001) vira o código do erro.
    const doBanco = j && typeof j.message === 'string' && (['nao_e_dono', 'doc_grande', 'doc_invalido', 'token_invalido'].includes(j.message) || (j.code === 'P0001' && /^[a-z][a-z_]{2,40}$/.test(j.message))) && j.message;
    const code = (j && (j.error_code || doBanco || j.error || j.code)) || `http_${res.status}`;
    throw new SyncError(String(code), (j && (j.msg || j.message || j.error_description)) || '', res.status);
  }
  return j;
}

// Volta do link mágico (#access_token=...). Deve rodar antes do roteador ler o endereço.
// Aceita a sessão quando este aparelho pediu o código, ou quando ela é da mesma conta que já está aqui.
// Devolve 'ok', um código de erro ou null.
export function consumeHash() {
  const h = location.hash || '';
  if (!/[#&](access_token|error_code|error)=/.test(h) || h.startsWith('#/')) return null;
  const p = new URLSearchParams(h.slice(1));
  history.replaceState(null, '', location.pathname + location.search + '#/dinheiro/sincronizar');
  if (p.get('error') || p.get('error_code')) return p.get('error_code') || p.get('error');
  const t = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_at: p.get('expires_at'), expires_in: p.get('expires_in') };
  if (!t.access_token || !t.refresh_token) return 'link_invalido';
  const nt = fromTokens(t);
  if (sess && nt.uid && nt.uid === sess.uid) { setSession({ ...nt, email: nt.email || sess.email }); clearPending(); return 'ok'; }
  if (sess) return 'ja_conectado';
  if (!pending()) return 'link_de_outro_aparelho';
  epoch++; setSession(nt); clearPending();
  return 'ok';
}

export async function sendCode(addr) {
  const e = String(addr || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new SyncError('email_invalido');
  const back = encodeURIComponent(location.origin + location.pathname);
  await call(`/auth/v1/otp?redirect_to=${back}`, { body: { email: e, create_user: true } });
  put(PK, { email: e, at: Date.now() });
  return e;
}

export async function verifyCode(addr, code) {
  const token = String(code || '').replace(/\D/g, '');
  if (token.length < 6) throw new SyncError('codigo_curto');
  const r = await call('/auth/v1/verify', { body: { type: 'email', email: String(addr).trim().toLowerCase(), token } });
  if (!r || !r.access_token) throw new SyncError('sem_sessao');
  epoch++; setSession(fromTokens(r));
  clearPending();
  return sess;
}

// Renova o token. Entre abas, uma de cada vez (navigator.locks): quem chega depois usa o token que a outra gravou,
// em vez de reusar um já trocado, o que faria o Supabase derrubar a sessão em todas.
const withLock = (fn) => (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request ? navigator.locks.request('painel-sessao', fn) : fn());
let refreshing = null;
let rotated = null; // a última troca de token feita aqui, mesmo descartada: a saída usa para encerrar a sessão
async function refreshNow(ep) {
  adoptDisk();
  if (ep !== epoch || !sess) throw new SyncError('sem_sessao');
  if (fresh(sess)) return sess.access_token;
  const rt = sess.refresh_token;
  let r;
  try { r = await call('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: rt } }); }
  catch (e) {
    if (ep !== epoch) throw new SyncError('sem_sessao');
    if (e.status === 400 || e.status === 401 || e.status === 403) {
      adoptDisk();
      if (sess && sess.refresh_token !== rt && fresh(sess)) return sess.access_token; // outra aba já renovou
      if (sess && sess.refresh_token === rt) endSession(); // token recusado pelo servidor: a sessão acabou
      throw new SyncError('sessao_expirada');
    }
    throw e;
  }
  if (r && r.access_token) rotated = { rt, r };
  // Saiu, aqui ou em outra aba, enquanto renovava: não volta a sessão.
  adoptDisk();
  if (ep !== epoch || !sess) throw new SyncError('sem_sessao');
  setSession({ ...fromTokens(r), email: (r.user && r.user.email) || sess.email });
  return sess.access_token;
}
async function accessToken() {
  adoptDisk();
  if (!sess) throw new SyncError('sem_sessao');
  if (fresh(sess)) return sess.access_token;
  if (!refreshing) { const ep = epoch; refreshing = withLock(() => refreshNow(ep)).finally(() => { refreshing = null; }); }
  return refreshing;
}

async function rpc(fn, args = {}, { keepalive = false } = {}) {
  const go = (tok) => call(`/rest/v1/rpc/${fn}`, { body: args, token: tok, timeout: 30000, keepalive });
  try { return await go(await accessToken()); }
  catch (e) {
    if (e.status !== 401 || !sess) throw e;
    sess = { ...sess, expires_at: 0 }; // token recusado antes da hora: renova uma vez e tenta de novo
    return go(await accessToken());
  }
}

// Dados no formato painel-financas/1. Na primeira vez, a conta com o e-mail do dono vira a dona dos dados.
// Se a pessoa sair (ou entrar com outra conta) no meio da leitura, o resultado é descartado.
export async function fetchPainel() {
  const ep = epoch;
  const same = (x) => { if (ep !== epoch) throw new SyncError('sem_sessao'); return x; };
  try { return same(await rpc('fin_painel')); }
  catch (e) {
    if (e.code === 'sessao_expirada') throw e; // a sessão acabou de verdade: o app pede o login de novo
    same();
    if (e.code !== 'nao_e_dono') throw e;
    const ok = same(await rpc('fin_reivindicar'));
    if (ok !== true) throw new SyncError('nao_e_dono');
    return same(await rpc('fin_painel'));
  }
}

// Saúde no formato painel-saude/1 (plano, fichas, dieta, medidas e exames). Só a conta dona lê; a mesma regra de
// sessão: se a pessoa sair no meio da leitura, o resultado é descartado.
export async function fetchSaude() {
  const ep = epoch;
  const r = await rpc('saude_painel');
  if (ep !== epoch) throw new SyncError('sem_sessao');
  return r;
}

// Seus registros (check-ins, treinos, tarefas, gastos, XP) na nuvem: um documento só, que o nuvem.js junta entre os
// aparelhos. Com rev igual ao da nuvem, a leitura devolve só {rev, mesmo: true}. Gravar manda a versão em que se
// baseou: se outra chegou antes, volta {ok: false, rev, doc} para juntar e gravar de novo.
export const lerEstado = (rev) => rpc('estado_ler', rev == null ? {} : { p_rev: rev });
export const salvarEstado = (doc, base, aparelho, keepalive) => rpc('estado_salvar', { p_doc: doc, p_base: base, p_aparelho: aparelho || null }, { keepalive });

// Atalho do iPhone (Apple Health e Calendário): o token novo aparece uma vez só, no app; o banco guarda só o hash.
// Gerar outro desliga o anterior.
export const novoToken = () => rpc('atalho_novo_token');

// Plano de contas e lançamentos (fin_recategorizar, fin_regra_criar, fin_manual_salvar...): só a conta dona grava.
export const fin = (fn, args) => rpc(fn, args);
export const ATALHO_URL = `${SB_URL}/functions/v1/atalho`;

// Sai deste aparelho. A sessão daqui é apagada na hora (fechar o app logo depois não a deixa salva); depois o
// Supabase encerra a sessão lá, com um token renovado antes se o atual já venceu. Devolve 'ok', 'sem-rede' ou
// 'erro' (o Supabase não confirmou o fim da sessão lá).
const limite = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new SyncError('timeout')), ms))]);
const motivo = (e) => (e && e.code === 'offline' ? 'sem-rede' : 'erro');
export async function signOut() {
  readDisk();
  const s = sess;
  endSession();
  clearPending();
  if (!s) return 'ok';
  let renovado = false;
  // Na fila das renovações: se uma estava em andamento aqui, usa o token que ela recebeu.
  const renova = async () => {
    renovado = true;
    const r = await limite(withLock(() => (rotated && rotated.rt === s.refresh_token ? rotated.r
      : call('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: s.refresh_token }, timeout: 10000 }))), 12000);
    return r && r.access_token;
  };
  const sair = (tok) => call('/auth/v1/logout?scope=local', { token: tok, timeout: 8000 });
  const recusou = (e) => e.status === 400 || e.status === 401 || e.status === 403; // o Supabase já não aceita esta sessão
  let tok = s.access_token;
  for (;;) {
    if (!fresh(s) || renovado) {
      try { tok = await renova(); } catch (e) { return recusou(e) ? 'ok' : motivo(e); }
      if (!tok) return 'erro';
    }
    try { await sair(tok); return 'ok'; }
    catch (e) {
      if (e.code === 'session_not_found') return 'ok'; // sessão que o servidor já tinha encerrado
      // Token recusado antes da hora (relógio do aparelho adiantado ou atrasado): renova uma vez e tenta de novo.
      if (!renovado && (e.status === 401 || e.code === 'bad_jwt')) { renovado = true; continue; }
      return motivo(e);
    }
  }
}
