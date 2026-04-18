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

  const videoId = req.query.id || req.query.v;

  if (!videoId) {
    return res.status(400).json({ error: "Video ID is required" });
  }

  try {
    const client = await getYoutubeClient();
    const info = await client.getInfo(videoId);
    
    const streamingData = info.streaming_data || {};
    const formats = (streamingData.formats || []).concat(streamingData.adaptive_formats || []);
    
    const itag18 = formats.find(function(f) { return f.itag === 18; });
    const primaryUrl = itag18 ? itag18.url : (formats ? formats.url : "");

    res.status(200).json({
      primaryUrl: primaryUrl,
      formats: formats
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      error: "ストリーム情報の取得に失敗しました。",
      details: err.message 
    });
  }
}
