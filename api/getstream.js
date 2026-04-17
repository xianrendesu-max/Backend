/**
 * getstream.js
 * 動画ストリームを中継するためのAPIエンドポイント
 */

export default async function handler(req, res) {
    const { v } = req.query;

    if (!v) {
        res.status(400).send('Error: Video ID (v) is required.');
        return;
    }

    // 外部のストリーム配信サーバー
    const targetUrl = `https://ytdlpinstance-vercel.vercel.app/stream/${v}?f=18`;

    try {
        const response = await fetch(targetUrl);

        if (!response.ok) {
            res.status(response.status).send(`Error: Failed to fetch stream. Status: ${response.status}`);
            return;
        }

        // ヘッダーの転送
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');

        // ストリームのパイプ処理
        const reader = response.body.getReader();

        async function push() {
            const { done, value } = await reader.read();
            if (done) {
                res.end();
                return;
            }
            res.write(value);
            await push();
        }

        await push();

    } catch (error) {
        console.error('Stream Proxy Error:', error);
        if (!res.headersSent) {
            res.status(500).send('Internal Server Error');
        }
    }
}
