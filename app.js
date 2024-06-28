app.post("/merge-videos", upload.any(), async (req, res) => {
  try {
    const scenes = JSON.parse(req.body.scenes);
    const audioFile = req.files.find((file) => file.fieldname === "audioFile");

    if (!audioFile) {
      console.error("No audio file found. Audio file is mandatory.");
      return res
        .status(400)
        .send("No audio file found. Audio file is mandatory.");
    }

    const audioFilePath = path.join("uploads", audioFile.filename);
    const tempDir = utils.createTempDirectory();

    const sceneVideos = await videoProcessing.generateSceneVideos(
      scenes,
      tempDir,
      req
    );

    const mergedVideoPath = path.join(__dirname, "merged_video.mp4");
    await videoProcessing.mergeSceneVideos(
      sceneVideos,
      tempDir,
      mergedVideoPath
    );

    let finalVideoPath = mergedVideoPath;
    if (audioFilePath) {
      finalVideoPath = path.join(__dirname, "final_merged_video.mp4");
      await videoProcessing.mergeAudioWithVideo(
        mergedVideoPath,
        audioFilePath,
        finalVideoPath
      );
    }

    utils.cleanupTempDirectory(tempDir);

    const videoFileName = path.basename(finalVideoPath);
    const mergedVideoUrl = `${req.protocol}://${req.get(
      "host"
    )}/${videoFileName}`;
    console.log(mergedVideoUrl);

    if (!res.headersSent) {
      res.json({ videoUrl: mergedVideoUrl });
    }
  } catch (err) {
    console.error("Error generating videos:", err);
    if (!res.headersSent) {
      res.status(500).send("Error generating videos");
    }
  }
});
