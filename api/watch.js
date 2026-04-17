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
    // クライアントが未準備なら準備できるまで待つ
    const client = await getYoutubeClient();

    if (!client) {
      return res.status(503).json({ error: "Client not ready" });
    }

    // 1. 動画詳細情報とコメントを並行して取得（ストリーム取得は除外）
    const [videoInfo, commentSection] = await Promise.all([
      client.getInfo(videoId),
      client.getComments(videoId).catch(() => ({ contents: [] })) // コメント失敗時は空配列
    ]);

    const basicInfo = videoInfo.basic_info;

    // 2. コメントの整形
    const commentThreads = commentSection.contents || [];
    const comments = commentThreads.map((thread) => {
      const c = thread.comment;
      return {
        author: (c.author && c.author.name) || "匿名",
        authorIcon: (c.author && c.author.thumbnails && c.author.thumbnails && c.author.thumbnails.url) || null,
        text: (c.content && c.content.toString()) || "",
        date: c.published_time || "",
        likes: c.like_count || 0,
      };
    });

    // 3. フロントエンド(watch.html)が期待するレスポンス形式にマッピング（streamsなし）
    const responseData = {
      title: (basicInfo.title && basicInfo.title.toString()) || "",
      description: basicInfo.short_description || (basicInfo.description && basicInfo.description.toString()) || "",
      author: basicInfo.author,
      authorId: basicInfo.channel_id,
      views: (basicInfo.view_count && basicInfo.view_count.toLocaleString()) || "0",
      published: basicInfo.is_live ? "ライブ配信中" : "公開済み",
      // サムネイルをYouTube公式から取得
      thumbnail: "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg",
      // 関連動画
      recommended: (videoInfo.watch_next_feed && videoInfo.watch_next_feed.contents && videoInfo.watch_next_feed.contents.map(v => ({
        id: v.id,
        title: v.title && v.title.toString(),
        author: v.author && v.author.name,
        views: v.short_view_count && v.short_view_count.toString(),
        thumbnail: "https://i.ytimg.com/vi/" + v.id + "/mqdefault.jpg"
      })).filter(v => v.id)) || [],
      // コメント情報
      commentCount: (commentSection.header && commentSection.header.count && commentSection.header.count.text) || "0",
      comments: comments
    };

    res.json(responseData);

  } catch (err) {
    console.error("[ERROR][" + videoId + "]", err);
    res.status(500).json({ error: "動画情報の取得に失敗しました。" });
  }
});

export default app;
