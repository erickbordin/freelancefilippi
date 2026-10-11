import { getStore } from '@netlify/blobs';

export default async () => {
    try {
        const catalogo = await getStore('catalogo').get('catalogo', { type: 'json' });
        return new Response(`window.CATALOGO = ${JSON.stringify(catalogo || { versao: 0, paginas: {} })};\n`, {
            headers: {
                'Content-Type': 'text/javascript; charset=utf-8',
                'Cache-Control': 'public, max-age=0, must-revalidate',
                'Netlify-CDN-Cache-Control': 'public, s-maxage=60'
            }
        });
    } catch (error) {
        console.error(error);
        return new Response('window.CATALOGO = { "versao": 0, "paginas": {} };\n', {
            headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }
        });
    }
};

export const config = { path: '/catalogo.js' };
