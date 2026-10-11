import { getStore } from '@netlify/blobs';
import { ADMIN_EMAIL, ADMIN_SENHA } from '../../credenciais.js';

const PAGINAS = new Set([
    'aneisFem', 'aneisMasc', 'braceletes', 'brincos', 'colares', 'correntes',
    'escapularios', 'pingentes', 'pulseiras', 'pulseirasFem', 'tornozeleiras'
]);
const IMAGEM_MAX_BYTES = 3 * 1024 * 1024;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const IMAGEM_EXISTENTE = /^(\/fotos\/[\w.-]+|https:\/\/[^\s"'<>]+)$/;
const REF = /^[\w-]{1,40}$/;

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const json = (status, body) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

const isAdmin = ({ email, senha }) =>
    String(email || '').trim().toLowerCase() === ADMIN_EMAIL && senha === ADMIN_SENHA;

export async function readCatalogo(store) {
    const catalogo = await store.get('catalogo', { type: 'json' });
    return { versao: catalogo?.versao || 0, paginas: catalogo?.paginas || {} };
}

export function sanitizeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const nome = String(entry.nome || '').trim().slice(0, 150);
    const preco = Number(entry.preco);
    if (!nome || !Number.isFinite(preco) || preco <= 0 || preco > 1000000) return null;

    const clean = { nome, preco: Math.round(preco * 100) / 100, oculto: entry.oculto === true };
    if (entry.novo === true) clean.novo = true;

    if (typeof entry.imagem === 'string' && (DATA_URL.test(entry.imagem) || IMAGEM_EXISTENTE.test(entry.imagem))) {
        clean.imagem = entry.imagem;
    }
    if (clean.novo && !clean.imagem) return null;
    return clean;
}

export function collectChanges(rascunho) {
    const changes = [];
    for (const [pagina, produtos] of Object.entries(rascunho?.paginas || {})) {
        if (!PAGINAS.has(pagina) || !produtos || typeof produtos !== 'object') {
            throw new HttpError(400, `Página inválida: ${pagina}`);
        }
        for (const [ref, entry] of Object.entries(produtos)) {
            const clean = REF.test(ref) ? sanitizeEntry(entry) : null;
            if (!clean) throw new HttpError(400, `Produto ${ref} com dados inválidos (nome, preço ou foto).`);
            changes.push({ pagina, ref, entry: clean });
        }
    }
    if (!changes.length) throw new HttpError(400, 'Nenhuma alteração para publicar.');
    return changes;
}

async function saveImagem(fotos, dataUrl, pagina, ref) {
    const [, tipo, base64] = dataUrl.match(DATA_URL);
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length > IMAGEM_MAX_BYTES) throw new HttpError(413, `Foto do produto ${ref} passou de 3 MB.`);

    const key = `${pagina}-${ref}-${Date.now()}.${tipo === 'jpeg' ? 'jpg' : tipo}`;
    const contentType = `image/${tipo}`;
    await fotos.set(key, new Blob([bytes], { type: contentType }), { metadata: { contentType } });
    return `/fotos/${key}`;
}

async function publish(rascunho) {
    const changes = collectChanges(rascunho);
    const store = getStore({ name: 'catalogo', consistency: 'strong' });
    const fotos = getStore({ name: 'fotos', consistency: 'strong' });
    const catalogo = await readCatalogo(store);

    await Promise.all(changes.map(async change => {
        if (change.entry.imagem?.startsWith('data:')) {
            change.entry.imagem = await saveImagem(fotos, change.entry.imagem, change.pagina, change.ref);
        }
    }));

    changes.forEach(({ pagina, ref, entry }) => {
        catalogo.paginas[pagina] = catalogo.paginas[pagina] || {};
        catalogo.paginas[pagina][ref] = entry;
    });
    catalogo.versao = Date.now();
    await store.setJSON('catalogo', catalogo);

    return json(200, { catalogo });
}

export default async request => {
    if (request.method !== 'POST') return json(405, { erro: 'Método não permitido.' });

    let body;
    try {
        body = await request.json();
    } catch {
        return json(400, { erro: 'Requisição inválida.' });
    }

    if (!isAdmin(body)) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return json(401, { erro: 'Sessão inválida. Entre novamente.' });
    }

    try {
        if (body.acao === 'publicar') return await publish(body.rascunho);
        return json(400, { erro: 'Ação desconhecida.' });
    } catch (error) {
        if (error instanceof HttpError) return json(error.status, { erro: error.message });
        console.error(error);
        return json(500, { erro: 'Falha ao publicar. Tente de novo em instantes.' });
    }
};
