import express from 'express';
import Firebird from 'node-firebird';
import dbConfig from './dbconfig.js';
import cors from 'cors';

const app = express();
app.use(cors());

// =========================
// Bloqueio punitivo por IP
// =========================
app.set('trust proxy', true); // importante se usar Nginx, Cloudflare ou outro proxy reverso

const ABUSE_MAX_STRIKES = Number(process.env.ABUSE_MAX_STRIKES || 3);
const ABUSE_STRIKE_WINDOW_MS = Number(process.env.ABUSE_STRIKE_WINDOW_MS || 30 * 60 * 1000); // 30 minutos
const ABUSE_PUNISH_DB_TIMEOUT = String(process.env.ABUSE_PUNISH_DB_TIMEOUT || 'true').toLowerCase() === 'true';

const ABUSE_BLOCK_STEPS_MS = [
  30 * 60 * 1000,      // 30 minutos
  60 * 60 * 1000,      // 1 hora
  2 * 60 * 60 * 1000,  // 2 horas
  4 * 60 * 60 * 1000,  // 4 horas
  8 * 60 * 60 * 1000,  // 8 horas
  24 * 60 * 60 * 1000  // máximo 24 horas
];

const abuseMap = new Map();

function getClientIp(req) {
  return (
    req.ip ||
    String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function getAbuseRecord(ip) {
  const now = Date.now();

  let record = abuseMap.get(ip);

  if (!record) {
    record = {
      strikes: 0,
      blockLevel: 0,
      blockedUntil: 0,
      lastStrikeAt: 0,
      totalBlocks: 0
    };

    abuseMap.set(ip, record);
  }

  // Se passou a janela sem novas chamadas indevidas e não está bloqueado, zera apenas os strikes.
  // O blockLevel é mantido para punir reincidência com tempos maiores.
  if (
    record.lastStrikeAt &&
    now - record.lastStrikeAt > ABUSE_STRIKE_WINDOW_MS &&
    now > record.blockedUntil
  ) {
    record.strikes = 0;
  }

  return record;
}

function registerBadRequest(req, reason = 'Chamada indevida') {
  const ip = getClientIp(req);
  const record = getAbuseRecord(ip);
  const now = Date.now();

  // Se já está bloqueado, não precisa somar strike de novo.
  if (record.blockedUntil && now < record.blockedUntil) {
    return record;
  }

  record.strikes += 1;
  record.lastStrikeAt = now;

  console.warn(`[ABUSE] IP ${ip} | strike ${record.strikes}/${ABUSE_MAX_STRIKES} | ${reason}`);

  if (record.strikes >= ABUSE_MAX_STRIKES) {
    const blockMs = ABUSE_BLOCK_STEPS_MS[Math.min(record.blockLevel, ABUSE_BLOCK_STEPS_MS.length - 1)];

    record.blockedUntil = now + blockMs;
    record.blockLevel += 1;
    record.totalBlocks += 1;
    record.strikes = 0;

    console.warn(`[ABUSE] IP ${ip} bloqueado por ${Math.ceil(blockMs / 60000)} minutos | motivo: ${reason}`);
  }

  return record;
}

function registerTimeoutStrikeIfNeeded(req, reason, err) {
  if (!req || !ABUSE_PUNISH_DB_TIMEOUT) return;

  if (err?.code === 'DB_QUERY_TIMEOUT' || err?.code === 'DB_CONNECT_TIMEOUT') {
    registerBadRequest(req, reason);
  }
}

function abuseProtection(req, res, next) {
  const ip = getClientIp(req);
  const record = getAbuseRecord(ip);
  const now = Date.now();

  if (record.blockedUntil && now < record.blockedUntil) {
    const secondsLeft = Math.ceil((record.blockedUntil - now) / 1000);

    return res.status(429).json({
      erro: 'Muitas chamadas indevidas. Acesso temporariamente bloqueado.',
      bloqueado_por_segundos: secondsLeft,
      tente_novamente_em_minutos: Math.ceil(secondsLeft / 60),
      reincidencias: record.totalBlocks
    });
  }

  return next();
}

// Limpeza simples para evitar crescimento infinito do Map em memória.
setInterval(() => {
  const now = Date.now();

  for (const [ip, record] of abuseMap.entries()) {
    const inactiveFor = now - Math.max(record.lastStrikeAt || 0, record.blockedUntil || 0);

    if (inactiveFor > 24 * 60 * 60 * 1000 && now > record.blockedUntil) {
      abuseMap.delete(ip);
    }
  }
}, 60 * 60 * 1000).unref();

app.use(abuseProtection);

// =========================
// Proteção operacional
// =========================
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 45000);      // tempo máximo da requisição HTTP
const DB_CONNECT_TIMEOUT_MS = Number(process.env.DB_CONNECT_TIMEOUT_MS || 7000); // tempo máximo para conectar no Firebird
const DB_QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS || 25000);    // tempo máximo de execução da consulta
const DB_MAX_RETRIES = Number(process.env.DB_MAX_RETRIES || 1);                  // 0 = sem retry | 1 = tenta novamente 1 vez
const DB_RETRY_DELAY_MS = Number(process.env.DB_RETRY_DELAY_MS || 500);

