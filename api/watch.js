import fetch from 'node-fetch';

export default async function handler(req, res) {
  // CORSヘッダーの設定（フロントエンドからのアクセスを許可）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { id } = req.query;

  // 動画IDがない場合はエラー
  if (!id) {
    return res.status(400).json({ error: "Video ID is required" });
  }

  // 利用可能なInvidiousインスタンス
  const INSTANCE = 'https://inv.nadeko.net';

  try {
    const response = await fetch(`${INSTANCE}/api/v1/videos/${id}`);
    
    if (!response.ok) {
      throw new Error(`Instance responded with status: ${response.status}`);
    }

    const data = await response.json();

    // フロントエンドの watch.html が期待する構造にマッピング
    // 1. ストリームURLの抽出
    const streams = (data.formatStreams || []).map(s => ({
      url: s.url,
      quality: s.qualityLabel,
      container: s.container
    }));

    // 2. 関連動画のマッピング
    const recommended = (data.recommendedVideos || []).map(rv => ({
      id: rv.videoId,
      title: rv.title,
      author: rv.author,
      views: rv.viewCountText,
      thumbnail: rv.videoThumbnails ? rv.videoThumbnails.find(t => t.quality === 'medium')?.url || rv.videoThumbnails[0].url : ""
    }));

    // フロントエンドへレスポンスを返す
    res.status(200).json({
      title: data.title,
      description: data.description,
      author: data.author, // 投稿者名
      views: data.viewCount.toLocaleString(), // 視聴回数（カンマ区切り）
      published: data.publishedText, // 投稿日（"1日前" など）
      streams: streams,
      recommended: recommended
    });

  } catch (error) {
    console.error("Video load error:", error);
    res.status(500).json({ 
      error: "Video load failed", 
      message: error.message 
    });
  }
}
