// js/monitoringService.js - Painel Central de Monitoramento e Auditoria do SIGEP
import { collection, addDoc, getDocs, query, orderBy, limit, getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export const MonitoringService = {
    
    // Registra automaticamente o acesso do usuário (Tráfego e IP)
    async registrarAcesso(db, usuarioEmail, pautaId) {
        try {
            // Utiliza uma API leve e gratuita para obter geolocalização básica e IP público
            let dadosIp = { ip: 'IP Protegido / Oculto', city: 'Desconhecida', region: 'RJ', country: 'BR' };
            try {
                const res = await fetch('https://ipapi.co/json/');
                if (res.ok) {
                    const json = await res.json();
                    dadosIp = {
                        ip: json.ip || 'N/A',
                        city: json.city || 'N/A',
                        region: json.region || 'N/A',
                        country: json.country_code || 'BR'
                    };
                }
            } catch (e) {
                // Fallback silencioso caso a rede bloqueie a API de IP
            }

            const deviceInfo = {
                usuario: usuarioEmail || 'Anônimo',
                pautaId: pautaId || 'Geral',
                ip: dadosIp.ip,
                localidade: `${dadosIp.city} - ${dadosIp.region} (${dadosIp.country})`,
                navegador: navigator.userAgent,
                dispositivo: /Mobi|Android/i.test(navigator.userAgent) ? 'Celular / Mobile' : 'Computador / Desktop',
                dataAcesso: new Date().toISOString()
            };

            // Salva na coleção de logs de acesso
            await addDoc(collection(db, "logs_acessos_seguranca"), deviceInfo);
        } catch (err) {
            console.error("Erro ao registrar log de acesso:", err);
        }
    },

    // Busca os dados consolidados para exibir no Painel Administrativo
    async carregarDadosPainel(db) {
        try {
            // 1. Carrega logs de acesso (Tráfego e IPs)
            const qAcessos = query(collection(db, "logs_acessos_seguranca"), orderBy("dataAcesso", "desc"), limit(50));
            const snapAcessos = await getDocs(qAcessos);
            const acessos = snapAcessos.docs.map(d => ({ id: d.id, ...d.data() }));

            // 2. Carrega erros capturados (Sentry / Feedbacks de bugs)
            const qErros = query(collection(db, "feedbacks_sistema"), orderBy("criadoEm", "desc"), limit(30));
            const snapErros = await getDocs(qErros);
            const erros = snapErros.docs.map(d => ({ id: d.id, ...d.data() }));

            return { acessos, erros };
        } catch (err) {
            console.error("Erro ao carregar dados do painel de monitoramento:", err);
            return { acessos: [], erros: [] };
        }
    }
};

export default MonitoringService;
window.MonitoringService = MonitoringService;
