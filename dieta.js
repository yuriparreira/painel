// Planos de dieta: o do Supabase (que não muda pelo app), os seus (cópias editadas ou montados do zero) e os modelos
// prontos, montados com alimentos da tabela TACO e ajustados à meta de calorias que você escolher.
// Um plano seu: { nome, orig ('sb' cópia do Supabase, 'tpl:<id>' modelo, 'novo'), kcal: { treino, descanso, refeed },
// prot (meta de proteína em g ou null), refs: [{ id, n nome, h hora, tipos: ['treino', ...], f: [itens] }], t }.
// Os itens são os mesmos das refeições registradas (alimentos.js): { n, q, u, por, b: [kcal, P, C, G] por "por", s }.
import * as AL from './alimentos.js';

export const TIPOS = ['treino', 'descanso', 'refeed'];
const r1 = (v) => Math.round(v * 10) / 10;
const num = (v) => { const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v; return Number.isFinite(n) ? n : null; };
const txt = (v, n) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, n) : '');

// Whey não está na TACO: valores médios de rótulo para uma dose de 30 g.
const WHEY = { n: 'Whey protein, dose de 30 g', b: [120, 24, 3, 2], u: 'porção', por: 1, s: 'mwhey-protein' };
const alimento = (id) => (id === 'whey' ? WHEY : AL.taco(`t${id}`));

// Modelos prontos. Quantidades em gramas (whey em doses) para a meta de referência; ao escolher, tudo é ajustado à sua meta.
// TACO: 3 arroz cozido, 1 arroz integral cozido, 561 feijão carioca, 567 feijão preto, 410 peito de frango grelhado, 377 patinho
// grelhado, 317 salmão grelhado, 488 ovo cozido, 53 pão francês, 52 pão de forma integral, 182 banana prata, 225 mamão formosa,
// 239 morango, 222 maçã fuji, 7 aveia, 449 iogurte natural desnatado, 461 queijo minas frescal, 88 batata-doce cozida,
// 91 batata inglesa cozida, 129 mandioca cozida, 100 brócolis cozido, 70 abobrinha cozida, 78 alface crespa, 157 tomate,
// 110 cenoura crua, 260 azeite, 163 abacate, 558 amendoim torrado, 589 castanha-do-pará, 277 atum em óleo, 533 cuscuz.
export const MODELOS = [
  {
    id: 'equilibrado', nome: 'Equilibrado', desc: 'Manutenção do peso: 5 refeições, comida do dia a dia, carboidrato moderado.',
    refs: [
      ['Café da manhã', '07:00', [[53, 50], [488, 100], [461, 30], [182, 100]]],
      ['Almoço', '12:30', [[3, 150], [561, 100], [410, 130], [100, 80], [78, 30], [157, 60], [260, 5]]],
      ['Lanche', '16:00', [[449, 170], [7, 30], [225, 150]]],
      ['Jantar', '20:00', [[3, 120], [561, 80], [377, 120], [70, 100], [260, 5]]],
      ['Ceia', '22:30', [[461, 40], [222, 130]]],
    ],
  },
  {
    id: 'hipertrofia', nome: 'Ganho de massa', desc: 'Superávit leve: 6 refeições, mais carboidrato perto do treino, proteína alta.',
    refs: [
      ['Café da manhã', '07:00', [[53, 100], [488, 150], [461, 30], [182, 120]]],
      ['Almoço', '12:00', [[3, 200], [561, 120], [410, 150], [100, 80], [78, 30], [260, 10]]],
      ['Pré-treino', '16:00', [[88, 200], [410, 100]]],
      ['Pós-treino', '18:30', [['whey', 1], [182, 120], [7, 40]]],
      ['Jantar', '20:30', [[3, 180], [567, 100], [377, 150], [70, 100], [260, 5]]],
      ['Ceia', '22:30', [[449, 170], [558, 20]]],
    ],
  },
  {
    id: 'definicao', nome: 'Definição', desc: 'Déficit moderado: proteína alta para manter a massa, menos carboidrato à noite.',
    refs: [
      ['Café da manhã', '07:00', [[52, 50], [488, 150], [239, 100]]],
      ['Almoço', '12:30', [[3, 120], [561, 100], [410, 150], [100, 100], [78, 40], [157, 60], [260, 5]]],
      ['Lanche', '16:00', [['whey', 1], [222, 130]]],
      ['Jantar', '20:00', [[377, 150], [91, 150], [70, 120], [110, 50], [260, 5]]],
      ['Ceia', '22:00', [[449, 170]]],
    ],
  },
  {
    id: 'lowcarb', nome: 'Low carb moderado', desc: 'Menos de 100 g de carboidrato: ovos, carnes, peixe, verduras e gorduras boas.',
    refs: [
      ['Café da manhã', '07:30', [[488, 150], [461, 40], [163, 80]]],
      ['Almoço', '12:30', [[410, 180], [100, 120], [78, 40], [157, 80], [260, 10]]],
      ['Lanche', '16:00', [[449, 170], [589, 15], [239, 100]]],
      ['Jantar', '20:00', [[317, 150], [70, 150], [110, 50], [260, 5]]],
      ['Ceia', '22:00', [[277, 60], [157, 60]]],
    ],
  },
];

