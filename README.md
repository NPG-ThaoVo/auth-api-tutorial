# API Auth

# **Auth API — Topic Guide cho Intern**
 
> Bỏ qua phần setup project, cài package, tạo `.env` và error middleware. Các phần đó đã có sẵn trong project.
> 

## **Quy ước chung**

- Dùng CommonJS (`require`). Nếu project dùng ES Modules, đổi sang `import`.
- Không lưu password dạng plain text.
- Không đưa password vào JWT hoặc response.
- User đăng ký mới luôn có role `user`.
- `401` là lỗi xác thực; `403` là lỗi phân quyền.
- Sau mỗi topic phải chạy test trước khi tiếp tục.

## **Cấu trúc file cần tạo hoặc cập nhật**

```
src/
├── controllers/
│   └── auth.controller.js
├── middleware/
│   ├── auth.middleware.js
│   └── role.middleware.js
├── models/
│   └── user.model.js
├── routes/
│   └── auth.routes.js
├── app.js                    # Mount auth routes
└── server.js                 # Đã có từ project CRUD
```

## **Tổng quan dependency giữa các topic**

```
Topic 1: User Model + Password
        ↓
Topic 2: Register
        ↓
Topic 3: Login + JWT
        ↓
Topic 4: Auth Middleware + /me
        ↓
Topic 5: Change Password + Logout
        ↓
Topic 6: RBAC
        ↓
Topic 7: Route Integration + Error Contract
        ↓
Topic 8: End-to-End Test + Deploy
```

---

# **Topic 1 — User Model và bảo mật Password**

## **Mục tiêu**

Tạo model User có đủ thông tin để phục vụ Register, Login và RBAC. Password phải được bảo vệ ngay từ tầng model.

## **File cần sửa**

```
src/models/user.model.js
```

## **Việc cần làm**

Tạo hoặc cập nhật model với các field:

- `name`: tên người dùng.
- `email`: bắt buộc, unique, lowercase.
- `password`: bắt buộc, tối thiểu 6 ký tự, không select mặc định.
- `role`: chỉ nhận `user` hoặc `admin`, mặc định là `user`.

## **Code mẫu**

```jsx
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name là bắt buộc"],
      trim: true
    },
    email: {
      type: String,
      required: [true, "Email là bắt buộc"],
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: [true, "Password là bắt buộc"],
      minlength: 6,
      select: false
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
```

## **Cần hiểu**

`select: false` khiến password không xuất hiện trong query thông thường. Khi cần kiểm tra password ở Login hoặc Change Password, phải dùng:

```jsx
User.findOne({ email }).select("+password");
```

Không cho client tự quyết định role admin trong request Register.

## **Hoàn thành topic khi**

- [ ]  Model chạy không lỗi.
- [ ]  Có đủ `name`, `email`, `password`, `role`.
- [ ]  Role mặc định là `user`.
- [ ]  Query user bình thường không trả password.

---

# **Topic 2 — Register: Hash và lưu User**

## **Mục tiêu**

Triển khai đăng ký tài khoản, hash password bằng bcrypt và không trả password cho client.

## **Endpoint**

```
POST /api/auth/register
```

## **File cần sửa**

```
src/controllers/auth.controller.js
```

Nếu file chưa có, tạo file mới.

## **Luồng xử lý**

```
Nhận name, email, password
→ Validate dữ liệu
→ Chuẩn hóa email
→ Kiểm tra email đã tồn tại
→ Hash password
→ Lưu user
→ Trả user không có password
```

## **Bước 1: Import dependency và model**

```jsx
const bcrypt = require("bcryptjs");
const User = require("../models/user.model");
```

## **Bước 2: Tạo helper loại bỏ password**

```jsx
const removePassword = (user) => {
  const data = user.toObject();
  delete data.password;
  return data;
};
```

## **Bước 3: Viết controller Register**

```jsx
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
    const existingUser = await User.findOne({
      email: normalizedEmail
    });

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
```

## **Bước 4: Export controller**

```jsx
module.exports = {
  register
};
```

## **Bước 5: Test bằng Postman**

Request:

```
POST http://localhost:3000/api/auth/register
Content-Type: application/json
```

Body:

