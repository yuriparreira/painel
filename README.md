# Painel

App pessoal (PWA): um painel diário em que você é o personagem principal, com saúde e treinos, dinheiro e tarefas.

**Abrir:** https://yuriparreira.github.io/painel/

No iPhone, abra no Safari e use Compartilhar → Adicionar à Tela de Início para usar como app instalado, inclusive offline.

## O que está aqui

Desde a versão 0.5.0 o app não tem nenhum dado de exemplo. Cada número vem de três lugares:

- **Dinheiro:** Open Finance pelo Supabase (depois do login) ou o arquivo `painel-dados.json` carregado à mão.
- **Saúde:** plano de treino, fichas, plano alimentar, medidas e exames, lidos do Supabase pela função `saude_painel()`.
- **O que você registra no app:** check-in de sono e peso, treinos, refeições, tarefas, gastos e contas pagas. Fica só no aparelho.

XP, Chama, atributos, conquistas e o chefe do mês começam do zero e são calculados só com esses registros. Sem dados, cada tela diz de onde eles vêm e qual é o próximo passo.

| Área | Telas |
| --- | --- |
| Hoje | check-in, missões do dia (Corpo, Combustível e Missão), linha do dia, resumo do dinheiro e da semana |
| Saúde | energia pelo sono, peso, treino com cronômetro de descanso, plano de treino, dieta do dia, exames e medidas |
| Dinheiro | quanto pode gastar, contas a pagar, cartões e faturas, patrimônio, sincronização |
| Agenda | Top 3 do dia, caixa de entrada com texto livre, próximos 7 dias |
| Ficha | nível, XP, atributos, missões da semana, conquistas, chefe do mês, ajustes |

Ainda não conectados: Apple Health, agenda (Google ou Apple) e lembretes automáticos. Ajustes mostra o estado de cada integração.

Ao abrir a 0.5.0 pela primeira vez, o aparelho zera o que a demonstração antiga tinha deixado (XP, Chama, histórico, peso e sono de exemplo) e mantém tema, contas marcadas como pagas, gastos anotados e tarefas próprias.

## Estrutura

```
index.html            casca do app, barra de abas e botão Registrar
app.js                telas, rotas, gamificação e interações
data.js               regras fixas do jogo e leitura dos dados (painel-financas/1 e painel-saude/1)
sync.js               login por código no e-mail (Supabase Auth) e leitura do banco
app.css               tokens de cor (claro e escuro) e componentes
icons.js              ícones de traço em SVG
sw.js                 service worker: funciona offline após a primeira visita
manifest.webmanifest  instalação como PWA
icons/                ícones do app
supabase/             banco e funções: Open Finance e saúde (só estrutura, nenhum dado)
```

Sem build e sem dependências: JavaScript puro em módulos ES. Para rodar localmente, sirva a pasta com qualquer servidor estático, por exemplo `python3 -m http.server 8080`, e abra http://localhost:8080.

## Privacidade

O repositório é público para usar o GitHub Pages grátis, então **nenhum dado pessoal real entra aqui**: nada de extratos, valores, exames, endereços de agenda, segredos ou tokens. A única chave aqui é a publicável do Supabase, em `sync.js`: ela é feita para ficar no navegador, e quem protege os dados é o RLS do banco, que só deixa a conta dona ler. Os dados de verdade ficam no banco do Supabase, que só a conta dona lê, e na cópia do próprio aparelho.

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
- Sair apaga na hora a sessão e a cópia dos dados do aparelho e depois encerra a sessão no Supabase; uma leitura ou renovação em andamento é descartada. Entre abas, a renovação do token é feita por uma de cada vez.
- Service worker: a página e os arquivos saem só da versão instalada, sem troca um a um. A versão nova chega inteira (o app oferece recarregar). Todo deploy precisa subir o `VERSION` de `sw.js`.

Os segredos (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_ITEM_IDS`, `PLUGGY_WEBHOOK_TOKEN`) ficam em Edge Functions → Secrets no Supabase.

## Saúde no Supabase

- `migrations/20261104200000_saude.sql`: tabelas `saude_*` (perfil com metas e plano de treino, fichas, refeições, diário, medidas, exames, treinos e histórico), com o mesmo RLS do dinheiro: só a conta dona lê e grava.
- `migrations/20261104201000_saude_painel.sql`: `saude_painel()`, que monta numa chamada só o formato `painel-saude/1` das telas de Saúde. Roda com as permissões de quem chama, então o RLS continua valendo.
- Os dados foram copiados uma vez para essas tabelas, direto no banco. Medidas e exames novos ainda não entram pelo app; o check-in e os treinos registrados ficam no aparelho.
