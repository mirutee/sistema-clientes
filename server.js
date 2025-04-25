require('dotenv').config();
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const crypto = require('crypto');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

function calcularMD5(texto) {
  return crypto.createHash('md5').update(texto).digest('hex');
}

async function testarConexao() {
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request().query('SELECT TOP 1 FUN_LOGIN FROM FUNCIONARIOS');
    console.log('✅ Conexão com banco OK. Exemplo de usuário:', result.recordset[0]?.FUN_LOGIN);
    return true;
  } catch (err) {
    console.error('❌ Erro ao conectar ao banco:', err.message);
    return false;
  }
}

app.post('/login', async (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios' });
  }

  try {
    const pool = await sql.connect(dbConfig);
    const senhaMD5 = calcularMD5(senha);

    const result = await pool.request()
      .input('login', sql.VarChar, usuario)
      .input('senha', sql.VarChar, senhaMD5)
      .query(`
        SELECT FUN_CODIGO, FUN_NOME 
        FROM FUNCIONARIOS 
        WHERE FUN_LOGIN = @login AND FUN_SENHA = @senha
      `);

    if (result.recordset.length > 0) {
      res.json({ 
        success: true,
        funcionario: result.recordset[0] 
      });
    } else {
      res.status(401).json({ 
        success: false,
        message: 'Usuário ou senha inválidos'
      });
    }
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno no servidor'
    });
  }
});

app.get('/clientes', async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request().query(`
      SELECT 
        CLI_CODIGO AS id,
        CLI_NOME AS nome,
        CLI_CIDADE AS cidade,
        CLI_DATA_ATENDIMENTO AS ultimo_atendimento,
        CLI_PENDENTE AS pendente,
        CLI_FEITO AS feito,
        CLI_GEOLOCALIZACAO AS geolocalizacao
      FROM CLIENTES
      ORDER BY CLI_NOME
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Erro ao buscar clientes:', err);
    res.status(500).json({ error: 'Erro ao carregar clientes' });
  }
});

app.post('/atendimento', async (req, res) => {
  const { id, feito, pendente, funcionario } = req.body;

  if (!id || !feito || !funcionario) {
    return res.status(400).json({ success: false, message: 'Dados obrigatórios não preenchidos' });
  }

  try {
    const pool = await sql.connect(dbConfig);

    await pool.request()
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

    await pool.request()
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
    res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

app.get('/historico/:clienteId', async (req, res) => {
  try {
    const clienteId = parseInt(req.params.clienteId);
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input('id', sql.Int, clienteId)
      .query(`
        SELECT FEITO, PENDENTE, FUN_NOME, DATA_ATENDIMENTO
        FROM HISTORICO_ATENDIMENTO
        WHERE CLI_CODIGO = @id
        ORDER BY DATA_ATENDIMENTO DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Erro ao buscar historico:', err);
    res.status(500).json({ success: false, message: 'Erro ao buscar historico' });
  }
});

app.post('/geolocalizacao', async (req, res) => {
  const { id, coordenada } = req.body;

  if (!id || !coordenada) {
    return res.status(400).json({ success: false, message: 'ID e coordenada são obrigatórios' });
  }

  try {
    const pool = await sql.connect(dbConfig);
    await pool.request()
      .input('id', sql.Int, id)
      .input('coordenada', sql.VarChar, coordenada)
      .query(`
        UPDATE CLIENTES SET CLI_GEOLOCALIZACAO = @coordenada WHERE CLI_CODIGO = @id
      `);

    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao atualizar geolocalização:', err);
    res.status(500).json({ success: false, message: 'Erro ao salvar geolocalização' });
  }
});

// Iniciar servidor
// Iniciar servidor com acesso externo
testarConexao().then(success => {
  if (success) {
    const PORT = process.env.PORT || 3000;
    const os = require('os');
    const interfaces = os.networkInterfaces();
    let ipLocal = 'localhost';

    for (const name in interfaces) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ipLocal = iface.address;
          break;
        }
      }
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Servidor rodando em:`);
      console.log(`→ http://localhost:${PORT} (uso no computador local)`);
      console.log(`→ http://${ipLocal}:${PORT} (uso em outros dispositivos na mesma rede)`);
    });
  } else {
    console.error('❌ Não foi possível iniciar o servidor devido a erros na conexão com o banco');
  }
});

