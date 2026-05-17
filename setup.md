# 部署指南：GitHub Pages + Firebase

## 第一步：创建 Firebase 项目

1. 打开 [console.firebase.google.com](https://console.firebase.google.com)
2. 点击"添加项目"，取个名字（比如 `cici-fitness`），一路 Continue
3. 进入项目后，左侧导航 → **Build → Firestore Database**
   - 点击"创建数据库"
   - 选择 **生产模式**，选一个离你近的区域（europe-west2 = 伦敦）
4. 左侧导航 → **Build → Authentication**
   - 点击"开始使用"
   - 找到"匿名"，启用它

---

## 第二步：获取 Firebase 配置

1. 项目首页点击齿轮 ⚙️ → **项目设置**
2. 往下滚到"您的应用"，点击 **`</>`** 图标注册一个 Web 应用
3. 取个名字，点击"注册应用"
4. 复制出现的 `firebaseConfig` 对象，大概长这样：

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "cici-fitness.firebaseapp.com",
  projectId: "cici-fitness",
  storageBucket: "cici-fitness.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

5. 打开 `index.html`，找到文件顶部标注了 `── Firebase 配置 ──` 的那段，替换进去

---

## 第三步：设置 Firestore 安全规则

在 Firebase 控制台 → Firestore Database → **规则** 标签页，替换成：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /fitness/{userId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }
  }
}
```

点击"发布"。这确保每个人只能读写自己的数据。

---

## 第四步：部署到 GitHub Pages

```bash
# 1. 在 GitHub 创建一个新的 repository（public 或 private 都行）
# 2. 在本地：

git init
git add index.html
git commit -m "init"
git remote add origin https://github.com/你的用户名/仓库名.git
git push -u origin main
```

然后：
1. 打开 GitHub 仓库页面
2. Settings → Pages
3. Source 选 **Deploy from a branch**
4. Branch 选 `main`，目录选 `/ (root)`
5. Save

等 1-2 分钟，访问 `https://你的用户名.github.io/仓库名`

---

## 工作原理

- 每次打开页面，Firebase **匿名登录**会自动生成一个持久化的用户 ID（存在浏览器里）
- 设置、计划、打卡进度都保存在 Firestore 的 `/fitness/{uid}` 文档里
- 只要在同一个浏览器打开，数据就会恢复
- 如果换设备，数据会重置（匿名登录没有账号系统）——如果需要跨设备同步，下一步可以加 Google 登录

---

## 可选：加 Google 登录（跨设备同步）

在 Firebase Authentication → 登录方式 → Google → 启用

然后在 `index.html` 的 `auth.signInAnonymously()` 那段替换成：

```js
const provider = new firebase.auth.GoogleAuthProvider();
auth.signInWithPopup(provider).then(result => {
  uid = result.user.uid;
  document.getElementById('sync-status').textContent = '已登录：' + result.user.displayName;
  loadSaved();
});
```

这样不同设备用同一个 Google 账号登录就能同步数据。