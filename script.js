document.addEventListener('DOMContentLoaded', () => {
    const botaoIA = document.getElementById('botao-ia');
    const inputPergunta = document.getElementById('input-pergunta');
    const respostaIA = document.getElementById('resposta-ia');
    
    // Substitua 'SUA_URL_DA_API' pela URL pública da sua API depois do deploy.
    // Por enquanto, para testes locais, use 'http://127.0.0.1:5000'
    const API_URL = 'http://127.0.0.1:5000/perguntar_ia';

    botaoIA.addEventListener('click', async () => {
        const pergunta = inputPergunta.value.trim();
        if (!pergunta) {
            alert("Por favor, digite sua pergunta.");
            return;
        }

        respostaIA.innerText = 'Processando...';
        botaoIA.disabled = true;

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pergunta: pergunta })
            });

            if (!response.ok) {
                throw new Error(`Erro: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.resposta) {
                respostaIA.innerText = data.resposta;
            } else {
                respostaIA.innerText = `Erro da API: ${data.erro}`;
            }

        } catch (error) {
            respostaIA.innerText = `Falha na requisição. Erro: ${error.message}`;
            console.error('Erro na requisição:', error);
        } finally {
            botaoIA.disabled = false;
        }
    });
});
