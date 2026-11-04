-- Ajustes 3: cada pagamento quita uma fatura só, e cada fatura fica com um pagamento só.
--
-- O mesmo pagamento costuma aparecer duas vezes: o débito na conta do banco e o crédito na fatura do cartão. Os dois
-- viram um único evento, ligado ao cartão do crédito. Um débito sem par vale para qualquer cartão; um crédito sem par,
-- só para o seu cartão. Depois as faturas, da mais antiga para a mais nova, escolhem cada uma o melhor evento ainda
-- livre: mesmo valor (diferença menor que R$ 1), pago de 12 dias antes até 20 dias depois do vencimento, o valor mais
-- próximo, depois a data mais perto do vencimento (atraso conta em dobro).

create or replace function private.fin_faturas_pagas()
returns table (bill_id text, pago_em date)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  ev jsonb := '[]'::jsonb;  -- eventos de pagamento: {k, d, v, conta}
  pares text[] := '{}';
  usados text[] := '{}';
  d record;
  c record;
  par boolean;
  b record;
  best jsonb;
begin
  -- Débitos no banco, cada um com o crédito do mesmo valor que aparece no cartão de 1 dia antes até 5 dias depois.
  -- O par fica com a data do primeiro dos dois.
  for d in
    select l.id, l.date, abs(l.amount) as v
      from public.fin_lancamentos l
     where l.categoria = 'Pagamento de fatura' and l.conta_tipo = 'BANK' and l.amount < 0
     order by l.date, l.id
  loop
    select l.id, l.account_id, l.date into c
      from public.fin_lancamentos l
     where l.categoria = 'Pagamento de fatura' and l.conta_tipo <> 'BANK' and l.amount > 0
       and abs(l.amount - d.v) < 1
       and l.date between d.date - 1 and d.date + 5
       and not (l.id = any(pares))
     order by abs(l.amount - d.v), abs(l.date - d.date), l.date, l.id
     limit 1;
    par := found;
    if par then pares := pares || c.id; end if;
    ev := ev || jsonb_build_array(jsonb_build_object(
      'k', 'b:' || d.id, 'd', case when par then least(d.date, c.date) else d.date end, 'v', d.v,
      'conta', case when par then c.account_id end));
  end loop;

  -- Créditos no cartão que não tiveram débito par (pagos de um banco fora do Open Finance, por exemplo).
  for c in
    select l.id, l.date, l.amount as v, l.account_id
      from public.fin_lancamentos l
     where l.categoria = 'Pagamento de fatura' and l.conta_tipo <> 'BANK' and l.amount > 0
       and not (l.id = any(pares))
     order by l.date, l.id
  loop
    ev := ev || jsonb_build_array(jsonb_build_object('k', 'c:' || c.id, 'd', c.date, 'v', c.v, 'conta', c.account_id));
  end loop;

  -- Faturas, da mais antiga para a mais nova.
  for b in
    select x.id, x.account_id, x.due_date, x.total from public.fin_bills x where x.total >= 1 order by x.due_date, x.id
  loop
    select e.value into best
      from jsonb_array_elements(ev) e
     where not ((e.value ->> 'k') = any(usados))
       and abs((e.value ->> 'v')::numeric - b.total) < 1
       and (e.value ->> 'd')::date between b.due_date - 12 and b.due_date + 20
       and (e.value ->> 'conta' is null or e.value ->> 'conta' = b.account_id)
     order by round(abs((e.value ->> 'v')::numeric - b.total), 2),
              case when (e.value ->> 'd')::date <= b.due_date then b.due_date - (e.value ->> 'd')::date
                   else 2 * ((e.value ->> 'd')::date - b.due_date) end,
              (e.value ->> 'd')::date, e.value ->> 'k'
     limit 1;
    if best is not null then
      usados := usados || (best ->> 'k');
      bill_id := b.id;
      pago_em := (best ->> 'd')::date;
      return next;
    end if;
  end loop;
end;
$$;