app.use((req, res, next) => {
  req.setTimeout(REQUEST_TIMEOUT_MS);

  res.setTimeout(REQUEST_TIMEOUT_MS, () => {
    registerBadRequest(req, `Timeout HTTP em ${req.method} ${req.originalUrl || req.url}`);

    if (!res.headersSent) {
      return res.status(504).json({
        erro: 'Tempo limite da solicitação excedido',
        timeout_ms: REQUEST_TIMEOUT_MS
      });
    }
  });

  next();
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(err) {
  const msg = String(err?.message || err || '').toLowerCase();

  return [
    'timeout',
    'timed out',
    'connection',
    'connect',
    'econnreset',
    'econnrefused',
    'etimedout',
    'network',
    'unavailable',
    'deadlock',
    'lock conflict'
  ].some(term => msg.includes(term));
}

function safeDetach(db) {
  if (!db) return;

  try {
    db.detach();
  } catch (err) {
    console.error('Erro ao fechar conexão Firebird:', err?.message || err);
  }
}

function attachWithRetry(options, callback, attempt = 0) {
  let settled = false;

  const timer = setTimeout(async () => {
    if (settled) return;
    settled = true;

    const err = new Error(`Timeout ao conectar no Firebird após ${DB_CONNECT_TIMEOUT_MS}ms`);
    err.code = 'DB_CONNECT_TIMEOUT';

    if (attempt < DB_MAX_RETRIES) {
      await delay(DB_RETRY_DELAY_MS * (attempt + 1));
      return attachWithRetry(options, callback, attempt + 1);
    }

    return callback(err);
  }, DB_CONNECT_TIMEOUT_MS);

  Firebird.attach(options, async (err, db) => {
    if (settled) {
      safeDetach(db);
      return;
    }

    clearTimeout(timer);

    if (err) {
      if (attempt < DB_MAX_RETRIES && isRetryableError(err)) {
        await delay(DB_RETRY_DELAY_MS * (attempt + 1));
        return attachWithRetry(options, callback, attempt + 1);
      }

      return callback(err);
    }

    settled = true;
    return callback(null, db);
  });
}

function queryWithTimeout(db, sqlQuery, params, callback, attempt = 0) {
  let settled = false;

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;

    const err = new Error(`Timeout ao executar consulta após ${DB_QUERY_TIMEOUT_MS}ms`);
    err.code = 'DB_QUERY_TIMEOUT';

    return callback(err);
  }, DB_QUERY_TIMEOUT_MS);

  db.query(sqlQuery, params, async (err, result) => {
    if (settled) return;

    clearTimeout(timer);

    if (err && attempt < DB_MAX_RETRIES && isRetryableError(err)) {
      await delay(DB_RETRY_DELAY_MS * (attempt + 1));
      return queryWithTimeout(db, sqlQuery, params, callback, attempt + 1);
    }

    settled = true;
    return callback(err, result);
  });
}

