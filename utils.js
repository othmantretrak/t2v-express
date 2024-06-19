// utils.js
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

exports.downloadVideo = async (url, filepath) => {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
      },
    });
    const buffer = await response.data;
    fs.writeFileSync(filepath, buffer);
    console.log(`Video downloaded successfully to ${outputPath}`);
  } catch (error) {
    if (error.response) {
      console.error(
        `Failed to download video: ${error.response.status} ${error.response.statusText}`
      );
      console.error(`Response data: ${error.response.data}`);
    } else if (error.request) {
      console.error(`No response received: ${error.request}`);
    } else {
      console.error(`Error setting up request: ${error.message}`);
    }
  }

  /*   const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.statusText}`);
  }
  const buffer = await response.buffer();
  fs.writeFileSync(filepath, buffer); */
};

exports.createTempDirectory = () => {
  const tempDir = path.join(__dirname, "temp");
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
};

exports.cleanupTempDirectory = (tempDir) => {
  fs.rmSync(tempDir, { recursive: true, force: true });
};

exports.createConcatFile = (sceneVideos, tempDir) => {
  const concatFilePath = path.join(tempDir, "concat.txt");
  fs.writeFileSync(
    concatFilePath,
    sceneVideos.map((video) => `file '${video}'`).join("\n")
  );
  return concatFilePath;
};
