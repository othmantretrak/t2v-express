const express = require("express");
const path = require("path");
const multer = require("multer");
const cors = require("cors");
const videoProcessing = require("./videoProcessing");
const utils = require("./utils");
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware to parse JSON request bodies
app.use(express.json());
app.use(cors());

// Configure multer for file uploads
const upload = multer({ dest: "uploads/" });

// Endpoint to generate and merge videos with audio
app.post("/merge-videos", upload.any(), async (req, res) => {
  try {
    const scenes = JSON.parse(req.body.scenes);
    const audioFile = req.files.find((file) => file.fieldname === "audioFile");

    if (!audioFile) {
      console.error("No audio file found. Audio file is mandatory.");
      return [];
    }
    const audioFilePath = path.join("uploads", audioFile.filename);
    // Create a temporary directory to store individual scene videos
    const tempDir = utils.createTempDirectory();

    // Generate videos for each scene and store them in the temp directory
    const sceneVideos = await videoProcessing.generateSceneVideos(
      scenes,
      tempDir,
      req
    );

    // Merge the individual scene videos into a single video
    const mergedVideoPath = path.join(__dirname, "merged_video.mp4");
    await videoProcessing.mergeSceneVideos(
      sceneVideos,
      tempDir,
      mergedVideoPath
    );

    // If an audio file is provided, merge it with the video
    if (audioFilePath) {
      const finalVideoPath = path.join(__dirname, "final_merged_video.mp4");
      await videoProcessing.mergeAudioWithVideo(
        mergedVideoPath,
        audioFilePath,
        finalVideoPath
      );

      // Cleanup temporary directory after processing
      utils.cleanupTempDirectory(tempDir);

      // Send the merged video URL as the response
      const mergedVideoUrl = `${req.protocol}://${req.get(
        "host"
      )}/final_merged_video.mp4`;
      console.log(mergedVideoUrl);
      res.json({ videoUrl: mergedVideoUrl });
    } else {
      // Cleanup temporary directory after processing
      utils.cleanupTempDirectory(tempDir);

      // Send the merged video URL as the response
      const mergedVideoUrl = `${req.protocol}://${req.get(
        "host"
      )}/merged_video.mp4`;
      res.json({ videoUrl: mergedVideoUrl });
    }
  } catch (err) {
    console.error("Error generating videos:", err);
    res.status(500).send("Error generating videos");
  }
});

// Serve static files (for accessing the merged video)
app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
