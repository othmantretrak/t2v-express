const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const cors = require("cors");
const axios = require("axios");
const videoProcessing = require("./videoProcessing");
const utils = require("./utils");
const cloudinary = require("./cloudinaryConfig");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());

// Configure multer for file uploads
const upload = multer({ dest: "uploads/" });

// Worker server URLs
//const WORKER_SERVERS = ["http://localhost:5001", "http://localhost:5002"];
const WORKER_SERVERS = [
  "https://server-worker1.onrender.com",
  "https://server-worker1-7o56.onrender.com",
];

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

    // Generate a unique job ID
    const jobId = Date.now().toString();

    // Start the video generation process asynchronously
    generateVideo(jobId, scenes, audioFile, req);

    // Respond immediately with a job ID
    res.json({
      jobId,
      statusUrl: `${req.protocol}://${req.get("host")}/video-status/${jobId}`,
    });
  } catch (err) {
    console.error("Error initiating video generation:", err);
    res.status(500).send("Error initiating video generation");
  }
});

async function generateVideo(jobId, scenes, audioFile, req) {
  updateJobStatus(jobId, "processing");
  try {
    // Distribute scenes to worker servers
    const fileBuffers = {};

    for (const file of req.files) {
      if (file.fieldname.startsWith("imageFile-")) {
        fileBuffers[file.fieldname] = await fs.promises.readFile(file.path);
      }
    }
    const workerTasks = distributeScenes(scenes, WORKER_SERVERS, fileBuffers);

    // Process scenes on worker servers
    const processedScenes = await processWorkerTasks(workerTasks);

    const sortedScenes = processedScenes
      .flat()
      .sort((a, b) => a.orderIndex - b.orderIndex);

    // Merge processed scenes
    const tempDir = utils.createTempDirectory();
    const mergedVideoPath = path.join(__dirname, `merged_video_${jobId}.mp4`);
    await videoProcessing.mergeSceneVideos(
      sortedScenes.map((scene) => scene.path),
      tempDir,
      mergedVideoPath
    );

    // Add audio to the merged video
    const audioFilePath = path.join("uploads", audioFile.filename);
    const finalVideoPath = path.join(
      __dirname,
      `final_merged_video_${jobId}.mp4`
    );
    await videoProcessing.mergeAudioWithVideo(
      mergedVideoPath,
      audioFilePath,
      finalVideoPath
    );

    // Clean up
    utils.cleanupTempDirectory(tempDir);

    // Generate video URL
    const videoFileName = path.basename(finalVideoPath);
    const videoUrl = `${req.protocol}://${req.get("host")}/${videoFileName}`;

    // Update job status (you'll need to implement this storage mechanism)
    updateJobStatus(jobId, "completed", videoUrl);
  } catch (error) {
    console.error("Error generating video:", error);
    updateJobStatus(jobId, "failed", null, error.message);
  }
}

function distributeScenes(scenes, workerServers, fileBuffers) {
  const tasks = [];
  for (let i = 0; i < scenes.length; i++) {
    const workerIndex = i % workerServers.length;
    if (!tasks[workerIndex])
      tasks[workerIndex] = { scenes: [], fileBuffers: {} };
    tasks[workerIndex].scenes.push({ ...scenes[i], orderIndex: i });
    if (scenes[i].imageFileName && fileBuffers[scenes[i].imageFileName]) {
      tasks[workerIndex].fileBuffers[scenes[i].imageFileName] = {
        type: "Buffer",
        data: Array.from(fileBuffers[scenes[i].imageFileName]),
      };
    }
  }
  return tasks.map((task, index) => ({
    url: workerServers[index],
    scenes: task.scenes,
    fileBuffers: task.fileBuffers,
  }));
}

async function processWorkerTasks(workerTasks) {
  const processedScenes = await Promise.all(
    workerTasks.map(async (task) => {
      const response = await axios.post(
        `${task.url}/process-scenes`,
        {
          scenes: task.scenes,
          fileBuffers: task.fileBuffers,
        },
        {
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data.processedScenes;
    })
  );
  return processedScenes.flat();
}

// Endpoint to check video generation status
app.get("/video-status/:jobId", (req, res) => {
  const jobId = req.params.jobId;
  const status = getJobStatus(jobId);

  if (status.status === "not_found") {
    return res.status(404).json({ error: "Job not found" });
  }

  res.json(status);
});

// Cloudinary video fetching endpoint
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
          image_metadata: true,
        });
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
  } catch (error) {
    console.error("Error fetching videos:", error);
    res.status(500).json({ error: "Failed to fetch videos" });
  }
});

function getThumbnailUrl(videoUrl) {
  if (videoUrl.endsWith(".mp4")) {
    return videoUrl.replace(".mp4", ".jpg");
  } else {
    console.error("The provided URL does not end with .mp4");
    return videoUrl;
  }
}

// Serve static files (for accessing the merged video)
app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Helper functions (you need to implement these)
const jobStatuses = new Map();
function updateJobStatus(jobId, status, videoUrl = null, error = null) {
  jobStatuses.set(jobId, {
    status,
    videoUrl,
    error,
    updatedAt: new Date().toISOString(),
  });
}

function getJobStatus(jobId) {
  const status = jobStatuses.get(jobId);
  if (!status) {
    return { status: "not_found" };
  }
  return status;
}
