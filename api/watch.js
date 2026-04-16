import fetch from 'node-fetch';

export default async function handler(req, res) {
  // CORSヘッダーの設定（フロントエンドからのリクエストを許可）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // プリフライトリクエストへの対応
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Video ID is required" });

  // サーバー（Vercel）経由でメタデータを取得するためのインスタンスリスト
  // 比較的安定しており、かつサーバーからのリクエストを拒否しにくいものを優先
  const INSTANCES = [
    'https://yewtu.be',
    'https://invidious.asir.dev',
    'https://inv.tux.pizza',
    'https://iv.ggtyler.dev',
    'https://invidious.projectsegfau.lt',
    'https://inv.river.group',
    'https://invidious.no-logs.com',
    'https://invidious.flokinet.to'
  ];

  // すべてのインスタンスに対して一斉にリクエストを送信（並列処理）
  const fetchTasks = INSTANCES.map(async (base) => {
    const instanceUrl = base.replace(/\/$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000); // 6秒でタイムアウト

    try {
      // サーバーサイドで Invidious API を叩く
      const response = await fetch(`${instanceUrl}/api/v1/videos/${id}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      if (!response.ok) throw new Error(`Status ${response.status}`);

      const data = await response.json();
      if (!data.title) throw new Error("Invalid data");

      // 動画ファイル（ストリーム）の取得先のみ、指定されたプロキシへ差し替える
      const streamUrl = `https://ytdlpinstance-vercel.vercel.app/stream?v=${id}`;

      const streams = [
        {
          url: streamUrl,
          quality: "720p",
          container: "mp4"
        }
      ];

      // フロントエンドが期待するデータ構造に整形
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
    } finally {
      clearTimeout(timeout);
    }
  });

  try {
    // Promise.any により、最も速く正常なデータを返したサーバーの採用
    const fastestResult = await Promise.any(fetchTasks);
    return res.status(200).json(fastestResult);
  } catch (error) {
    // 全てのインスタンスがサーバー側で拒否された、またはダウンしている場合
    console.error("Critical: All instances failed via server-side fetch.");
    res.status(500).json({ 
      error: "Metadata fetch failed", 
      message: "Server was unable to retrieve video info from any Invidious instance.",
      debug: error.message 
    });
  }
}
