# Painel

App pessoal (PWA): um painel diário em que você é o personagem principal, com saúde e treinos, dinheiro e tarefas.

**Abrir:** https://yuriparreira.github.io/painel/

No iPhone, abra no Safari e use Compartilhar → Adicionar à Tela de Início para usar como app instalado, inclusive offline.

## O que está aqui

Desde a versão 0.5.0 o app não tem nenhum dado de exemplo. Cada número vem de três lugares:

- **Dinheiro:** Open Finance pelo Supabase (depois do login) ou o arquivo `painel-dados.json` carregado à mão.
- **Saúde:** plano de treino, fichas, plano alimentar, medidas e exames, lidos do Supabase pela função `saude_painel()`.
- **O que você registra no app:** check-in de sono e peso, treinos, refeições, tarefas, gastos e contas pagas. Fica no aparelho e, depois do login, também na nuvem (Supabase), igual no celular e no computador.
- **Apple Health e agenda do iPhone:** pelo atalho “Painel Sync” do app Atalhos, que manda sono, passos, peso, VFC, frequência de repouso, energia ativa, minutos de exercício e os eventos do Calendário (iCloud e Google) para a função `atalho` do Supabase.

XP, Chama, atributos, conquistas e o chefe do mês começam do zero e são calculados só com esses registros. Sem dados, cada tela diz de onde eles vêm e qual é o próximo passo.

| Área | Telas |
| --- | --- |
| Hoje | check-in, missões do dia (Corpo, Combustível e Missão), linha do dia, resumo do dinheiro e da semana |
| Saúde | energia pelo sono, peso, treino com cronômetro de descanso, treinos seus e base de exercícios, plano de treino, dieta do dia, exames e medidas |
| Dinheiro | quanto pode gastar, contas a pagar, cartões e faturas, patrimônio, sincronização |
| Agenda | Top 3 do dia, caixa de entrada com texto livre, próximos 7 dias |
| Ficha | nível, XP, atributos, missões da semana, conquistas, chefe do mês, ajustes |

Ainda não existem: lembretes automáticos e a leitura dos treinos do Apple Health (o app Atalhos não lê treinos). Ajustes mostra o estado de cada integração.

Ao abrir a 0.5.0 pela primeira vez, o aparelho zera o que a demonstração antiga tinha deixado (XP, Chama, histórico, peso e sono de exemplo) e mantém tema, contas marcadas como pagas, gastos anotados e tarefas próprias.

## Estrutura

```
index.html            casca do app, barra de abas e botão Registrar
app.js                telas, rotas, gamificação e interações
data.js               regras fixas do jogo e leitura dos dados (painel-financas/1 e painel-saude/1)
sync.js               login por código no e-mail (Supabase Auth) e leitura do banco
nuvem.js              seus registros na nuvem: junta o estado do celular e do computador
app.css               tokens de cor (claro e escuro) e componentes
icons.js              ícones de traço em SVG
sw.js                 service worker: funciona offline após a primeira visita
manifest.webmanifest  instalação como PWA
icons/                ícones do app
supabase/             banco e funções: Open Finance e saúde (só estrutura, nenhum dado)
```

Sem build e sem dependências: JavaScript puro em módulos ES. Para rodar localmente, sirva a pasta com qualquer servidor estático, por exemplo `python3 -m http.server 8080`, e abra http://localhost:8080.

## Privacidade

O repositório é público para usar o GitHub Pages grátis, então **nenhum dado pessoal real entra aqui**: nada de extratos, valores, exames, endereços de agenda, segredos ou tokens. A única chave aqui é a publicável do Supabase, em `sync.js`: ela é feita para ficar no navegador, e quem protege os dados é o RLS do banco, que só deixa a conta dona ler. Os dados de verdade ficam no banco do Supabase, que só a conta dona lê, e na cópia do próprio aparelho. O token do atalho do iPhone também nunca entra aqui: ele aparece só no app, uma vez.

## Sincronização com o Open Finance

A pasta `supabase/` tem só a estrutura do banco e as funções; nenhum dado real.

