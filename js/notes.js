// js/notes.js - BLOCO DE NOTAS INTELIGENTE (MODERNIZADO)

import { showNotification, debounce } from './utils.js';
import { EmailService } from './emailService.js';

export const NotesService = {
    
    /**
     * Gera uma chave única de armazenamento para não misturar rascunhos de pautas diferentes
     */
    getStorageKey() {
        const pautaId = window.app?.currentPauta?.id || 'avulsa';
        return `sigap_notes_v2_${pautaId}`;
    },

    /**
     * Configura os eventos e o modal de anotações
     */
    setup() {
        const notesBtn = document.getElementById("notes-btn");
        const notesModal = document.getElementById("notes-modal");
        const closeNotesBtn = document.getElementById("close-notes-btn");
        const saveNotesBtn = document.getElementById("save-notes-btn");
        const notesText = document.getElementById("notes-text");
        
        if (!notesBtn || !notesModal || !notesText) {
            console.warn("Módulo de anotações não inicializado: Elementos não encontrados.");
            return;
        }

        // Abre o modal
        notesBtn.addEventListener("click", () => this.openModal());

        // Fecha o modal (botão e clique fora)
        if (closeNotesBtn) closeNotesBtn.addEventListener("click", () => this.closeModal());
        notesModal.addEventListener("click", (e) => {
            if (e.target === notesModal) this.closeModal();
        });

        // Salvar manual (feedback visual)
        if (saveNotesBtn) {
            saveNotesBtn.addEventListener("click", () => {
                this.save();
                this.closeModal();
            });
        }

        // ==========================================
        // AUTO-SAVE (Salvamento automático Premium)
        // Salva silenciosamente a cada 1 segundo que o usuário para de digitar
        // ==========================================
        notesText.addEventListener("input", debounce(() => {
            localStorage.setItem(this.getStorageKey(), notesText.value);
            
            // Opcional: Feedback bem sutil no botão de salvar para mostrar que salvou sozinho
            if (saveNotesBtn) {
                const textoOriginal = saveNotesBtn.textContent;
                saveNotesBtn.textContent = "✓ Salvo";
                saveNotesBtn.classList.replace('bg-indigo-600', 'bg-emerald-500');
                setTimeout(() => {
                    saveNotesBtn.textContent = textoOriginal;
                    saveNotesBtn.classList.replace('bg-emerald-500', 'bg-indigo-600');
                }, 1500);
            }
        }, 1000));
    },

    openModal() {
        const notesModal = document.getElementById("notes-modal");
        const notesText = document.getElementById("notes-text");
        
        if (notesModal && notesText) {
            notesText.value = this.getNotes();
            notesModal.classList.remove("hidden");
            // Foco automático para começar a digitar na hora
            setTimeout(() => notesText.focus(), 100);
        }
    },

    closeModal() {
        const notesModal = document.getElementById("notes-modal");
        if (notesModal) notesModal.classList.add("hidden");
    },

    save() {
        const notesText = document.getElementById("notes-text");
        if (notesText) {
            localStorage.setItem(this.getStorageKey(), notesText.value);
            showNotification("Anotações salvas com sucesso!", "success");
        }
    },

    getNotes() {
        return localStorage.getItem(this.getStorageKey()) || "";
    },

    clearNotes() {
        if (confirm("Tem certeza que deseja apagar todas as anotações desta pauta?")) {
            localStorage.removeItem(this.getStorageKey());
            const notesText = document.getElementById("notes-text");
            if (notesText) notesText.value = "";
            showNotification("Anotações apagadas.", "info");
        }
    },

    appendNotes(text) {
        if (!text) return;
        const current = this.getNotes();
        const newNotes = current ? `${current}\n${text}` : text;
        localStorage.setItem(this.getStorageKey(), newNotes);
        showNotification("Texto anexado ao rascunho!", "success");
    },

    /**
     * Backup de segurança via E-mail
     */
    async sendOnClose(currentUserName, userEmail) {
        const notes = this.getNotes();
        if (!notes.trim() || !userEmail) return;
        
        try {
            await EmailService.sendNotesByEmail(notes, currentUserName, userEmail);
            showNotification("Cópia das anotações enviada para seu e-mail.", "info");
        } catch (err) {
            console.error("Falha ao enviar backup de notas:", err);
            showNotification("Falha no backup das anotações por e-mail.", "warning");
        }
    },

    exportToTxt() {
        const notes = this.getNotes();
        if (!notes.trim()) {
            showNotification("O bloco de notas está vazio.", "warning");
            return;
        }

        const blob = new Blob([notes], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const pautaNome = window.app?.currentPauta?.name || 'Geral';
        const nomeArquivoSeguro = pautaNome.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        
        a.download = `rascunho_${nomeArquivoSeguro}_${new Date().toISOString().slice(0,10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        
        showNotification("Rascunho exportado (.txt)!", "success");
    }
};

// ========================================================
// FUNÇÕES AVULSAS (Mantidas para compatibilidade com versões antigas)
// ========================================================
export function setupNotes() { return NotesService.setup(); }
export function openNotesModal() { return NotesService.openModal(); }
export function saveNotes() { return NotesService.save(); }
export function closeNotesModal() { return NotesService.closeModal(); }
export async function sendNotesOnClose(currentUserName, userEmail) { return NotesService.sendOnClose(currentUserName, userEmail); }
export function getNotes() { return NotesService.getNotes(); }
export function clearNotes() { return NotesService.clearNotes(); }
