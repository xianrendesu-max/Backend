import { Innertube } from 'youtubei.js';

let youtube;

async function getYoutubeClient() {
  if (!youtube) {
    youtube = await Innertube.create({
      lang: "ja",
      location: "JP",
      retrieve_player: true,
    });
  }
  return youtube;
}

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
    const client = await getYoutubeClient();
    const info = await client.getInfo(videoId);
    
    const streamingData = info.streaming_data || {};
    // 全てのフォーマット（混合、ビデオのみ、オーディオのみ）を統合
    const formats = (streamingData.formats || []).concat(streamingData.adaptive_formats || []);
    
    // itag 18 を優先URLとして抽出
    const itag18 = formats.find(function(f) { return f.itag === 18; });
    // itag18がなければ最初のフォーマット、それもなければ空文字
    const primaryUrl = itag18 ? itag18.url : (formats ? formats.url : "");

    // 成功レスポンスの返却
    res.status(200).json({
      primaryUrl: primaryUrl,
      formats: formats
    });
  } catch (err) {
    console.error(err);
    // エラー時も必ずJSON形式で返却することでフロントエンドのパースエラーを防ぐ
    res.status(500).json({ 
      error: "ストリーム情報の取得に失敗しました。",
      details: err.message 
    });
  }
}
