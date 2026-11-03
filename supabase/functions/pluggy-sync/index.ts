// Sincroniza todas as conexões do Meu Pluggy. Chamada pelo agendamento diário, pelo webhook e à mão.
// POST {"trigger": "cron" | "manual", "force": true} · POST {"action": "setup-webhook"} registra o webhook na Pluggy.
import { apiKey, call, db, failItem, json, syncItem } from '../_shared/pluggy.ts';

Deno.serve(async (req) => {
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const sb = db();
  // A chave anon basta para a sincronização normal (com o limite de 10 minutos).
  // Forçar e registrar o webhook só com a chave de serviço ou com o login do dono.
  let pode = false;
  try {
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
    const claims = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (claims.role === 'service_role') pode = true;
    else if (claims.sub) pode = !!(await sb.from('fin_owner').select('user_id').eq('user_id', claims.sub).maybeSingle()).data;
  } catch { pode = false; }
  if (!pode) { delete body.force; if (body.action) return json({ ok: false, error: 'sem permissão' }, 403); }
  const ids = (Deno.env.get('PLUGGY_ITEM_IDS') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!Deno.env.get('PLUGGY_CLIENT_ID') || !Deno.env.get('PLUGGY_CLIENT_SECRET')) return json({ ok: false, error: 'faltam PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET nos segredos' }, 500);
  const key = await apiKey();

  if (body.action === 'setup-webhook') {
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/pluggy-webhook`;
    const token = Deno.env.get('PLUGGY_WEBHOOK_TOKEN');
    if (!token) return json({ ok: false, error: 'falta PLUGGY_WEBHOOK_TOKEN nos segredos' }, 500);
    const atual = (await call(key, '/webhooks'))?.results || [];
    const mesmo = atual.find((w: any) => w.url === url);
    const cfg = { event: 'all', url, headers: { 'x-painel-token': token } };
    const w = mesmo ? await call(key, `/webhooks/${mesmo.id}`, { method: 'PATCH', body: JSON.stringify(cfg) }) : await call(key, '/webhooks', { method: 'POST', body: JSON.stringify(cfg) });
    return json({ ok: true, webhook: { id: w?.id, event: w?.event, url: w?.url } });
  }

  if (!ids.length) return json({ ok: false, error: 'PLUGGY_ITEM_IDS está vazio' }, 500);
  // Evita rodar em sequência: o Meu Pluggy só atualiza uma vez por dia.
  const last = await sb.from('fin_sync_log').select('at').eq('ok', true).order('at', { ascending: false }).limit(1);
  if (!body.force && last.data?.[0] && Date.now() - new Date(last.data[0].at).getTime() < 10 * 60e3) return json({ ok: true, skipped: 'sincronizado há menos de 10 minutos' });

  const trigger = String(body.trigger || 'manual');
  const items = [];
  for (const id of ids) {
    try { items.push(await syncItem(sb, key, id, trigger)); } catch (e) { items.push(await failItem(sb, id, trigger, e)); }
  }
  return json({ ok: items.every((x: any) => !x.error), items });
});
