import express from 'express';
import cors from 'cors';
import { Innertube } from 'youtubei.js';

const app = express();
app.use(cors());

let youtube;

// YouTubeクライアントの初期化
(async () => {
  try {
    youtube = await Innertube.create({
      lang: "ja",
      location: "JP",
      retrieve_player: true,
    });
    console.log("YouTube Client (youtubei.js) Initialized");
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
    if (!youtube) {
      return res.status(503).json({ error: "Client not ready" });
    }

    // 1. 動画詳細情報とコメントを並行して取得
    const [videoInfo, commentSection] = await Promise.all([
      youtube.getInfo(videoId),
      youtube.getComments(videoId).catch(() => ({ contents: [] })) // コメント失敗時は空配列
    ]);

    const basicInfo = videoInfo.basic_info;

    // 2. ストリームURLの構築 (指定されたプロキシを使用)
    const streamUrl = `https://ytdlpinstance-vercel.vercel.app/stream/${videoId}?f=18`;

    // 3. コメントの整形
    const commentThreads = commentSection.contents || [];
    const comments = commentThreads.map((thread) => {
      const c = thread.comment;
      return {
        author: c.author?.name || "匿名",
        authorIcon: c.author?.thumbnails?.[0]?.url || null,
        text: c.content?.toString() || "",
        date: c.published_time || "",
        likes: c.like_count || 0,
      };
    });

    // 4. フロントエンド(watch.html)が期待するレスポンス形式にマッピング
    const responseData = {
      title: basicInfo.title,
      description: basicInfo.description,
      author: basicInfo.author,
      authorId: basicInfo.channel_id,
      views: basicInfo.view_count?.toLocaleString() || "0",
      published: basicInfo.is_live ? "ライブ配信中" : "公開済み",
      // 動画ストリーム
      streams: [
        {
          url: streamUrl,
          quality: "720p",
          container: "mp4"
        }
      ],
      // サムネイルをYouTube公式から取得
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      // 関連動画
      recommended: videoInfo.watch_next_feed?.contents?.map(v => ({
        id: v.id,
        title: v.title?.toString(),
        author: v.author?.name,
        views: v.short_view_count?.toString(),
        thumbnail: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`
      })).filter(v => v.id) || [],
      // コメント情報
      commentCount: commentSection.header?.count?.text || "0",
      comments: comments
    };

    res.json(responseData);

  } catch (err) {
    console.error(`[ERROR][${videoId}]`, err);
    res.status(500).json({ error: "動画情報の取得に失敗しました。" });
  }
});

// 静的ファイルの設定などは環境に合わせて追加してください
export default app;
