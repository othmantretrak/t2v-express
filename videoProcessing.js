// videoProcessing.js
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
const path = require("path");
const utils = require("./utils");

ffmpeg.setFfprobePath(path.join("C:", "ffmpeg", "bin", "ffprobe.exe"));

ffmpeg.setFfmpegPath(ffmpegStatic);

exports.generateSceneVideos = async (scenes, tempDir, req) => {
  const sceneVideos = [];
  for (let i = 0; i < scenes.length; i++) {
    const { paragraph, videoUrlOrImageFile, duration } = scenes[i];
    const sceneVideoPath = path.join(tempDir, `scene_${i}.mp4`);

    if (typeof videoUrlOrImageFile === "string") {
      // Download the video file first
      const downloadedFilePath = path.join(tempDir, `downloaded_${i}.mp4`);
      await utils.downloadVideo(videoUrlOrImageFile, downloadedFilePath);

      // Process the downloaded video
      await new Promise((resolve, reject) => {
        ffmpeg(downloadedFilePath)
          .inputOptions([
            "-stream_loop",
            "-1", // Loop the input video indefinitely
          ])
          .noAudio()
          .duration(duration) // Set the output duration
          .outputOptions(["-vcodec", "libx264"])
          .output(sceneVideoPath)
          .on("start", (commandLine) => {
            console.log("Generating scene video with command: " + commandLine);
          })
          .on("end", () => {
            console.log("Processing remote video finished successfully");
            resolve();
          })
          .on("error", (err, stdout, stderr) => {
            console.error("Error: " + err.message);
            console.error("FFmpeg stderr: " + stderr);
            reject(err);
          })
          .run();
      });
    } else {
      // If videoUrlOrImageFile is a file, process the uploaded image
      const imageFile = req.files.find(
        (file) => file.fieldname === `imageFile-${i}`
      );
      if (imageFile) {
        const imageFilePath = path.join("uploads", imageFile.filename);
        await processImage(imageFilePath, sceneVideoPath, duration);
      } else {
        console.error(`No file found for imageFile-${i}`);
        continue; // Skip the scene with invalid data
      }
    }

    sceneVideos.push(sceneVideoPath);
  }
  return sceneVideos;
};

const processImage = async (imageFilePath, sceneVideoPath, duration) => {
  return new Promise((resolve, reject) => {
    ffmpeg(imageFilePath)
      .inputOptions([`-framerate 1/${duration}`])
      .complexFilter([
        {
          filter: "scale",
          options: {
            w: 1280,
            h: 720,
            force_original_aspect_ratio: "decrease",
            flags: "fast_bilinear",
          },
          outputs: "scaled", // Add an output label for this filter
        },
        {
          filter: "split",
          inputs: "scaled", // Use the output label from the previous filter as input
          outputs: ["original", "copy"],
        },
        {
          filter: "scale",
          inputs: "copy",
          options: {
            w: 32,
            h: 18,
            force_original_aspect_ratio: "increase",
            flags: "fast_bilinear",
          },
          outputs: "scaled_copy", // Add an output label for this filter
        },
        {
          filter: "gblur",
          options: {
            sigma: 10,
          },
          inputs: "scaled_copy", // Use the output label from the previous filter as input
          outputs: "blurred",
        },
        {
          filter: "scale",
          inputs: "blurred",
          options: {
            w: 1280,
            h: 720,
            flags: "fast_bilinear",
          },
          outputs: "blurred-copy",
        },
        {
          filter: "overlay",
          options: {
            x: "(main_w-overlay_w)/2",
            y: "(main_h-overlay_h)/2",
          },
          inputs: ["blurred-copy", "original"],
          outputs: "overlaid", // Add an output label for this filter
        },
        {
          filter: "setsar",
          inputs: "overlaid", // Use the output label from the previous filter as input
          options: "1",
        },
      ])
      .outputOptions(["-c:v libx264", "-r 30", "-pix_fmt yuv420p"])
      .on("start", (commandLine) => {
        console.log("Spawned FFmpeg with command: " + commandLine);
      })
      .on("progress", (progress) => {
        console.log("Processing: " + progress.percent + "% done");
      })
      .on("end", () => {
        console.log("Processing finished successfully");
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.error("Error: " + err.message);
        console.error("FFmpeg stderr: " + stderr);
        reject(err);
      })
      .save(sceneVideoPath);
  });
};

exports.mergeSceneVideos = async (sceneVideos, tempDir, outputPath) => {
  const concatFilePath = utils.createConcatFile(sceneVideos, tempDir);

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatFilePath)
      .inputOptions(["-f", "concat", "-safe", "0"])
      .outputOptions(["-c", "copy"])
      .output(outputPath)
      .on("start", (commandLine) => {
        console.log("Merging scene videos with command: " + commandLine);
      })
      .on("progress", (progress) => {
        console.log("Processing: " + progress.percent + "% done");
      })
      .on("end", () => {
        console.log(" Merging scene videos finished successfully");
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.error("Error: " + err.message);
        console.error("FFmpeg stderr: " + stderr);
        reject(err);
      })
      .run();
  });
};

exports.mergeAudioWithVideo = async (videoPath, audioFilePath, outputPath) => {
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioFilePath)
      .outputOptions(["-c:v", "copy", "-c:a", "aac"])
      .on("start", (commandLine) => {
        console.log("Merging audio with video:", commandLine);
      })
      .on("progress", (progress) => {
        console.log("Processing: " + progress.percent + "% done");
      })
      .on("end", () => {
        console.log(" Merging audio with video finished successfully");
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.error("Error: " + err.message);
        console.error("FFmpeg stderr: " + stderr);
        reject(err);
      })
      .save(outputPath);
  });
};