```json
{
  "name": "Nguyen Van A",
  "email": "user@example.com",
  "password": "123456"
}
```

## **Test bắt buộc**

| Trường hợp | Kết quả |
| --- | --- |
| Dữ liệu hợp lệ | `201` |
| Thiếu `name`, `email` hoặc `password` | `400` |
| Password dưới 6 ký tự | `400` |
| Email đã tồn tại | `409` |
| Response không có password | Đạt |
| MongoDB không lưu `123456` dạng plain text | Đạt |

## **Hoàn thành topic khi**

- [ ]  User được tạo thành công.
- [ ]  Password trong MongoDB là chuỗi hash.
- [ ]  Role tự động là `user`.
- [ ]  Client không nhận password.

---

# **Topic 3 — Login và JWT Authentication**

## **Mục tiêu**

Kiểm tra thông tin đăng nhập và cấp JWT có thời hạn một ngày.

## **Endpoint**

```
POST /api/auth/login
```

## **Luồng xử lý**

```
Nhận email, password
→ Tìm user theo email
→ Lấy password đã hash
→ bcrypt.compare
→ Tạo JWT
→ Trả token và user
```

## **Bước 1: Import JWT**

Trong `auth.controller.js`:

```jsx
const jwt = require("jsonwebtoken");
```

## **Bước 2: Viết controller Login**

```jsx
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
    const user = await User.findOne({
      email: normalizedEmail
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        message: "Email hoặc mật khẩu không đúng",
        error: "Unauthorized",
        statusCode: 401
      });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Email hoặc mật khẩu không đúng",
        error: "Unauthorized",
        statusCode: 401
      });
    }

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d"
      }
    );

    return res.status(200).json({
      message: "Đăng nhập thành công",
      user: removePassword(user),
      token,
      expiresIn: "1d"
    });
  } catch (error) {
    next(error);
  }
};
```

## **Bước 3: Cập nhật export**

```jsx
module.exports = {
  register,
  login
};
```

## **Payload JWT**

Chỉ lưu dữ liệu cần thiết:

```json
{
  "userId": "user-id",
  "role": "user"
}
```

Không lưu:

- Password.
- Số điện thoại nhạy cảm.
- Thông tin bí mật.
- Toàn bộ document User.

## **Test bằng Postman**

Request:

```
POST http://localhost:3000/api/auth/login
Content-Type: application/json
```

Body:

```json
{
  "email": "user@example.com",
  "password": "123456"
}
```

Lưu token trả về để dùng ở Topic 4.

| Trường hợp | Kết quả |
| --- | --- |
| Email/password đúng | `200` + token |
| Sai password | `401` |
| Email không tồn tại | `401` |
| Thiếu field | `400` |
| Response không có password | Đạt |
| JWT có `userId`, `role` | Đạt |
| JWT hết hạn sau một ngày | Đạt |

## **Hoàn thành topic khi**

- [ ]  Login đúng trả về JWT.
- [ ]  JWT có `userId` và `role`.
- [ ]  JWT có `expiresIn: "1d"`.
- [ ]  Sai thông tin đăng nhập trả `401`.
- [ ]  Password không xuất hiện trong response hoặc JWT.

---

# **Topic 4 — Authentication Middleware và Protected Route**

## **Mục tiêu**

Đọc JWT từ request, verify token và bảo vệ route `/me`.

## **File cần tạo**

```
src/middleware/auth.middleware.js
```

## **Luồng request**

```
Client gửi Authorization: Bearer <token>
→ Middleware lấy token
→ jwt.verify(token)
→ Gán payload vào req.user
→ next()
→ Controller xử lý request
```

## **Bước 1: Tạo middleware**

```jsx
const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Không tìm thấy token",
        error: "Unauthorized",
        statusCode: 401
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        message: "Token không hợp lệ",
        error: "Unauthorized",
        statusCode: 401
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Token không hợp lệ hoặc đã hết hạn",
      error: "Unauthorized",
      statusCode: 401
    });
  }
};

module.exports = authMiddleware;
```

## **Bước 2: Viết controller `/me`**

Thêm vào `src/controllers/auth.controller.js`:

```jsx
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
```

Cập nhật export:

