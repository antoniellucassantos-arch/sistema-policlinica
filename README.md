# MedAgenda — Sistema de agendamento da policlínica

Sistema web para pacientes agendarem consultas, profissionais acompanharem a própria agenda
e a administração da clínica gerenciar a equipe.

O sistema **não depende mais do Supabase**: tem servidor próprio (Node.js) e banco de dados
SQL próprio. Funciona com **SQLite**, **PostgreSQL** ou **MySQL/MariaDB** — o código é o mesmo,
basta escolher no arquivo `.env`.

## O que tem no sistema

| Perfil | O que pode fazer |
| --- | --- |
| **Paciente** | Criar conta, ver o perfil completo dos profissionais (horários, valores e convênios), agendar escolhendo motivo e forma de pagamento, **remarcar** e cancelar (respeitando o prazo mínimo), editar seus dados e trocar a senha |
| **Profissional** | Ver a agenda (hoje, próximas, anteriores), marcar consultas como **concluída**, **faltou** ou cancelada, **remarcar**, configurar o **próprio expediente** (dias, horário, pausa e duração da consulta), valor particular e **convênios**, e **bloquear datas** (férias, folgas) |
| **Recepção** | Ver a **agenda geral da clínica** por dia e por profissional, **agendar em nome do paciente** (inclusive cadastrando pacientes só com telefone), remarcar, registrar faltas e bloquear datas |
| **Administrador** | Tudo o que a recepção faz, mais: cadastrar profissionais e contas da recepção, ativar/desativar profissionais e ajustar as **configurações** (limite de consultas por paciente, prazo para cancelar e antecedência máxima) |

Também tem:

- **"Esqueci minha senha"** na tela de login: o sistema envia por e-mail um link (válido por 1 hora,
  de uso único) para criar uma nova senha.
- **Lembrete por e-mail** na véspera da consulta (a partir das 9h, configurável).
- **Limite de consultas futuras por paciente** (padrão 3) para ninguém "segurar" horários.
- **Prazo mínimo para o paciente cancelar ou remarcar** pelo site (padrão 24h antes). Depois disso,
  só pela clínica.
- Os horários nunca se sobrepõem, mesmo quando o profissional muda a duração da consulta.

## Demonstração no GitHub Pages

Para só **ver e mostrar** o sistema, sem servidor, dá para publicar no GitHub Pages:
em **Settings → Pages**, escolha *Deploy from a branch*, a branch com este código e a pasta
`/ (root)`. O endereço `https://<usuario>.github.io/<repositorio>/` abre o sistema em
**modo demonstração**:

- Tudo funciona (agendar, remarcar, perfis, agenda do médico, agenda da recepção, bloqueios,
  configurações, esqueci minha senha), mas os dados
  ficam salvos **só no navegador de quem acessa** (cada pessoa vê a sua própria cópia).
- A tela de login mostra botões para entrar como paciente, médica, recepção ou administrador
  (senha `demo123`).
- No "esqueci minha senha", o link aparece na tela em vez de ir por e-mail, e os lembretes
  por e-mail não são enviados.
- O botão "Reiniciar dados" (canto inferior) volta tudo ao estado inicial.

O modo demonstração liga sozinho em endereços `*.github.io`, ao abrir o `public/index.html`
direto do computador ou com `?demo` no endereço. Com o servidor rodando (`npm start`),
o sistema usa o banco de dados de verdade.

## Como rodar

