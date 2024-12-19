import express from 'express';
import Firebird from 'node-firebird';
import dbConfig from './dbconfig.js';

const app = express();

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
                fc15100.prcobr - fc15100.vrdsc AS "Valor a Pagar"
            FROM
                fc15100
            WHERE
                fc15100.nrorc = ? 
            AND
                fc15100.cdfil = ?
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
