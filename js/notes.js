// js/notes.js - VERSÃO COMPLETA CORRIGIDA
import { showNotification } from './utils.js';
import { EmailService } from './emailService.js';

// ========================================================
// NOTES SERVICE - Objeto com todas as funções de anotações
// ========================================================

export const NotesService = {
    STORAGE_KEY: 'pauta_notes',

    /**
     * Configura o modal de anotações
     */
    setup() {
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
            this.openModal();
        });

        // Fechar modal (botão X)
        if (closeNotesBtn) {
            closeNotesBtn.addEventListener("click", () => {
                this.closeModal();
            });
        }

        // Salvar anotações
        if (saveNotesBtn) {
            saveNotesBtn.addEventListener("click", () => {
                this.save();
            });
        }

        // Fechar ao clicar fora do modal
        notesModal.addEventListener("click", (e) => {
            if (e.target === notesModal) {
                this.closeModal();
            }
        });
    },

    /**
     * Abre o modal de anotações
     */
    openModal() {
        const notesModal = document.getElementById("notes-modal");
        const notesText = document.getElementById("notes-text");
        
        if (notesModal && notesText) {
            const saved = this.getNotes();
            notesText.value = saved;
            notesModal.classList.remove("hidden");
        }
    },

    /**
     * Fecha o modal de anotações
     */
    closeModal() {
        const notesModal = document.getElementById("notes-modal");
        if (notesModal) {
            notesModal.classList.add("hidden");
        }
    },

    /**
     * Salva as anotações atuais
     */
    save() {
        const notesText = document.getElementById("notes-text");
        if (notesText) {
            localStorage.setItem(this.STORAGE_KEY, notesText.value);
            showNotification("Anotação salva!", "success");
            this.closeModal();
        }
    },

    /**
     * Obtém o texto das anotações
     * @returns {string} Texto das anotações
     */
    getNotes() {
        return localStorage.getItem(this.STORAGE_KEY) || "";
    },

    /**
     * Limpa as anotações (opcional)
     */
    clearNotes() {
        if (confirm("Limpar todas as anotações?")) {
            localStorage.removeItem(this.STORAGE_KEY);
            showNotification("Anotações removidas!", "info");
        }
    },

    /**
     * Envia as anotações por email ao fechar a pauta
     * @param {string} currentUserName - Nome do usuário atual
     * @param {string} userEmail - Email do usuário
     */
    async sendOnClose(currentUserName, userEmail) {
        const notes = this.getNotes();
        
        if (notes.trim() === "") {
            return;
        }
        
        try {
            await EmailService.sendNotesByEmail(notes, currentUserName, userEmail);
            showNotification("Anotações enviadas para seu e-mail por segurança!", "info");
        } catch (err) {
            console.error("Falha ao enviar backup das notas:", err);
            showNotification("Erro ao enviar anotações.", "error");
        }
    },

    /**
     * Verifica se existem anotações salvas
     * @returns {boolean}
     */
    hasNotes() {
        const notes = this.getNotes();
        return notes.trim() !== "";
    },

    /**
     * Adiciona texto às anotações existentes
     * @param {string} text - Texto a ser adicionado
     */
    appendNotes(text) {
        if (!text) return;
        
        const current = this.getNotes();
        const newNotes = current ? `${current}\n${text}` : text;
        localStorage.setItem(this.STORAGE_KEY, newNotes);
        showNotification("Texto adicionado às anotações!", "success");
    },

    /**
     * Exporta anotações para download como arquivo .txt
     */
    exportToTxt() {
        const notes = this.getNotes();
        if (!notes) {
            showNotification("Não há anotações para exportar", "info");
            return;
        }

        const blob = new Blob([notes], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `anotacoes_${new Date().toISOString().slice(0,10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        
        showNotification("Anotações exportadas!", "success");
    }
};

// ========================================================
// FUNÇÕES AVULSAS (para compatibilidade com código antigo)
// ========================================================

/**
 * @deprecated Use NotesService.setup() instead
 */
export function setupNotes() {
    return NotesService.setup();
}

/**
 * @deprecated Use NotesService.openModal() instead
 */
export function openNotesModal() {
    return NotesService.openModal();
}

/**
 * @deprecated Use NotesService.save() instead
 */
export function saveNotes() {
    return NotesService.save();
}

/**
 * @deprecated Use NotesService.closeModal() instead
 */
export function closeNotesModal() {
    return NotesService.closeModal();
}

/**
 * @deprecated Use NotesService.sendOnClose() instead
 */
export async function sendNotesOnClose(currentUserName, userEmail) {
    return NotesService.sendOnClose(currentUserName, userEmail);
}

/**
 * @deprecated Use NotesService.getNotes() instead
 */
export function getNotes() {
    return NotesService.getNotes();
}

/**
 * @deprecated Use NotesService.clearNotes() instead
 */
export function clearNotes() {
    return NotesService.clearNotes();
}
