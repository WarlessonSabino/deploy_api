import express from 'express';
import Firebird from 'node-firebird';
import dbConfig from './dbconfig.js';
import cors from 'cors';

const app = express();
app.use(cors());

app.get('/requisicoes', (req, res) => {
    const { nrorc, cdfil } = req.query;

    if (!nrorc || !cdfil) {
        return res.status(400).send('Parâmetros nrorc e cdfil são obrigatórios');
    }

    const options = dbConfig;

    Firebird.attach(options, (err, db) => {
        if (err) {
            return res.status(500).send('Erro ao conectar ao banco de dados');
        }

        const sqlQuery = `
            SELECT          
                fc15100.cdfil || ' - ' || fc15100.nrorc || ' - ' || fc15100.serieo as "N° Orçamento",
                fc15100.prcobr AS "Valor_Bruto",
                fc15100.vrdsc AS "Valor_Desconto",
                fc15100.prcobr - fc15100.vrdsc AS "Valor a Pagar",

            CASE fc15100.tpformafarma
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


            CASE fc15100.tpformafarma
                WHEN 1 THEN 
                    (ROUND(fc15100.volume, 2)
                    || ' ' || 'doses' || ' ' || 
                    '(1 dose = ' || ' ' || ROUND(fc15100.qtcont, 0) || ' ' || 'Cápsulas).')
                WHEN 6 THEN
                fc15100.qtfor    
                ELSE 
                    (ROUND(fc15100.volume, 2 )
                    || ' ' || fc15100.univol)
            END AS "Quantidade",

            CASE fc15100.tpformafarma
                WHEN 3 THEN fc15100.qtfor || ' de ' || fc15100.qtcont || ' ' || fc15100.univol
                WHEN 4 THEN fc15100.qtfor || ' de ' || fc15100.qtcont || ' ' || fc15100.univol
                WHEN 5 THEN fc15100.qtfor || ' de ' || fc15100.qtcont || ' ' || fc15100.univol
                WHEN 8 THEN fc15100.qtfor || ' de ' || fc15100.qtcont || ' ' || fc15100.univol
                WHEN 12 THEN fc15100.qtfor || ' de ' || fc15100.qtcont || ' ' || fc15100.univol
                WHEN 13 THEN fc15100.qtfor || ' de ' || fc15100.qtcont || ' ' || fc15100.univol
                ELSE fc15100.qtfor
            END AS "Quantidade Potes",     

            TRIM(
              COALESCE(
                SUBSTRING(
                  TRIM(
                    CASE
                      WHEN fc15110.cdpro <> fc15110.cdprin THEN
                        CASE
                          WHEN POSITION(UPPER(TRIM(fc03200.descrprd)) IN UPPER(TRIM(fc15110.descr))) > 0 THEN fc03200.descrprd
                          ELSE fc15110.descr
                        END
                      WHEN fc15110.cdpro = fc15110.cdprin
                           AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descr))
                           AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descrprd))
                        THEN fc15110.descr
                      WHEN UPPER(TRIM(fc15110.descr)) = UPPER(TRIM(fc03000.descr)) THEN fc03000.descrprd
                      WHEN fc03000.descrprd IS NULL THEN fc15110.descr
                      ELSE fc03000.descrprd
                    END
                  ) FROM 1 FOR NULLIF(POSITION('DERMATO' IN UPPER(
                    TRIM(
                      CASE
                        WHEN fc15110.cdpro <> fc15110.cdprin THEN
                          CASE
                            WHEN POSITION(UPPER(TRIM(fc03200.descrprd)) IN UPPER(TRIM(fc15110.descr))) > 0 THEN fc03200.descrprd
                            ELSE fc15110.descr
                          END
                        WHEN fc15110.cdpro = fc15110.cdprin
                             AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descr))
                             AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descrprd))
                          THEN fc15110.descr
                        WHEN UPPER(TRIM(fc15110.descr)) = UPPER(TRIM(fc03000.descr)) THEN fc03000.descrprd
                        WHEN fc03000.descrprd IS NULL THEN fc15110.descr
                        ELSE fc03000.descrprd
                      END
                    )
                  )), 0) - 1),
                SUBSTRING(
                  TRIM(
                    CASE
                      WHEN fc15110.cdpro <> fc15110.cdprin THEN
                        CASE
                          WHEN POSITION(UPPER(TRIM(fc03200.descrprd)) IN UPPER(TRIM(fc15110.descr))) > 0 THEN fc03200.descrprd
                          ELSE fc15110.descr
                        END
                      WHEN fc15110.cdpro = fc15110.cdprin
                           AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descr))
                           AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descrprd))
                        THEN fc15110.descr
                      WHEN UPPER(TRIM(fc15110.descr)) = UPPER(TRIM(fc03000.descr)) THEN fc03000.descrprd
                      WHEN fc03000.descrprd IS NULL THEN fc15110.descr
                      ELSE fc03000.descrprd
                    END
                  ) FROM 1 FOR NULLIF(POSITION('DILUIDO' IN UPPER(
                    TRIM(
                      CASE
                        WHEN fc15110.cdpro <> fc15110.cdprin THEN
                          CASE
                            WHEN POSITION(UPPER(TRIM(fc03200.descrprd)) IN UPPER(TRIM(fc15110.descr))) > 0 THEN fc03200.descrprd
                            ELSE fc15110.descr
                          END
                        WHEN fc15110.cdpro = fc15110.cdprin
                             AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descr))
                             AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descrprd))
                          THEN fc15110.descr
                        WHEN UPPER(TRIM(fc15110.descr)) = UPPER(TRIM(fc03000.descr)) THEN fc03000.descrprd
                        WHEN fc03000.descrprd IS NULL THEN fc15110.descr
                        ELSE fc03000.descrprd
                      END
                    )
                  )), 0) - 1),
                SUBSTRING(
                  TRIM(
                    CASE
                      WHEN fc15110.cdpro <> fc15110.cdprin THEN
                        CASE
                          WHEN POSITION(UPPER(TRIM(fc03200.descrprd)) IN UPPER(TRIM(fc15110.descr))) > 0 THEN fc03200.descrprd
                          ELSE fc15110.descr
                        END
                      WHEN fc15110.cdpro = fc15110.cdprin
                           AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descr))
                           AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descrprd))
                        THEN fc15110.descr
                      WHEN UPPER(TRIM(fc15110.descr)) = UPPER(TRIM(fc03000.descr)) THEN fc03000.descrprd
                      WHEN fc03000.descrprd IS NULL THEN fc15110.descr
                      ELSE fc03000.descrprd
                    END
                  ) FROM 1 FOR NULLIF(POSITION('USAR ESTE' IN UPPER(
                    TRIM(
                      CASE
                        WHEN fc15110.cdpro <> fc15110.cdprin THEN
                          CASE
                            WHEN POSITION(UPPER(TRIM(fc03200.descrprd)) IN UPPER(TRIM(fc15110.descr))) > 0 THEN fc03200.descrprd
                            ELSE fc15110.descr
                          END
                        WHEN fc15110.cdpro = fc15110.cdprin
                             AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descr))
                             AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descrprd))
                          THEN fc15110.descr
                        WHEN UPPER(TRIM(fc15110.descr)) = UPPER(TRIM(fc03000.descr)) THEN fc03000.descrprd
                        WHEN fc03000.descrprd IS NULL THEN fc15110.descr
                        ELSE fc03000.descrprd
                      END
                    )
                  )), 0) - 1),
                SUBSTRING(
                  TRIM(
                    CASE
                      WHEN fc15110.cdpro <> fc15110.cdprin THEN
                        CASE
                          WHEN POSITION(UPPER(TRIM(fc03200.descrprd)) IN UPPER(TRIM(fc15110.descr))) > 0 THEN fc03200.descrprd
                          ELSE fc15110.descr
                        END
                      WHEN fc15110.cdpro = fc15110.cdprin
                           AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descr))
                           AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descrprd))
                        THEN fc15110.descr
                      WHEN UPPER(TRIM(fc15110.descr)) = UPPER(TRIM(fc03000.descr)) THEN fc03000.descrprd
                      WHEN fc03000.descrprd IS NULL THEN fc15110.descr
                      ELSE fc03000.descrprd
                    END
                  ) FROM 1 FOR NULLIF(POSITION('NAO USAR' IN UPPER(
                    TRIM(
                      CASE
                        WHEN fc15110.cdpro <> fc15110.cdprin THEN
                          CASE
                            WHEN POSITION(UPPER(TRIM(fc03200.descrprd)) IN UPPER(TRIM(fc15110.descr))) > 0 THEN fc03200.descrprd
                            ELSE fc15110.descr
                          END
                        WHEN fc15110.cdpro = fc15110.cdprin
                             AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descr))
                             AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descrprd))
                          THEN fc15110.descr
                        WHEN UPPER(TRIM(fc15110.descr)) = UPPER(TRIM(fc03000.descr)) THEN fc03000.descrprd
                        WHEN fc03000.descrprd IS NULL THEN fc15110.descr
                        ELSE fc03000.descrprd
                      END
                    )
                  )), 0) - 1),
                SUBSTRING(
                  TRIM(
                    CASE
                      WHEN fc15110.cdpro <> fc15110.cdprin THEN
                        CASE
                          WHEN POSITION(UPPER(TRIM(fc03200.descrprd)) IN UPPER(TRIM(fc15110.descr))) > 0 THEN fc03200.descrprd
                          ELSE fc15110.descr
                        END
                      WHEN fc15110.cdpro = fc15110.cdprin
                           AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descr))
                           AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descrprd))
                        THEN fc15110.descr
                      WHEN UPPER(TRIM(fc15110.descr)) = UPPER(TRIM(fc03000.descr)) THEN fc03000.descrprd
                      WHEN fc03000.descrprd IS NULL THEN fc15110.descr
                      ELSE fc03000.descrprd
                    END
                  ) FROM 1 FOR NULLIF(POSITION('ACIMA DE' IN UPPER(
                    TRIM(
                      CASE
                        WHEN fc15110.cdpro <> fc15110.cdprin THEN
                          CASE
                            WHEN POSITION(UPPER(TRIM(fc03200.descrprd)) IN UPPER(TRIM(fc15110.descr))) > 0 THEN fc03200.descrprd
                            ELSE fc15110.descr
                          END
                        WHEN fc15110.cdpro = fc15110.cdprin
                             AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descr))
                             AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descrprd))
                          THEN fc15110.descr
                        WHEN UPPER(TRIM(fc15110.descr)) = UPPER(TRIM(fc03000.descr)) THEN fc03000.descrprd
                        WHEN fc03000.descrprd IS NULL THEN fc15110.descr
                        ELSE fc03000.descrprd
                      END
                    )
                  )), 0) - 1),
                SUBSTRING(
                  TRIM(
                    CASE
                      WHEN fc15110.cdpro <> fc15110.cdprin THEN
                        CASE
                          WHEN POSITION(UPPER(TRIM(fc03200.descrprd)) IN UPPER(TRIM(fc15110.descr))) > 0 THEN fc03200.descrprd
                          ELSE fc15110.descr
                        END
                      WHEN fc15110.cdpro = fc15110.cdprin
                           AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descr))
                           AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descrprd))
                        THEN fc15110.descr
                      WHEN UPPER(TRIM(fc15110.descr)) = UPPER(TRIM(fc03000.descr)) THEN fc03000.descrprd
                      WHEN fc03000.descrprd IS NULL THEN fc15110.descr
                      ELSE fc03000.descrprd
                    END
                  ) FROM 1 FOR NULLIF(POSITION('ABAIXO DE' IN UPPER(
                    TRIM(
                      CASE
                        WHEN fc15110.cdpro <> fc15110.cdprin THEN
                          CASE
                            WHEN POSITION(UPPER(TRIM(fc03200.descrprd)) IN UPPER(TRIM(fc15110.descr))) > 0 THEN fc03200.descrprd
                            ELSE fc15110.descr
                          END
                        WHEN fc15110.cdpro = fc15110.cdprin
                             AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descr))
                             AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descrprd))
                          THEN fc15110.descr
                        WHEN UPPER(TRIM(fc15110.descr)) = UPPER(TRIM(fc03000.descr)) THEN fc03000.descrprd
                        WHEN fc03000.descrprd IS NULL THEN fc15110.descr
                        ELSE fc03000.descrprd
                      END
                    )
                  )), 0) - 1),
                TRIM(
                  CASE
                    WHEN fc15110.cdpro <> fc15110.cdprin THEN
                      CASE
                        WHEN POSITION(UPPER(TRIM(fc03200.descrprd)) IN UPPER(TRIM(fc15110.descr))) > 0 THEN fc03200.descrprd
                        ELSE fc15110.descr
                      END
                    WHEN fc15110.cdpro = fc15110.cdprin
                         AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descr))
                         AND UPPER(TRIM(fc15110.descr)) <> UPPER(TRIM(fc03000.descrprd))
                      THEN fc15110.descr
                    WHEN UPPER(TRIM(fc15110.descr)) = UPPER(TRIM(fc03000.descr)) THEN fc03000.descrprd
                    WHEN fc03000.descrprd IS NULL THEN fc15110.descr
                    ELSE fc03000.descrprd
                  END
                )
              )
            ) AS "Componentes da Fórmula",





            ROUND(
                CASE 
                    WHEN fc15110.quant = 0 THEN fc15110.quanthp 
                    WHEN fc15110.quanthp IS NULL THEN 0
                    WHEN fc15110.quant IS NULL THEN 0
                    ELSE fc15110.quant
                END, 4
            ) || ' ' ||
            COALESCE(LOWER(fc15110.unida), LOWER(fc15110.unihp), ' ') 
            AS "Quantidade Dosagem",
            
            CASE fc15100.qtaprov
                    WHEN 0 THEN '⬜'
            ELSE '✅'
            END AS "Status",

            
            CASE 
              WHEN fc03000.cdpro IN (3721, 50260) THEN NULL 
              ELSE fc03000.porta 
            END AS "Portaria",

            CASE
                WHEN fc15100.tpformafarma = 1
                     AND fc0h000.idtipocap <> 9
                THEN fc0h000.descricao
                ELSE NULL
            END AS Tipo_Capsula,

            (fc04000.nrcrm || '-' || fc04000.ufcrm ) AS CRM,
            fc04000.nomemed AS MEDICO,

             fc08000.nomefun AS VENDEDOR
    

            FROM
                fc15100


            LEFT JOIN
            fc15110 on fc15110.nrorc = fc15100.nrorc AND fc15110.cdfil = fc15100.cdfil and fc15110.serieo = fc15100.serieo

            LEFT JOIN
            fc04000 ON fc04000.ufcrm = fc15100.ufcrm AND fc04000.nrcrm = fc15100.nrcrm AND fc04000.pfcrm = fc15100.pfcrm

            LEFT JOIN
            fc08000 ON fc08000.cdcon = fc15100.cdconre AND fc08000.cdfun = fc15100.cdfunre
            
            LEFT JOIN
            fc03000 on fc03000.cdpro = fc15110.cdprin

            LEFT JOIN
            fc03200 on fc03200.cdsin = fc15110.cdpro

            LEFT JOIN
            fc0h000 on fc0h000.tpcapsula = fc15100.tpcap


            WHERE
                fc15100.nrorc = ?
            AND
                fc15100.cdfil = ?

            AND 
                fc15110.tpcmp IN ('C','H')  

            AND 
                fc15110.indelicmp <> 'S'      


            ORDER BY fc15110.itemid ASC;           

        `;

        db.query(sqlQuery, [nrorc, cdfil], (err, result) => {
            db.detach();

            if (err) {
                return res.status(500).send('Erro ao executar a consulta');
            }

            if (result.length === 0) {
                return res.status(404).send('Nenhum registro encontrado');
            }

            return res.json(result);
        });
    });
});

