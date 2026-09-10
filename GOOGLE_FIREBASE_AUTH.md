# Hướng Dẫn Tích Hợp Đăng Nhập Google Firebase (Node.js Express + React Vite)

Tài liệu này hướng dẫn chi tiết cách tích hợp tính năng **Google Login (Firebase Authentication)** tiếp nối theo kiến trúc của dự án `auth-api-tutorial` (Node.js CommonJS + Express + MongoDB + JWT) và xây dựng ứng dụng Frontend React (Vite) đầy đủ từ A-Z.

---

## **1. Tổng quan luồng hoạt động (Architecture Flow)**

```text
[ React Frontend ]                  [ Node.js Backend ]               [ Firebase Console ]
       │                                     │                                 │
       │── 1. Đăng nhập Google Popup ───────>│                                 │
       │   (signInWithPopup + GoogleAuthProvider)                              │
       │                                     │                                 │
       │<── 2. Nhận Firebase ID Token ───────│                                 │
       │                                     │                                 │
       │── 3. POST /api/auth/google-login ──>│                                 │
       │      Body: { idToken }              │                                 │
       │                                     │── 4. Verify ID Token ──────────>│
       │                                     │   (firebase-admin)              │
       │                                     │                                 │
       │                                     │<── 5. Trả về thông tin User ────│
       │                                     │   (uid, email, name, picture)   │
       │                                     │                                 │
       │                                     │── 6. Tìm/Tạo User trong MongoDB │
       │                                     │── 7. Ký JWT của hệ thống mình   │
       │                                     │                                 │
       │<── 8. Trả về User + System JWT ─────│                                 │
       │                                     │                                 │
       │── 9. Dùng JWT cho các API khác ────>│                                 │
       │   (Header: Bearer <system_jwt>)     │                                 │
```

---

## **2. Cấu hình Firebase Console**

