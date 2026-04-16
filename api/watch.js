import fetch from 'node-fetch';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Video ID is required" });

  const INSTANCES = [
    'https://inv.nadeko.net/',
    'https://invidious.f5.si/',
    'https://invidious.lunivers.trade/',
    'https://invidious.ducks.party/',
    'https://iv.melmac.space/',
    'https://invidious.nerdvpn.de/',
    "https://invidious.privacyredirect.com",
    "https://invidious.technicalvoid.dev",
    "https://invidious.darkness.services",
    "https://invidious.nikkosphere.com",
    "https://invidious.schenkel.eti.br",
    "https://invidious.tiekoetter.com",
    "https://invidious.perennialte.ch",
    "https://invidious.reallyaweso.me",
    "https://invidious.private.coffee",
    "https://invidious.privacydev.net"
  ];

  // 各インスタンスへのリクエストを作成
  const fetchTasks = INSTANCES.map(async (base) => {
    const instanceUrl = base.replace(/\/$/, "");
    const response = await fetch(`${instanceUrl}/api/v1/videos/${id}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
      },
      timeout: 5000 
    });

    if (!response.ok) {
      throw new Error(`Instance ${instanceUrl} failed: ${response.status}`);
    }

    const data = await response.json();

    const streams = (data.formatStreams || []).map(s => ({
      url: s.url,
      quality: s.qualityLabel,
      container: s.container
    }));

    const recommended = (data.recommendedVideos || []).map(rv => ({
      id: rv.videoId,
      title: rv.title,
      author: rv.author,
      views: rv.viewCountText,
      thumbnail: rv.videoThumbnails?.[0]?.url || ""
    }));

    return {
      title: data.title,
      description: data.description,
      author: data.author,
      views: data.viewCount?.toLocaleString() || "0",
      published: data.publishedText,
      streams: streams,
      recommended: recommended
    };
  });

  try {
    // 最も速く完了した成功リクエストを取得
    const fastestResult = await Promise.any(fetchTasks);
    return res.status(200).json(fastestResult);
  } catch (error) {
    // 全てのインスタンスが失敗した場合
    console.error("All instances failed:", error);
    res.status(500).json({ 
      error: "Video load failed", 
      details: "All instances failed to return a valid response simultaneously.",
      last_error: error.message 
    });
  }
}