function executeFirebirdQuery(reqOrSqlQuery, sqlOrParams, paramsOrCallback, maybeCallback) {
  const hasRequest = typeof reqOrSqlQuery === 'object' && typeof sqlOrParams === 'string' && Array.isArray(paramsOrCallback);

  const req = hasRequest ? reqOrSqlQuery : null;
  const sqlQuery = hasRequest ? sqlOrParams : reqOrSqlQuery;
  const params = hasRequest ? paramsOrCallback : sqlOrParams;
  const callback = hasRequest ? maybeCallback : paramsOrCallback;

  attachWithRetry(dbConfig, (err, db) => {
    if (err) {
      registerTimeoutStrikeIfNeeded(req, `Timeout de conexão Firebird em ${req?.method || ''} ${req?.originalUrl || req?.url || ''}`, err);
      return callback(err);
    }

    queryWithTimeout(db, sqlQuery, params, (queryErr, result) => {
      safeDetach(db);
      registerTimeoutStrikeIfNeeded(req, `Timeout de consulta Firebird em ${req?.method || ''} ${req?.originalUrl || req?.url || ''}`, queryErr);
      return callback(queryErr, result);
    });
  });
}

function parseIntList(value) {
  if (!value) return [];

  return String(value)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(n => Number(n))
    .filter(n => Number.isInteger(n) && n > 0);
}

function placeholders(n) {
  return Array.from({ length: n }, () => '?').join(',');
}

