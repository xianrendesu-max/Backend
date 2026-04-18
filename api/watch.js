import express from 'express';
import cors from 'cors';
import { Innertube } from 'youtubei.js';
import fetch from 'node-fetch';

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

// 関連動画のサムネイル base64 取得
async function getThumbnailBase64(videoId) {
  const imgUrl = "https://img.youtube.com/vi/" + videoId + "/mqdefault.jpg";
  try {
    const res = await fetch(imgUrl);
    if (!res.ok) return "";
    const buffer = Buffer.from(await res.arrayBuffer());
    return "data:image/jpeg;base64," + buffer.toString("base64");
  } catch (e) {
    return "";
  }
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
      client.getComments(videoId).catch(function() { return { contents: [] }; }) // コメント失敗時は空配列
    ]);

    const basicInfo = videoInfo.basic_info || {};

    // 2. コメントの整形
    const commentThreads = commentSection.contents || [];
    const comments = commentThreads.map(function(thread) {
      const c = thread.comment || {};
      return {
        author: (c.author && c.author.name) || "匿名",
        authorIcon: (c.author && c.author.thumbnails && c.author.thumbnails && c.author.thumbnails.url) || null,
        text: (c.content && c.content.toString()) || "",
        date: c.published_time || "",
        likes: c.like_count || 0,
      };
    });

    // 関連動画のパース
    const rawRelated = videoInfo.watch_next_feed || [];
    const related = await Promise.all(
      rawRelated.map(async function(item) {
        const id = item.id || item.video_id || 
                   (item.renderer_context && item.renderer_context.command_context && 
                    item.renderer_context.command_context.on_tap && 
                    item.renderer_context.command_context.on_tap.payload && 
                    item.renderer_context.command_context.on_tap.payload.videoId) || "";
        
        if (!id) return { id: null };
        const thumbnailBase64 = await getThumbnailBase64(id);

        return {
          id: id,
          title: (item.title && item.title.toString()) || (item.metadata && item.metadata.title && item.metadata.title.text) || "",
          author: (item.author && item.author.name) || (item.metadata && item.metadata.metadata && item.metadata.metadata.metadata_rows && item.metadata.metadata.metadata_rows && item.metadata.metadata.metadata_rows.metadata_parts && item.metadata.metadata.metadata_rows.metadata_parts && item.metadata.metadata.metadata_rows.metadata_parts.text && item.metadata.metadata.metadata_rows.metadata_parts.text.text) || "",
          views: (item.short_view_count && item.short_view_count.toString()) || (item.metadata && item.metadata.metadata && item.metadata.metadata.metadata_rows && item.metadata.metadata.metadata_rows && item.metadata.metadata.metadata_rows.metadata_parts && item.metadata.metadata.metadata_rows.metadata_parts && item.metadata.metadata.metadata_rows.metadata_parts.text && item.metadata.metadata.metadata_rows.metadata_parts.text.text) || "",
          thumbnail: thumbnailBase64 || ("https://i.ytimg.com/vi/" + id + "/mqdefault.jpg")
        };
      })
    );

    // 3. フロントエンド(watch.html)が期待するレスポンス形式にマッピング（streamsなし）
    const responseData = {
      title: (videoInfo.primary_info && videoInfo.primary_info.title && videoInfo.primary_info.title.text) || basicInfo.title || "",
      description: (videoInfo.secondary_info && videoInfo.secondary_info.description && videoInfo.secondary_info.description.text) || basicInfo.short_description || (basicInfo.description && basicInfo.description.toString()) || "",
      author: {
        id: basicInfo.channel_id || (videoInfo.secondary_info && videoInfo.secondary_info.owner && videoInfo.secondary_info.owner.author && videoInfo.secondary_info.owner.author.id) || "",
        name: basicInfo.author || (videoInfo.secondary_info && videoInfo.secondary_info.owner && videoInfo.secondary_info.owner.author && videoInfo.secondary_info.owner.author.name) || "",
        subscribers: (videoInfo.secondary_info && videoInfo.secondary_info.owner && videoInfo.secondary_info.owner.subscriber_count && videoInfo.secondary_info.owner.subscriber_count.text) || "",
        thumbnail: (videoInfo.secondary_info && videoInfo.secondary_info.owner && videoInfo.secondary_info.owner.author && videoInfo.secondary_info.owner.author.thumbnails && videoInfo.secondary_info.owner.author.thumbnails && videoInfo.secondary_info.owner.author.thumbnails.url) || ""
      },
      authorId: basicInfo.channel_id,
      views: (videoInfo.primary_info && videoInfo.primary_info.view_count && videoInfo.primary_info.view_count.view_count && videoInfo.primary_info.view_count.view_count.text) || (basicInfo.view_count && basicInfo.view_count.toLocaleString()) || "0",
      published: basicInfo.is_live ? "ライブ配信中" : ((videoInfo.primary_info && videoInfo.primary_info.relative_date && videoInfo.primary_info.relative_date.text) || "公開済み"),
      // サムネイルをYouTube公式から取得
      thumbnail: "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg",
      // 関連動画
      recommended: related.filter(function(v) { return v.id; }),
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
