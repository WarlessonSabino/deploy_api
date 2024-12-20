import express from 'express';
import Firebird from 'node-firebird';
import path from 'path';
import dbConfig from './dbconfig.js';
import cors from 'cors';

const app = express();

// Enable CORS for cross-origin requests
app.use(cors());

// Serve static files from the root directory
const __dirname = path.resolve();
app.use(express.static(__dirname));

// API route for requisitions
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
                CAST(LEFT(LIST(fc15110.DESCR || ' ' || REPLACE(CAST(ROUND(fc15110.quant, 0) AS VARCHAR(255)), '.', ',') || ' ' || fc15110.unida), 255) AS VARCHAR(255)) AS "Componentes da Fórmula"

            FROM
                fc15100


            LEFT JOIN
            fc15110 on fc15110.nrorc = fc15100.nrorc AND fc15110.cdfil = fc15100.cdfil and fc15110.serieo = fc15100.serieo


            WHERE
                fc15100.nrorc = ? 
            AND
                fc15100.cdfil = ?

            AND fc15110.tpcmp = 'C'    

            GROUP BY 
            fc15100.cdfil || ' - ' || fc15100.nrorc || ' - ' || fc15100.serieo,
            fc15100.prcobr,
            fc15100.vrdsc 
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


// Catch-all route to serve the front-end application
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API em funcionamento na porta ${PORT}.`);
});
