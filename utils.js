// utils.js
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

exports.downloadVideo = async (url, filepath) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.statusText}`);
  }
  const buffer = await response.buffer();
  fs.writeFileSync(filepath, buffer);
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