app.get('/requisicoes', (req, res) => {
  const { nrorc, cdfil } = req.query;

  if (!nrorc || !cdfil) {
    registerBadRequest(req, 'Parâmetros ausentes em /requisicoes');
    return res.status(400).send('Parâmetros nrorc e cdfil são obrigatórios');
  }

  const sqlQuery = `
    WITH base AS (
      SELECT
        fc15100.cdfil,
        fc15100.nrorc,
        fc15100.serieo,
        fc15100.prcobr,
        fc15100.vrdsc,
        fc15100.tpformafarma,
        fc15100.volume,
        fc15100.qtcont,
        fc15100.qtfor,
        fc15100.univol,
        fc15100.qtaprov,
        fc15100.cdconre,
        fc15100.cdfunre,
        fc15100.tpcap,

        fc15110.itemid,
        fc15110.quant,
        fc15110.quanthp,
        fc15110.unida,
        fc15110.unihp,

        fc03000.cdpro AS cdpro_principal,
        fc03000.porta,

        fc0h000.idtipocap,
        fc0h000.descricao AS descricao_capsula,

        fc04000.nrcrm,
        fc04000.ufcrm,
        fc04000.nomemed,

        fc08000.nomefun,

        fc15000.OBSPA,

        TRIM(
          CASE
            WHEN fc15110.cdpro <> fc15110.cdprin THEN
              CASE
                WHEN fc03200.descrprd IS NOT NULL
                     AND POSITION(UPPER(TRIM(fc03200.descrprd)) IN UPPER(TRIM(fc15110.descr))) > 0
                THEN fc03200.descrprd
                ELSE fc15110.descr
              END

            WHEN fc15110.cdpro = fc15110.cdprin
                 AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descr))
                 AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descrprd))
            THEN fc15110.descr

            WHEN UPPER(TRIM(fc15110.descr)) = UPPER(TRIM(fc03000.descr))
            THEN fc03000.descrprd

            WHEN fc03000.descrprd IS NULL
            THEN fc15110.descr

            ELSE fc03000.descrprd
          END
        ) AS produto_base

      FROM fc15100

      LEFT JOIN fc15000
        ON fc15000.nrorc = fc15100.nrorc
       AND fc15000.cdfil = fc15100.cdfil

      LEFT JOIN fc15110
        ON fc15110.nrorc = fc15100.nrorc
       AND fc15110.cdfil = fc15100.cdfil
       AND fc15110.serieo = fc15100.serieo

      LEFT JOIN fc04000
        ON fc04000.ufcrm = fc15100.ufcrm
       AND fc04000.nrcrm = fc15100.nrcrm
       AND fc04000.pfcrm = fc15100.pfcrm

      LEFT JOIN fc08000
        ON fc08000.cdcon = fc15100.cdconre
       AND fc08000.cdfun = fc15100.cdfunre

      LEFT JOIN fc03000
        ON fc03000.cdpro = fc15110.cdprin

      LEFT JOIN fc03200
        ON fc03200.cdsin = fc15110.cdpro

      LEFT JOIN fc0h000
        ON fc0h000.tpcapsula = fc15100.tpcap

      WHERE fc15100.nrorc = ?
        AND fc15100.cdfil = ?
        AND fc15110.tpcmp IN ('C','H')
        AND fc15110.indelicmp <> 'S'
    )

    SELECT
      cdfil || ' - ' || nrorc || ' - ' || serieo AS "N° Orçamento",
      prcobr AS "Valor_Bruto",
      vrdsc AS "Valor_Desconto",
      prcobr - vrdsc AS "Valor a Pagar",

      CASE tpformafarma
        WHEN 0  THEN 'Indefinido'
        WHEN 1  THEN 'Cápsula'
        WHEN 2  THEN 'Creme'
        WHEN 3  THEN 'Loção'
        WHEN 4  THEN 'Shampoo'
        WHEN 5  THEN 'Outras'
        WHEN 6  THEN 'Unidades'
        WHEN 7  THEN 'Homeopatia'
        WHEN 8  THEN 'Floral'
        WHEN 9  THEN 'Comprimido'
        WHEN 10 THEN 'Gel'
        WHEN 11 THEN 'Pomada'
        WHEN 12 THEN 'Xarope'
        WHEN 13 THEN 'Filtro Solar'
        WHEN 14 THEN 'Injetável'
        WHEN 15 THEN 'Envelope'
        WHEN 16 THEN 'Biscoito Medicamentoso'
        WHEN 17 THEN 'Pastilha Medicamentosa'
        WHEN 18 THEN 'Patch Gel'
        WHEN 19 THEN 'Filmes'
        WHEN 20 THEN 'Pasta Oral'
        WHEN 21 THEN 'Solução Oral'
        ELSE 'Não Definido'
      END AS "Fórmula Farmacêutica",

      CASE tpformafarma
        WHEN 1 THEN
          ROUND(volume, 2)
          || ' doses '
          || '(1 dose = ' || ROUND(qtcont, 0) || ' Cápsulas).'
        WHEN 6 THEN qtfor
        ELSE ROUND(volume, 2) || ' ' || univol
      END AS "Quantidade",

      CASE tpformafarma
        WHEN 2 THEN qtfor || ' de ' || qtcont || ' ' || univol || ' Total ' || (qtfor * qtcont) || ' ' || univol
        WHEN 3 THEN qtfor || ' de ' || qtcont || ' ' || univol
        WHEN 4 THEN qtfor || ' de ' || qtcont || ' ' || univol
        WHEN 5 THEN qtfor || ' de ' || qtcont || ' ' || univol
        WHEN 8 THEN qtfor || ' de ' || qtcont || ' ' || univol
        WHEN 12 THEN qtfor || ' de ' || qtcont || ' ' || univol
        WHEN 13 THEN qtfor || ' de ' || qtcont || ' ' || univol
        ELSE qtfor
      END AS "Quantidade Potes",

      TRIM(
        CASE
          WHEN POSITION('DERMATO' IN UPPER(produto_base)) > 0 THEN
            SUBSTRING(produto_base FROM 1 FOR POSITION('DERMATO' IN UPPER(produto_base)) - 1)

          WHEN POSITION('DILUIDO' IN UPPER(produto_base)) > 0 THEN
            SUBSTRING(produto_base FROM 1 FOR POSITION('DILUIDO' IN UPPER(produto_base)) - 1)

          WHEN POSITION('USAR ESTE' IN UPPER(produto_base)) > 0 THEN
            SUBSTRING(produto_base FROM 1 FOR POSITION('USAR ESTE' IN UPPER(produto_base)) - 1)

          WHEN POSITION('NAO USAR' IN UPPER(produto_base)) > 0 THEN
            SUBSTRING(produto_base FROM 1 FOR POSITION('NAO USAR' IN UPPER(produto_base)) - 1)

          WHEN POSITION('ACIMA DE' IN UPPER(produto_base)) > 0 THEN
            SUBSTRING(produto_base FROM 1 FOR POSITION('ACIMA DE' IN UPPER(produto_base)) - 1)

          WHEN POSITION('ABAIXO DE' IN UPPER(produto_base)) > 0 THEN
            SUBSTRING(produto_base FROM 1 FOR POSITION('ABAIXO DE' IN UPPER(produto_base)) - 1)

          ELSE produto_base
        END
      ) AS "Componentes da Fórmula",

      ROUND(
        CASE
          WHEN quant = 0 THEN quanthp
          WHEN quanthp IS NULL THEN 0
          WHEN quant IS NULL THEN 0
          ELSE quant
        END, 4
      ) || ' ' || COALESCE(LOWER(unida), LOWER(unihp), ' ')
      AS "Quantidade Dosagem",

      CASE qtaprov
        WHEN 0 THEN '⬜'
        ELSE '✅'
      END AS "Status",

      CASE
        WHEN cdpro_principal IN (3721, 50260) THEN NULL
        ELSE porta
      END AS "Portaria",

      CASE
        WHEN tpformafarma = 1
             AND idtipocap <> 9
        THEN descricao_capsula
        ELSE NULL
      END AS Tipo_Capsula,

      nrcrm || '-' || ufcrm AS CRM,
      nomemed AS MEDICO,
      cdconre AS FILIAL_VENDEDOR,
      cdfunre AS CODIGO_VENDEDOR,
      nomefun AS VENDEDOR,
      OBSPA AS OBS

    FROM base
    ORDER BY itemid ASC;
  `;

  executeFirebirdQuery(req, sqlQuery, [nrorc, cdfil], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erro ao executar a consulta');
    }

    if (!result || result.length === 0) {
      return res.status(404).send('Nenhum registro encontrado');
    }

    return res.json(result);
  });
});