app.get('/visitas', (req, res) => {
    const { nrcrm, ufcrm, dtage } = req.query;

    if (!nrcrm || !ufcrm || !dtage) {
        return res.status(400).send('Parâmetros nrcrm, ufcrm e dtage são obrigatórios');
    }

    const options = dbConfig;

    Firebird.attach(options, (err, db) => {
        if (err) {
            return res.status(500).send('Erro ao conectar ao banco de dados');
        }

        const sqlQuery = `
            SELECT
                CAST(fc04A00.agendaid AS VARCHAR(55)) AS agendaid,
                (fc04a00.nrcrm || '-' || fc04a00.ufcrm) AS "N° CRM",
                (fc04a00.pfcrm || fc04a00.ufcrm || fc04a00.nrcrm) AS ID_Unico,
                fc04a00.dtage AS data_realizada,
                CAST(fc04a00.hrvisitaini AS TIME) AS hora_realizada,
                CAST(fc04a00.obsagenda AS VARCHAR(8191)) AS obsagenda,
                CAST(fc04a00.obsvisita AS VARCHAR(8191)) AS obsvisita,
                fc04a00.cdfun AS cd_visitador,
                CASE
                    WHEN fc04a00.situacao = 4 THEN 'Remarcado'
                    WHEN fc04a00.situacao = 2 THEN 'Realizado'
                    WHEN fc04a00.situacao = 1 THEN 'Agendado'
                    ELSE 'Removido'
                END AS situacao
            FROM FC04A00
            WHERE fc04a00.nrcrm = ?
              AND fc04a00.ufcrm = ?
              AND fc04a00.dtage = ?
        `;

        db.query(sqlQuery, [nrcrm, ufcrm, dtage], (err, result) => {
            db.detach();

            if (err) {
                return res.status(500).send('Erro ao executar a consulta');
            }

            if (!result || result.length === 0) {
                return res.status(404).send('Nenhuma visita encontrada');
            }

            return res.json(result);
        });
    });
});