```jsx
module.exports = {
  register,
  login,
  getMe
};
```

## **Bước 3: Tạo route**

Tạo `src/routes/auth.routes.js`:

```jsx
const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const {
  register,
  login,
  getMe
} = require("../controllers/auth.controller");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", authMiddleware, getMe);

module.exports = router;
```

Mount trong `src/app.js`:

```jsx
const authRoutes = require("./routes/auth.routes");

app.use("/api/auth", authRoutes);
```

## **Bước 4: Test `/me`**

Request:

```
GET http://localhost:3000/api/auth/me
Authorization: Bearer <token>
```

Trong Postman chọn **Authorization → Bearer Token**, sau đó dán token từ Login.

| Trường hợp | Kết quả |
| --- | --- |
| Không có Authorization | `401` |
| Không có chữ `Bearer` | `401` |
| Token giả | `401` |
| Token đúng | `200` |
| User không còn trong database | `404` |

## **Hoàn thành topic khi**

- [ ]  Middleware đọc được Bearer token.
- [ ]  Token hợp lệ được verify.
- [ ]  Payload được gắn vào `req.user`.
- [ ]  [ ] `/me` bị chặn khi không có token.
- [ ]  [ ] `/me` trả thông tin user khi token hợp lệ.
- [ ]  Response không có password.

---

# **Topic 5 — Account Management: Change Password và Logout**

## **Phần A — Change Password**

### **Mục tiêu**

Cho phép user đã đăng nhập đổi password sau khi xác nhận password cũ.

### **Endpoint**

```
PUT /api/auth/change-password
```

### **Luồng xử lý**

```
Verify token
→ Lấy user từ req.user.userId
→ Lấy password hiện tại
→ Compare oldPassword
→ Hash newPassword
→ Lưu password mới
```

### **Bước 1: Viết controller**

Thêm vào `src/controllers/auth.controller.js`:

```jsx
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

    const user = await User.findById(req.user.userId)
      .select("+password");

    if (!user) {
      return res.status(404).json({
        message: "Không tìm thấy người dùng",
        error: "NotFound",
        statusCode: 404
      });
    }

    const isOldPasswordValid = await bcrypt.compare(
      oldPassword,
      user.password
    );

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
```

### **Bước 2: Thêm route**

Trong `src/routes/auth.routes.js`:

```jsx
const {
  register,
  login,
  getMe,
  changePassword
} = require("../controllers/auth.controller");

router.put(
  "/change-password",
  authMiddleware,
  changePassword
);
```

### **Bước 3: Cập nhật export**

```jsx
module.exports = {
  register,
  login,
  getMe,
  changePassword
};
```

### **Test Change Password**

Request:

```
PUT http://localhost:3000/api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "oldPassword": "123456",
  "newPassword": "new123456"
}
```

| Trường hợp | Kết quả |
| --- | --- |
| Không có token | `401` |
| Sai password cũ | `401` |
| Password mới dưới 6 ký tự | `400` |
| Đổi thành công | `200` |
| Login bằng password cũ | Thất bại |
| Login bằng password mới | Thành công |

### **Hoàn thành Change Password khi**

- [ ]  Route có `authMiddleware`.
- [ ]  Password cũ được kiểm tra bằng `bcrypt.compare`.
- [ ]  Password mới được hash trước khi lưu.
- [ ]  Password cũ không còn login được sau khi đổi.

## **Phần B — Logout**

### **Mục tiêu**

Hiểu logout trong phiên bản JWT stateless.

### **Endpoint**

```
POST /api/auth/logout
```

JWT gửi qua Authorization header không thể bị xóa trực tiếp ở server. Vì vậy, trong bài này:

```
Logout = Client xóa token
```

### **Bước 1: Tạo controller**

```jsx
const logout = async (req, res) => {
  return res.status(200).json({
    message: "Đăng xuất thành công"
  });
};
```

### **Bước 2: Thêm route**

```jsx
router.post("/logout", logout);
```

### **Bước 3: Cập nhật export**

```jsx
module.exports = {
  register,
  login,
  getMe,
  changePassword,
  logout
};
```

Nếu có frontend:

```jsx
localStorage.removeItem("token");
```

