# MedAgenda — Sistema de agendamento da policlínica

Sistema web para pacientes agendarem consultas, profissionais acompanharem a própria agenda
e a administração da clínica gerenciar a equipe.

O sistema **não depende mais do Supabase**: tem servidor próprio (Node.js) e banco de dados
SQL próprio. Funciona com **SQLite**, **PostgreSQL** ou **MySQL/MariaDB** — o código é o mesmo,
basta escolher no arquivo `.env`.

## O que tem no sistema

| Perfil | O que pode fazer |
| --- | --- |
| **Paciente** | Criar conta, ver o perfil completo dos profissionais, agendar (profissional → data → horário), ver e cancelar consultas, editar seus dados e trocar a senha |
| **Profissional** | Ver a agenda (hoje, próximas, anteriores), marcar consultas como concluídas ou canceladas, editar o **perfil público** (foto, especialidade, registro, apresentação, formação e dias de atendimento) |
| **Administrador** | Cadastrar profissionais (com login e senha provisória), ativar/desativar quem aparece para agendamento e ver números gerais |

Todos os perfis têm **"Esqueci minha senha"** na tela de login: o sistema envia por e-mail um link
(válido por 1 hora, de uso único) para criar uma nova senha.

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

Cria 4 profissionais e o paciente `paciente@demo.com`, todos com a senha `demo123`
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
| `usuarios` | Pacientes, profissionais e administradores (senha guardada com bcrypt) |
| `profissionais` | Perfil público de cada profissional, ligado a um usuário |
| `consultas` | Agendamentos (`agendada`, `concluida` ou `cancelada`). Um índice único impede dois pacientes no mesmo horário |
| `redefinicoes_senha` | Pedidos de "esqueci minha senha" (só o hash do código é guardado) |

A estrutura completa está em `db/migrations/`.

## E-mail de recuperação de senha

Preencha os campos `SMTP_*` do `.env` com os dados do seu provedor de e-mail (Gmail, Outlook,
Brevo, Amazon SES etc.) e ajuste `APP_URL` com o endereço público do site, que é usado no link.

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
server/            Servidor Express
  rotas/           auth (login, cadastro, senha), profissionais, consultas e admin
db/migrations/     Estrutura do banco (criação das tabelas)
db/seeds/          Dados de demonstração
test/              Testes automáticos da API
knexfile.js        Escolha do banco (SQLite / PostgreSQL / MySQL)
```

## Sobre os dados antigos do Supabase

Os dados que estavam no Supabase não são copiados automaticamente. Se precisar trazê-los
(pacientes, profissionais ou consultas), exporte as tabelas pelo painel do Supabase e importe
no banco novo. Os campos têm nomes parecidos com os da versão anterior.
