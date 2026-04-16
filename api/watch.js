import fetch from 'node-fetch';

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "ID is missing" });

  // 複数のインスタンスを候補に入れる（nadekoがAPI制限をかけている場合があるため）
  const INSTANCE = 'https://inv.nadeko.net'; 

  try {
    // タイムアウト付きでフェッチ
    const response = await fetch(`${INSTANCE}/api/v1/videos/${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Instance Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // ストリームの選別
    const streams = (data.formatStreams || []).map(s => ({
      url: s.url,
      quality: s.qualityLabel,
      container: s.container
    }));

    // 推奨動画の選別
    const recommended = (data.recommendedVideos || []).map(rv => ({
      id: rv.videoId,
      title: rv.title,
      author: rv.author,
      views: rv.viewCountText,
      thumbnail: rv.videoThumbnails?.find(t => t.quality === 'medium')?.url || rv.videoThumbnails?.[0]?.url || ""
    }));

    res.status(200).json({
      title: data.title,
      description: data.description,
      author: data.author,
      views: data.viewCount?.toLocaleString() || "0",
      published: data.publishedText,
      streams: streams,
      recommended: recommended
    });

  } catch (error) {
    console.error("Backend Error:", error.message);
    res.status(500).json({ error: "Failed to fetch from instance", details: error.message });
  }
}