- `migrations/`: tabelas `fin_*`, RLS em que só o dono lê, e a categorização dos lançamentos feita no próprio banco. As regras pessoais de categoria ficam só na tabela `fin_rules` do banco, nunca aqui.
- `functions/pluggy-sync`: busca contas, lançamentos, faturas e investimentos de cada conexão do Meu Pluggy. Roda todo dia pelo agendamento, pelo webhook e à mão.
- `functions/pluggy-webhook`: recebe os avisos da Pluggy e dispara a sincronização da conexão.
- `cron.example.sql`: modelo do agendamento diário, para rodar no SQL Editor com os valores reais.

### Login no app

Em Dinheiro → Sincronizar, o dono entra com um código de 6 dígitos que chega no e-mail (Supabase Auth, sem senha). Depois disso o app chama a função `fin_painel()`, que monta numa chamada só o mesmo formato do arquivo `painel-dados.json`: contas, cartões, faturas e lançamentos do Open Finance, mais a foto manual (`fin_snapshots`) com o que não vem por lá. A última leitura fica no aparelho para abrir sem internet.

- Na primeira vez, `fin_reivindicar()` torna dona a conta cujo e-mail está em `private.fin_config` (gravado direto no banco, nunca aqui), e só enquanto não há dono. Só vale o login pelo código do e-mail: senha, provedor externo ou sessão anônima não reivindicam.
- Outra conta consegue entrar, mas não lê nada: o banco responde `nao_e_dono`.
- No painel do Supabase: em Authentication → Email Templates, os modelos **Magic Link** e **Confirm signup** precisam mostrar `{{ .Token }}`. O melhor é mostrar só o código, sem o link: o link e o código são o mesmo código, e abrir o link no navegador (fora do app instalado no iPhone) gasta o código. Sem SMTP próprio o Supabase não deixa mudar os modelos e o e-mail traz só o link: aí o login é pelo link, aberto no mesmo navegador em que o e-mail foi pedido, com o endereço do app no Site URL e em Redirect URLs (URL Configuration). No iPhone, o app da tela inicial não recebe o link; para ele, só com SMTP próprio e o código.
- Fatura paga: `fin_painel()` procura o pagamento com o valor da fatura, de 12 dias antes a 20 dias depois do vencimento, e manda a data em `pagoEm`. O débito na conta e o crédito no cartão do mesmo pagamento contam como um só. Cada pagamento quita uma fatura só e cada fatura fica com um pagamento só: da mais antiga para a mais nova, cada uma escolhe o de valor mais parecido e data mais perto do vencimento.
- Conta marcada como paga à mão: sai do saldo até o banco mostrar o pagamento, ou seja, até o extrato trazer um débito do mesmo valor ou até todos os bancos atualizarem (`atualizadoEm`, a atualização do próprio Pluggy) depois da marcação e do vencimento. O débito precisa ser de depois da marcação (desde o dia anterior) e não pode já estar ligado a outra conta. A marcação vale para aquela conta e aquele mês. Gasto registrado à mão sai da lista quando o extrato traz um lançamento novo do mesmo valor e do mesmo meio (cartão no cartão, Pix na conta; dinheiro nunca), que ainda não estava lá quando o gasto foi registrado e não foi ligado a outro gasto, ou quando os bancos atualizam depois dele.
- Sair sobe para a nuvem o que falta, apaga a sessão e a cópia dos dados do aparelho e depois encerra a sessão no Supabase; uma leitura ou renovação em andamento é descartada. Entre abas, a renovação do token é feita por uma de cada vez.
- Service worker: a página e os arquivos saem só da versão instalada, sem troca um a um. A versão nova chega inteira (o app oferece recarregar). Todo deploy precisa subir o `VERSION` de `sw.js`.

