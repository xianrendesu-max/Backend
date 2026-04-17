/**
 * getstream.js
 * 動画ストリームを中継するためのAPIエンドポイント
 */

export default async function handler(req, res) {
    // クエリパラメータから動画ID(v)を取得
    const { v } = req.query;

    if (!v) {
        res.status(400).send('Error: Video ID (v) is required.');
        return;
    }

    // 実際のストリーム配信サーバーのURL
    // フォーマット18 (360p MP4) をデフォルトとして指定
    const targetUrl = `https://ytdlpinstance-vercel.vercel.app/stream/${v}?f=18`;

    try {
        // ターゲットサーバーへリクエストを送信
        const response = await fetch(targetUrl);

        if (!response.ok) {
            res.status(response.status).send(`Error: Failed to fetch stream from upstream. Status: ${response.status}`);
            return;
        }

        // レスポンスヘッダーの設定
        // 動画として認識させるために適切なContent-Typeを設定
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        // Rangeリクエストなどに対応する場合の追加ヘッダー（必要に応じて）
        res.setHeader('Accept-Ranges', 'bytes');

        // ストリームをブラウザにパイプ（中継）する
        // Vercel / Node.js の環境でReadableStreamを処理
        const reader = response.body.getReader();

        // データの断片を読み取って順次書き出す関数
        async function push() {
            const { done, value } = await reader.read();
            
            if (done) {
                res.end();
                return;
            }

            // 取得したバイナリデータを書き込み
            res.write(value);
            // 次の断片へ
            await push();
        }

        await push();

    } catch (error) {
        console.error('Stream Proxy Error:', error);
        res.status(500).send('Internal Server Error: Failed to proxy video stream.');
    }
}
