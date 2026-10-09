/* ==========================================================
   REGRAS DE AGENDA (compartilhadas)
   Usado pelo servidor (Node) e pelo modo demonstração (navegador),
   para que os dois calculem horários e prazos do mesmo jeito.
========================================================== */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.RegrasAgenda = fabrica();
}(typeof self !== 'undefined' ? self : this, () => {
  const STATUS = ['agendada', 'concluida', 'cancelada', 'faltou'];
  const MOTIVOS = ['Primeira consulta', 'Retorno', 'Exame / resultado', 'Outro'];
  const DURACOES = [15, 20, 30, 40, 45, 50, 60, 90];

  const CONFIG_PADRAO = {
    limite_consultas_futuras: 3, // por paciente (0 = sem limite)
    prazo_cancelamento_horas: 24, // antecedência mínima para o paciente cancelar/reagendar
    antecedencia_maxima_dias: 180,
  };

  const pad = (n) => String(n).padStart(2, '0');

  function horaValida(h) {
    return typeof h === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
  }

  function paraMinutos(h) {
    const [a, b] = h.split(':').map(Number);
    return a * 60 + b;
  }

  function paraHora(min) {
    return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  }

  /** Lista de horários de início (HH:MM) conforme o expediente do profissional. */
  function gerarHorarios(p) {
    const dur = Number(p.duracao_consulta) || 30;
    const inicio = paraMinutos(p.hora_inicio || '08:00');
    const fim = paraMinutos(p.hora_fim || '18:00');
    const periodos = [];
    if (p.pausa_inicio && p.pausa_fim) {
      periodos.push([inicio, paraMinutos(p.pausa_inicio)], [paraMinutos(p.pausa_fim), fim]);
    } else {
      periodos.push([inicio, fim]);
    }
    const lista = [];
    periodos.forEach(([de, ate]) => {
      for (let t = de; t + dur <= ate; t += dur) lista.push(paraHora(t));
    });
    return lista;
  }

  /** Devolve uma mensagem de erro, ou null se o expediente estiver correto. */
  function validarExpediente(p) {
    const campos = [['hora_inicio', 'Início do expediente'], ['hora_fim', 'Fim do expediente']];
    for (const [campo, nome] of campos) {
      if (!horaValida(p[campo])) return `${nome}: use o formato HH:MM.`;
    }
    if (paraMinutos(p.hora_inicio) >= paraMinutos(p.hora_fim)) {
      return 'O fim do expediente deve ser depois do início.';
    }
    if (!!p.pausa_inicio !== !!p.pausa_fim) return 'Informe o início e o fim da pausa (ou deixe os dois em branco).';
    if (p.pausa_inicio) {
      if (!horaValida(p.pausa_inicio) || !horaValida(p.pausa_fim)) return 'Pausa: use o formato HH:MM.';
      const pi = paraMinutos(p.pausa_inicio);
      const pf = paraMinutos(p.pausa_fim);
      if (pi >= pf) return 'O fim da pausa deve ser depois do início.';
      if (pi <= paraMinutos(p.hora_inicio) || pf >= paraMinutos(p.hora_fim)) {
        return 'A pausa precisa ficar dentro do expediente.';
      }
    }
    if (!DURACOES.includes(Number(p.duracao_consulta))) return 'Duração da consulta inválida.';
    if (!gerarHorarios(p).length) return 'Com esse expediente não cabe nenhuma consulta.';
    return null;
  }

  /** Dois atendimentos [inicio, inicio + duração) se sobrepõem? */
  function sobrepoe(h1, dur1, h2, dur2) {
    const a = paraMinutos(h1);
    const b = paraMinutos(h2);
    return a < b + Number(dur2) && b < a + Number(dur1);
  }

  /** Minutos entre "agora" e o início da consulta (mesmo fuso). */
  function minutosAte(data, hora, agora) {
    const emMin = (d, h) => {
      const [a, m, dia] = d.split('-').map(Number);
      return Date.UTC(a, m - 1, dia) / 60000 + paraMinutos(h);
    };
    return emMin(data, hora) - emMin(agora.data, agora.hora);
  }

  /** Lista de convênios a partir do texto (um por linha ou separados por vírgula). */
  function listaConvenios(texto) {
    return [...new Set(String(texto || '').split(/[\n,;]/).map((c) => c.trim()).filter(Boolean))];
  }

  /** Data dentro de algum bloqueio? */
  function bloqueioDoDia(bloqueios, data) {
    return bloqueios.find((b) => b.data_inicio <= data && data <= b.data_fim) || null;
  }

  return {
    STATUS,
    MOTIVOS,
    DURACOES,
    CONFIG_PADRAO,
    horaValida,
    paraMinutos,
    paraHora,
    gerarHorarios,
    validarExpediente,
    sobrepoe,
    minutosAte,
    listaConvenios,
    bloqueioDoDia,
  };
}));