// Um item de alimento na quantidade dada.
const itemDe = (id, q) => { const a = alimento(id); return a ? AL.item(a, q) : null; };
const arred = (it, f) => {
  if (it.por === 1) return Math.max(0.5, Math.round(it.q * f * 2) / 2); // doses: de meia em meia
  const g = it.q * f; return Math.max(5, Math.round(g / (g >= 50 ? 10 : 5)) * (g >= 50 ? 10 : 5));
};
export const totais = (refs) => (refs || []).reduce((a, r) => { const m = AL.soma(r.f); return a.map((v, i) => v + m[i]); }, [0, 0, 0, 0]);

// Um modelo montado para uma meta de calorias (o mesmo cardápio todo dia; dá para separar os dias depois, refeição a refeição).
export function montar(mod, alvo) {
  const base = mod.refs.map(([n, h, L]) => ({ n, h, f: L.map(([id, q]) => itemDe(id, q)).filter(Boolean) }));
  const k0 = totais(base)[0], f = num(alvo) > 0 && k0 > 0 ? num(alvo) / k0 : 1;
  const refs = base.map((r, i) => ({ id: `${mod.id}-${i + 1}`, n: r.n, h: r.h, tipos: [...TIPOS], f: r.f.map((it) => ({ ...it, q: arred(it, f) })) }));
  const t = totais(refs), k = Math.round(t[0] / 10) * 10;
  return { nome: mod.nome, orig: `tpl:${mod.id}`, kcal: { treino: k, descanso: k, refeed: k }, prot: Math.round(t[1]), refs };
}

// O plano do Supabase como plano seu, para editar: cada refeição vira uma porção com os valores do plano (o texto dos
// alimentos fica como nome). Os ids são os mesmos: o que você já marcou hoje continua valendo.
export function doSupabase(H, slug) {
  const L = (H && Array.isArray(H.refeicoes) ? H.refeicoes : []).filter((r) => r && r.refeicao);
  const M = (H && H.metas) || {}, K = M.kcal && typeof M.kcal === 'object' ? M.kcal : {}, vistos = new Set();
  const refs = L.map((r) => {
    const id = slug(r.refeicao); if (vistos.has(id)) return null; vistos.add(id);
    const tipos = TIPOS.filter((t) => Array.isArray(r.tipos) && r.tipos.includes(t.charAt(0).toUpperCase() + t.slice(1)));
    const b = [num(r.kcal) || 0, num(r.p) || 0, num(r.c) || 0, num(r.g) || 0];
    return { id, n: txt(r.refeicao, 40), h: /^\d\d:\d\d/.test(r.horario || '') ? r.horario.slice(0, 5) : '', tipos, f: [{ n: txt(r.alimentos, 160) || 'Como no plano', q: 1, u: 'porção', por: 1, b, s: 'plano' }] };
  }).filter(Boolean);
  return { nome: 'Meu plano', orig: 'sb', kcal: { treino: num(K.treino), descanso: num(K.descanso), refeed: num(K.refeed) }, prot: num(M.proteina), refs };
}

// Confere o formato de um plano guardado (pode ter vindo de outro aparelho ou de uma versão anterior).
export function valido(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.refs)) return null;
  const k = p.kcal && typeof p.kcal === 'object' ? p.kcal : {};
  const refs = p.refs.filter((r) => r && typeof r.id === 'string' && r.id && Array.isArray(r.f)).slice(0, 12).map((r) => ({
    id: r.id.slice(0, 40), n: txt(r.n, 40) || 'Refeição', h: typeof r.h === 'string' && /^\d\d:\d\d$/.test(r.h) ? r.h : '',
    tipos: TIPOS.filter((t) => Array.isArray(r.tipos) && r.tipos.includes(t)),
    f: r.f.filter((it) => it && typeof it === 'object' && Array.isArray(it.b) && typeof it.n === 'string').slice(0, 30),
  }));
  const pos = (v) => (num(v) > 0 ? num(v) : null);
  return { nome: txt(p.nome, 40) || 'Meu plano', orig: typeof p.orig === 'string' ? p.orig : 'novo', kcal: { treino: pos(k.treino), descanso: pos(k.descanso), refeed: pos(k.refeed) }, prot: pos(p.prot), refs, t: Number(p.t) || 0 };
}

const qTxt = (it) => (it.por === 1 ? (it.q === 1 ? '' : `${String(r1(it.q)).replace('.', ',')} × `) : `${String(r1(it.q)).replace('.', ',')} ${it.u || 'g'} `);
const curto = (n) => String(n || '').split(',').slice(0, 2).join(',').trim();
// O texto de uma refeição do plano: "150 g Arroz, tipo 1 · 130 g Frango, peito".
export const itensTxt = (f) => (f || []).map((it) => (it.s === 'plano' ? it.n : `${qTxt(it)}${curto(it.n)}`)).join(' · ');

// As refeições de um plano seu no formato que a Dieta usa (o mesmo do Supabase).
export function refeicoes(p, tipo) {
  return p.refs.filter((r) => r.tipos.includes(tipo)).map((r) => { const t = AL.soma(r.f); return { id: r.id, nome: r.n, hora: r.h, itens: itensTxt(r.f), kcal: r1(t[0]), p: r1(t[1]), c: r1(t[2]), g: r1(t[3]), versao: '' }; })
    .sort((a, b) => (a.hora || '99') < (b.hora || '99') ? -1 : (a.hora || '99') > (b.hora || '99') ? 1 : 0);
}
