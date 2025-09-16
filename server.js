// Importa as bibliotecas necessárias
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config(); // Para carregar a chave de API de forma segura
const path = require('path');

// Configuração do servidor
const app = express();
app.use(express.json()); // Permite que o servidor entenda JSON

// Pega a chave de API do ambiente (muito mais seguro!)
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    // Se a chave não for encontrada, o servidor não deve iniciar.
    console.error("ERRO: A variável de ambiente GEMINI_API_KEY não foi definida no arquivo .env");
    process.exit(1); // Encerra o processo com um código de erro.
}
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// Rota para a comunicação com a IA (o front-end vai chamar este endereço)
app.post('/ask-ai', async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Nenhum prompt foi fornecido.' });
    }

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        res.json({ response: text });
    } catch (error) {
        console.error("Erro no back-end ao chamar a IA do Google:", error);
        res.status(500).json({ error: 'Falha ao comunicar com a IA do Google.' });
    }
});

// Serve o arquivo index.html e outros arquivos estáticos da pasta principal
app.use(express.static(path.join(__dirname, '')));

// Rota principal para servir o index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}. Acesse http://localhost:${PORT}`);
});