Nếu chỉ dùng Postman, xóa token trong Authorization để mô phỏng logout.

> Token cũ vẫn có thể hợp lệ đến khi hết hạn. Muốn revoke ngay cần blacklist, token version hoặc session store.
> 

---

# **Topic 6 — Authorization và RBAC**

## **Mục tiêu**

Phân biệt hai khái niệm:

```
Authentication: User là ai?
Authorization: User được làm gì?
```

## **File cần tạo**

```
src/middleware/role.middleware.js
```

## **Bước 1: Tạo middleware phân quyền**

```jsx
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Bạn không có quyền truy cập",
        error: "Forbidden",
        statusCode: 403
      });
    }

    next();
  };
};

module.exports = authorizeRoles;
```

## **Bước 2: Tạo route admin để test**

Trong `src/routes/auth.routes.js`:

```jsx
const authorizeRoles = require("../middleware/role.middleware");

router.get(
  "/admin/dashboard",
  authMiddleware,
  authorizeRoles("admin"),
  (req, res) => {
    return res.status(200).json({
      message: "Bạn đã truy cập khu vực admin"
    });
  }
);
```

Thứ tự middleware bắt buộc:

```
authMiddleware
→ authorizeRoles("admin")
→ controller
```

## **Bước 3: Test RBAC**

1. Register một user.
2. Login để lấy token có role `user`.
3. Gọi route `/api/auth/admin/dashboard`.
4. Kết quả phải là `403`.
5. Đổi role user thành `admin` trong MongoDB.
6. Login lại để tạo token mới.
7. Gọi lại route.
8. Kết quả phải là `200`.

Nếu dùng MongoDB shell:

```jsx
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { role: "admin" } }
);
```

## **Phân biệt status code**

```
401 = Chưa xác thực hoặc token không hợp lệ
403 = Đã xác thực nhưng không đủ quyền
```

## **Hoàn thành topic khi**

- [ ]  User thường không truy cập được admin route.
- [ ]  Admin truy cập được admin route.
- [ ]  Route chạy qua auth middleware trước role middleware.
- [ ]  Client không thể tự đăng ký role admin.

---

# **Topic 7 — Route Integration và API Contract**

## **Mục tiêu**

Kiểm tra các controller, middleware và routes đã được kết nối đúng; toàn bộ API dùng response lỗi thống nhất.

## **Bước 1: Kiểm tra export controller**

Cuối `src/controllers/auth.controller.js` phải có đủ:

```jsx
module.exports = {
  register,
  login,
  getMe,
  changePassword,
  logout
};
```

## **Bước 2: Kiểm tra auth routes**

`src/routes/auth.routes.js` cần có dạng:

```jsx
const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const authorizeRoles = require("../middleware/role.middleware");
const {
  register,
  login,
  getMe,
  changePassword,
  logout
} = require("../controllers/auth.controller");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", authMiddleware, getMe);
router.put(
  "/change-password",
  authMiddleware,
  changePassword
);
router.post("/logout", logout);
router.get(
  "/admin/dashboard",
  authMiddleware,
  authorizeRoles("admin"),
  (req, res) => {
    res.json({ message: "Admin data" });
  }
);

module.exports = router;
```

## **Bước 3: Kiểm tra mount route**

Trong `src/app.js`:

```jsx
const authRoutes = require("./routes/auth.routes");

app.use("/api/auth", authRoutes);
```

## **Danh sách API cuối cùng**

| Method | Endpoint | Middleware | Mục đích |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Không | Đăng ký |
| `POST` | `/api/auth/login` | Không | Đăng nhập và nhận JWT |
| `GET` | `/api/auth/me` | `authMiddleware` | Lấy user hiện tại |
| `PUT` | `/api/auth/change-password` | `authMiddleware` | Đổi password |
| `POST` | `/api/auth/logout` | Không | Xác nhận logout phía client |
| `GET` | `/api/auth/admin/dashboard` | Auth + Admin | Test RBAC |

## **API error contract**

Các lỗi phải có cùng cấu trúc:

```json
{
  "message": "Email hoặc mật khẩu không đúng",
  "error": "Unauthorized",
  "statusCode": 401
}
```

Status code:

