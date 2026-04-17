import express from 'express';
import axios from 'axios';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());

const PORT = process.env.PORT || 3000;

// 終了したインスタンスを除外し、現在動いているものを優先
const INVIDIOUS_INSTANCES = [
    'https://yewtu.be',
    'https://invidious.asir.dev',
    'https://inv.tux.pizza',
    'https://invidious.projectsegfau.lt',
    'https://inv.river.group',
    'https://invidious.no-logs.com',
    'https://invidious.flokinet.to',
    'https://iv.n8pjl.ca'
];

function injectYoutubeThumbnails(video, id) {
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
 * 修正ポイント：JSON以外のレスポンス（HTML等）をエラーとして弾く
 */
async function fetchFromFastestInstance(endpoint) {
    const controller = new AbortController();
    
    const requests = INVIDIOUS_INSTANCES.map(async (instance) => {
        try {
            const res = await axios.get(`${instance}/api/v1${endpoint}`, { 
                timeout: 6000,
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json' // 明示的にJSONを要求
                },
                signal: controller.signal
            });

            // 重要：レスポンスがHTML（<!DOCTYPE...）なら失敗扱いにする
            if (typeof res.data === 'string' && res.data.includes('<!DOCTYPE')) {
                throw new Error("Received HTML instead of JSON");
            }

            // データがオブジェクトでない場合も弾く
            if (typeof res.data !== 'object') {
                throw new Error("Invalid response format");
            }

            controller.abort(); // 成功したので他をキャンセル
            return res.data;
        } catch (err) {
            throw err;
        }
    });

    return await Promise.any(requests);
}

app.get('/api/watch', async (req, res) => {
    const videoId = req.query.id || req.query.v;
    if (!videoId) return res.status(400).json({ error: 'Video ID is required' });

    try {
        const [metadata, streamData] = await Promise.all([
            fetchFromFastestInstance(`/videos/${videoId}`),
            axios.get(`https://ytdlpinstance-vercel.vercel.app/stream/${videoId}?f=18`, { timeout: 8000 })
                .then(r => r.data)
                .catch(() => ({ formats: [] }))
        ]);

        const processedData = injectYoutubeThumbnails(metadata, videoId);

        const format18 = streamData.formats?.find(f => f.itag === 18 || f.itag === "18");
        const finalStreamUrl = format18 ? format18.url : `https://ytdlpinstance-vercel.vercel.app/stream?v=${videoId}`;

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
        res.status(500).json({ error: '動画データの取得に失敗しました。', debug: error.message });
    }
});

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

app.use(express.static(path.join(__dirname, '../public')));

export default app;
