import express from 'express';
import Firebird from 'node-firebird';
import dbConfig from './dbconfig.js';

const app = express();

app.get('/requisicoes', (req, res) => {
    const queryParam = req.query.cpf;

    if (!queryParam) {
        return res.status(400).send('Parametro nrrqu é obrigatório');
    }

    const options = dbConfig;

    Firebird.attach(options, (err, db) => {
        if (err) {
            console.error('Erro ao conectar ao banco de dados:', err);
            return res.status(500).send('Erro ao conectar ao banco de dados');
        }

        const sqlQuery = `
            SELECT
                fc12100.cdfil,
                fc12100.nrrqu,
                fc12100.serier,
                fc12100.dtentr,
                fc12100.nomepa
            FROM
                fc12100
            WHERE
                fc12100.cpfclientedav = ?
        `;

        db.query(sqlQuery, [queryParam], (err, result) => {
            db.detach();

            if (err) {
                console.error('Erro ao executar a consulta:', err);
                return res.status(500).send('Erro ao executar a consulta');
            }

            console.log('Resultado da consulta:', result);

            if (result.length === 0) {
                return res.status(404).send('Nenhum registro encontrado');
            }

            return res.json(result);
        });
    });
});

app.listen(3000, () => {
    console.log('API em funcionamento na porta 3000');
});