```
400 — Dữ liệu đầu vào không hợp lệ
401 — Chưa xác thực hoặc token không hợp lệ
403 — Không đủ quyền
404 — Không tìm thấy user
409 — Email đã tồn tại
500 — Lỗi server
```

## **Hoàn thành topic khi**

- [ ]  Tất cả controller được export đúng.
- [ ]  Tất cả route được mount đúng prefix `/api/auth`.
- [ ]  Protected route có `authMiddleware`.
- [ ]  Admin route có cả `authMiddleware` và `authorizeRoles`.
- [ ]  Error response có `message`, `error`, `statusCode`.

---

# **Topic 8 — End-to-End Test và Deploy**

## **Mục tiêu**

Chạy toàn bộ flow từ Register đến RBAC, sau đó deploy API lên Render.

## **Bước 1: Test local theo thứ tự**

### **1. Register**

```
POST /api/auth/register
```

```json
{
  "name": "Nguyen Van A",
  "email": "user@example.com",
  "password": "123456"
}
```

Kiểm tra `201`, không có password trong response và database lưu password dạng hash.

### **2. Login**

```
POST /api/auth/login
```

```json
{
  "email": "user@example.com",
  "password": "123456"
}
```

Copy token trả về.

### **3. Gọi `/me`**

```
GET /api/auth/me
Authorization: Bearer <token>
```

Mong đợi `200`.

### **4. Đổi password**

```
PUT /api/auth/change-password
Authorization: Bearer <token>
```

```json
{
  "oldPassword": "123456",
  "newPassword": "new123456"
}
```

Login lại bằng password mới.

### **5. Test user route admin**

```
GET /api/auth/admin/dashboard
Authorization: Bearer <user-token>
```

Mong đợi `403`.

### **6. Test admin route**

Đổi role trong database, login lại và gọi route bằng token mới. Mong đợi `200`.

### **7. Test logout**

```
POST /api/auth/logout
```

Mong đợi response `200`, sau đó xóa token ở client/Postman.

## **Bước 2: Kiểm tra Render configuration**

`package.json` phải có:

```json
{
  "scripts": {
    "start": "node src/server.js"
  }
}
```

Server phải dùng port của Render:

```jsx
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

Render settings:

```
Build Command: npm install
Start Command: npm start
```

Environment variables trên Render:

```
MONGO_URI=<MongoDB production connection string>
JWT_SECRET=<secret đủ dài và khó đoán>
NODE_ENV=production
```

Không dùng MongoDB `localhost` khi deploy. Render cần kết nối tới MongoDB Atlas hoặc database production tương đương.

## **Bước 3: Test production**

Thay localhost bằng URL Render:

```
POST https://<railway-domain>/api/auth/register
POST https://<railway-domain>/api/auth/login
GET  https://<railway-domain>/api/auth/me
PUT  https://<railway-domain>/api/auth/change-password
GET  https://<railway-domain>/api/auth/admin/dashboard
```

Nếu deploy lỗi, kiểm tra theo thứ tự:

1. Railway logs.
2. Start Command.
3. `process.env.PORT`.
4. `MONGO_URI`.
5. MongoDB Atlas Network Access.
6. `JWT_SECRET`.
7. Prefix `/api/auth`.

---

# **Checklist cuối cùng**

## **User và password**

- [ ]  User model có `name`, `email`, `password`, `role`.
- [ ]  Email unique và lowercase.
- [ ]  Password có `select: false`.
- [ ]  Password được hash bằng bcrypt.
- [ ]  Không response nào trả password.

## **Authentication**

- [ ]  Register hoạt động.
- [ ]  Login hoạt động.
- [ ]  JWT có `userId` và `role`.
- [ ]  JWT hết hạn sau một ngày.
- [ ]  Middleware đọc đúng Bearer token.
- [ ]  [ ] `/me` là protected route.

## **Account và authorization**

- [ ]  Change password kiểm tra password cũ.
- [ ]  Password mới được hash.
- [ ]  Logout được mô tả đúng là xóa token phía client.
- [ ]  User không truy cập được admin route.
- [ ]  Admin truy cập được admin route.
- [ ]  Phân biệt đúng `401` và `403`.