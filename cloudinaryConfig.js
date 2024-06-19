const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: "tretrak",
  api_key: "317273311843466",
  api_secret: "ENYWIJuFfn52oT-IpCrWQPB9cnU",
  secure: true,
});

module.exports = cloudinary;
