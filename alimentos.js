// Alimentos para registrar o que você comeu: a tabela TACO no aparelho (funciona sem internet) e, quando pedido, os
// produtos de marca do Open Food Facts (base aberta, ODbL), pelo nome ou pelo código de barras.
// Um alimento escolhido vira um item { n nome, q quantidade, u unidade, por base, b [kcal, P, C, G] por "por" unidades, s fonte }.
// A porção do plano é o item { pl: 1, x vezes, b [kcal, P, C, G] da refeição sugerida }.
import { TACO, GRUPOS_TACO } from './taco.js';

const num = (v) => { const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v; return Number.isFinite(n) ? n : null; };
const r1 = (v) => Math.round(v * 10) / 10;
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Macros de um item: [kcal, proteína, carboidrato, gordura]. Valor ausente na tabela conta como 0.
export function macros(it) {
  if (!it || typeof it !== 'object' || !Array.isArray(it.b)) return [0, 0, 0, 0];
  const f = it.pl ? (num(it.x) ?? 1) : (num(it.q) ?? 0) / (num(it.por) || 100);
  if (!(f > 0)) return [0, 0, 0, 0];
  return [0, 1, 2, 3].map((i) => (num(it.b[i]) || 0) * f);
}
export const soma = (L) => (Array.isArray(L) ? L : []).reduce((a, it) => { const m = macros(it); return a.map((v, i) => v + m[i]); }, [0, 0, 0, 0]);

// TACO como itens de busca.
const T = TACO.map((r) => ({ id: `t${r[0]}`, n: r[2], gi: r[1], g: GRUPOS_TACO[r[1]] || '', b: [r[3], r[4], r[5], r[6]], fib: r[7], u: 'g', por: 100, s: `t${r[0]}`, k: norm(r[2]) }));
export const tacoN = T.length;
export const taco = (id) => T.find((x) => x.id === id) || null;

// Os do dia a dia vêm antes numa busca curta ("arroz" acha o tipo 1 cozido antes do carreteiro). Chave: grupo × 1000 + id.
const COMUNS = new Set([[1, 3], [14, 561], [9, 488], [7, 458], [7, 457], [1, 53], [7, 461], [3, 182], [6, 410], [1, 7], [2, 88], [2, 91], [4, 260], [6, 326],
  [6, 377], [7, 448], [3, 226], [3, 222], [8, 471], [7, 468], [3, 163], [1, 533], [3, 214], [3, 239], [2, 161], [2, 100], [4, 261], [5, 317]].map(([g, i]) => g * 1000 + i));
// Busca por todas as palavras (sem acento). Na frente: o que começa com a primeira palavra, depois os nomes mais curtos.
// Sem "cru" na busca, carnes, peixes, ovos, cereais e feijões prontos vêm antes do cru (fruta e verdura crua é o normal);
// doces, caldas, gema e clara vêm depois do alimento comum.
export function buscarTaco(q, max = 40) {
  const w = norm(q).split(' ').filter(Boolean); if (!w.length) return [];
  // Uma palavra acha também o plural e o feminino ("ovos", "moida" acham "ovo", "moído").
  const tem = (k, p) => k.includes(p) || (p.length >= 4 && k.includes(p.slice(0, -1)));
  const pre = (x) => w.every((p) => x.k.split(' ').some((t) => t.startsWith(p)));
  const hit = T.filter((x) => w.every((p) => tem(x.k, p)));
  const cru = w.some((p) => p.startsWith('cru'));
  const COZ = new Set([1, 5, 6, 9, 14]), raro = (p) => !w.some((q) => p.startsWith(q));
  const nota = (x) => (COMUNS.has(x.gi * 1000 + +x.id.slice(1)) ? -1.5 : 0) + (x.k.startsWith(w[0]) ? 0 : 4) + (pre(x) ? 0 : 2) + (!cru && COZ.has(x.gi) && /\bcru[ao]?s?\b/.test(x.k) ? 1 : 0)
    + (/\b(doce|calda|barra|gema|clara|po|desidratad\w*|cristalizad\w*)\b/.test(x.k) && raro('doce') && raro('calda') && raro('barra') && raro('gema') && raro('clara') ? 0.6 : 0) + x.k.length / 200;
  return hit.sort((a, b) => nota(a) - nota(b)).slice(0, max);
}

