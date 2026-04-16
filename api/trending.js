import fetch from 'node-fetch';

export default async function handler(req, res) {
  // 安定しているInvidiousインスタンスを選択
  const INSTANCE = 'https://invidious.f5.si/'; 
  
  try {
    const response = await fetch(`${INSTANCE}/api/v1/trending?region=JP`);
    const data = await response.json();

    // フロントエンドのUIに合わせてデータを整形
    const result = data.map(v => ({
      id: v.videoId,
      title: v.title,
      thumbnail: v.videoThumbnails.find(t => t.quality === 'medium')?.url || v.videoThumbnails[0].url,
      author: v.author,
      views: v.viewCountText,
      published: v.publishedText
    }));

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch trending" });
  }
}
