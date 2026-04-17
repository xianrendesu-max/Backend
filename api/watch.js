import express from 'express';
import cors from 'cors';
import { Innertube } from 'youtubei.js';

const app = express();
app.use(cors());

let youtube;

// YouTubeクライアントの初期化用関数
async function getYoutubeClient() {
  if (!youtube) {
    youtube = await Innertube.create({
      lang: "ja",
      location: "JP",
      retrieve_player: true,
    });
    console.log("YouTube Client (youtubei.js) Initialized");
  }
  return youtube;
}

// サーバー起動時に初期化を開始
(async () => {
  try {
    await getYoutubeClient();
  } catch (e) {
    console.error("Failed to initialize YouTube Client:", e);
  }
})();

app.get('/api/watch', async (req, res) => {
  const videoId = req.query.id || req.query.v;

  if (!videoId) {
    return res.status(400).json({ error: "Video ID is required" });
  }

  try {
    const client = await getYoutubeClient();

    if (!client) {
      return res.status(503).json({ error: "Client not ready" });
    }

    // 動画詳細情報とコメントを取得
    const [videoInfo, commentSection] = await Promise.all([
      client.getInfo(videoId),
      client.getComments(videoId).catch(() => ({ contents: [] }))
    ]);

    const basicInfo = videoInfo.basic_info;

    // コメントの整形
    const commentThreads = commentSection.contents || [];
    const comments = commentThreads.map((thread) => {
      const c = thread.comment;
      return {
        author: c.author?.name || "匿名",
        authorIcon: c.author?.thumbnails?.?.url || null,
        text: c.content?.toString() || "",
        date: c.published_time || "",
        likes: c.like_count || 0,
      };
    });

    // フロントエンドが期待する形式に厳密にマッピング
    const responseData = {
      title: basicInfo.title || "無題の動画",
      description: basicInfo.short_description || basicInfo.description || "",
      author: basicInfo.author || (videoInfo.primary_info?.owner?.author?.name) || "不明なチャンネル",
      authorId: basicInfo.channel_id,
      authorIcon: videoInfo.primary_info?.owner?.author?.thumbnails?.?.url || "",
      views: basicInfo.view_count?.toLocaleString() || "0",
      published: basicInfo.is_live ? "ライブ配信中" : (videoInfo.primary_info?.published?.toString() || "公開済み"),
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      recommended: videoInfo.watch_next_feed?.contents?.map(v => ({
        id: v.id,
        title: v.title?.toString(),
        author: v.author?.name,
        view_count_text: v.short_view_count?.toString(),
        thumbnail: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`
      })).filter(v => v.id) || [],
      commentCount: commentSection.header?.count?.text || "0",
      comments: comments
    };

    res.json(responseData);

  } catch (err) {
    console.error(`[ERROR][${videoId}]`, err);
    res.status(500).json({ error: "動画情報の取得に失敗しました。" });
  }
});

// ストリーミング用エンドポイントの追加 (HTML側の api/getstream.js に対応)
app.get('/api/getstream.js', async (req, res) => {
  const videoId = req.query.v;
  if (!videoId) return res.status(400).send("ID required");

  try {
    const client = await getYoutubeClient();
    const stream = await client.download(videoId, {
      type: 'video+audio',
      quality: 'best',
      format: 'mp4'
    });

    res.setHeader('Content-Type', 'video/mp4');
    for await (const chunk of stream) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    console.error("Stream Error:", err);
    res.status(500).send("Stream Error");
  }
});

export default app;
