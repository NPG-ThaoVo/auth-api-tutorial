/**
 * Topic 2 + 3 + 4 + 5: Auth controller
 * Đăng ký, đăng nhập (JWT), lấy thông tin hiện tại, đổi password, logout.
 * Quy ước: không lưu plain password, không đưa password vào JWT hay response.
 */
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const firebaseAdmin = require("../config/firebase");
const User = require("../models/user.model");

/**
 * Helper: loại bỏ password khỏi object trước khi trả về client.
 */
const removePassword = (user) => {
  const data = user.toObject();
  delete data.password;
  return data;
};

/**
 * Topic 2: POST /api/auth/register
 * Validate -> chuẩn hóa email -> check trùng -> hash -> lưu -> trả user không password.
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email và password là bắt buộc",
        error: "BadRequest",
        statusCode: 400
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password phải có ít nhất 6 ký tự",
        error: "BadRequest",
        statusCode: 400
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({
        message: "Email đã được đăng ký",
        error: "Conflict",
        statusCode: 409
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword
    });

    return res.status(201).json({
      message: "Đăng ký thành công",
      user: removePassword(user)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Topic 3: POST /api/auth/login
 * Tìm user kèm password -> bcrypt.compare -> ký JWT chứa userId và role.
 * Sai email hoặc sai password đều trả cùng một thông báo để không dò được tài khoản.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email và password là bắt buộc",
        error: "BadRequest",
        statusCode: 400
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).select("+password");

    if (!user) {
      return res.status(401).json({
        message: "Email hoặc mật khẩu không đúng",
        error: "Unauthorized",
        statusCode: 401
      });
    }

    if (!user.password) {
      return res.status(401).json({
        message: "Tài khoản này cần đăng nhập bằng Google",
        error: "Unauthorized",
        statusCode: 401
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Email hoặc mật khẩu không đúng",
        error: "Unauthorized",
        statusCode: 401
      });
    }

    const expiresIn = process.env.JWT_EXPIRES_IN || "1d";

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    return res.status(200).json({
      message: "Đăng nhập thành công",
      user: removePassword(user),
      token,
      expiresIn
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/google-login
 * Xác thực Firebase ID Token, sau đó tìm hoặc tạo user và cấp JWT của hệ thống.
 */
const googleLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        message: "idToken là bắt buộc",
        error: "BadRequest",
        statusCode: 400
      });
    }

    if (!firebaseAdmin) {
      return res.status(503).json({
        message: "Firebase Admin chưa được cấu hình",
        error: "ServiceUnavailable",
        statusCode: 503
      });
    }

    let decodedToken;
    try {
      decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
    } catch (error) {
      return res.status(401).json({
        message:
          error.code === "auth/id-token-expired"
            ? "Firebase ID Token đã hết hạn"
            : "Firebase ID Token không hợp lệ",
        error: "Unauthorized",
        statusCode: 401
      });
    }

    const { uid, email, name, picture } = decodedToken;

    if (!email) {
      return res.status(400).json({
        message: "Tài khoản Google không cung cấp email hợp lệ",
        error: "BadRequest",
        statusCode: 400
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    let user = await User.findOne({ email: normalizedEmail });

    if (user) {
      let updated = false;
      if (!user.googleId) {
        user.googleId = uid;
        updated = true;
      }
      if (picture && user.avatar === "default.jpg") {
        user.avatar = picture;
        updated = true;
      }
      if (updated) {
        await user.save();
      }
    } else {
      user = await User.create({
        name: name || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        googleId: uid,
        avatar: picture || "default.jpg",
        authType: "google"
      });
    }

    const expiresIn = process.env.JWT_EXPIRES_IN || "1d";
    const token = jwt.sign(
      { userId: user._id.toString(), role: user.role },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    return res.status(200).json({
      message: "Đăng nhập Google thành công",
      user: removePassword(user),
      token,
      expiresIn
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Topic 4: GET /api/auth/me
 * req.user do authMiddleware gắn vào sau khi verify JWT.
 */
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        message: "Không tìm thấy người dùng",
        error: "NotFound",
        statusCode: 404
      });
    }

    return res.status(200).json({
      message: "Lấy thông tin thành công",
      user: removePassword(user)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Topic 5A: PUT /api/auth/change-password
 * Bắt buộc kiểm tra password cũ bằng bcrypt.compare trước khi ghi password mới.
 */
const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        message: "oldPassword và newPassword là bắt buộc",
        error: "BadRequest",
        statusCode: 400
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "Password mới phải có ít nhất 6 ký tự",
        error: "BadRequest",
        statusCode: 400
      });
    }

    const user = await User.findById(req.user.userId).select("+password");

    if (!user) {
      return res.status(404).json({
        message: "Không tìm thấy người dùng",
        error: "NotFound",
        statusCode: 404
      });
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);

    if (!isOldPasswordValid) {
      return res.status(401).json({
        message: "Mật khẩu hiện tại không đúng",
        error: "Unauthorized",
        statusCode: 401
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.status(200).json({
      message: "Đổi mật khẩu thành công"
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Topic 5B: POST /api/auth/logout
 * JWT stateless nên server không "xóa" được token đã cấp.
 * Logout thực tế là client xóa token; endpoint này chỉ để xác nhận và log.
 * Muốn revoke ngay cần blacklist, token version hoặc session store.
 */
const logout = async (req, res) => {
  return res.status(200).json({
    message: "Đăng xuất thành công"
  });
};

module.exports = {
  register,
  login,
  googleLogin,
  getMe,
  changePassword,
  logout
};
