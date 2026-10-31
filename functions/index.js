'use strict';
// Cloud Functions do totem de autoatendimento (SIGEP)
//  - totemConfig  (GET):  devolve identidade visual (logo, cores, nome do órgão) e as pautas do totem
//  - totemCheckin (POST): procura o assistido por CPF ou nome + agendamento e confirma a presença
//
// A página do totem NÃO lê o Firestore: só conversa com estas duas funções, então
// as regras do Firestore podem continuar fechadas para leitura pública.

const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { criarHandlers } = require('./totem');

admin.initializeApp();
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 10 });

const handlers = criarHandlers({ db: admin.firestore() });

// cors: true libera chamadas a partir da página do totem (qualquer origem; a proteção é o token do link)
exports.totemConfig  = onRequest({ cors: true, timeoutSeconds: 30 }, handlers.config);
exports.totemCheckin = onRequest({ cors: true, timeoutSeconds: 60, memory: '256MiB' }, handlers.checkin);
