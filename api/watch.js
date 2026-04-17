import express from 'express';
import axios from 'axios';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json()); // JSONボディパーサーを追加（将来用）

// インスタンスリスト（死んでいるものを除外しやすいよう定数化）
const INVIDIOUS_INSTANCES = [
    'https://yewtu.be',
    'https://invidious.snopyta.org',
    'https://vid.puffyan.us',
    'https://invidious.kavin.rocks'
];

/**
 * 安全にYouTubeサムネイルを生成
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
 * インスタンスから最速でデータを取得
 * 強化ポイント: AggregateErrorのハンドリング、タイムアウトの厳格化
 */
async function fetchFromFastestInstance(endpoint) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 全体タイムアウト

    const requests = INVIDIOUS_INSTANCES.map(async (instance) => {
        try {
            const res = await axios.get(`${instance}/api/v1${endpoint}`, { 
                timeout: 5000,
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                },
                signal: controller.signal
            });

            // HTMLレスポンスのチェック
            if (typeof res.data === 'string' && res.data.includes('<!DOCTYPE')) {
                throw new Error("HTML_RESPONSE_ERROR");
            }

            // データ構造の最低限のチェック
            if (!res.data || (typeof res.data !== 'object')) {
                throw new Error("INVALID_DATA_FORMAT");
            }

            controller.abort(); // 最初に成功したリクエスト以外を中断
            return res.data;
        } catch (err) {
            // 個別のリクエスト失敗はPromise.anyが処理するので再スロー
            throw err;
        }
    });

    try {
        const result = await Promise.any(requests);
        clearTimeout(timeoutId);
        return result;
    } catch (err) {
        clearTimeout(timeoutId);
        // 全てのインスタンスが失敗した場合の処理
        throw new Error("ALL_INSTANCES_FAILED");
    }
}

app.get('/api/watch', async (req, res) => {
    const videoId = req.query.id || req.query.v;
    if (!videoId || typeof videoId !== 'string') {
        return res.status(400).json({ error: 'Video ID is required' });
    }

    try {
        // streamDataの取得でエラーが起きてもmetadata取得を殺さないように保護
        const [metadata, streamData] = await Promise.allSettled([
            fetchFromFastestInstance(`/videos/${videoId}`),
            axios.get(`https://ytdlpinstance-vercel.vercel.app/stream/${videoId}?f=18`, { timeout: 7000 })
                .then(r => r.data)
                .catch(() => ({ formats: [] }))
        ]);

        if (metadata.status === 'rejected') {
            throw new Error(metadata.reason.message);
        }

        const data = metadata.value;
        const processedData = injectYoutubeThumbnails(data, videoId);
        const sData = streamData.status === 'fulfilled' ? streamData.value : { formats: [] };

        // ストリームURLの安全な抽出
        const format18 = sData.formats?.find(f => String(f.itag) === "18");
        const finalStreamUrl = format18?.url || `https://ytdlpinstance-vercel.vercel.app/stream?v=${videoId}`;

        res.json({
            title: processedData.title || "Unknown Title",
            description: processedData.description || "",
            author: processedData.author || "Unknown Artist",
            views: processedData.viewCount?.toLocaleString() || "0",
            published: processedData.publishedText || "",
            streams: [{ url: finalStreamUrl, quality: "720p", container: "mp4" }],
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
        res.status(500).json({ 
            error: '動画データの取得に失敗しました。', 
            details: error.message === "ALL_INSTANCES_FAILED" ? "利用可能なサーバーが見つかりません。" : "APIエラー"
        });
    }
});

app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Query is empty' });

    try {
        const data = await fetchFromFastestInstance(`/search?q=${encodeURIComponent(String(query))}&region=JP`);
        
        if (!Array.isArray(data)) {
            throw new Error("SEARCH_DATA_NOT_ARRAY");
        }

        const results = data
            .filter(item => item && item.type === 'video')
            .map(video => injectYoutubeThumbnails(video));
            
        res.json(results);
    } catch (error) {
        console.error('Search API Error:', error.message);
        res.status(500).json({ error: '検索に失敗しました。後ほどやり直してください。' });
    }
});

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, '../public')));

// 404ハンドリング
app.use((req, res) => res.status(404).json({ error: "Not Found" }));

export default app;
