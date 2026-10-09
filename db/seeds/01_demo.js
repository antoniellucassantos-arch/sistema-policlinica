/* ==========================================================
   DADOS DE DEMONSTRAÇÃO (apenas para testes)
   npm run seed:demo
   Cria profissionais e um paciente de exemplo, todos com a senha "demo123".
   Não apaga nada: contas com o mesmo e-mail são ignoradas.
========================================================== */
const bcrypt = require('bcryptjs');

const PROFISSIONAIS = [
  {
    nome: 'Dra. Ana Beatriz Lima',
    email: 'ana.lima@demo.com',
    especialidade: 'Clínica Geral',
    registro: 'CRM 12345-SP',
    descricao: 'Atendimento humanizado para adultos e idosos.',
    sobre: 'Médica clínica com foco em prevenção e acompanhamento de doenças crônicas, como hipertensão e diabetes.',
    formacao: 'Medicina — USP\nResidência em Clínica Médica — Hospital das Clínicas',
    dias_atendimento: '12345',
    valor_consulta: 18000,
    convenios: 'Unimed\nBradesco Saúde\nSulAmérica',
  },
  {
    nome: 'Dr. Carlos Eduardo Souza',
    email: 'carlos.souza@demo.com',
    especialidade: 'Cardiologia',
    registro: 'CRM 23456-SP',
    descricao: 'Check-up cardiológico e acompanhamento de arritmias.',
    sobre: 'Cardiologista com mais de 15 anos de experiência em prevenção cardiovascular.',
    formacao: 'Medicina — UNIFESP\nResidência em Cardiologia — InCor',
    dias_atendimento: '135',
    hora_inicio: '07:00',
    hora_fim: '13:00',
    pausa_inicio: null,
    pausa_fim: null,
    duracao_consulta: 40,
    valor_consulta: 35000,
    convenios: 'Unimed',
  },
  {
    nome: 'Dra. Juliana Martins',
    email: 'juliana.martins@demo.com',
    especialidade: 'Pediatria',
    registro: 'CRM 34567-SP',
    descricao: 'Cuidado com a saúde de bebês, crianças e adolescentes.',
    sobre: 'Pediatra apaixonada por acompanhar o crescimento e desenvolvimento dos pequenos.',
    formacao: 'Medicina — UNICAMP\nResidência em Pediatria — Hospital Infantil Sabará',
    dias_atendimento: '246',
    duracao_consulta: 20,
    valor_consulta: 22000,
    convenios: 'Unimed\nAmil',
  },
  {
    nome: 'Rafael Oliveira',
    email: 'rafael.oliveira@demo.com',
    especialidade: 'Psicologia',
    registro: 'CRP 06/98765',
    descricao: 'Terapia cognitivo-comportamental para adultos.',
    sobre: 'Psicólogo clínico com atuação em ansiedade, depressão e orientação profissional.',
    formacao: 'Psicologia — PUC-SP\nEspecialização em Terapia Cognitivo-Comportamental',
    dias_atendimento: '1234',
    hora_inicio: '09:00',
    hora_fim: '20:00',
    pausa_inicio: '13:00',
    pausa_fim: '14:00',
    duracao_consulta: 50,
    valor_consulta: 20000,
  },
];

async function criarUsuario(knex, dados) {
  const existente = await knex('usuarios').where({ email: dados.email }).first();
  if (existente) return null;

  const linhas = await knex('usuarios').insert(dados).returning('id');
  const linha = linhas[0];
  return typeof linha === 'object' ? linha.id : linha;
}

exports.seed = async function (knex) {
  const senhaHash = await bcrypt.hash('demo123', 10);
  const agora = new Date().toISOString();

  for (const p of PROFISSIONAIS) {
    const usuarioId = await criarUsuario(knex, {
      nome: p.nome,
      email: p.email,
      senha_hash: senhaHash,
      tipo: 'profissional',
      data_cadastro: agora,
    });
    if (!usuarioId) continue;

    const { nome, email, ...perfil } = p; // eslint-disable-line no-unused-vars
    await knex('profissionais').insert({ usuario_id: usuarioId, ...perfil, ativo: true });
  }

  await criarUsuario(knex, {
    nome: 'Rita Recepção',
    email: 'recepcao@demo.com',
    senha_hash: senhaHash,
    tipo: 'recepcao',
    data_cadastro: agora,
  });

  await criarUsuario(knex, {
    nome: 'Maria Paciente',
    email: 'paciente@demo.com',
    telefone: '(11) 98888-7777',
    data_nascimento: '1990-05-20',
    senha_hash: senhaHash,
    tipo: 'paciente',
    data_cadastro: agora,
  });
};
