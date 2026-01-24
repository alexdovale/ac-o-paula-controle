// js/csvHandler.js

/**
 * Lê o arquivo CSV e transforma em uma lista de objetos prontos para o Firebase.
 */
export const parsePautaCSV = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const text = e.target.result;
            let lines = text.split(/\r\n|\n|\r/).filter(line => line.trim() !== '');
            
            if (lines.length === 0) {
                return reject("O arquivo está vazio.");
            }

            // Lógica para ignorar o cabeçalho se ele não tiver formato de hora (HH:MM) na segunda coluna
            const firstLineParts = lines[0].split(';').map(item => item.trim().replace(/^"|"$/g, ''));
            if (firstLineParts.length >= 2) {
                const potentialTime = firstLineParts[1].trim();
                if (!/^\d{1,2}:\d{2}$/.test(potentialTime)) {
                    lines.shift(); // Remove a primeira linha (cabeçalho)
                }
            }

            const processedData = lines.map(line => {
                const parts = line.split(';').map(item => item.trim().replace(/^"|"$/g, ''));
                if (parts.length >= 3) {
                    return {
                        name: parts[0],
                        scheduledTime: parts[1],
                        subject: parts[2],
                        cpf: parts.length > 3 ? parts[3] : null
                    };
                }
                return null;
            }).filter(item => item !== null && item.name && /^\d{1,2}:\d{2}$/.test(item.scheduledTime));

            if (processedData.length === 0) {
                return reject("Nenhum registro válido encontrado. Use o formato: Nome;HH:MM;Assunto;CPF");
            }

            resolve(processedData);
        };

        reader.onerror = () => reject("Erro ao ler o arquivo físico.");
        reader.readAsText(file);
    });
};
