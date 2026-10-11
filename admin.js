import { ADMIN_EMAIL, ADMIN_SENHA } from './credenciais.js';

(function () {
    const API_URL = '/.netlify/functions/admin';
    const MAX_IMAGE_SIDE = 1200;
    const IMAGE_QUALITY = 0.82;
    const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
    let adminStarted = false;

    function loadStyles() {
        if (document.getElementById('admin-styles')) return;
        const link = document.createElement('link');
        link.id = 'admin-styles';
        link.rel = 'stylesheet';
        link.href = 'admin.css';
        document.head.appendChild(link);
    }

    function readDraft() {
        const draft = readStoredJSON(DRAFT_KEY);
        return draft && draft.paginas ? draft : { paginas: {} };
    }

    function countDraft(draft) {
        return Object.values(draft.paginas).reduce((total, products) => total + Object.keys(products).length, 0);
    }

    function saveDraftEntry(ref, entry) {
        const draft = readDraft();
        const page = currentPageKey();
        draft.paginas[page] = draft.paginas[page] || {};
        draft.paginas[page][ref] = entry;
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        } catch (error) {
            throw new Error('Rascunho cheio de fotos. Publique as alterações antes de continuar.');
        }
    }

    async function callApi(body) {
        const session = readStoredJSON(ADMIN_SESSION_KEY) || {};
        let response;
        try {
            response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...body, email: session.email, senha: session.senha })
            });
        } catch (error) {
            throw new Error('Sem conexão com o servidor. Verifique a internet.');
        }
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) localStorage.removeItem(ADMIN_SESSION_KEY);
        if (!response.ok) throw new Error(data.erro || `Erro ${response.status}`);
        return data;
    }

    function openDialog(html) {
        const overlay = document.createElement('div');
        overlay.className = 'adm-overlay';
        overlay.innerHTML = `<form class="adm-dialog" novalidate>${html}</form>`;
        document.body.appendChild(overlay);

        const form = overlay.querySelector('form');
        const close = () => overlay.remove();
        overlay.addEventListener('click', event => {
            if (event.target === overlay || event.target.closest('[data-close]')) close();
        });
        form.querySelector('input')?.focus();
        return { form, close, error: message => { form.querySelector('.adm-error').textContent = message; } };
    }

    function showLogin() {
        loadStyles();
        const dialog = openDialog(`
            <h3>Acesso restrito</h3>
            <label>E-mail<input type="email" name="email" autocomplete="username" required></label>
            <label>Senha<input type="password" name="senha" autocomplete="current-password" required></label>
            <p class="adm-error"></p>
            <div class="adm-actions">
                <button type="button" data-close>Cancelar</button>
                <button type="submit" class="adm-primary">Entrar</button>
            </div>
        `);

        dialog.form.addEventListener('submit', event => {
            event.preventDefault();
            const email = dialog.form.elements.email.value.trim().toLowerCase();
            const senha = dialog.form.elements.senha.value;
            if (email !== ADMIN_EMAIL || senha !== ADMIN_SENHA) {
                dialog.error('E-mail ou senha inválidos.');
                return;
            }
            localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ email, senha, exp: Date.now() + SESSION_TTL_MS }));
            location.reload();
        });
    }

    function compressImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.naturalWidth * scale);
                canvas.height = Math.round(img.naturalHeight * scale);
                const context = canvas.getContext('2d');
                context.fillStyle = '#fff';
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL('image/jpeg', IMAGE_QUALITY));
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Não foi possível ler essa foto. Use JPG ou PNG.'));
            };
            img.src = url;
        });
    }

    function parsePriceInput(value) {
        const text = value.trim();
        const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
        return Math.round(parseFloat(normalized) * 100) / 100;
    }

    function readCard(card) {
        const img = card.querySelector('.img-container-black img');
        return {
            nome: getCardTitle(card),
            preco: getCardPrice(card),
            imagem: img ? img.getAttribute('src') : '',
            oculto: card.classList.contains('product-hidden')
        };
    }

    function openEditor(card) {
        const isNew = !card;
        const ref = isNew ? `n${Date.now().toString(36)}` : getCardId(card);
        const current = isNew ? { nome: '', preco: '', imagem: '', oculto: false } : readCard(card);
        const stored = isNew ? { novo: true } : (getCatalogEntry(ref) || {});
        let newImage = null;

        const dialog = openDialog(`
            <h3>${isNew ? 'Novo produto' : 'Editar produto'}</h3>
            <div class="adm-preview"><img alt=""><span>Sem foto</span></div>
            <label>Foto<input type="file" name="foto" accept="image/*"></label>
            <label>Nome<input type="text" name="nome" maxlength="150" required></label>
            <label>Preço (R$)<input type="text" name="preco" inputmode="decimal" placeholder="0,00" required></label>
            <label class="adm-check"><input type="checkbox" name="oculto"> Ocultar do site</label>
            <p class="adm-error"></p>
            <div class="adm-actions">
                <button type="button" data-close>Cancelar</button>
                <button type="submit" class="adm-primary">Salvar</button>
            </div>
        `);
        const { form } = dialog;
        const preview = form.querySelector('.adm-preview');
        const showPreview = src => {
            preview.querySelector('img').src = src;
            preview.classList.toggle('has-image', Boolean(src));
        };

        form.elements.nome.value = current.nome;
        form.elements.preco.value = current.preco ? current.preco.toFixed(2).replace('.', ',') : '';
        form.elements.oculto.checked = current.oculto;
        showPreview(current.imagem);

        form.elements.foto.addEventListener('change', async () => {
            const file = form.elements.foto.files[0];
            if (!file) return;
            dialog.error('');
            try {
                newImage = await compressImage(file);
                showPreview(newImage);
            } catch (error) {
                dialog.error(error.message);
            }
        });

        form.addEventListener('submit', event => {
            event.preventDefault();
            const nome = form.elements.nome.value.trim();
            const preco = parsePriceInput(form.elements.preco.value);
            const imagem = newImage || stored.imagem;

            if (!nome) return dialog.error('Informe o nome.');
            if (!(preco > 0)) return dialog.error('Informe um preço válido.');
            if (isNew && !imagem) return dialog.error('Escolha uma foto.');

            const entry = { ...stored, nome, preco, oculto: form.elements.oculto.checked };
            if (imagem) entry.imagem = imagem;

            try {
                saveDraftEntry(ref, entry);
            } catch (error) {
                return dialog.error(error.message);
            }

            if (isNew) {
                location.reload();
                return;
            }
            applyProductData(card, entry);
            refreshCardDerivedData(card);
            updateBar();
            dialog.close();
        });
    }

    function decorateCards() {
        document.querySelectorAll('.product-card').forEach(card => {
            if (card.querySelector('.adm-edit') || !getCardId(card)) return;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'adm-edit';
            button.textContent = 'Editar';
            card.appendChild(button);
        });

        document.addEventListener('click', event => {
            const button = event.target.closest('.adm-edit');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            openEditor(button.closest('.product-card'));
        }, true);
    }

    function updateBar() {
        const status = document.querySelector('.adm-bar-status');
        if (!status) return;
        const pending = countDraft(readDraft());
        status.textContent = pending
            ? `${pending} alteraç${pending > 1 ? 'ões' : 'ão'} não publicada${pending > 1 ? 's' : ''}`
            : 'Modo edição';
        document.querySelector('[data-adm="publicar"]').disabled = !pending;
    }

    async function publish(button) {
        const draft = readDraft();
        const pending = countDraft(draft);
        if (!pending) return;
        if (!confirm(`Publicar ${pending} alteraç${pending > 1 ? 'ões' : 'ão'}? O site leva até 2 minutos para atualizar para os clientes.`)) return;

        button.disabled = true;
        button.textContent = 'Publicando…';
        try {
            const { catalogo } = await callApi({ acao: 'publicar', rascunho: draft });
            localStorage.setItem(CATALOG_PUBLISHED_KEY, JSON.stringify(catalogo));
            localStorage.removeItem(DRAFT_KEY);
            showToast('Publicado! Os clientes veem em até 2 minutos.');
        } catch (error) {
            alert(error.message);
            if (!isAdminLogged()) location.reload();
        }
        button.textContent = 'Publicar';
        updateBar();
    }

    function discardDraft() {
        if (!countDraft(readDraft())) return;
        if (!confirm('Descartar todas as alterações não publicadas?')) return;
        localStorage.removeItem(DRAFT_KEY);
        location.reload();
    }

    function logout() {
        localStorage.removeItem(ADMIN_SESSION_KEY);
        location.reload();
    }

    function renderBar() {
        const bar = document.createElement('div');
        bar.className = 'adm-bar';
        bar.innerHTML = `
            <span class="adm-bar-status"></span>
            <div class="adm-bar-actions">
                ${document.querySelector('.product-grid') ? '<button type="button" data-adm="novo">+ Novo produto</button>' : ''}
                <button type="button" data-adm="descartar">Descartar</button>
                <button type="button" data-adm="publicar" class="adm-primary">Publicar</button>
                <button type="button" data-adm="sair">Sair</button>
            </div>
        `;
        bar.addEventListener('click', event => {
            const action = event.target.closest('[data-adm]')?.dataset.adm;
            if (action === 'novo') openEditor(null);
            if (action === 'publicar') publish(event.target);
            if (action === 'descartar') discardDraft();
            if (action === 'sair') logout();
        });
        document.body.appendChild(bar);
    }

    function startAdmin() {
        if (adminStarted) return;
        adminStarted = true;
        loadStyles();
        document.body.classList.add('admin-mode');
        renderBar();
        decorateCards();
        updateBar();
    }

    function open() {
        if (isAdminLogged()) startAdmin();
        else showLogin();
    }

    window.FilippiAdmin = { open };
    open();
})();
