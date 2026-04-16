import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { id } = req.query;
  const INSTANCE = 'https://inv.nadeko.net';

  try {
    const response = await fetch(`${INSTANCE}/api/v1/videos/${id}`);
    const data = await response.json();

    // ストリームURLの抽出（最も高画質なものを優先）
    const streams = data.formatStreams.map(s => ({
      url: s.url,
      quality: s.qualityLabel,
      container: s.container
    }));

    res.status(200).json({
      title: data.title,
      description: data.description,
      streams: streams,
      recommended: data.recommendedVideos.map(rv => ({
        id: rv.videoId,
        title: rv.title,
        thumbnail: rv.videoThumbnails[0].url
      }))
    });
  } catch (error) {
    res.status(500).json({ error: "Video load failed" });
  }
}