app.get('/requisicoes-cliente', (req, res) => {
  const { cpfclientedav } = req.query;

  if (!cpfclientedav) {
    registerBadRequest(req, 'Parâmetro cpfclientedav ausente em /requisicoes-cliente');
    return res.status(400).send('Parâmetro cpfclientedav é obrigatório');
  }

  const sqlQuery = `
    SELECT
      fc.cdfil || ' - ' || fc.nrrqu AS PROTOCOLO,
      fc.dtentr AS DATA_PEDIDO,
      CASE
        WHEN fc.tpformafarma = 6 THEN 'Produto de Revenda'
        ELSE 'Fórmula Manipulada'
      END AS TIPO,
      fc.volume,
      fc.univol,
      fc.qtcont AS DOSE,
      fc.dtval AS VALIDADE,
      fc.vrliqdav AS "R$ Fórmula"
    FROM fc12100 fc

    INNER JOIN fc07000 c
      ON c.cdcli = fc.cdcli

    WHERE c.nrcnpj = ?
      AND fc.dtentr >= DATEADD(-6 MONTH TO CURRENT_DATE)

    ORDER BY fc.dtentr DESC
  `;

  executeFirebirdQuery(req, sqlQuery, [cpfclientedav], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erro ao executar a consulta');
    }

    if (!result || result.length === 0) {
      return res.status(404).send('Nenhuma requisição encontrada');
    }

    return res.json(result);
  });
});

