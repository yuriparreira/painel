// Contas a pagar lançadas no app, como num ERP: uma vez, parceladas (N vezes, todo mês) ou todo mês sem fim.
// Ficam nos seus registros (lastSets, chave '~c:<id>'), que vão para a nuvem com o login; não mexem no Supabase.
// Uma conta: { n nome, v valor de cada parcela, d primeiro vencimento 'AAAA-MM-DD', q parcelas (1 = uma vez,
// 0 = todo mês sem fim), met forma de pagamento, cat categoria (texto livre), pg { parcela: 'AAAA-MM-DD' pagas }, t }.
export const K_C = '~c:';
export const METS = ['Boleto', 'Pix', 'Débito automático', 'Cartão'];
const isoOk = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T12:00'));
const txt = (v, n) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, n) : '');

// Confere uma conta guardada (pode ter vindo de outro aparelho ou de uma versão anterior).
export function valida(c) {
  if (!c || typeof c !== 'object' || !isoOk(c.d)) return null;
  const v = Number(c.v), q = Number.isInteger(c.q) && c.q >= 0 && c.q <= 360 ? c.q : 1;
  if (!(v > 0 && v < 1e7)) return null;
  const pg = {};
  if (c.pg && typeof c.pg === 'object') Object.entries(c.pg).forEach(([k, d]) => { if (/^\d{1,3}$/.test(k) && (q === 0 || +k < q) && isoOk(d)) pg[+k] = d; });
  return { n: txt(c.n, 80) || 'Conta', v: Math.round(v * 100) / 100, d: c.d, q, met: METS.includes(c.met) ? c.met : 'Boleto', cat: txt(c.cat, 60), pg, t: Number(c.t) || 0 };
}

// Vencimento da parcela k (0 = a primeira): mesmo dia do primeiro vencimento, k meses depois (dia 31 vira o último do mês).
export function vence(c, k) {
  const y = +c.d.slice(0, 4), m = +c.d.slice(5, 7) - 1 + k, dia = +c.d.slice(8, 10);
  const dim = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(dia, dim));
}
// Índice da parcela que vence no mês (ano, mês 0-11), ou null.
export function parcelaDoMes(c, ano, mes) {
  const k = (ano - +c.d.slice(0, 4)) * 12 + mes - (+c.d.slice(5, 7) - 1);
  return k >= 0 && (c.q === 0 || k < c.q) ? k : null;
}
// Parcelas até o fim de um mês (para achar as atrasadas). Todo mês sem fim: até o mês pedido.
export function parcelasAte(c, ano, mes) {
  const idx = (ano - +c.d.slice(0, 4)) * 12 + mes - (+c.d.slice(5, 7) - 1), ult = c.q === 0 ? idx : Math.min(idx, c.q - 1);
  return Array.from({ length: Math.max(0, ult + 1) }, (_, k) => k);
}
// "3/12", "todo mês" ou "".
export const rotulo = (c, k) => (c.q > 1 ? `${k + 1}/${c.q}` : c.q === 0 ? 'todo mês' : '');
// Quanto falta pagar da conta inteira (parcelada) e quantas parcelas faltam.
export function saldo(c) {
  if (c.q === 0) return null;
  const pagas = Object.keys(c.pg).length;
  return { falta: Math.max(0, c.q - pagas), v: Math.round(Math.max(0, c.q - pagas) * c.v * 100) / 100 };
}
