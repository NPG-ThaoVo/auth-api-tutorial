const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const authorizeRoles = require("../middleware/role.middleware");
const {
  register,
  login,
  googleLogin,
  getMe,
  changePassword,
  logout
} = require("../controllers/auth.controller");

const router = express.Router();

// Public routes
router.post("/register", register);
router.post("/login", login);
router.post("/google-login", googleLogin);
router.post("/logout", logout);

// Protected routes
router.get("/me", authMiddleware, getMe);
router.put("/change-password", authMiddleware, changePassword);

// Admin route: authMiddleware BẮT BUỘC phải đứng trước authorizeRoles
router.get(
  "/admin/dashboard",
  authMiddleware,
  authorizeRoles("admin"),
  (req, res) => {
    res.json({ message: "Admin data" });
  }
);

module.exports = router;
