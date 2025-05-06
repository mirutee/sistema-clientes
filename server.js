require('dotenv').config();
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.json());

// Configurações do servidor
app.use(express.static('public'));

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// Utilitários
function calcularMD5(texto) {
  return crypto.createHash('md5').update(texto).digest('hex');
}

// Middleware para gerenciamento de conexões
app.use(async (req, res, next) => {
  try {
    req.db = await sql.connect(dbConfig);
    next();
  } catch (err) {
    console.error('Erro na conexão com o banco:', err);
    res.status(500).json({ success: false, message: 'Erro de conexão com o banco de dados' });
  }
});

app.use((req, res, next) => {
  res.on('finish', () => {
    if (req.db) req.db.close().catch(err => console.error('Erro ao fechar conexão:', err));
  });
  next();
});

// Middleware para verificar administrador
async function verificarAdministrador(req, res, next) {
  const { funcionarioId } = req.body;
  if (!funcionarioId) {
    return res.status(401).json({ success: false, message: 'ID do funcionário não fornecido' });
  }
  try {
    const result = await req.db.request()
      .input('id', sql.Int, funcionarioId)
      .query('SELECT FUN_NIVEL FROM FUNCIONARIOS WHERE FUN_CODIGO = @id');
    if (result.recordset.length === 0 || result.recordset[0].FUN_NIVEL !== 1) {
      return res.status(403).json({ success: false, message: 'Acesso negado: apenas administradores' });
    }
    next();
  } catch (err) {
    console.error('Erro ao verificar administrador:', err);
    res.status(500).json({ success: false, message: 'Erro ao verificar permissões' });
  }
}

