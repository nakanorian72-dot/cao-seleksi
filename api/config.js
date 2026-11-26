import { CONFIG } from "../config.js";

function send(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.end(JSON.stringify(payload));
}

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { status: false, message: "Method tidak diizinkan." });
  }

  return send(res, 200, {
    minFollowers: CONFIG.minFollowers,
    minVideoAgeMinutes: CONFIG.minVideoAgeMinutes,
    latestVideosToCheck: CONFIG.latestVideosToCheck,
    profileImageUrl: CONFIG.profileImageUrl || "",
    requiredCN: CONFIG.requiredCN,
    requiredHashtags: CONFIG.requiredHashtags,
    requiredBio: CONFIG.requiredBio,
    groups: CONFIG.groups
  });
}