// Open Food Facts: produtos do Brasil pelo nome, ou um produto pelo código de barras (8 a 14 dígitos).
// A base aberta pede no máximo 10 buscas por minuto: o app só busca quando você toca em Buscar.
export const ehCodigo = (q) => /^\d{8,14}$/.test(String(q || '').replace(/\s/g, ''));
const CAMPOS = 'code,product_name,product_name_pt,brands,nutriments,serving_quantity,serving_size,quantity';
function produto(p) {
  if (!p || typeof p !== 'object') return null;
  const N = p.nutriments || {}, nome = String(p.product_name_pt || p.product_name || '').trim();
  let k = num(N['energy-kcal_100g']);
  if (k == null && num(N.energy_100g) != null) k = num(N.energy_100g) / 4.184; // só em kJ
  const b = [k, num(N.proteins_100g), num(N.carbohydrates_100g), num(N.fat_100g)];
  if (!nome || b.every((v) => v == null)) return null;
  const marca = String(p.brands || '').split(',')[0].trim(), sv = num(p.serving_quantity);
  const liq = /\bml\b/i.test(String(p.quantity || '') + ' ' + String(p.serving_size || ''));
  return { id: `o${p.code}`, n: marca && !norm(nome).includes(norm(marca)) ? `${nome} · ${marca}` : nome, g: 'Open Food Facts', b: b.map((v) => (v == null ? null : r1(v))), u: liq ? 'ml' : 'g', por: 100, s: `o${p.code}`, sv: sv > 0 && sv < 2000 ? sv : null, svTxt: String(p.serving_size || '').slice(0, 30) };
}
export async function buscarOff(q, { fetchFn = fetch, ms = 10000 } = {}) {
  const t = String(q || '').trim(); if (!t) return [];
  const ctl = typeof AbortController === 'function' ? new AbortController() : null, timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
  try {
    const cod = t.replace(/\s/g, '');
    const url = ehCodigo(cod) ? `https://world.openfoodfacts.org/api/v2/product/${cod}.json?fields=${CAMPOS}`
      : `https://br.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(t)}&search_simple=1&action=process&json=1&page_size=24&fields=${CAMPOS}`;
    const r = await fetchFn(url, { signal: ctl ? ctl.signal : undefined, headers: { Accept: 'application/json' } });
    if (!r.ok) { if (r.status === 404 && ehCodigo(cod)) return []; throw new Error(`Open Food Facts respondeu ${r.status}`); }
    const j = await r.json();
    const L = ehCodigo(cod) ? (j && j.status === 1 ? [j.product] : []) : (j && Array.isArray(j.products) ? j.products : []);
    const vistos = new Set();
    return L.map(produto).filter((x) => x && !vistos.has(x.id) && vistos.add(x.id));
  } catch (e) {
    throw new Error(e && e.name === 'AbortError' ? 'A busca demorou demais. Tente de novo.' : e && /Open Food/.test(e.message) ? e.message : 'Sem conexão com o Open Food Facts agora.');
  } finally { if (timer) clearTimeout(timer); }
}

// Um item novo a partir de um alimento (TACO, produto, recente ou criado por você) e da quantidade.
export function item(a, q) {
  const qq = num(q);
  return { n: String(a.n || 'Alimento').slice(0, 80), q: qq > 0 ? r1(Math.min(qq, 5000)) : (a.por === 1 ? 1 : 100), u: a.u || 'g', por: num(a.por) || 100, b: (a.b || []).slice(0, 4).map((v) => (num(v) == null ? null : r1(num(v)))), s: String(a.s || 'm').slice(0, 30) };
}
// Quantidades rápidas para escolher: a porção do produto (se tiver) e medidas redondas.
export function rapidas(a) {
  if (a.por === 1) return [[0.5, '½'], [1, '1'], [2, '2']];
  const L = [50, 100, 150, 200].map((g) => [g, `${g} ${a.u || 'g'}`]);
  if (a.sv) L.unshift([a.sv, `1 porção (${r1(a.sv)} ${a.u || 'g'})`]);
  return L;
}
