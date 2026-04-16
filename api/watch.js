const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

// CORS設定（Vercelやローカル環境でのフロントエンド接続用）
const cors = require('cors');
app.use(cors());

const PORT = process.env.PORT || 3000;

// 使用するInvidiousインスタンスのリスト（安定性の高いものを厳選）
const INVIDIOUS_INSTANCES = [
    'https://yewtu.be',
    'https://invidious.asir.dev',
    'https://inv.tux.pizza',
    'https://iv.ggtyler.dev',
    'https://invidious.projectsegfau.lt',
    'https://inv.river.group',
    'https://invidious.no-logs.com',
    'https://invidious.flokinet.to'
];

/**
 * YouTubeの画像サーバー(i.ytimg.com)のURLに書き換える補助関数
 */
function injectYoutubeThumbnails(video, id) {
    const videoId = id || video.videoId;
    if (videoId) {
        // 高画質なサムネイル(hqdefault)をセット
        video.thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        video.videoThumbnails = [
            { quality: 'high', url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` },
            { quality: 'medium', url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` }
        ];
    }
    return video;
}

/**
 * 複数のインスタンスを同時に叩き、最速のレスポンスを返す
 */
async function fetchFromFastestInstance(endpoint) {
    const controller = new AbortController();
    const requests = INVIDIOUS_INSTANCES.map(instance => 
        axios.get(`${instance}/api/v1${endpoint}`, { 
            timeout: 6000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            signal: controller.signal
        }).then(res => {
            controller.abort(); // 最初に成功した時点で他をキャンセル
            return res.data;
        })
    );
    return await Promise.any(requests);
}

/**
 * 動画詳細情報取得 API (watch.html用)
 */
app.get('/api/watch', async (req, res) => {
    const videoId = req.query.id || req.query.v;
    if (!videoId) return res.status(400).json({ error: 'Video ID is required' });

    try {
        // メタデータ(Invidious)とストリームURL(ytdlp-proxy)を並列取得
        const [metadata, streamData] = await Promise.all([
            fetchFromFastestInstance(`/videos/${videoId}`),
            axios.get(`https://ytdlpinstance-vercel.vercel.app/stream/${videoId}?f=18`, { timeout: 8000 })
                .then(r => r.data)
                .catch(() => ({ formats: [] })) // 失敗時のフォールバック用
        ]);

        // サムネイルをYouTube直結に変換
        const processedData = injectYoutubeThumbnails(metadata, videoId);

        // ytdlpプロキシから最適なURLを選択
        const format18 = streamData.formats?.find(f => f.itag === 18 || f.itag === "18");
        const finalStreamUrl = format18 ? format18.url : `https://ytdlpinstance-vercel.vercel.app/stream?v=${videoId}`;

        // フロントエンド(watch.html)が期待するレスポンス形式
        res.json({
            title: processedData.title,
            description: processedData.description,
            author: processedData.author,
            views: processedData.viewCount?.toLocaleString() || "0",
            published: processedData.publishedText,
            streams: [
                {
                    url: finalStreamUrl,
                    quality: "720p",
                    container: "mp4"
                }
            ],
            recommended: (processedData.recommendedVideos || []).map(rv => ({
                id: rv.videoId,
                title: rv.title,
                author: rv.author,
                views: rv.viewCountText,
                thumbnail: `https://i.ytimg.com/vi/${rv.videoId}/mqdefault.jpg`
            }))
        });

    } catch (error) {
        console.error('Watch API Error:', error.message);
        res.status(500).json({ error: '動画データの取得に失敗しました。' });
    }
});

/**
 * 検索 API
 */
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Query is empty' });

    try {
        const data = await fetchFromFastestInstance(`/search?q=${encodeURIComponent(query)}&region=JP`);
        const results = data
            .filter(item => item.type === 'video')
            .map(video => injectYoutubeThumbnails(video));
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

// 静的ファイルの配信
app.use(express.static(path.join(__dirname, 'public')));

app.get('/watch', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/watch.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

module.exports = app; // Vercel用