### **Bước 1: Tạo project và kích hoạt Google Sign-In**
1. Truy cập [Firebase Console](https://console.firebase.google.com/).
2. Nhấn **Add project** (hoặc chọn project có sẵn) và hoàn tất các bước tạo.
3. Trong menu bên trái, vào **Build** -> **Authentication** -> chọn tab **Sign-in method**.
4. Chọn **Google** -> Bật toggle **Enable** -> Chọn **Support email for project** -> Nhấn **Save**.

### **Bước 2: Lấy Service Account Private Key cho Backend**
1. Vào **Project Settings** (biểu tượng bánh răng cạnh *Project Overview*).
2. Chuyển sang tab **Service accounts**.
3. Chọn **Node.js** và nhấn nút **Generate new private key** -> Xác nhận tải về file JSON.
4. Đổi tên file tải về thành:
   ```text
   auth-login-firebase.json
   ```
5. Đặt file này tại **thư mục gốc của Backend** (ngang hàng với `package.json`).
6. Thêm file vào `.gitignore` để không bị lộ secret key lên Git:
   ```gitignore
   # .gitignore
   auth-login-firebase.json
   ```

### **Bước 3: Lấy Firebase Config cho Frontend Web App**
1. Cũng trong **Project Settings** -> tab **General**.
2. Cuộn xuống mục **Your apps** -> Nhấn biểu tượng Web `</>` để tạo Web App.
3. Đặt tên app (ví dụ: `auth-client-app`) -> Nhấn **Register app**.
4. Copy đoạn cấu hình `firebaseConfig`:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "your-project-id.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project-id.firebasestorage.app",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

---

## **3. Cập nhật Backend (Node.js Express)**

### **3.1. Cài đặt thư viện**
Chạy lệnh sau tại thư mục gốc của backend:

```bash
npm install firebase-admin
```

---

### **3.2. Tạo module Firebase Admin (`src/config/firebase.js`)**

Tạo file `src/config/firebase.js` với quy ước **CommonJS** đồng bộ toàn bộ repo:

```javascript
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccountPath = path.join(__dirname, "../../auth-login-firebase.json");

if (!fs.existsSync(serviceAccountPath)) {
  console.warn(
    "[Firebase Warning] Không tìm thấy file 'auth-login-firebase.json' ở thư mục gốc."
  );
} else {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

module.exports = admin;
```

---

### **3.3. Cập nhật User Model (`src/models/user.model.js`)**

Hỗ trợ lưu thông tin đăng nhập Google (avatar, googleId, authType) và cho phép `password` không bắt buộc với tài khoản Google:

```javascript
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
      // Bắt buộc nếu đăng nhập thường, không bắt buộc nếu dùng Google OAuth
      required: function () {
        return this.authType === "local";
      },
      minlength: [6, "Password phải có ít nhất 6 ký tự"],
      select: false
    },
    googleId: {
      type: String,
      default: null
    },
    avatar: {
      type: String,
      default: "default.jpg"
    },
    authType: {
      type: String,
      enum: ["local", "google"],
      default: "local"
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

---

### **3.4. Thêm Controller `googleLogin` (`src/controllers/auth.controller.js`)**

Thêm xử lý xác thực Firebase ID Token và cấp phát JWT của hệ thống:

```javascript
const admin = require("../config/firebase");

/**
 * POST /api/auth/google-login
 * Nhận Firebase ID Token -> Xác thực qua Firebase Admin SDK -> Tìm hoặc tạo User -> Ký JWT hệ thống.
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

    // 1. Xác thực ID Token qua Firebase Admin SDK
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      if (err.code === "auth/id-token-expired") {
        return res.status(401).json({
          message: "Firebase ID Token đã hết hạn",
          error: "Unauthorized",
          statusCode: 401
        });
      }
      return res.status(401).json({
        message: "Firebase ID Token không hợp lệ",
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

    // 2. Tìm User trong Database
    let user = await User.findOne({ email: normalizedEmail });

    if (user) {
      // Nếu đã có tài khoản: cập nhật thêm googleId/avatar nếu trước đó đăng ký local
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
      // 3. Nếu chưa có tài khoản: tạo User mới với authType = 'google'
      user = await User.create({
        name: name || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        googleId: uid,
        avatar: picture || "default.jpg",
        authType: "google",
        role: "user"
      });
    }

    // 4. Ký JWT của hệ thống (dùng chung quy ước với login thường)
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
      message: "Đăng nhập Google thành công",
      user: removePassword(user),
      token,
      expiresIn
    });
  } catch (error) {
    next(error);
  }
};
```

*Đừng quên export `googleLogin` trong `src/controllers/auth.controller.js`.*

---

### **3.5. Cập nhật Route (`src/routes/auth.routes.js`)**

```javascript
const {
  register,
  login,
  googleLogin,
  getMe,
  changePassword,
  logout
} = require("../controllers/auth.controller");

// ...
router.post("/google-login", googleLogin);
```

---

## **4. Hướng dẫn chi tiết Frontend (React + Vite)**

### **4.1. Tạo dự án React Vite & Cài đặt thư viện**

1. Tạo dự án React Vite (nếu chưa có):
```bash
npm create vite@latest client -- --template react
cd client
npm install
```

2. Cài đặt thư viện Firebase Client SDK:
```bash
npm install firebase
```

---

### **4.2. Cấu trúc thư mục Frontend đề xuất**

```text
client/
├── .env.example
├── .env
├── package.json
├── src/
│   ├── firebase.js              # Cấu hình Firebase SDK Client
│   ├── App.jsx                  # Root App
│   ├── main.jsx
│   └── components/
│       └── GoogleLoginButton.jsx # Component nút bấm đăng nhập Google
```

---

### **4.3. Thiết lập biến môi trường Frontend (`client/.env`)**

```env
VITE_API_BASE_URL=http://localhost:3000/api/auth

# Firebase Web Config
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=724561475744
VITE_FIREBASE_APP_ID=1:724561475744:web:xxxx
```

---

### **4.4. Khởi tạo Firebase SDK Client (`src/firebase.js`)**

Tạo file `src/firebase.js`:

```javascript
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Lấy config từ biến môi trường Vite (.env.local)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Khởi tạo app Firebase Client
const app = initializeApp(firebaseConfig);

// Khởi tạo Auth và Google Provider
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Cấu hình prompt chọn tài khoản mỗi khi bấm login
googleProvider.setCustomParameters({
  prompt: "select_account"
});
```

---

### **4.5. Xây dựng Component Đăng nhập Google (`src/components/GoogleLoginButton.jsx`)**

Tạo component nút bấm popup đăng nhập và gửi `idToken` lên backend:

```jsx
import React, { useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api/auth";

export default function GoogleLoginButton({ onLoginSuccess, onLoginFailure }) {
  const [loading, setLoading] = useState(false);

  const handleLoginGoogle = async () => {
    setLoading(true);
    try {
      // 1. Mở popup đăng nhập tài khoản Google
      const result = await signInWithPopup(auth, googleProvider);
      
      // 2. Lấy Firebase ID Token từ user đăng nhập
      const idToken = await result.user.getIdToken();

      // 3. Gửi idToken lên Backend Node.js để verify
      const response = await fetch(`${API_BASE_URL}/google-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ idToken })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Đăng nhập Google thất bại từ server");
      }

      // 4. Lưu JWT của hệ thống vào localStorage
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      if (onLoginSuccess) {
        onLoginSuccess(data);
      }
    } catch (error) {
      console.error("Lỗi Google Sign-In:", error);
      if (onLoginFailure) {
        onLoginFailure(error.message || "Đăng nhập Google không thành công");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLoginGoogle}
      disabled={loading}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        padding: "10px 18px",
        backgroundColor: "#ffffff",
        color: "#3c4043",
        border: "1px solid #dadce0",
        borderRadius: "6px",
        fontSize: "14px",
        fontWeight: "500",
        cursor: loading ? "not-allowed" : "pointer",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        transition: "background-color .2s, box-shadow .2s"
      }}
    >
      <svg width="18" height="18" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      {loading ? "Đang kết nối Google..." : "Đăng nhập bằng Google"}
    </button>
  );
}
```

---

### **4.6. Sử dụng trong App (`src/App.jsx`)**

Tích hợp nút đăng nhập, hiển thị thông tin User và gọi API `/api/auth/me` để kiểm tra JWT hệ thống:

```jsx
import React, { useState, useEffect } from "react";
import GoogleLoginButton from "./components/GoogleLoginButton";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api/auth";

export default function App() {
  const [user, setUser] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Kiểm tra token đã lưu khi load trang
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      fetch(`${API_BASE_URL}/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.user) {
            setUser(data.user);
          } else {
            handleLogout();
          }
        })
        .catch(() => handleLogout());
    }
  }, []);

  const handleLoginSuccess = (data) => {
    setUser(data.user);
    setErrorMsg("");
  };

  const handleLoginFailure = (msg) => {
    setErrorMsg(msg);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  return (
    <div style={{ maxWidth: 460, margin: "60px auto", fontFamily: "sans-serif", textAlign: "center", padding: 24, border: "1px solid #e0e0e0", borderRadius: 12 }}>
      <h2>Demo Google Firebase Login</h2>

      {errorMsg && (
        <div style={{ color: "#d32f2f", backgroundColor: "#ffebee", padding: 10, borderRadius: 6, marginBottom: 16 }}>
          {errorMsg}
        </div>
      )}

      {user ? (
        <div>
          <img
            src={user.avatar}
            alt={user.name}
            style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", marginBottom: 12 }}
          />
          <h3>{user.name}</h3>
          <p style={{ color: "#555" }}>{user.email}</p>
          <p>
            Role: <span style={{ fontWeight: "bold", color: "#1976d2" }}>{user.role}</span>
          </p>
          <p style={{ fontSize: 13, color: "#888" }}>Auth Type: {user.authType}</p>
          <button
            onClick={handleLogout}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              backgroundColor: "#f44336",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer"
            }}
          >
            Đăng xuất
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 24 }}>
          <p style={{ color: "#666", marginBottom: 16 }}>Nhấn nút bên dưới để đăng nhập:</p>
          <GoogleLoginButton
            onLoginSuccess={handleLoginSuccess}
            onLoginFailure={handleLoginFailure}
          />
        </div>
      )}
    </div>
  );
}
```

---

## **5. Hướng dẫn Test với REST Client (`tests/auth-api.http`)**

Thêm đoạn test sau vào file `tests/auth-api.http` để kiểm tra trực tiếp qua VS Code REST Client:

```http
### -------------------------------------------------------------------------
### GOOGLE LOGIN (Firebase Auth)
### -------------------------------------------------------------------------

# 1. Login bằng Firebase ID Token (Lấy ID Token từ frontend hoặc Firebase CLI)
POST {{authUrl}}/google-login
Content-Type: {{contentType}}

{
  "idToken": "PASTE_FIREBASE_ID_TOKEN_HERE"
}

###

# 2. Thiếu idToken -> mong đợi 400
POST {{authUrl}}/google-login
Content-Type: {{contentType}}

{
}

###

# 3. idToken không hợp lệ / giả mạo -> mong đợi 401
POST {{authUrl}}/google-login
Content-Type: {{contentType}}

{
  "idToken": "fake_token_123456"
}
```

---

## **6. Checklist kiểm tra**

- [ ] File `auth-login-firebase.json` đã đặt tại thư mục gốc Backend và nằm trong `.gitignore`.
- [ ] Model `User` hỗ trợ trường `googleId`, `avatar`, `authType` và `password` không bắt buộc với Google.
- [ ] API `POST /api/auth/google-login` xác thực `idToken` bằng Firebase Admin SDK thành công.
- [ ] Client SDK khởi tạo thành công với `initializeApp`, `getAuth`, `GoogleAuthProvider`.
- [ ] Nút `signInWithPopup(auth, googleProvider)` lấy được `idToken` và gửi lên server.
- [ ] Hệ thống tự tạo user mới hoặc liên kết user cũ, cấp phát System JWT dùng được cho route `/api/auth/me`.
