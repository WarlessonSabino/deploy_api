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
                    (ROUND(fc15100.volume, 
                        CASE 
                            WHEN fc15100.volume LIKE '0%' THEN 2 
                            ELSE 2 
                        END) 
                    || ' ' || 'doses' || ' ' || 
                    '(1 dose = ' || ' ' || ROUND(fc15100.qtcont, 0) || ' ' || 'Cápsulas).')
                ELSE 
                    (ROUND(fc15100.volume, 
                        CASE 
                            WHEN fc15100.volume LIKE '0%' THEN 2 
                            ELSE 2 
                        END) 
                    || ' ' || fc15100.univol)
            END AS "Quantidade",


            CAST(
                LIST(
                    CASE
                        WHEN fc03000.descrprd <> fc15110.descr THEN fc15110.descr
                        ELSE fc03000.descrprd
                    END
                    || ' ' 
                    || CAST(
                            ROUND(
                                fc15110.quant,
                                CASE
                                    WHEN fc15110.quant LIKE '0%' THEN 2
                                    ELSE 1
                                END
                            ) AS VARCHAR(255)
                    )
                    || ' ' 
                    || LOWER(fc15110.unida)
                ) AS VARCHAR(32704)
            ) AS "Componentes da Fórmula"





            FROM
                fc15100


            LEFT JOIN
            fc15110 on fc15110.nrorc = fc15100.nrorc AND fc15110.cdfil = fc15100.cdfil and fc15110.serieo = fc15100.serieo

            LEFT JOIN
            fc12004 on fc12004.codigo = fc15100.tpformafarma

            LEFT JOIN
            fc03000 on fc03000.cdpro = fc15110.cdprin


            WHERE
                fc15100.nrorc = ?
            AND
                fc15100.cdfil = ?

            AND 
                fc15110.tpcmp IN ('C','H')  

            AND 
                fc15110.unida <> '%A'    


            GROUP BY 
            fc15100.cdfil || ' - ' || fc15100.nrorc || ' - ' || fc15100.serieo,
            fc15100.prcobr,
            fc15100.vrdsc,
            fc15100.volume,
            fc15100.qtcont,
            fc15100.tpformafarma,
            fc15100.univol,
            fc12004.forma_farmaceutica 
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

app.listen(3000, () => {
    console.log('API em funcionamento.');
});
