import { getStore } from '@netlify/blobs';

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export default async request => {
    const key = decodeURIComponent(new URL(request.url).pathname.replace(/^\/fotos\//, ''));
    if (!/^[\w.-]+$/.test(key)) return notFound();

    const result = await getStore({ name: 'fotos', consistency: 'strong' }).getWithMetadata(key, { type: 'arrayBuffer' });
    if (!result) return notFound();

    return new Response(result.data, {
        headers: {
            'Content-Type': result.metadata?.contentType || 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable'
        }
    });
};

export const config = { path: '/fotos/*' };
