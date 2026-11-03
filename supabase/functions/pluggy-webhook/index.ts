// Recebe os avisos da Pluggy (item atualizado, transações novas, erro de consentimento).
// Responde na hora, como a Pluggy pede (2xx em até 10 s), e sincroniza o item em segundo plano.
// Publicada sem verificação de JWT: a autenticação é o cabeçalho x-painel-token, cadastrado junto com o webhook.
import { apiKey, db, failItem, syncItem } from '../_shared/pluggy.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

Deno.serve(async (req) => {
  const token = Deno.env.get('PLUGGY_WEBHOOK_TOKEN');
  if (!token || req.headers.get('x-painel-token') !== token) return new Response('forbidden', { status: 403 });
  const ev = await req.json().catch(() => null);
  if (!ev?.event) return new Response('bad request', { status: 400 });
  const conhecidos = (Deno.env.get('PLUGGY_ITEM_IDS') || '').split(',').map((s) => s.trim());
  const itemId: string | undefined = ev.itemId;

  const work = (async () => {
    const sb = db();
    if (!itemId || !conhecidos.includes(itemId)) {
      await sb.from('fin_sync_log').insert({ trigger: 'webhook', item_id: itemId ?? null, ok: true, detail: { ignorado: ev.event } });
      return;
    }
    if (ev.event === 'item/error') {
      await sb.from('fin_items').upsert({ id: itemId, status: 'LOGIN_ERROR', last_error: ev.error?.code || ev.error?.message || 'item/error' });
      await sb.from('fin_sync_log').insert({ trigger: 'webhook', item_id: itemId, ok: false, detail: { event: ev.event, error: ev.error ?? null } });
      return;
    }
    if (['item/updated', 'transactions/created', 'transactions/updated', 'transactions/deleted', 'item/created'].includes(ev.event)) {
      try { await syncItem(sb, await apiKey(), itemId, `webhook:${ev.event}`); } catch (e) { await failItem(sb, itemId, 'webhook', e); }
    }
  })();
  EdgeRuntime.waitUntil(work);
  return new Response('ok');
});
