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
                WHEN 2 THEN fc15100.qtfor || ' de ' || fc15100.qtcont || ' ' || fc15100.univol || ' Total ' || (fc15100.qtfor * fc15100.qtcont) || ' ' || fc15100.univol
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
             fc15100.cdconre AS FILIAL_VENDEDOR,
             fc15100.cdfunre AS CODIGO_VENDEDOR,
             fc08000.nomefun AS VENDEDOR,

             fc15000.OBSPA AS OBS
    

            FROM
                fc15100


            LEFT JOIN
            fc15000 on fc15000.nrorc = fc15100.nrorc AND fc15000.cdfil = fc15100.cdfil

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
            SELECT
                (fc.cdfil || ' - ' || fc.nrrqu) AS PROTOCOLO,
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
            
            WHERE 
                c.nrcnpj = ?
                AND fc.dtentr >= DATEADD(-6 MONTH TO CURRENT_DATE)

            ORDER BY fc.dtentr DESC
        `;

        db.query(sqlQuery, [cpfclientedav], (err, result) => {
            db.detach();

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


app.listen(3000, () => {
    console.log('API em funcionamento.');
});











