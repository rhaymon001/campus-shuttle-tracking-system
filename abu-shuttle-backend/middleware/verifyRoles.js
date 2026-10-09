const verifyRole = (allowedRole) => {
  return (req, res, next) => {
    if (!req?.user?.role || !allowedRole.includes(req.user.role)) {
      return res.status(403).json({ message: "unauthorized!" });
    }

    next();
  };
};

export default verifyRole;