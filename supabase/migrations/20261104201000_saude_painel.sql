-- Tudo o que as telas de Saúde precisam, numa chamada só (schema painel-saude/1).
-- Roda com as permissões de quem chama: o RLS de cada tabela continua valendo.
create or replace function public.saude_painel()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  perfil jsonb;
  altura numeric;
  fichas jsonb;
  refeicoes jsonb;
  diario jsonb;
  medidas jsonb;
  exames jsonb;
  treinos jsonb;
  historico jsonb;
begin
  if not private.fin_is_owner() then
    raise exception 'nao_e_dono' using hint = 'fin_reivindicar';
  end if;

  select p.dados into perfil from public.saude_perfil p where p.id = 1;
  select m.altura into altura from public.saude_medidas m where m.altura is not null order by m.data desc, m.id limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'treino', f.treino, 'bloco', f.bloco, 'titulo', f.titulo, 'semanas', f.semanas, 'resumo', f.resumo,
      'orientacao', f.orientacao, 'exercicios', f.exercicios, 'cardapio', f.cardapio, 'observacoes', f.observacoes)
      order by f.bloco nulls last, f.ordem, f.id), '[]'::jsonb)
    into fichas from public.saude_fichas f;

  select coalesce(jsonb_agg(jsonb_build_object(
      'refeicao', r.refeicao, 'horario', r.horario, 'alimentos', r.alimentos, 'kcal', r.kcal,
      'p', r.proteina, 'c', r.carbo, 'g', r.gordura, 'tipos', to_jsonb(r.tipos), 'versao', r.versao)
      order by r.ordem, r.id), '[]'::jsonb)
    into refeicoes from public.saude_refeicoes r where r.ativo;

  -- Diário: os últimos 400 dias com algum registro.
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'd', x.data, 'peso', x.peso, 'sono', x.sono, 'treinou', x.treinou, 'prot', x.proteina_ok, 'agua', x.agua_ok,
      'creatina', x.creatina, 'passos', x.passos, 'energia', x.energia, 'fc', x.fc_repouso, 'hrv', x.hrv,
      'kcal', x.calorias, 'protG', x.proteina_g, 'aguaL', x.agua_l, 'tipo', x.tipo_dia, 'notas', x.notas, 'fonte', x.fonte))
      order by x.data), '[]'::jsonb)
    into diario from public.saude_diario x where x.data >= hoje - 400;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'd', m.data, 'fonte', m.fonte, 'peso', m.peso, 'gordura', m.gordura, 'cintura', m.cintura, 'abdomen', m.abdomen,
      'peito', m.peito, 'ombros', m.ombros, 'pescoco', m.pescoco, 'quadril', m.quadril,
      'bicepsD', m.biceps_d, 'bicepsE', m.biceps_e, 'antebracoD', m.antebraco_d, 'antebracoE', m.antebraco_e,
      'coxaD', m.coxa_d, 'coxaE', m.coxa_e, 'panturrilhaD', m.panturrilha_d, 'panturrilhaE', m.panturrilha_e, 'notas', m.notas))
      order by m.data, m.id), '[]'::jsonb)
    into medidas from public.saude_medidas m;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'd', e.data, 'n', e.marcador, 'cat', e.categoria, 'lab', e.laboratorio, 'v', e.resultado, 'txt', e.resultado_texto,
      'u', e.unidade, 'lo', e.ref_min, 'hi', e.ref_max, 'notas', e.notas))
      order by e.data, e.categoria, e.marcador), '[]'::jsonb)
    into exames from public.saude_exames e;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'd', t.data, 'titulo', t.titulo, 'modalidade', t.modalidade, 'programa', t.programa, 'cardio', t.tipo_cardio,
      'min', t.duracao_min, 'rpe', t.rpe, 'sensacao', t.sensacao, 'fc', t.fc_media, 'kcal', t.kcal, 'km', t.distancia_km,
      'dor', t.dor, 'notas', t.notas))
      order by t.data, t.id), '[]'::jsonb)
    into treinos from public.saude_treinos t where t.data >= hoje - 400;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'mes', h.mes, 'musculacao', h.musculacao, 'cardio', h.cardio, 'outros', h.outros, 'min', h.minutos,
      'kcal', h.kcal_ativas, 'passos', h.passos_dia, 'fc', h.fc_repouso))
      order by h.mes), '[]'::jsonb)
    into historico from public.saude_historico h;

  return jsonb_build_object(
    'schema', 'painel-saude/1',
    'lidoEm', now(),
    'perfil', coalesce(perfil, '{}'::jsonb),
    'altura', altura,
    'fichas', fichas,
    'refeicoes', refeicoes,
    'diario', diario,
    'medidas', medidas,
    'exames', exames,
    'treinos', treinos,
    'historico', historico);
end
$$;
