// js/csvHandler.js

export const parsePautaCSV = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split(/\r\n|\n|\r/).filter(line => line.trim() !== '');
            
            if (lines.length === 0) return reject("Arquivo vazio.");

            // Validação de cabeçalho: se a 1ª linha não tiver formato de hora no 2º campo, removemos
            const firstLineParts = lines[0].split(';');
            if (firstLineParts.length >= 2 && !/^\d{1,2}:\d{2}$/.test(firstLineParts[1].trim())) {
                lines.shift();
            }

            const processedData = lines.map(line => {
                const parts = line.split(';').map(item => item.trim().replace(/^"|"$/g, ''));
                if (parts.length >= 3) {
                    return {
                        name: parts[0],
                        scheduledTime: parts[1],
                        subject: parts[2],
                        cpf: parts[3] || null,
                        valid: /^\d{1,2}:\d{2}$/.test(parts[1]) // Valida se é hora mesmo
                    };
                }
                return null;
            }).filter(item => item && item.valid);

            resolve(processedData);
        };
        reader.onerror = () => reject("Erro ao ler arquivo.");
        reader.readAsText(file);
    });
};
