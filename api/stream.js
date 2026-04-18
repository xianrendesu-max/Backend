export default async function handler(req, res) {
  // CORSヘッダーの設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  // OPTIONSメソッド（プリフライトリクエスト）への対応
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const videoId = req.query.id || req.query.v;

  if (!videoId) {
    return res.status(400).json({ error: "Video ID is required" });
  }

  try {
    // 指定されたURL「yudlp.vercel.app/stream」を叩く
    // api/ を挟まない直下のパスに修正しました
    const targetUrl = `https://yudlp.vercel.app/stream?id=${videoId}`;
    
    const response = await fetch(targetUrl);
    
    if (!response.ok) {
      throw new Error(`External API responded with status: ${response.status}`);
    }

    const data = await response.json();

    // yudlp.vercel.app から返ってきた内容をそのまま返却
    res.status(200).json(data);

  } catch (err) {
    console.error(err);
    // エラー時もJSON形式を維持
    res.status(500).json({ 
      error: "ストリーム情報の取得に失敗しました。",
      details: err.message 
    });
  }
}