Requisitos: [Node.js](https://nodejs.org) 18 ou mais recente.

```bash
npm install
cp .env.example .env      # depois edite o .env
npm start
```

Abra http://localhost:3000.

Na primeira execução, o servidor cria as tabelas automaticamente e cadastra o administrador
definido em `ADMIN_EMAIL` / `ADMIN_SENHA` no `.env`. Entre com essa conta para cadastrar os
profissionais.

### Dados de demonstração (opcional)

```bash
npm run seed:demo
```

Cria 4 profissionais (com horários, valores e convênios diferentes), a recepcionista
`recepcao@demo.com` e o paciente `paciente@demo.com`, todos com a senha `demo123`
(os profissionais usam os e-mails `ana.lima@demo.com`, `carlos.souza@demo.com`,
`juliana.martins@demo.com` e `rafael.oliveira@demo.com`). Use só para testes.

## Escolhendo o banco de dados

No `.env`:

```ini
# SQLite (padrão) — um arquivo em data/medagenda.sqlite, não precisa instalar nada
DB_CLIENT=sqlite

# PostgreSQL
DB_CLIENT=postgres
DATABASE_URL=postgres://usuario:senha@localhost:5432/medagenda

# MySQL / MariaDB
DB_CLIENT=mysql
DATABASE_URL=mysql://usuario:senha@localhost:3306/medagenda
```

Crie o banco vazio (`CREATE DATABASE medagenda;`) e inicie o servidor: as tabelas são criadas
sozinhas. Para criar as tabelas sem iniciar o servidor, rode `npm run migrate`.

### Tabelas

| Tabela | Conteúdo |
| --- | --- |
| `usuarios` | Pacientes, profissionais, recepção e administradores (senha guardada com bcrypt). O e-mail é opcional para pacientes cadastrados pela recepção |
| `profissionais` | Perfil público, expediente, duração da consulta, valor e convênios de cada profissional |
| `consultas` | Agendamentos (`agendada`, `concluida`, `faltou` ou `cancelada`) com motivo, observação, forma de pagamento e controle do lembrete |
| `redefinicoes_senha` | Pedidos de "esqueci minha senha" (só o hash do código é guardado) |
| `bloqueios` | Datas em que a agenda fica fechada (de um profissional ou da clínica toda) |
| `configuracoes` | Regras ajustáveis pelo administrador (limite, prazo, antecedência) |

A estrutura completa está em `db/migrations/`.

## E-mails (recuperação de senha e lembretes)

Preencha os campos `SMTP_*` do `.env` com os dados do seu provedor de e-mail (Gmail, Outlook,
Brevo, Amazon SES etc.) e ajuste `APP_URL` com o endereço público do site, que é usado nos links.

Os lembretes saem na véspera da consulta, a partir de `HORA_LEMBRETE` (padrão 9h), para pacientes
que têm e-mail. Para desligar, use `LEMBRETES=false`. Lembrete por WhatsApp precisa de um serviço
pago (como a API oficial do WhatsApp Business) e não está incluído.

Sem SMTP configurado, o e-mail **aparece no terminal do servidor**, o que é útil para testes.

## Colocando no ar

1. Defina `JWT_SECRET` com um valor aleatório (veja o comando no `.env.example`). Sem ele,
   todos são desconectados sempre que o servidor reinicia.
2. Use HTTPS e defina `COOKIE_SECURE=true`.
3. Atrás de um proxy (nginx, Render, Railway etc.), defina `TRUST_PROXY=1`.
4. Ajuste `APP_URL` para o endereço real do site.
5. Para SQLite, faça backup do arquivo `data/medagenda.sqlite`. Para PostgreSQL/MySQL, use o
   backup do próprio banco.

## Testes

```bash
npm test
```

Os testes rodam a API inteira em um banco SQLite temporário. Para testar em PostgreSQL ou MySQL,
aponte `TEST_DB_CLIENT` e `TEST_DATABASE_URL` para um banco **vazio**. As tabelas desse banco são
apagadas e recriadas.

## Estrutura

```
public/            Front-end (HTML, CSS e JavaScript puros)
  demo.js          Modo demonstração (simula a API no navegador)
server/            Servidor Express
  rotas/           auth, profissionais, consultas, equipe (pacientes e bloqueios) e admin
  lembretes.js     Envio dos lembretes da véspera
shared/agenda.js   Regras de horário usadas pelo servidor e pela demonstração
db/migrations/     Estrutura do banco (criação das tabelas)
db/seeds/          Dados de demonstração
test/              Testes automáticos da API
knexfile.js        Escolha do banco (SQLite / PostgreSQL / MySQL)
```

## Sobre os dados antigos do Supabase

Os dados que estavam no Supabase não são copiados automaticamente. Se precisar trazê-los
(pacientes, profissionais ou consultas), exporte as tabelas pelo painel do Supabase e importe
no banco novo. Os campos têm nomes parecidos com os da versão anterior.
