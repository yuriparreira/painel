# Painel

Wireframe navegável do app pessoal do Yuri: um painel diário em que ele é o personagem principal, com saúde e treinos, finanças pessoais e um assessor para o dia a dia.

**Abrir:** https://yuriparreira.github.io/painel/

No iPhone, abra no Safari e use Compartilhar → Adicionar à Tela de Início para testar como app instalado, inclusive offline.

## O que está aqui

Esta é a etapa M0 (wireframe). Todas as telas funcionam com dados fictícios guardados só no navegador, para testar fluxo, hierarquia e hábito antes de construir o app real.

| Área | Telas |
| --- | --- |
| Hoje | resumo do dia, check-in de sono e energia, missões diárias, chama de sequência |
| Saúde | atributos, treino com cronômetro de descanso, campanha de 4 atos, dieta, exames e medidas |
| Dinheiro | quanto pode gastar, contas a pagar, cartões e faturas, patrimônio, importação de extratos |
| Agenda | top 3, caixa de entrada com texto livre, agenda do dia, hora de dormir |
| Ficha | nível, XP, conquistas, chefe da semana, ajustes e estados de demonstração |

O mapa de telas e as notas de UX aparecem ao lado do aparelho em telas largas. No celular, Ficha → Mapa de telas e estados abre o mesmo mapa e os controles da demonstração: Hoje de manhã, feito ou à noite, simular sem internet e tema claro ou escuro.

## Estrutura

```
index.html            casca do app, barra de abas e botão Registrar
app.js                telas, rotas, gamificação e interações
data.js               dados fictícios de demonstração e leitura dos dados reais (formato painel-financas/1)
sync.js               login por código no e-mail (Supabase Auth) e leitura do banco
app.css               tokens de cor (claro e escuro) e componentes
icons.js              ícones de traço em SVG
sw.js                 service worker: funciona offline após a primeira visita
manifest.webmanifest  instalação como PWA
icons/                ícones do app
supabase/             banco e funções da sincronização com o Open Finance (só estrutura)
```

Sem build e sem dependências: JavaScript puro em módulos ES. Para rodar localmente, sirva a pasta com qualquer servidor estático, por exemplo `python3 -m http.server 8080`, e abra http://localhost:8080.

## Privacidade

O repositório é público para usar o GitHub Pages grátis, então **nenhum dado pessoal real entra aqui**: nada de extratos, valores, exames, endereços de agenda, segredos ou tokens. A única chave aqui é a publicável do Supabase, em `sync.js`: ela é feita para ficar no navegador, e quem protege os dados é o RLS do banco, que só deixa a conta dona ler. O app real, com os dados de verdade, vai para um endereço e um banco separados e privados.

## Sincronização com o Open Finance

A pasta `supabase/` tem só a estrutura do banco e as funções; nenhum dado real.

- `migrations/`: tabelas `fin_*`, RLS em que só o dono lê, e a categorização dos lançamentos feita no próprio banco. As regras pessoais de categoria ficam só na tabela `fin_rules` do banco, nunca aqui.
- `functions/pluggy-sync`: busca contas, lançamentos, faturas e investimentos de cada conexão do Meu Pluggy. Roda todo dia pelo agendamento, pelo webhook e à mão.
- `functions/pluggy-webhook`: recebe os avisos da Pluggy e dispara a sincronização da conexão.
- `cron.example.sql`: modelo do agendamento diário, para rodar no SQL Editor com os valores reais.

### Login no app

Em Dinheiro → Open Finance e extratos → Open Finance, o dono entra com um código de 6 dígitos que chega no e-mail (Supabase Auth, sem senha). Depois disso o app chama a função `fin_painel()`, que monta numa chamada só o mesmo formato do arquivo `painel-dados.json`: contas, cartões, faturas e lançamentos do Open Finance, mais a foto manual (`fin_snapshots`) com o que não vem por lá. A última leitura fica no aparelho para abrir sem internet.

- Na primeira vez, `fin_reivindicar()` torna dona a conta cujo e-mail está em `private.fin_config` (gravado direto no banco, nunca aqui), e só enquanto não há dono. Só vale o login pelo código do e-mail: senha, provedor externo ou sessão anônima não reivindicam.
- Outra conta consegue entrar, mas não lê nada: o banco responde `nao_e_dono`.
- No painel do Supabase: em Authentication → Email Templates, os modelos **Magic Link** e **Confirm signup** precisam mostrar `{{ .Token }}`. O melhor é mostrar só o código, sem o link: o link e o código são o mesmo código, e abrir o link no navegador (fora do app instalado no iPhone) gasta o código. Sem SMTP próprio o Supabase não deixa mudar os modelos e o e-mail traz só o link: aí o login é pelo link, aberto no mesmo navegador em que o e-mail foi pedido, com o endereço do app no Site URL e em Redirect URLs (URL Configuration). No iPhone, o app da tela inicial não recebe o link; para ele, só com SMTP próprio e o código.
- Fatura paga: `fin_painel()` procura o pagamento com o valor da fatura, de 12 dias antes a 20 dias depois do vencimento, e manda a data em `pagoEm`. O débito na conta e o crédito no cartão do mesmo pagamento contam como um só. Cada pagamento quita uma fatura só e cada fatura fica com um pagamento só: da mais antiga para a mais nova, cada uma escolhe o de valor mais parecido e data mais perto do vencimento.
- Conta marcada como paga à mão: sai do saldo até o banco mostrar o pagamento, ou seja, até o extrato trazer um débito do mesmo valor ou até todos os bancos atualizarem (`atualizadoEm`, a atualização do próprio Pluggy) depois da marcação e do vencimento. O débito precisa ser de depois da marcação (desde o dia anterior) e não pode já estar ligado a outra conta. A marcação vale para aquela conta e aquele mês. Gasto registrado à mão sai da lista quando o extrato traz um lançamento novo do mesmo valor e do mesmo meio (cartão no cartão, Pix na conta; dinheiro nunca), que ainda não estava lá quando o gasto foi registrado e não foi ligado a outro gasto, ou quando os bancos atualizam depois dele.
- Sair apaga na hora a sessão e a cópia dos dados do aparelho e depois encerra a sessão no Supabase; uma leitura ou renovação em andamento é descartada. Entre abas, a renovação do token é feita por uma de cada vez.
- Service worker: a página e os arquivos saem só da versão instalada, sem troca um a um. A versão nova chega inteira (o app oferece recarregar). Todo deploy precisa subir o `VERSION` de `sw.js`.

Os segredos (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_ITEM_IDS`, `PLUGGY_WEBHOOK_TOKEN`) ficam em Edge Functions → Secrets no Supabase.
