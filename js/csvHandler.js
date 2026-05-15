// js/csvHandler.js

export const parsePautaCSV = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.split('\n').map(line => line.trim()).filter(line => line);
                if (lines.length === 0) throw new Error("Arquivo vazio");

                const assistidos = [];
                let startIndex = 0;
                
                // Ignora o cabeçalho se houver
                const firstLineLower = lines[0].toLowerCase();
                if (firstLineLower.includes('nome') || firstLineLower.includes('assunto') || firstLineLower.includes('agend')) {
                    startIndex = 1;
                }

                for (let i = startIndex; i < lines.length; i++) {
                    const delimiter = lines[i].includes(';') ? ';' : ',';
                    // Remove aspas caso o Excel coloque
                    const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));

                    if (cols.length < 3) continue;

                    let numeroAgendamento = '';
                    let nome = '';
                    let hora = '';
                    let assunto = '';
                    let cpf = '';

                    // Validador de horário (ex: 14:30)
                    const isTime = (str) => /^([01]?\d|2[0-3]):([0-5]\d)/.test(str);

                    // Formato A (5 colunas): N° Agend ; Nome ; HH:MM ; Assunto ; CPF(opcional)
                    if (cols.length >= 4 && isTime(cols[2])) {
                        numeroAgendamento = cols[0];
                        nome = cols[1];
                        hora = cols[2];
                        assunto = cols[3];
                        cpf = cols[4] || '';
                    } 
                    // Formato B (4 colunas): Nome ; HH:MM ; Assunto ; CPF(opcional)
                    else if (cols.length >= 3 && isTime(cols[1])) {
                        nome = cols[0];
                        hora = cols[1];
                        assunto = cols[2];
                        cpf = cols[3] || '';
                    } 
                    // Fallback
                    else {
                        nome = cols[0];
                        hora = cols[1];
                        assunto = cols[2];
                        cpf = cols[3] || '';
                    }

                    if (nome) {
                        assistidos.push({
                            numeroAgendamento: numeroAgendamento,
                            name: nome,
                            scheduledTime: hora,
                            subject: assunto,
                            cpf: cpf
                        });
                    }
                }

                resolve(assistidos);
            } catch (err) {
                reject(err);
            }
        };
        
        reader.onerror = () => reject(new Error("Falha na leitura do arquivo"));
        reader.readAsText(file);
    });
};