Os segredos (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_ITEM_IDS`, `PLUGGY_WEBHOOK_TOKEN`) ficam em Edge Functions → Secrets no Supabase.

## Treinos seus e base de exercícios

- No Treino, ao lado de A, B, C e Cardio, **Outros** abre os treinos seus: montar o treino de hoje buscando os exercícios, guardar para repetir, ou criar um treino fora do A, B e C. Contam como treino de força na semana.
- Cada exercício tem o botão de trocar: busca um substituto na base (só hoje ou sempre naquela ficha), com as mesmas séries. A carga fica guardada por exercício, então trocar, tirar ou reordenar não perde nada.
- **Editar a ficha** muda a sua versão de A, B ou C do bloco (tirar, pôr, trocar, reordenar, séries e repetições). A ficha no Supabase não muda, e dá para voltar à original.
- **Saúde → Exercícios** é a base: os exercícios das fichas, os dos seus treinos, os criados por você e os que já têm carga, com a última carga, o recorde estimado e o histórico dia a dia (400 dias).
- Tudo isso fica no mapa `lastSets` do estado, com chaves que começam com `~` (ou `exercício@dia` no histórico), para a cópia 0.6.0 do app, se ainda estiver aberta em outro aparelho, manter essas chaves na nuvem em vez de apagá-las.

## Saúde no Supabase

- `migrations/20261104200000_saude.sql`: tabelas `saude_*` (perfil com metas e plano de treino, fichas, refeições, diário, medidas, exames, treinos e histórico), com o mesmo RLS do dinheiro: só a conta dona lê, e nada grava pelo navegador (só direto no banco ou pelas funções).
- `migrations/20261104201000_saude_painel.sql`: `saude_painel()`, que monta numa chamada só o formato `painel-saude/1` das telas de Saúde. Roda com as permissões de quem chama, então o RLS continua valendo.
- Os dados foram copiados uma vez para essas tabelas, direto no banco. Medidas e exames novos ainda não entram pelo app.

## Seus registros na nuvem

- `migrations/20261104220000_nuvem.sql`: `painel_estado`, um documento só com tudo o que você registra no app, e as funções `estado_ler(p_rev)` e `estado_salvar(p_doc, p_base, p_aparelho)`. Só a conta dona lê, e grava só por `estado_salvar`. Gravar manda a versão em que o aparelho se baseou; se outra chegou antes, a função devolve a da nuvem e o aparelho junta as duas. As versões anteriores ficam em `private.painel_estado_hist` (uma por hora nos últimos 3 dias, uma por dia até 60 dias).
- `nuvem.js` junta entrada por entrada: ganha a mudança mais nova, com exceções (primeiro dia, dia atual, recordes, histórico e registro do dia). O XP é a soma das parcelas de cada aparelho, e o que é do dia (check-in, missões, séries) não passa para o dia seguinte: se só um aparelho tinha o dia que ficou para trás, o app fecha esse dia (histórico, noite boa, registro) ao juntar, e a Chama é refeita a partir do histórico juntado. Um aparelho que passa mais de 58 dias sem ver a nuvem descarta o que já tinha subido para a nuvem (senão o que foi apagado no outro aparelho voltaria) e junta só o que ainda não tinha subido. Tema, rascunhos, cronômetro e filtros ficam em cada aparelho.
- Com a nuvem, a virada do dia espera a leitura dela (até 4 s): o outro aparelho pode já ter virado. O dia só vira para frente. Ao sair da tela, o envio sai na hora, mesmo com uma leitura em andamento. Sair da conta sobe o que falta e apaga do aparelho a cópia dos registros; entrar de novo traz tudo de volta.

## Atalho do iPhone (Apple Health e agenda)

- `migrations/20261104221000_atalho.sql`: o token do atalho (só o SHA-256 dele, em `private.atalho_token`), as amostras do Apple Health (`private.saude_amostra`), a agenda (`agenda_eventos`), o registro de chamadas (`atalho_log`) e as funções `atalho_novo_token()` e `atalho_receber()`. O sono de cada noite sai das amostras: a fonte com estágios vence, e conta o tempo dormindo (essencial, profundo, REM), não o tempo na cama.
- `migrations/20261104222000_saude_painel_agenda.sql`: `saude_painel()` passa a mandar a agenda (de ontem até 15 dias) e quando o atalho mandou cada parte.
- `functions/atalho`: recebe o atalho (sem JWT do Supabase: confere o token no cabeçalho `x-painel-token` ou `Authorization: Bearer`), entende datas e números do iPhone em português e responde uma linha que o atalho mostra numa notificação, começando com OK, AVISO ou ERRO. A resposta mostra só valores que vieram na própria chamada; do banco vêm só as contagens. Sem token válido nada é gravado; com ele, uma chamada que não deu para ler anota só o motivo em `atalho_log` (90 dias). `ATALHO_BRUTO=1` nos segredos guarda também o corpo cru por 14 dias, para ajustar a leitura.
- O token é gerado em Sincronizar → Atalho do iPhone e aparece uma vez só. Gerar outro desliga o anterior. Quem tem o token consegue mandar dados de saúde e trocar a agenda que veio do atalho, nada mais.
