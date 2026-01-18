// js/csvHandler.js - O arquivo de Importação

export const parsePautaCSV = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split(/\r\n|\n|\r/).filter(line => line.trim() !== '');
            
            // Tira o cabeçalho se não for um horário
            if (lines.length > 0 && !/^\d{1,2}:\d{2}$/.test(lines[0].split(';')[1])) {
                lines.shift();
            }

            const data = lines.map(line => {
                const parts = line.split(';').map(item => item.trim().replace(/^"|"$/g, ''));
                return {
                    name: parts[0],
                    scheduledTime: parts[1],
                    subject: parts[2],
                    cpf: parts[3] || null
                };
            });
            resolve(data);
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
};
