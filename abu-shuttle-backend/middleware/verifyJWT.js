import jwt from "jsonwebtoken";
import User from "../models/User.js";

const verifyJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided!" }); // Unauthorized
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = await new Promise((resolve, reject) =>
      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) =>
        err ? reject(err) : resolve(decoded)
      )
    );

    // The token is signed and unexpired — but the account it names may no longer
    // exist (e.g. after a data reset that regenerates users with fresh _ids, or a
    // deleted/disabled account). Trusting a ghost id would let a stale session
    // create trips whose driver can never resolve on the tracking map, so the
    // row is re-validated before any request is authorized.
    const user = await User.findById(decoded.id).select("_id role name").lean();
    if (!user) {
      return res.status(401).json({
        message: "Account no longer exists — please log in again."
      });
    }

    // Attach user info to request object (authoritative values from the DB,
    // not the token, so role changes and deletions take effect immediately)
    req.user = { id: user._id, role: user.role, name: user.name };

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      // Token expired
      return res.status(401).json({ message: "Access token expired!" });
    }
    // Token exists but invalid signature/format
    return res.status(403).json({ message: "Invalid token from jwt!" });
  }
};

export default verifyJWT;