app.get('/componentes-req', (req, res) => {
  const { cdfil, nrrqu } = req.query;

  if (!cdfil || !nrrqu) {
    registerBadRequest(req, 'Parâmetros ausentes em /componentes-req');
    return res.status(400).send('Parâmetros cdfil e nrrqu são obrigatórios');
  }

  const sqlQuery = `
    WITH base AS (
      SELECT
        cf.cdfil,
        cf.nrrqu,
        cf.itemid,
        cf.quant,
        cf.unida,
        f.posol,

        TRIM(
          CASE
            WHEN cf.cdpro <> cf.cdprin THEN
              CASE
                WHEN fc03200.descrprd IS NOT NULL
                     AND POSITION(UPPER(TRIM(fc03200.descrprd)) IN UPPER(TRIM(cf.descr))) > 0
                THEN fc03200.descrprd
                ELSE cf.descr
              END

            WHEN cf.cdpro = cf.cdprin
                 AND UPPER(TRIM(cf.descr)) <> UPPER(TRIM(fc03000.descr))
                 AND UPPER(TRIM(cf.descr)) <> UPPER(TRIM(fc03000.descrprd))
            THEN cf.descr

            WHEN UPPER(TRIM(cf.descr)) = UPPER(TRIM(fc03000.descr))
            THEN fc03000.descrprd

            WHEN fc03000.descrprd IS NULL
            THEN cf.descr

            ELSE fc03000.descrprd
          END
        ) AS produto_base

      FROM fc12110 cf

      INNER JOIN fc12100 f
        ON f.cdfil = cf.cdfil
       AND f.nrrqu = cf.nrrqu

      LEFT JOIN fc03000
        ON fc03000.cdpro = cf.cdprin

      LEFT JOIN fc03200
        ON fc03200.cdsin = cf.cdpro

      WHERE cf.cdfil = ?
        AND cf.nrrqu = ?
        AND cf.tpcmp = 'C'
    )

    SELECT
      TRIM(
        CASE
          WHEN POSITION('DERMATO' IN UPPER(produto_base)) > 0 THEN
            SUBSTRING(produto_base FROM 1 FOR POSITION('DERMATO' IN UPPER(produto_base)) - 1)

          WHEN POSITION('DILUIDO' IN UPPER(produto_base)) > 0 THEN
            SUBSTRING(produto_base FROM 1 FOR POSITION('DILUIDO' IN UPPER(produto_base)) - 1)

          WHEN POSITION('USAR ESTE' IN UPPER(produto_base)) > 0 THEN
            SUBSTRING(produto_base FROM 1 FOR POSITION('USAR ESTE' IN UPPER(produto_base)) - 1)

          WHEN POSITION('NAO USAR' IN UPPER(produto_base)) > 0 THEN
            SUBSTRING(produto_base FROM 1 FOR POSITION('NAO USAR' IN UPPER(produto_base)) - 1)

          WHEN POSITION('ACIMA DE' IN UPPER(produto_base)) > 0 THEN
            SUBSTRING(produto_base FROM 1 FOR POSITION('ACIMA DE' IN UPPER(produto_base)) - 1)

          WHEN POSITION('ABAIXO DE' IN UPPER(produto_base)) > 0 THEN
            SUBSTRING(produto_base FROM 1 FOR POSITION('ABAIXO DE' IN UPPER(produto_base)) - 1)

          ELSE produto_base
        END
      ) AS PRODUTO,

      quant AS QUANTIDADE,
      unida AS UNIDADE,
      posol AS POSOLOGIA

    FROM base
    ORDER BY itemid ASC
  `;

  executeFirebirdQuery(req, sqlQuery, [cdfil, nrrqu], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erro ao executar a consulta');
    }

    if (!result || result.length === 0) {
      return res.status(404).send('Nenhum componente encontrado');
    }

    return res.json(result);
  });
});

app.get('/romaneios_dia', (req, res) => {
  const { inicio, fim, tpentg } = req.query;

  if (!inicio || !fim) {
    registerBadRequest(req, 'Parâmetros inicio/fim ausentes em /romaneios_dia');
    return res.status(400).json({
      erro: "Parâmetros 'inicio' e 'fim' são obrigatórios. Ex: ?inicio=2026-01-20&fim=2026-01-21"
    });
  }

  let sqlQuery = `
    SELECT
      r.cdfilentg AS F_ROMANEIO,
      r.nrentg AS N_ROMANEIO,
      r.dtentg AS DATA,
      r.hrentg AS HORA,
      r.obsentg AS OBSERVACAO,

      r.ender AS ENDERECO,
      r.endnr AS N_ENDERECO,
      r.endcp AS COMPLEMENTO,
      r.bairr AS BAIRRO,
      r.munic AS MUNICIPIO,
      r.unfed AS UF,
      r.nrcep AS CEP,

      r.tpentg,

      CASE r.tpentg
        WHEN 2 THEN 'Sedex'
        WHEN 1 THEN 'MotoBoy'
        WHEN 3 THEN 'Outros (Rio)'
        ELSE 'Loja'
      END AS TipoEntrega,

      r.nrddd AS NR_DDD,
      r.nrtel AS NR_TELEFONE

    FROM fc12400 r
    WHERE r.dtentg BETWEEN ? AND ?
  `;

  const params = [inicio, fim];

  if (tpentg) {
    sqlQuery += ' AND r.tpentg = ?';
    params.push(parseInt(tpentg));
  }

  executeFirebirdQuery(req, sqlQuery, params, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erro ao executar a consulta');
    }

    if (!result || result.length === 0) {
      return res.status(404).json({
        mensagem: 'Nenhum romaneio encontrado no período'
      });
    }

    return res.json(result);
  });
});

