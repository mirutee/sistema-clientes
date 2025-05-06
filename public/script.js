document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const usuarioInput = document.getElementById('usuario');
  const senhaInput = document.getElementById('senha');
  const loginContainer = document.getElementById('login-container');
  const appContainer = document.getElementById('app-container');
  const listaClientes = document.getElementById('lista-clientes');
  const filtroCidade = document.getElementById('filtro-cidade');
  const logoutButton = document.getElementById('btn-logout');
  const modal = document.getElementById('modal-atendimento');
  const formAtendimento = document.getElementById('form-atendimento');
  const modalClienteNome = document.getElementById('modal-cliente-nome');
  const inputFeito = document.getElementById('atendimento-realizado');
  const inputPendente = document.getElementById('atendimento-pendente');
  const inputId = document.getElementById('cliente-id');
  const btnFecharModal = document.getElementById('btn-fechar-modal');
  const btnFecharModalRodape = document.getElementById('btn-fechar-modal-rodape');
  const inputData = document.getElementById('data-atendimento');
  const btnGeo = document.getElementById('btn-geolocalizacao');
  const btnAtualizarGeo = document.getElementById('btn-atualizar-geolocalizacao');
  const listaHistorico = document.getElementById('historico-atendimento');
  const btnConfig = document.getElementById('btn-config');
  const modalConfig = document.getElementById('modal-config');
  const inputDias = document.getElementById('dias-quadrado');
  const btnSalvarConfig = document.getElementById('btn-salvar-config');
  const btnFecharConfig = document.getElementById('btn-fechar-config');
  const listaDebitos = document.getElementById('lista-debitos');
  const listaHistoricoDebitos = document.getElementById('historico-debitos');

  let todosClientes = [];
  let funcionarioLogado = null;
  let clienteAtual = null;
  let diasPorQuadrado = 10; // Valor inicial, será sobrescrito pelo backend

  // Verificar se os elementos do login existem
  if (!loginForm || !usuarioInput || !senhaInput || !loginContainer || !appContainer) {
    console.error('[❌] Elementos do login não encontrados. Verifique o index.html.');
    alert('Erro na inicialização da página. Contate o suporte.');
    return;
  }

  // Atualiza a configuração de diasPorQuadrado a cada 20 segundos
  setInterval(async () => {
    try {
      const res = await fetch('/config/dias-quadrado');
      const data = await res.json();
      if (data.success && data.valor && data.valor !== diasPorQuadrado) {
        diasPorQuadrado = data.valor;
        console.log('[🔄] diasPorQuadrado atualizado para:', diasPorQuadrado);
        aplicarFiltros(); // Re-renderiza os quadradinhos com o novo valor
      }
    } catch (e) {
      console.warn('[⚠️] Falha ao atualizar diasPorQuadrado dinamicamente');
    }
  }, 20000); // 20 segundos

  // Polling para atualizar a lista de clientes a cada 10 segundos
  setInterval(async () => {
    if (appContainer.style.display === 'block') {
      console.log('[🔄] Verificando atualizações na lista de clientes...');
      await carregarClientes();
    }
  }, 10000); // 10 segundos

  // Esconder botão de configuração por padrão
  btnConfig.style.display = 'none';

  // Função para carregar a configuração de dias_por_quadrado do backend
  async function carregarConfiguracao() {
    try {
      const res = await fetch('/config/dias-quadrado');
      const data = await res.json();
      if (data.success) {
        diasPorQuadrado = data.valor;
        console.log('Configuração carregada: diasPorQuadrado =', diasPorQuadrado);
      } else {
        console.error('Erro ao carregar configuração:', data.message);
      }
    } catch (err) {
      console.error('Erro ao buscar configuração:', err);
    }
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('[🔍] Iniciando processo de login...');
    console.log('[ℹ️] Usuário digitado:', usuarioInput.value);

    try {
      console.log('[📤] Enviando requisição POST para /login');
      const response = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario: usuarioInput.value,
          senha: senhaInput.value
        })
      });

      console.log('[📥] Resposta recebida do servidor. Status:', response.status);
      const data = await response.json();
      console.log('[ℹ️] Dados da resposta:', data);

      if (!response.ok || !data.success) {
        console.warn('[⚠️] Falha no login:', data.message || 'Usuário ou senha inválidos');
        alert(data.message || 'Usuário ou senha inválidos');
        return;
      }

      funcionarioLogado = data.funcionario;
      console.log('[✅] Login bem-sucedido. Usuário:', funcionarioLogado.FUN_NOME, 'Nível:', funcionarioLogado.FUN_NIVEL);
      
      // Mostrar botão de configuração apenas para administradores
      if (funcionarioLogado.FUN_NIVEL === 1) {
        btnConfig.style.display = 'inline-block';
      } else {
        btnConfig.style.display = 'none';
      }

      loginContainer.style.display = 'none';
      appContainer.style.display = 'block';
      await carregarConfiguracao();
      carregarClientes();
    } catch (error) {
      console.error('[❌] Erro no login:', error);
      alert('Erro ao tentar realizar o login. Verifique sua conexão ou contate o suporte.');
    }
  });

  async function carregarClientes() {
    try {
      const res = await fetch(`/clientes?t=${new Date().getTime()}`);
      const clientes = await res.json();
      todosClientes = clientes;
      console.log('Clientes carregados:', clientes.length, 'clientes');
      preencherFiltroCidades(clientes);
      aplicarFiltros();
    } catch (err) {
      console.error('Erro ao carregar clientes:', err);
      alert('Erro ao carregar clientes.');
    }
  }

  function preencherFiltroCidades(clientes) {
    const cidades = [...new Set(clientes.map(c => c.cidade))].sort();
    filtroCidade.innerHTML = '<option value="">Todas</option>';
    cidades.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      filtroCidade.appendChild(opt);
    });
  }

  document.getElementById('filtro-cidade').addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-cliente').addEventListener('input', aplicarFiltros);
  document.getElementById('filtro-data-inicio').addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-data-fim').addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-pendencia').addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-debitos').addEventListener('change', aplicarFiltros);

  function aplicarFiltros() {
    const cidadeSelecionada = filtroCidade.value;
    const nomeCliente = document.getElementById('filtro-cliente').value.toLowerCase();
    const dataInicio = document.getElementById('filtro-data-inicio').value;
    const dataFim = document.getElementById('filtro-data-fim').value;
    const somentePendentes = document.getElementById('filtro-pendencia').checked;
    const somenteComDebitos = document.getElementById('filtro-debitos').checked;

    let filtrados = todosClientes;

    if (cidadeSelecionada) {
      filtrados = filtrados.filter(c => c.cidade === cidadeSelecionada);
    }

    if (nomeCliente) {
      filtrados = filtrados.filter(c => c.nome.toLowerCase().includes(nomeCliente));
    }

    if (dataInicio) {
      const dataI = new Date(dataInicio);
      filtrados = filtrados.filter(c => c.ultimo_atendimento && new Date(c.ultimo_atendimento) >= dataI);
    }

    if (dataFim) {
      const dataF = new Date(dataFim);
      filtrados = filtrados.filter(c => c.ultimo_atendimento && new Date(c.ultimo_atendimento) <= dataF);
    }

    if (somentePendentes) {
      filtrados = filtrados.filter(c => c.pendente && c.pendente.trim() !== '');
    }

    if (somenteComDebitos) {
      filtrados = filtrados.filter(c => c.tem_debitos);
    }

    console.log('Aplicando filtros: clientes filtrados =', filtrados.length);
    renderizarClientes(filtrados);
  }

  function renderizarClientes(clientes) {
    listaClientes.innerHTML = '';
    clientes.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.nome}</td>
        <td>${c.cidade}</td>
        <td>${c.ultimo_atendimento ? new Date(c.ultimo_atendimento).toLocaleDateString() : '—'}</td>
        <td>
          <div class="status-bar">${gerarQuadrados(c)}</div>
          ${c.pendente ? '<span class="asterisco-pendente">*</span>' : ''}
          ${c.tem_debitos ? '<span class="debito-icon" title="Cliente com débitos pendentes"><i class="fas fa-money-bill-wave"></i></span>' : ''}
        </td>
      `;
      tr.addEventListener('click', () => abrirModal(c));
      listaClientes.appendChild(tr);
    });
    console.log('Tabela renderizada com', clientes.length, 'clientes, diasPorQuadrado =', diasPorQuadrado);
  }

  function gerarQuadrados(cliente) {
    const hoje = new Date();
    const data = cliente.ultimo_atendimento ? new Date(cliente.ultimo_atendimento) : hoje;
    const dias = Math.floor((hoje - data) / (1000 * 60 * 60 * 24));
    const nivelCor = Math.min(9, Math.floor(dias / diasPorQuadrado));
    const quadradosAtivos = Math.max(0, 9 - nivelCor);
    let html = '';
    for (let i = 0; i < 9; i++) {
      const classe = i < quadradosAtivos ? `v${nivelCor + 1}` : 'vazio';
      const tooltip = i < quadradosAtivos ? `${dias} dias desde último atendimento` : 'Sem atendimento recente';
      html += `<div class="status-quadrado ${classe}" data-tooltip="${tooltip}"></div>`;
    }
    console.log(`gerarQuadrados para ${cliente.nome}: dias = ${dias}, nivelCor = ${nivelCor}, quadradosAtivos = ${quadradosAtivos}, diasPorQuadrado = ${diasPorQuadrado}, ultimo_atendimento = ${cliente.ultimo_atendimento}`);
    return html;
  }

  function abrirModal(cliente) {
    clienteAtual = cliente;
    modalClienteNome.textContent = cliente.nome;
    inputId.value = cliente.id;
    inputFeito.value = '';
    inputPendente.value = '';
    inputData.value = cliente.ultimo_atendimento ? new Date(cliente.ultimo_atendimento).toLocaleDateString() : '—';
    modal.style.display = 'flex';
    carregarHistorico(cliente.id);
    carregarDebitos(cliente.id);
    carregarHistoricoDebitos(cliente.id);

    btnGeo.textContent = ' Localização';
    btnGeo.classList.toggle('verde', !!cliente.geolocalizacao);
    btnGeo.title = cliente.geolocalizacao ? `Destino: ${cliente.geolocalizacao}` : 'Localização do cliente não cadastrada';
  }

  async function carregarDebitos(clienteId) {
    listaDebitos.innerHTML = '<li>Carregando débitos...</li>';
    
    try {
      const res = await fetch(`/debitos/${clienteId}`);
      const debitos = await res.json();
      
      if (debitos.length === 0) {
        listaDebitos.innerHTML = '<li>Nenhum débito pendente encontrado</li>';
        return;
      }
      
      let html = '';
      debitos.forEach(d => {
        console.log('Data bruta (débitos):', d.vencimento);
        // Formatar YYYY-MM-DD para DD/MM/YYYY
        const [ano, mes, dia] = d.vencimento.split('-');
        const dataFormatada = `${dia}/${mes}/${ano}`;
        console.log('Data convertida (débitos):', dataFormatada);
        const vencimento = new Date(d.vencimento);
        const hoje = new Date();
        const diasAtraso = Math.floor((hoje - vencimento) / (1000 * 60 * 60 * 24));
        const classe = diasAtraso > 30 ? 'debito-vencido' : 'debito-normal';
        
        html += `<li class="${classe}">Débito Pendente - Vencimento: ${dataFormatada}</li>`;
      });
      
      listaDebitos.innerHTML = html;
    } catch (err) {
      console.error('Erro ao carregar débitos:', err);
      listaDebitos.innerHTML = '<li>Erro ao carregar débitos</li>';
    }
  }

  async function carregarHistoricoDebitos(clienteId) {
  listaHistoricoDebitos.innerHTML = '<li>Carregando histórico de débitos...</li>';
  
  try {
    const res = await fetch(`/historico-debitos/${clienteId}`);
    const historico = await res.json();
    
    if (historico.length === 0) {
      listaHistoricoDebitos.innerHTML = '<li>Nenhum débito vencido ou pago recentemente encontrado</li>';
      return;
    }
    
    let html = '';
    historico.forEach(d => {
      // Formata a data de YYYY-MM-DD para DD/MM/YYYY
      const [ano, mes, dia] = d.vencimento.split('-');
      const dataFormatada = `${dia}/${mes}/${ano}`;
      
      // Aplica classe CSS baseada no status
      const classe = d.status === 'Vencido' ? 'debito-vencido' : 'debito-pago';
      
      // Adiciona ícone de alerta para débitos vencidos
      const icone = d.status === 'Vencido' ? '<i class="fas fa-exclamation-circle"></i> ' : '';
      
      html += `<li class="${classe}">${icone}${dataFormatada} - ${d.status}</li>`;
    });
    
    listaHistoricoDebitos.innerHTML = html;
  } catch (err) {
    console.error('Erro ao carregar histórico de débitos:', err);
    listaHistoricoDebitos.innerHTML = '<li>Erro ao carregar histórico de débitos</li>';
  }
}

  async function carregarHistorico(clienteId) {
    listaHistorico.innerHTML = '<li>Carregando histórico...</li>';
    try {
      const res = await fetch(`/historico/${clienteId}`);
      const historico = await res.json();
      listaHistorico.innerHTML = historico.length === 0
        ? '<li>Nenhum atendimento registrado</li>'
        : historico.map(h => `<li><strong>${new Date(h.DATA_ATENDIMENTO).toLocaleDateString()}</strong> - <em>${h.FUN_NOME}</em><br><strong>Feito:</strong> ${h.FEITO}<br><strong>Pendente:</strong> ${h.PENDENTE || '—'}</li>`).join('');
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
      listaHistorico.innerHTML = '<li>Erro ao carregar histórico</li>';
    }
  }

  formAtendimento.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      id: inputId.value,
      feito: inputFeito.value,
      pendente: inputPendente.value,
      funcionario: funcionarioLogado.FUN_NOME
    };

    try {
      const res = await fetch('/atendimento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        console.log('Atendimento salvo para cliente ID:', inputId.value, 'Feito:', payload.feito, 'Pendente:', payload.pendente);
        alert('✅ Atendimento salvo com sucesso!');
        inputFeito.value = '';
        inputPendente.value = '';
        modal.style.display = 'none'; // Fechar o modal após salvar
        await carregarClientes(); // Atualizar a lista de clientes
        carregarHistorico(inputId.value);
      } else {
        console.error('Falha ao salvar atendimento:', data.message);
        alert('❌ Falha ao salvar atendimento.');
      }
    } catch (err) {
      console.error('Erro ao salvar atendimento:', err);
      alert('❌ Erro ao tentar salvar.');
    }
  });

  btnGeo.addEventListener('click', () => {
    if (!clienteAtual.geolocalizacao) {
      alert('Cliente sem localização cadastrada.');
      return;
    }
    if (!navigator.geolocation) {
      alert('Navegador não suporta geolocalização.');
      return;
    }
    navigator.geolocation.getCurrentPosition(pos => {
      const origem = `${pos.coords.latitude},${pos.coords.longitude}`;
      const destino = clienteAtual.geolocalizacao;
      const rota = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origem)}&destination=${encodeURIComponent(destino)}`;
      window.open(rota, '_blank');
    }, () => {
      alert('Não foi possível obter sua localização atual.');
    });
  });

  btnAtualizarGeo.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('Geolocalização não suportada neste dispositivo.');
      return;
    }

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude.toFixed(14);
      const lon = pos.coords.longitude.toFixed(14);
      const coords = `${lat},${lon}`;
      const res = await fetch('/geolocalizacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: clienteAtual.id, coordenada: coords })
      });
      const data = await res.json();
      if (data.success) {
        alert('📍 Localização atualizada com sucesso!');
        clienteAtual.geolocalizacao = coords;
        btnGeo.classList.add('verde');
        btnGeo.title = `Destino: ${coords}`;
      } else {
        alert('❌ Falha ao atualizar localização.');
      }
    }, () => {
      alert('Não foi possível obter sua localização.');
    });
  });

  btnFecharModal.addEventListener('click', () => modal.style.display = 'none');
  btnFecharModalRodape.addEventListener('click', () => modal.style.display = 'none');

  logoutButton.addEventListener('click', () => {
    loginContainer.style.display = 'flex';
    appContainer.style.display = 'none';
    btnConfig.style.display = 'none'; // Esconder botão ao fazer logout
    loginForm.reset();
  });

  btnConfig.addEventListener('click', () => {
    inputDias.value = diasPorQuadrado;
    modalConfig.style.display = 'flex';
  });

  btnSalvarConfig.addEventListener('click', async () => {
    btnSalvarConfig.disabled = true;
    btnSalvarConfig.textContent = 'Salvando...';
    const novo = parseInt(inputDias.value);
    if (!isNaN(novo) && novo > 0) {
      try {
        const res = await fetch('/config/dias-quadrado', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valor: novo, funcionarioId: funcionarioLogado.FUN_CODIGO })
        });
        const data = await res.json();
        if (data.success) {
          console.log('Configuração salva: diasPorQuadrado =', novo);
          diasPorQuadrado = novo; // Atualiza a variável local
          aplicarFiltros(); // Re-renderiza a tabela com filtros atuais
          modalConfig.style.display = 'none';
          alert('✅ Configuração salva com sucesso!');
        } else {
          console.error('Erro na resposta do backend:', data);
          alert('❌ Falha ao salvar configuração: ' + (data.message || 'Erro desconhecido'));
        }
      } catch (err) {
        console.error('Erro ao salvar configuração:', err);
        alert('❌ Erro ao salvar configuração. Verifique a conexão com o servidor.');
      }
    } else {
      alert('Informe um número válido maior que 0.');
    }
    btnSalvarConfig.disabled = false;
    btnSalvarConfig.textContent = 'Salvar';
  });

  btnFecharConfig.addEventListener('click', () => {
    modalConfig.style.display = 'none';
  });
});
