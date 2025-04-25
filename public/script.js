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
  const inputData = document.getElementById('data-atendimento');
  const btnGeo = document.getElementById('btn-geolocalizacao');
  const btnAtualizarGeo = document.getElementById('btn-atualizar-geolocalizacao');
  const listaHistorico = document.getElementById('historico-atendimento');

  let todosClientes = [];
  let funcionarioLogado = null;
  let clienteAtual = null;

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      const response = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario: usuarioInput.value,
          senha: senhaInput.value
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.message || 'Usuário ou senha inválidos');
        return;
      }

      funcionarioLogado = data.funcionario;
      loginContainer.style.display = 'none';
      appContainer.style.display = 'block';
      carregarClientes();
    } catch (error) {
      console.error('Erro no login:', error);
      alert('Erro ao tentar realizar o login.');
    }
  });

  async function carregarClientes() {
    const res = await fetch('/clientes');
    const clientes = await res.json();
    todosClientes = clientes;
    preencherFiltroCidades(clientes);
    renderizarClientes(clientes);
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
  document.getElementById('filtro-data-inicio').addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-data-fim').addEventListener('change', aplicarFiltros);
  document.getElementById('filtro-pendencia').addEventListener('change', aplicarFiltros);

  function aplicarFiltros() {
    const cidadeSelecionada = filtroCidade.value;
    const dataInicio = document.getElementById('filtro-data-inicio').value;
    const dataFim = document.getElementById('filtro-data-fim').value;
    const somentePendentes = document.getElementById('filtro-pendencia').checked;

    let filtrados = todosClientes;

    if (cidadeSelecionada) {
      filtrados = filtrados.filter(c => c.cidade === cidadeSelecionada);
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
        </td>
      `;
      tr.addEventListener('click', () => abrirModal(c));
      listaClientes.appendChild(tr);
    });
  }

  function gerarQuadrados(cliente) {
    const hoje = new Date();
    const data = new Date(cliente.ultimo_atendimento || hoje);
    const dias = Math.floor((hoje - data) / (1000 * 60 * 60 * 24));
    const nivelCor = Math.min(9, Math.floor(dias / 10));
    const quadradosAtivos = Math.max(0, 9 - nivelCor);
    let html = '';
    for (let i = 0; i < 9; i++) {
      html += `<div class="status-quadrado ${i < quadradosAtivos ? `v${nivelCor + 1}` : 'vazio'}"></div>`;
    }
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

    btnGeo.textContent = '📍 Localização';
    btnGeo.classList.toggle('verde', !!cliente.geolocalizacao);
    btnGeo.title = cliente.geolocalizacao ? `Destino: ${cliente.geolocalizacao}` : 'Localização do cliente não cadastrada';
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
        alert('✅ Atendimento salvo com sucesso!');
        inputFeito.value = '';
        inputPendente.value = '';
        carregarClientes();
        carregarHistorico(inputId.value);
      } else {
        alert('❌ Falha ao salvar atendimento.');
      }
    } catch (err) {
      console.error('Erro ao salvar:', err);
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

  logoutButton.addEventListener('click', () => {
    loginContainer.style.display = 'flex';
    appContainer.style.display = 'none';
    loginForm.reset();
  });
});
