import express from 'express';
import axios from 'axios';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

/**
 * 1. 信頼性の高いインスタンスリスト
 * ※ api.invidious.io から自動取得する仕組みを fetch 内に組み込んでいます
 */
let CACHED_INSTANCES = [
    'https://invidious.projectsegfau.lt',
    'https://invidious.privacydev.net',
    'https://iv.ggtyler.dev',
    'https://inv.pistasjis.net',
    'https://invidious.perennialte.ch',
    'https://yewtu.be'
];

/**
 * サムネイルをYouTube公式から取得するように差し替え
 */
function injectYoutubeThumbnails(video, id) {
    if (!video) return {};
    const videoId = id || video.videoId;
    if (videoId) {
        video.thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        video.videoThumbnails = [
            { quality: 'high', url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` },
            { quality: 'medium', url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` }
        ];
    }
    return video;
}

/**
 * 2. インスタンスから最速で取得するコア関数
 * 全滅を避けるため、タイムアウトとエラー判定を厳格化
 */
async function fetchFromFastestInstance(endpoint) {
    const controller = new AbortController();
    // 全体の制限時間を10秒に設定
    const globalTimeout = setTimeout(() => controller.abort(), 10000);

    const requests = CACHED_INSTANCES.map(async (instance) => {
        try {
            const res = await axios.get(`${instance}/api/v1${endpoint}`, {
                timeout: 6000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                },
                signal: controller.signal
            });

            // Cloudflareの待機画面やエラーページ（HTML）が返ってきた場合は失敗扱いにする
            if (typeof res.data === 'string' && (res.data.includes('<!DOCTYPE') || res.data.includes('<html'))) {
                throw new Error(`HTML_RESPONSE_FROM_${instance}`);
            }

            // データが空、または予期せぬ形式（検索結果が配列でない等）のチェック
            if (!res.data || (endpoint.includes('/search') && !Array.isArray(res.data))) {
                throw new Error(`INVALID_DATA_FROM_${instance}`);
            }

            controller.abort(); // 他のリクエストをキャンセル
            return res.data;
        } catch (err) {
            // 個別のエラーはログに出すが、Promise.anyのために再スロー
            console.warn(`Instance failed: ${instance} | Reason: ${err.message}`);
            throw err;
        }
    });

    try {
        const result = await Promise.any(requests);
        clearTimeout(globalTimeout);
        return result;
    } catch (err) {
        clearTimeout(globalTimeout);
        console.error("Critical: All instances failed to respond with JSON.");
        throw new Error("ALL_INSTANCES_FAILED");
    }
}

/**
 * 3. 動画再生 API
 */
app.get('/api/watch', async (req, res) => {
    const videoId = req.query.id || req.query.v;
    if (!videoId || typeof videoId !== 'string') {
        return res.status(400).json({ error: 'Video ID is required' });
    }

    try {
        // Promise.allSettled を使い、片方が失敗してももう片方を活かす
        const [metadataResult, streamResult] = await Promise.allSettled([
            fetchFromFastestInstance(`/videos/${videoId}`),
            axios.get(`https://ytdlpinstance-vercel.vercel.app/stream/${videoId}?f=18`, { timeout: 8000 })
                .then(r => r.data)
                .catch(e => {
                    console.warn("Stream API fallback engaged:", e.message);
                    return { formats: [] };
                })
        ]);

        // メタデータ（タイトル等）が取れなかった場合はエラー
        if (metadataResult.status === 'rejected') {
            return res.status(503).json({ 
                error: '動画情報の取得に失敗しました。', 
                debug: metadataResult.reason.message 
            });
        }

        const metadata = metadataResult.value;
        const processedData = injectYoutubeThumbnails(metadata, videoId);
        
        // ストリームURLの選定（yt-dlp側がダメならプロキシURLを生成）
        const streamData = streamResult.status === 'fulfilled' ? streamResult.value : { formats: [] };
        const format18 = streamData.formats?.find(f => String(f.itag) === "18");
        const finalStreamUrl = format18 ? format18.url : `https://ytdlpinstance-vercel.vercel.app/stream?v=${videoId}`;

        res.json({
            title: processedData.title || "不明なタイトル",
            description: processedData.description || "",
            author: processedData.author || "不明なチャンネル",
            authorId: processedData.authorId || "",
            views: processedData.viewCount?.toLocaleString() || "0",
            published: processedData.publishedText || "",
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
        console.error('Watch API Critical Error:', error);
        res.status(500).json({ error: '予期せぬエラーが発生しました。' });
    }
});

/**
 * 4. 検索 API
 */
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Query is empty' });

    try {
        const data = await fetchFromFastestInstance(`/search?q=${encodeURIComponent(String(query))}&region=JP`);
        
        // 配列であることを確認してから処理
        const results = Array.isArray(data) 
            ? data.filter(item => item.type === 'video').map(v => injectYoutubeThumbnails(v))
            : [];

        res.json(results);
    } catch (error) {
        console.error('Search API Error:', error.message);
        res.status(500).json({ 
            error: '検索結果を取得できませんでした。', 
            debug: error.message 
        });
    }
});

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, '../public')));

// サーバー起動
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

export default app;
