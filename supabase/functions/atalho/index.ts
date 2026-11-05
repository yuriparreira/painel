// Recebe o atalho do iPhone (Apple Health e Calendário) e grava pelo atalho_receber do banco.
// Publicada sem verificação de JWT: o atalho se identifica com o token gerado no app (Sincronizar → Atalho do
// iPhone), no cabeçalho Authorization: Bearer <token> ou x-painel-token. O banco guarda só o SHA-256 do token.
// A resposta é sempre uma linha de texto (o app Atalhos não mostra o código HTTP), que o atalho mostra numa
// notificação: começa com OK, AVISO ou ERRO.
// Ambiente: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (do próprio Supabase); ATALHO_BRUTO=1 guarda o corpo cru por
// 14 dias, para ajustar a leitura dos formatos (sem ele, nem as chamadas com erro guardam o corpo);
// ATALHO_CAL_IGNORAR troca a lista de calendários ignorados. Sem token válido, nada é gravado.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { limpo, normalizar, resposta } from './normaliza.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const texto = (s: string, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
const MAX = 2_000_000;

const bruto = (corpo: string) => (env('ATALHO_BRUTO') === '1' ? limpo(corpo) : null);
const tokenRuim = (msg: string) => /token_invalido/.test(msg);
const TOKEN_RUIM = 'ERRO: token inválido. Gere outro em Painel > Sincronizar e cole no atalho.';

// Corpo que não deu para ler: o banco confere o token antes de anotar o erro (sem token válido, nada é gravado).
async function erroDeFormato(token: string, erro: string, corpo: string) {
  const { error } = await db().rpc('atalho_receber', { p_token: token, p_dados: { tipo: 'erro', erro }, p_bruto: bruto(corpo) });
  if (error && tokenRuim(String(error.message || error.code || ''))) return texto(TOKEN_RUIM);
  return texto(`ERRO: ${erro}`);
}

async function receber(req: Request): Promise<Response> {
  if (req.method !== 'POST') return texto('ERRO: use POST', 405);
  const auth = req.headers.get('authorization') || '';
  // x-painel-token primeiro: com ele, o Authorization pode levar outra chave (a do gateway).
  const token = (req.headers.get('x-painel-token') || /^bearer\s+(\S+)/i.exec(auth)?.[1] || '').trim();
  if (!token) return texto('ERRO: sem token. Gere um em Painel > Sincronizar > Atalho do iPhone.');
  const corpo = await req.text().catch(() => '');
  if (corpo.length > MAX) return texto('ERRO: corpo grande demais');
  let c: unknown;
  try { c = JSON.parse(corpo); } catch { c = null; }
  if (!c || typeof c !== 'object' || Array.isArray(c)) return erroDeFormato(token, 'corpo não é JSON', corpo);
  const ignorar = env('ATALHO_CAL_IGNORAR') ? env('ATALHO_CAL_IGNORAR').split(',').map((s) => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')).filter(Boolean) : undefined;
  const d = normalizar(c as Record<string, unknown>, Date.now(), ignorar);
  if ('erro' in d) return erroDeFormato(token, d.erro, corpo);
  const { data, error } = await db().rpc('atalho_receber', { p_token: token, p_dados: d, p_bruto: bruto(corpo) });
  if (error) {
    const msg = String(error.message || error.code || 'erro');
    if (tokenRuim(msg)) return texto(TOKEN_RUIM);
    // Fica só no log da função: o banco não gravou nada, e a falha pode ter vindo antes de ele conferir o token.
    console.error('atalho_receber', msg.slice(0, 300));
    return texto(`ERRO: o banco não gravou (${msg.slice(0, 80)})`);
  }
  return texto(resposta(d, (data || {}) as Record<string, unknown>));
}

// Toda resposta é uma linha que começa com OK, AVISO ou ERRO, mesmo numa falha que ninguém previu.
Deno.serve(async (req) => {
  try { return await receber(req); } catch (e) { return texto(`ERRO: falha inesperada (${String((e as Error)?.message || e).slice(0, 80)})`); }
});