app.get('/requisicoes-cliente', (req, res) => {
    const { cpfclientedav } = req.query;

    if (!cpfclientedav) {
        return res.status(400).send('Parâmetro cpfclientedav é obrigatório');
    }

    Firebird.attach(dbConfig, (err, db) => {
        if (err) {
            return res.status(500).send('Erro ao conectar ao banco de dados');
        }

        const sqlQuery = `
            SELECT FIRST 5
                (fc.cdfil || ' - ' || fc.nrrqu) AS PROTOCOLO,
                fc.dtentr AS DATA_PEDIDO,
                CASE 
                    WHEN fc.tpformafarma = 6 THEN 'Produto de Revenda'
                    ELSE 'Fórmula Manipulada'
                END AS TIPO
            FROM fc12100 fc

            INNER JOIN
            fc07000 c ON c.cdcli = fc.cdcli   
            
            WHERE c.nrcnpj = ?
            ORDER BY fc.dtentr DESC
        `;

        db.query(sqlQuery, [cpfclientedav], (err, result) => {
            db.detach();

            if (err) {
                return res.status(500).send('Erro ao executar a consulta');
            }

            if (!result || result.length === 0) {
                return res.status(404).send('Nenhuma requisição encontrada');
            }

            return res.json(result);
        });
    });
});

