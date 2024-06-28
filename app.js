const express = require("express");
const path = require("path");
const multer = require("multer");
const cors = require("cors");
const videoProcessing = require("./videoProcessing");
const utils = require("./utils");
const cloudinary = require("./cloudinaryConfig");
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

app.get("/api/cloudinary-videos", async (req, res) => {
  try {
    const prefix = "t2v/videos";
    const result = await cloudinary.api.resources({
      resource_type: "video",
      max_results: 500,
      prefix,
      type: "upload",
    });

    const videosWithDuration = await Promise.all(
      result.resources.map(async (video) => {
        const videoInfo = await cloudinary.api.resource(video.public_id, {
          resource_type: "video",
          image_metadata: true, // Include metadata in the response
        });
        console.log(videoInfo);
        return {
          publicId: video.public_id,
          duration: videoInfo.duration,
          url: video.secure_url,
          title: videoInfo.tags,
          thumbnail: getThumbnailUrl(video.secure_url),
        };
      })
    );

    res.json(videosWithDuration);

    //res.json(result.resources);
  } catch (error) {
    console.error("Error fetching videos:", error);
    res.status(500).json({ error: "Failed to fetch videos" });
  }
});
function getThumbnailUrl(videoUrl) {
  // Check if the URL ends with .mp4
  if (videoUrl.endsWith(".mp4")) {
    // Replace .mp4 with .jpg
    return videoUrl.replace(".mp4", ".jpg");
  } else {
    // If the URL doesn't end with .mp4, return the original URL
    console.error("The provided URL does not end with .mp4");
    return videoUrl;
  }
}
// Serve static files (for accessing the merged video)
app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
