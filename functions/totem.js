'use strict';
// Lógica do totem, separada do index.js para poder ser testada sem o Firebase.

const crypto = require('crypto');

const NA_FILA = ['aguardando', 'emAtendimento', 'atendido'];  // já confirmou presença
const INELEGIVEIS = ['cancelado'];                             // agendamento cancelado não gera senha

const normalizar = (t) => String(t ?? '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const soDigitos = (t) => String(t ?? '').replace(/\D/g, '');

const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const hojeSP = (d) => fmtDia.format(d);

const tokenValido = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

const corValida = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? c : '');

class ErroTotem extends Error {
    constructor(status, codigo) { super(codigo); this.status = status; this.codigo = codigo; }
}

function criarHandlers({ db, agora = () => new Date(), limite = { max: 20, janelaMs: 60000 } }) {

    // Valida o link do totem (recepção + token + dia) e devolve o documento de configuração
    async function carregarTotem(rec, token) {
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(rec || ''))) throw new ErroTotem(400, 'parametros-invalidos');
        const snap = await db.collection('totens').doc(rec).get();
        if (!snap.exists) throw new ErroTotem(403, 'link-invalido');
        const d = snap.data();
        if (!tokenValido(String(token || ''), String(d.token || ''))) throw new ErroTotem(403, 'link-invalido');
        if (d.dia !== hojeSP(agora())) throw new ErroTotem(403, 'totem-inativo');
        return d;
    }

    // Pautas que este link atende: todas do dia, ou só a indicada em ?pauta=
    function pautasDoLink(totem, pautaId) {
        const todas = Array.isArray(totem.pautas) ? totem.pautas.filter(p => p && p.id) : [];
        if (!pautaId) return todas;
        const uma = todas.find(p => p.id === pautaId);
        if (!uma) throw new ErroTotem(403, 'link-invalido');
        return [uma];
    }

    // Limite de tentativas por IP (janela fixa), guardado no Firestore para valer entre instâncias
    async function dentroDoLimite(req) {
        const ip = String(req.headers?.['x-forwarded-for'] || req.ip || 'desconhecido').split(',')[0].trim();
        const id = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);
        const ref = db.collection('totem_limites').doc(id);
        const agoraMs = agora().getTime();
        return db.runTransaction(async (tx) => {
            const s = await tx.get(ref);
            let { inicio = 0, qtd = 0 } = s.exists ? s.data() : {};
            if (agoraMs - inicio > limite.janelaMs) { inicio = agoraMs; qtd = 0; }
            qtd += 1;
            tx.set(ref, { inicio, qtd });
            return qtd <= limite.max;
        });
    }

    const responderErro = (res, e) => {
        if (e instanceof ErroTotem) return res.status(e.status).json({ erro: e.codigo });
        console.error('totem-erro', e);
        return res.status(500).json({ erro: 'erro-interno' });
    };

    // ── GET /totemConfig?rec=&t=&pauta= ─────────────────────────────────────────
    async function config(req, res) {
        try {
            if (req.method !== 'GET') throw new ErroTotem(405, 'metodo-invalido');
            const totem = await carregarTotem(req.query.rec, req.query.t);
            const pautas = pautasDoLink(totem, req.query.pauta ? String(req.query.pauta) : '');
            res.set?.('Cache-Control', 'no-store');
            return res.status(200).json({
                nomeOrgao: String(totem.nomeOrgao || ''),
                logoUrl: String(totem.logoUrl || ''),
                corPrimaria: corValida(totem.corPrimaria),
                corDestaque: corValida(totem.corDestaque),
                pautas: pautas.map(p => ({ id: p.id, name: String(p.name || '') })),
                pautaUnica: !!req.query.pauta,
            });
        } catch (e) { return responderErro(res, e); }
    }

    // ── POST /totemCheckin ─────────────────────────────────────────────────────
    // corpo: { rec, t, pauta?, modo: 'cpf'|'duplo', cpf?, nome?, agendamento?, escolha?: {pautaId, id} }
    async function checkin(req, res) {
        try {
            if (req.method !== 'POST') throw new ErroTotem(405, 'metodo-invalido');
            const b = (req.body && typeof req.body === 'object') ? req.body : {};

            if (!(await dentroDoLimite(req))) throw new ErroTotem(429, 'muitas-tentativas');

            const totem = await carregarTotem(b.rec, b.t);
            const pautas = pautasDoLink(totem, b.pauta ? String(b.pauta) : '');

            const modo = b.modo === 'duplo' ? 'duplo' : 'cpf';
            const cpf = soDigitos(b.cpf);
            const nome = normalizar(String(b.nome || '').slice(0, 120));
            const agend = normalizar(String(b.agendamento || '').slice(0, 30));
            if (modo === 'cpf' && cpf.length !== 11) throw new ErroTotem(400, 'cpf-invalido');
            if (modo === 'duplo' && (!nome || !agend)) throw new ErroTotem(400, 'dados-incompletos');

            const casa = (x) => modo === 'cpf'
                ? (soDigitos(x.cpf) !== '' && soDigitos(x.cpf) === cpf)
                : (normalizar(x.name) === nome && normalizar(x.numeroAgendamento ?? x.numAgendamento) === agend);

            const candidatos = [];
            let jaConfirmado = false;
            for (const p of pautas) {
                const qs = await db.collection('pautas').doc(p.id).collection('attendances').get();
                qs.forEach((d) => {
                    const x = d.data();
                    if (!casa(x)) return;
                    if (NA_FILA.includes(x.status)) jaConfirmado = true;
                    else if (!INELEGIVEIS.includes(x.status)) candidatos.push({ pautaId: p.id, pautaNome: p.name || '', id: d.id, dados: x });
                });
            }

            // Não revela qual campo falhou nem se o CPF existe em outra situação
            if (candidatos.length === 0) {
                return res.status(200).json({ resultado: jaConfirmado ? 'ja-confirmado' : 'nao-encontrado' });
            }

            let alvo;
            if (candidatos.length === 1) {
                alvo = candidatos[0];
            } else if (b.escolha && b.escolha.pautaId && b.escolha.id) {
                alvo = candidatos.find(c => c.pautaId === b.escolha.pautaId && c.id === b.escolha.id);
                if (!alvo) throw new ErroTotem(400, 'escolha-invalida');
            } else {
                return res.status(200).json({
                    resultado: 'escolher',
                    opcoes: candidatos.map(c => ({ pautaId: c.pautaId, id: c.id, pautaNome: c.pautaNome, horario: String(c.dados.scheduledTime || '') })),
                });
            }

            const ref = db.collection('pautas').doc(alvo.pautaId).collection('attendances').doc(alvo.id);
            const agoraDt = agora();
            const r = await db.runTransaction(async (tx) => {
                const s = await tx.get(ref);
                const st = s.exists ? s.data().status : null;
                if (NA_FILA.includes(st)) return 'ja';
                tx.update(ref, {
                    status: 'aguardando',
                    arrivalTime: agoraDt.toISOString(),
                    checkInOrder: agoraDt.getTime(),
                    checkInOrigem: 'totem',
                });
                return 'ok';
            });
            if (r === 'ja') return res.status(200).json({ resultado: 'ja-confirmado' });

            // Log sem dados pessoais
            console.log(JSON.stringify({ evento: 'totem-checkin', rec: b.rec, pautaId: alvo.pautaId, assistidoId: alvo.id }));

            const nomeCompleto = String(alvo.dados.name || '').trim();
            return res.status(200).json({
                resultado: 'ok',
                primeiroNome: nomeCompleto.split(' ')[0] || '',
                ticket: {
                    nome: nomeCompleto,
                    agendamento: String(alvo.dados.numeroAgendamento ?? alvo.dados.numAgendamento ?? ''),
                    pauta: alvo.pautaNome,
                    hora: fmtHora.format(agoraDt),
                    assunto: String(alvo.dados.subject || 'Triagem Geral'),
                    local: String(alvo.dados.room || 'Recepção / Fila Geral'),
                },
            });
        } catch (e) { return responderErro(res, e); }
    }

    return { config, checkin };
}

module.exports = { criarHandlers, normalizar, soDigitos, hojeSP, tokenValido, corValida, NA_FILA };
