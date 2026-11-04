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
data.js               dados fictícios de demonstração
app.css               tokens de cor (claro e escuro) e componentes
icons.js              ícones de traço em SVG
sw.js                 service worker: funciona offline após a primeira visita
manifest.webmanifest  instalação como PWA
icons/                ícones do app
supabase/             banco e funções da sincronização com o Open Finance (só estrutura)
```

Sem build e sem dependências: JavaScript puro em módulos ES. Para rodar localmente, sirva a pasta com qualquer servidor estático, por exemplo `python3 -m http.server 8080`, e abra http://localhost:8080.

## Privacidade

O repositório é público para usar o GitHub Pages grátis, então **nenhum dado pessoal real entra aqui**: nada de extratos, valores, exames, endereços de agenda, chaves ou tokens. O app real, com os dados de verdade, vai para um endereço e um banco separados e privados.

## Sincronização com o Open Finance

A pasta `supabase/` tem só a estrutura do banco e as funções; nenhum dado real.

- `migrations/`: tabelas `fin_*`, RLS em que só o dono lê, e a categorização dos lançamentos feita no próprio banco. As regras pessoais de categoria ficam só na tabela `fin_rules` do banco, nunca aqui.
- `functions/pluggy-sync`: busca contas, lançamentos, faturas e investimentos de cada conexão do Meu Pluggy. Roda todo dia pelo agendamento, pelo webhook e à mão.
- `functions/pluggy-webhook`: recebe os avisos da Pluggy e dispara a sincronização da conexão.
- `cron.example.sql`: modelo do agendamento diário, para rodar no SQL Editor com os valores reais.

Os segredos (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_ITEM_IDS`, `PLUGGY_WEBHOOK_TOKEN`) ficam em Edge Functions → Secrets no Supabase.
