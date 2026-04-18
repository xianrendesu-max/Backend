export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  const { id, proxy_url } = req.query;

  // 動画バイナリのプロキシ処理 (proxy_urlがある場合)
  if (proxy_url) {
    try {
      const videoRes = await fetch(decodeURIComponent(proxy_url));
      const contentType = videoRes.headers.get('content-type');
      res.setHeader('Content-Type', contentType || 'video/mp4');
      
      const arrayBuffer = await videoRes.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    } catch (err) {
      return res.status(500).send("Proxy error");
    }
  }

  // 通常のストリーム情報取得
  if (!id) return res.status(400).json({ error: "ID required" });

  try {
    const targetUrl = `https://yudlp.vercel.app/stream/${id}`;
    const response = await fetch(targetUrl);
    const data = await response.json();

    // 再生URLを自分のサーバー経由のURLに書き換える
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const proxyBase = `${protocol}://${host}/api/stream?proxy_url=`;

    if (data.primaryUrl) {
      data.primaryUrl = proxyBase + encodeURIComponent(data.primaryUrl);
    }
    if (data.formats) {
      data.formats = data.formats.map(f => ({
        ...f,
        url: proxyBase + encodeURIComponent(f.url)
      }));
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
