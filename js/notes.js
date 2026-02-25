// js/notes.js - VERSÃO COMPLETA CORRIGIDA
import { showNotification } from './utils.js';
import { EmailService } from './emailService.js';

/**
 * Configura o modal de anotações
 */
export function setupNotes() {
    const notesBtn = document.getElementById("notes-btn");
    const notesModal = document.getElementById("notes-modal");
    const closeNotesBtn = document.getElementById("close-notes-btn");
    const saveNotesBtn = document.getElementById("save-notes-btn");
    const notesText = document.getElementById("notes-text");
    
    if (!notesBtn || !notesModal) {
        console.warn("Elementos do modal de anotações não encontrados");
        return;
    }

    // Abrir modal
    notesBtn.addEventListener("click", () => {
        const saved = localStorage.getItem("pauta_notes") || "";
        notesText.value = saved;
        notesModal.classList.remove("hidden");
    });

    // Fechar modal (botão X)
    if (closeNotesBtn) {
        closeNotesBtn.addEventListener("click", () => {
            notesModal.classList.add("hidden");
        });
    }

    // Salvar anotações
    if (saveNotesBtn) {
        saveNotesBtn.addEventListener("click", () => {
            localStorage.setItem("pauta_notes", notesText.value);
            showNotification("Anotação salva!", "success");
            notesModal.classList.add("hidden");
        });
    }

    // Fechar ao clicar fora do modal
    notesModal.addEventListener("click", (e) => {
        if (e.target === notesModal) {
            notesModal.classList.add("hidden");
        }
    });
}

/**
 * Abre o modal de anotações
 */
export function openNotesModal() {
    const notesModal = document.getElementById("notes-modal");
    const notesText = document.getElementById("notes-text");
    
    if (notesModal && notesText) {
        const saved = localStorage.getItem("pauta_notes") || "";
        notesText.value = saved;
        notesModal.classList.remove("hidden");
    }
}

/**
 * Salva as anotações atuais
 */
export function saveNotes() {
    const notesText = document.getElementById("notes-text");
    if (notesText) {
        localStorage.setItem("pauta_notes", notesText.value);
        showNotification("Anotação salva!", "success");
        closeNotesModal();
    }
}

/**
 * Fecha o modal de anotações
 */
export function closeNotesModal() {
    const notesModal = document.getElementById("notes-modal");
    if (notesModal) {
        notesModal.classList.add("hidden");
    }
}

/**
 * Envia as anotações por email ao fechar a pauta
 * @param {string} currentUserName - Nome do usuário atual
 * @param {string} userEmail - Email do usuário
 */
export async function sendNotesOnClose(currentUserName, userEmail) {
    const notes = localStorage.getItem("pauta_notes") || "";
    
    if (notes.trim() === "") {
        return;
    }
    
    try {
        await EmailService.sendNotesByEmail(notes, currentUserName, userEmail);
        showNotification("Anotações enviadas para seu e-mail por segurança!", "info");
    } catch (err) {
        console.error("Falha ao enviar backup das notas:", err);
    }
}

/**
 * Limpa as anotações (opcional)
 */
export function clearNotes() {
    if (confirm("Limpar todas as anotações?")) {
        localStorage.removeItem("pauta_notes");
        showNotification("Anotações removidas!", "info");
    }
}

/**
 * Obtém o texto das anotações
 * @returns {string} Texto das anotações
 */
export function getNotes() {
    return localStorage.getItem("pauta_notes") || "";
}