app.get('/itens_romaneio', (req, res) => {
  const { cdfilentg, nrentg } = req.query;

  if (!cdfilentg || !nrentg) {
    registerBadRequest(req, 'Parâmetros ausentes em /itens_romaneio');
    return res.status(400).send('Parâmetros cdfilentg e nrentg são obrigatórios');
  }

  const sqlQuery = `
    SELECT
      dr.cdfilr || '-' || dr.cdpro AS requisicao,
      dr.vrliq,
      c.cdcli,
      c.nomecli
    FROM fc12410 dr

    INNER JOIN fc12100 req
      ON req.cdfil = dr.cdfilr
     AND req.nrrqu = dr.cdpro

    INNER JOIN fc07000 c
      ON c.cdcli = req.cdcli

    WHERE dr.cdfilentg = ?
      AND dr.nrentg = ?
  `;

  executeFirebirdQuery(req, sqlQuery, [cdfilentg, nrentg], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erro ao executar a consulta');
    }

    if (!result || result.length === 0) {
      return res.status(404).send('Nenhum item encontrado para o romaneio');
    }

    return res.json(result);
  });
});

app.get('/orcamentos_rejeitados', (req, res) => {
  const { dataInicio, dataFim, filial } = req.query;
  const filiais = parseIntList(filial);

  if (!dataInicio || !dataFim || filiais.length === 0) {
    registerBadRequest(req, 'Parâmetros obrigatórios ausentes ou inválidos em /orcamentos_rejeitados');
    return res.status(400).json({
      erro: 'Os parâmetros dataInicio, dataFim e filial são obrigatórios. Ex: ?dataInicio=2026-06-01&dataFim=2026-06-23&filial=1,2,3'
    });
  }

  const sqlQuery = `
    SELECT
      f.cdfil,
      SUM(f.prcobr - f.vrdsc) AS total
    FROM fc15100 f
    WHERE f.dtentr BETWEEN ? AND ?
      AND f.cdfil IN (${placeholders(filiais.length)})
      AND f.qtaprov = 0
    GROUP BY f.cdfil
    ORDER BY f.cdfil
  `;

  executeFirebirdQuery(req, sqlQuery, [dataInicio, dataFim, ...filiais], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({
        erro: 'Erro ao executar a consulta',
        detalhe: err.message
      });
    }

    if (!result || result.length === 0) {
      return res.status(404).json({
        erro: 'Nenhum registro encontrado'
      });
    }

    return res.json(result);
  });
});

app.get('/vendas_unidade', (req, res) => {
  const { filial } = req.query;
  const filiais = parseIntList(filial);

  if (filiais.length === 0) {
    registerBadRequest(req, 'Parâmetro filial ausente ou inválido em /vendas_unidade');
    return res.status(400).json({
      erro: 'Parâmetro filial é obrigatório. Ex: ?filial=1 ou ?filial=1,2,3'
    });
  }

  const sqlQuery = `
    SELECT
      f.cdfil,
      COUNT(DISTINCT f.nrrqu) AS Req,
      SUM(f.prcobr - f.vrdsc) AS Total,
      COUNT(DISTINCT f.cdcli) AS Quantidade_Clientes,
      COUNT(DISTINCT CASE
        WHEN c.dtcad = current_date
        THEN f.cdcli
      END) AS Novos_Clientes
    FROM fc12100 f

    LEFT JOIN fc07000 c
      ON c.cdcli = f.cdcli

    WHERE f.dtentr = current_date
      AND f.cdfil IN (${placeholders(filiais.length)})

    GROUP BY f.cdfil
    ORDER BY f.cdfil
  `;

  executeFirebirdQuery(req, sqlQuery, filiais, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erro ao executar a consulta');
    }

    if (!result || result.length === 0) {
      return res.status(404).send('Nenhum registro encontrado');
    }

    return res.json(result);
  });
});

app.listen(3000, () => {
  console.log('API em funcionamento.');
});