app.get('/componentes-req', (req, res) => {
    const { cdfil, nrrqu } = req.query;

    if (!cdfil || !nrrqu) {
        return res.status(400).send('Parâmetros cdfil e nrrqu são obrigatórios');
    }

    Firebird.attach(dbConfig, (err, db) => {
        if (err) {
            return res.status(500).send('Erro ao conectar ao banco de dados');
        }

        const sqlQuery = `
            SELECT
                p.descrprd AS PRODUTO,
                cf.quant AS QUANTIDADE,
                cf.unida AS UNIDADE,
                f.posol AS POSOLOGIA
            FROM fc12110 cf
            INNER JOIN fc12100 f 
                ON f.cdfil = cf.cdfil 
               AND f.nrrqu = cf.nrrqu
            INNER JOIN fc03000 p 
                ON p.cdpro = cf.cdprin
            WHERE cf.cdfil = ?
              AND cf.nrrqu = ?
              AND cf.tpcmp = 'C'
            ORDER BY cf.itemid ASC
        `;

        db.query(sqlQuery, [cdfil, nrrqu], (err, result) => {
            db.detach();

            if (err) {
                return res.status(500).send('Erro ao executar a consulta');
            }

            if (!result || result.length === 0) {
                return res.status(404).send('Nenhum componente encontrado');
            }

            return res.json(result);
        });
    });
});