// Rotas de autenticação
app.post('/login', async (req, res) => {
  const { usuario, senha } = req.body;
  
  if (!usuario || !senha) {
    return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios' });
  }

  try {
    const senhaMD5 = calcularMD5(senha);
    const result = await req.db.request()
      .input('login', sql.VarChar, usuario)
      .input('senha', sql.VarChar, senhaMD5)
      .query(`SELECT FUN_CODIGO, FUN_NOME, FUN_NIVEL FROM FUNCIONARIOS WHERE FUN_LOGIN = @login AND FUN_SENHA = @senha`);

    if (result.recordset.length > 0) {
      res.json({ success: true, funcionario: result.recordset[0] });
    } else {
      res.status(401).json({ success: false, message: 'Usuário ou senha inválidos' });
    }
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
});

// Rotas de clientes
app.get('/clientes', async (req, res) => {
  try {
    const result = await req.db.request().query(`
      SELECT 
        CLI_CODIGO AS id,
        CLI_NOME AS nome,
        CLI_CIDADE AS cidade,
        CLI_DATA_ATENDIMENTO AS ultimo_atendimento,
        CLI_PENDENTE AS pendente,
        CLI_FEITO AS feito,
        CLI_GEOLOCALIZACAO AS geolocalizacao,
        CASE 
          WHEN EXISTS (
            SELECT 1 
            FROM CONTAS_RECEBER cr 
            INNER JOIN CONTAS_RECEBER_DADOS crd ON cr.con_vendas = crd.crd_codigo 
            WHERE cr.con_cliente = CLIENTES.CLI_CODIGO 
              AND crd.crd_valor_pago = 0
          ) THEN 1 
          ELSE 0 
        END AS tem_debitos
      FROM CLIENTES
      ORDER BY CLI_NOME
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Erro ao carregar clientes:', err);
    res.status(500).json({ success: false, message: 'Erro ao carregar clientes' });
  }
});

app.post('/atendimento', async (req, res) => {
  const { id, feito, pendente, funcionario } = req.body;
  
  if (!id || !feito || !funcionario) {
    return res.status(400).json({ success: false, message: 'Dados obrigatórios não preenchidos' });
  }

  try {
    await req.db.request()
      .input('id', sql.Int, id)
      .input('feito', sql.Text, feito)
      .input('pendente', sql.Text, pendente || '')
      .input('data', sql.DateTime, new Date())
      .query(`
        UPDATE CLIENTES SET 
          CLI_FEITO = @feito,
          CLI_PENDENTE = @pendente,
          CLI_DATA_ATENDIMENTO = @data
        WHERE CLI_CODIGO = @id
      `);

    await req.db.request()
      .input('cliente', sql.Int, id)
      .input('funcionario', sql.NVarChar, funcionario)
      .input('feito', sql.Text, feito)
      .input('pendente', sql.Text, pendente || '')
      .query(`
        INSERT INTO HISTORICO_ATENDIMENTO (CLI_CODIGO, FUN_NOME, FEITO, PENDENTE, DATA_ATENDIMENTO)
        VALUES (@cliente, @funcionario, @feito, @pendente, GETDATE())
      `);

    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao salvar atendimento:', err);
    res.status(500).json({ success: false, message: 'Erro ao salvar atendimento' });
  }
});

// Rotas de histórico
app.get('/historico/:clienteId', async (req, res) => {
  try {
    const clienteId = parseInt(req.params.clienteId);
    const result = await req.db.request()
      .input('id', sql.Int, clienteId)
      .query(`
        SELECT FEITO, PENDENTE, FUN_NOME, DATA_ATENDIMENTO
        FROM HISTORICO_ATENDIMENTO
        WHERE CLI_CODIGO = @id
        ORDER BY DATA_ATENDIMENTO DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Erro ao buscar histórico:', err);
    res.status(500).json({ success: false, message: 'Erro ao buscar histórico' });
  }
});

// Rotas de débitos financeiros
app.get('/debitos/:clienteId', async (req, res) => {
  try {
    const clienteId = parseInt(req.params.clienteId);
    if (isNaN(clienteId)) {
      return res.status(400).json({ success: false, message: 'ID do cliente inválido' });
    }
    const result = await req.db.request()
      .input('clienteId', sql.Int, clienteId)
      .query(`
        SELECT 
          con_valor AS valor,
          CONVERT(VARCHAR, crd_vencimento, 23) AS vencimento,
          crd_valor_pago AS valor_pago
        FROM CONTAS_RECEBER 
        INNER JOIN CONTAS_RECEBER_DADOS ON con_vendas = crd_codigo 
        WHERE con_cliente = @clienteId 
          AND crd_valor_pago = 0
      `);
    console.log(`Débitos pendentes para cliente ${clienteId}:`, result.recordset);
    res.json(result.recordset);
  } catch (err) {
    console.error(`Erro ao buscar débitos para cliente ${req.params.clienteId}:`, err);
    res.status(500).json({ success: false, message: 'Erro ao buscar débitos', error: err.message });
  }
});

app.get('/historico-debitos/:clienteId', async (req, res) => {
  try {
    const clienteId = parseInt(req.params.clienteId);
    if (isNaN(clienteId)) {
      return res.status(400).json({ success: false, message: 'ID do cliente inválido' });
    }
    const result = await req.db.request()
      .input('clienteId', sql.Int, clienteId)
      .query(`
        SELECT 
          con_valor AS valor,
          CONVERT(VARCHAR, crd_vencimento, 23) AS vencimento,
          crd_valor_pago AS valor_pago,
          CASE 
            WHEN crd_valor_pago >= con_valor THEN 'Pago'
            WHEN crd_vencimento < GETDATE() THEN 'Vencido'
            ELSE 'Pendente'
          END AS status
        FROM CONTAS_RECEBER 
        INNER JOIN CONTAS_RECEBER_DADOS ON con_vendas = crd_codigo 
        WHERE con_cliente = @clienteId AND crd_vencimento >= DATEADD(MONTH, -12, GETDATE())
        ORDER BY crd_vencimento DESC
      `);
    console.log(`Histórico de débitos para cliente ${clienteId}:`, result.recordset);
    res.json(result.recordset);
  } catch (err) {
    console.error(`Erro ao buscar histórico de débitos para cliente ${req.params.clienteId}:`, err);
    res.status(500).json({ success: false, message: 'Erro ao buscar histórico de débitos', error: err.message });
  }
});

// Rotas de geolocalização
app.post('/geolocalizacao', async (req, res) => {
  const { id, coordenada } = req.body;
  
  if (!id || !coordenada) {
    return res.status(400).json({ success: false, message: 'ID e coordenada são obrigatórios' });
  }

  try {
    await req.db.request()
      .input('id', sql.Int, id)
      .input('coordenada', sql.VarChar, coordenada)
      .query(`
        UPDATE CLIENTES SET CLI_GEOLOCALIZACAO = @coordenada WHERE CLI_CODIGO = @id
      `);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao salvar geolocalização:', err);
    res.status(500).json({ success: false, message: 'Erro ao salvar geolocalização' });
  }
});

// Rotas de configuração
app.get('/config/dias-quadrado', async (req, res) => {
  try {
    const result = await req.db.request()
      .query(`SELECT VALOR FROM CONFIGURACOES WHERE CHAVE = 'dias_por_quadrado'`);
    
    if (result.recordset.length > 0) {
      res.json({ success: true, valor: parseInt(result.recordset[0].VALOR) || 10 });
    } else {
      // Cria com valor padrão se não existir
      await req.db.request()
        .query(`INSERT INTO CONFIGURACOES (CHAVE, VALOR) VALUES ('dias_por_quadrado', '10')`);
      res.json({ success: true, valor: 10 });
    }
  } catch (err) {
    console.error('Erro ao buscar configuração:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao buscar configuração',
      error: err.message 
    });
  }
});

app.post('/config/dias-quadrado', verificarAdministrador, async (req, res) => {
  const { valor, funcionarioId } = req.body;
  
  if (!valor || isNaN(valor) || valor <= 0) {
    return res.status(400).json({ success: false, message: 'Valor deve ser um número positivo' });
  }

  try {
    const result = await req.db.request()
      .input('valor', sql.Int, valor)
      .query(`
        IF EXISTS (SELECT 1 FROM CONFIGURACOES WHERE CHAVE = 'dias_por_quadrado')
          UPDATE CONFIGURACOES SET VALOR = @valor WHERE CHAVE = 'dias_por_quadrado'
        ELSE
          INSERT INTO CONFIGURACOES (CHAVE, VALOR) VALUES ('dias_por_quadrado', @valor)
      `);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao atualizar configuração:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao atualizar configuração',
      error: err.message 
    });
  }
});

// Inicialização do servidor
async function iniciarServidor() {
  try {
    // Testar conexão com o banco
    const pool = await sql.connect(dbConfig);
    const result = await pool.request().query('SELECT TOP 1 FUN_LOGIN FROM FUNCIONARIOS');
    console.log('✅ Conexão com banco OK. Exemplo de usuário:', result.recordset[0]?.FUN_LOGIN);
    await pool.close();

    // Configurar HTTPS
    const PORT = process.env.PORT || 3000;
    const interfaces = os.networkInterfaces();
    let ipLocal = '127.0.0.1';

    for (const name in interfaces) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ipLocal = iface.address;
          break;
        }
      }
    }

    const options = {
      key: fs.readFileSync('192.168.1.76-key.pem'),
      cert: fs.readFileSync('192.168.1.76.pem')
    };

    https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
      console.log('🔒 Servidor HTTPS rodando em:');
      console.log(`→ https://localhost:${PORT}`);
      console.log(`→ https://${ipLocal}:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Falha ao iniciar servidor:', err);
    process.exit(1);
  }
}

iniciarServidor();
