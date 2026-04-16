import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { q } = req.query;
  const INSTANCE = 'https://inv.riverside.rocks';

  try {
    const response = await fetch(`${INSTANCE}/api/v1/search?q=${encodeURIComponent(q)}&region=JP`);
    const data = await response.json();

    const result = data
      .filter(i => i.type === 'video') // 動画のみ抽出
      .map(v => ({
        id: v.videoId,
        title: v.title,
        thumbnail: v.videoThumbnails[0].url,
        author: v.author,
        views: v.viewCountText,
        published: v.publishedText
      }));

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Search failed" });
  }
}
