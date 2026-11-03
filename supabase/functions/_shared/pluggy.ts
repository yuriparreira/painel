// Cliente mínimo da API da Pluggy e a sincronização de um item (uma conexão do Meu Pluggy).
// Segredos vêm do ambiente da função (Supabase → Edge Functions → Secrets), nunca do código:
//   PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_ITEM_IDS (separados por vírgula), PLUGGY_WEBHOOK_TOKEN
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

const BASE = 'https://api.pluggy.ai';
const env = (k: string) => Deno.env.get(k) ?? '';

export function db(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

export async function apiKey(): Promise<string> {
  const r = await fetch(`${BASE}/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: env('PLUGGY_CLIENT_ID'), clientSecret: env('PLUGGY_CLIENT_SECRET') }),
  });
  if (!r.ok) throw new Error(`pluggy auth ${r.status}`);
  return (await r.json()).apiKey;
}

export async function call(key: string, path: string, init: RequestInit = {}) {
  const r = await fetch(BASE + path, { ...init, headers: { 'X-API-KEY': key, 'content-type': 'application/json', ...(init.headers || {}) } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${path.split('?')[0]} ${r.status}`);
  return r.json();
}

// Listas paginadas por página (accounts, bills, investments, loans).
async function list(key: string, path: string) {
  const out: any[] = [];
  for (let page = 1; page < 50; page++) {
    const j = await call(key, `${path}${path.includes('?') ? '&' : '?'}page=${page}`);
    if (!j) break;
    out.push(...(j.results || []));
    if (!j.totalPages || page >= j.totalPages) break;
  }
  return out;
}

// Transações: GET /v2/transactions com cursor (next).
async function transactions(key: string, accountId: string, dateFrom: string) {
  const out: any[] = [];
  let q = `?accountId=${accountId}&dateFrom=${dateFrom}`;
  for (let i = 0; i < 200 && q; i++) {
    const j = await call(key, `/v2/transactions${q}`);
    if (!j) break;
    out.push(...(j.results || []));
    q = j.next || '';
  }
  return out;
}

// Regras genéricas: categoria da Pluggy + descrição → grupo do Painel. A escolha manual (coluna categoria) sempre vence.
const RULES: [RegExp, string][] = [
  [/credit card payment|pagamento de fatura/i, 'Pagamento de fatura'],
  [/same person|mesma titularidade/i, 'Entre contas próprias'],
  [/investment|aplica|resgate|rdb|cdb/i, 'Investimentos'],
  [/supermarket|groceries|mercado/i, 'Mercado'],
  [/restaurant|food delivery|\bbar\b|ifood|lanch/i, 'Alimentação fora'],
  [/gas station|fuel|posto|combust/i, 'Transporte: combustível'],
  [/toll|pedágio|pedagio|sem parar/i, 'Transporte: pedágio'],
  [/parking|estacion/i, 'Transporte: estacionamento'],
  [/taxi|\bride\b|uber|\b99 ?(app|pop|taxi)\b/i, 'Transporte: app'],
  [/pharmacy|drugstore|farm/i, 'Saúde: farmácia'],
  [/gym|fitness|academia|total ?pass|wellhub|gympass/i, 'Saúde: academia'],
  [/health|hospital|clinic|dentist|médic|medic/i, 'Saúde'],
  [/water|\bágua\b|\bagua\b|sanea/i, 'Moradia: água'],
  [/electric|energia|\bluz\b/i, 'Moradia: energia'],
  [/telecom|mobile|phone|internet|celular|\bvivo\b|\bclaro\b|\btim\b/i, 'Moradia: telefone e internet'],
  [/\brent\b|aluguel|condom/i, 'Moradia: aluguel e condomínio'],
  [/tax|tribut|iptu|ipva|darf|dare/i, 'Impostos e taxas'],
  [/streaming|subscription|assinatura|netflix|spotify/i, 'Assinaturas'],
  [/leisure|entertainment|cinema|games|lazer/i, 'Lazer'],
  [/travel|airline|hotel|viagem/i, 'Viagem'],
  [/shopping|clothing|electronics|loja/i, 'Compras'],
  [/\bfees?\b|tarifa|juros|interest|\biof\b/i, 'Tarifas e juros'],
  [/salary|salário|income|rendimento/i, 'Receitas'],
  [/transfer|\bpix\b|\bted\b|\bdoc\b/i, 'Transferências'],
];
export function categoriza(t: any): string {
  const s = `${t.category || ''} ${t.description || ''}`;
  for (const [rx, c] of RULES) if (rx.test(s)) return c;
  return t.type === 'CREDIT' ? 'Receitas' : 'Outros';
}

const d10 = (v: any) => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export async function syncItem(sb: SupabaseClient, key: string, itemId: string, trigger: string) {
  const item = await call(key, `/items/${itemId}`);
  if (!item) throw new Error('item não encontrado na Pluggy');
  const prev = await sb.from('fin_items').select('last_sync_at').eq('id', itemId).maybeSingle();
  await sb.from('fin_items').upsert({
    id: itemId, connector: item.connector?.name ?? null, status: item.status ?? null, execution_status: item.executionStatus ?? null,
    consent_expires_at: item.consentExpiresAt ?? null, last_updated_at: item.lastUpdatedAt ?? null, raw: item,
  });
  // Primeira vez: 12 meses (o máximo da Pluggy). Depois: 10 dias para trás, para pegar lançamentos que mudaram de status.
  const dateFrom = prev.data?.last_sync_at ? daysAgo(10) : daysAgo(365);
  const counts = { accounts: 0, transactions: 0, bills: 0, investments: 0, loans: 0 };

  const accounts = await list(key, `/accounts?itemId=${itemId}`);
  if (accounts.length) {
    await sb.from('fin_accounts').upsert(accounts.map((a: any) => ({
      id: a.id, item_id: itemId, type: a.type, subtype: a.subtype, name: a.marketingName || a.name, number: a.number ?? null,
      balance: a.balance, currency: a.currencyCode, credit_limit: a.creditData?.creditLimit ?? null,
      available_credit: a.creditData?.availableCreditLimit ?? null, close_date: d10(a.creditData?.balanceCloseDate),
      due_date: d10(a.creditData?.balanceDueDate), updated_at: new Date().toISOString(), raw: a,
    })));
    counts.accounts = accounts.length;
  }
  for (const a of accounts) {
    const tx = await transactions(key, a.id, dateFrom);
    for (let i = 0; i < tx.length; i += 500) {
      const rows = tx.slice(i, i + 500).map((t: any) => ({
        id: t.id, account_id: a.id, date: d10(t.date), description: t.description,
        // Saída sempre negativa, entrada positiva, em conta e em cartão.
        amount: t.type === 'DEBIT' ? -Math.abs(t.amount) : Math.abs(t.amount),
        type: t.type, status: t.status ?? null, category: t.category ?? null, categoria_auto: categoriza(t),
        installment: t.creditCardMetadata?.totalInstallments ? `${t.creditCardMetadata.installmentNumber}/${t.creditCardMetadata.totalInstallments}` : null,
        bill_id: t.creditCardMetadata?.billId ?? null, updated_at: new Date().toISOString(), raw: t,
      }));
      const { error } = await sb.from('fin_transactions').upsert(rows);
      if (error) throw new Error(`transactions: ${error.message}`);
    }
    counts.transactions += tx.length;
    if (a.type === 'CREDIT') {
      const bills = await list(key, `/bills?accountId=${a.id}`);
      if (bills.length) {
        await sb.from('fin_bills').upsert(bills.map((b: any) => ({
          id: b.id, account_id: a.id, due_date: d10(b.dueDate), total: b.totalAmount ?? null,
          minimum: b.minimumPaymentAmount ?? null, updated_at: new Date().toISOString(), raw: b,
        })));
        counts.bills += bills.length;
      }
    }
  }
  const inv = await list(key, `/investments?itemId=${itemId}`).catch(() => []);
  if (inv.length) {
    await sb.from('fin_investments').upsert(inv.map((x: any) => ({
      id: x.id, item_id: itemId, type: x.type, subtype: x.subtype ?? null, name: x.name, balance: x.balance ?? x.amount ?? null,
      quantity: x.quantity ?? null, updated_at: new Date().toISOString(), raw: x,
    })));
    counts.investments = inv.length;
  }
  const loans = await list(key, `/loans?itemId=${itemId}`).catch(() => []);
  if (loans.length) {
    await sb.from('fin_loans').upsert(loans.map((l: any) => ({
      id: l.id, item_id: itemId, product: l.productName ?? l.type ?? null, contract_amount: l.contractAmount ?? null,
      outstanding: l.payments?.contractOutstandingBalance ?? l.outstandingBalance ?? null,
      installments_total: l.installments?.totalNumberOfInstallments ?? null, installments_paid: l.installments?.paidInstallments ?? null,
      due_date: d10(l.dueDate), updated_at: new Date().toISOString(), raw: l,
    })));
    counts.loans = loans.length;
  }
  await sb.from('fin_items').update({ last_sync_at: new Date().toISOString(), last_error: null }).eq('id', itemId);
  await sb.from('fin_sync_log').insert({ trigger, item_id: itemId, ok: true, detail: counts });
  return { itemId, ...counts };
}

export async function failItem(sb: SupabaseClient, itemId: string, trigger: string, e: unknown) {
  const msg = String((e as Error)?.message || e).slice(0, 300);
  await sb.from('fin_items').upsert({ id: itemId, last_error: msg });
  await sb.from('fin_sync_log').insert({ trigger, item_id: itemId, ok: false, detail: { error: msg } });
  return { itemId, error: msg };
}

export const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