app.get('/orcamentos_rejeitados', (req, res) => {
  Firebird.attach(dbConfig, (err, db) => {
    if (err) {
      return res.status(500).send('Erro ao conectar ao banco de dados');
    }

    const sqlQuery = `
      SELECT
        f.cdfil,
        SUM(f.prcobr - f.vrdsc) AS Total
      FROM fc15100 f
      WHERE f.dtentr = current_date
        AND f.qtaprov = 0
      GROUP BY f.cdfil
    `;

    db.query(sqlQuery, [], (err, result) => {
      db.detach();

      if (err) {
        return res.status(500).send('Erro ao executar a consulta');
      }

      if (!result || result.length === 0) {
        return res.status(404).send('Nenhum registro encontrado');
      }

      return res.json(result);
    });
  });
});


app.get('/vendas_unidade', (req, res) => {
  Firebird.attach(dbConfig, (err, db) => {
    if (err) {
      return res.status(500).send('Erro ao conectar ao banco de dados');
    }

    const sqlQuery = `
      SELECT
        f.cdfil,
        COUNT(DISTINCT f.nrrqu) AS Req,
        SUM(f.prcobr - f.vrdsc) AS Total
      FROM fc12100 f
      WHERE f.dtentr = current_date
      GROUP BY f.cdfil
    `;

    db.query(sqlQuery, [], (err, result) => {
      db.detach();

      if (err) {
        return res.status(500).send('Erro ao executar a consulta');
      }

      if (!result || result.length === 0) {
        return res.status(404).send('Nenhum registro encontrado');
      }

      return res.json(result);
    });
  });
});


app.listen(3000, () => {
    console.log('API em funcionamento.');
});


























