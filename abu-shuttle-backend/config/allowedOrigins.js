import dotenv from "dotenv";
dotenv.config();

// Local dev origins that are always allowed, so a fresh checkout works out of
// the box. Production origins come from ALLOWED_ORIGINS (comma-separated) —
// Render injects it (e.g. https://abu-shuttle-frontend.onrender.com).
const localOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
];

const allowedOrigins = [
  ...localOrigins,
  ...(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
];

export default allowedOrigins;