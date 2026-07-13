---
layout:     post
title:      "Vaultwarden 自架完整指南：用 Cloudflare Tunnel 反向代理 + 安全強化"
subtitle:   "Self-hosting Vaultwarden with Cloudflare Tunnel"
date:       2026-07-13
author:     "Allen"
headerImg: "https://img.allenspace.de/life-of-pix-door-bell-498392_1920.2r1zmwzmgfc0.webp"
headerMask: 0.7
catalog: true
tags:
    - Vaultwarden
    - Bitwarden
    - Cloudflare
    - Docker
    - Self-hosting
    - Security
---

自架密碼管理服務聽起來很硬核，但其實 Vaultwarden 搭配 Cloudflare Tunnel 設定起來十分簡單，設定一次後幾乎不用維護。不需要公網 IP、不用 DDNS、不用維護憑證、不用開防火牆規則。整個架構裡唯一露在外面的只有 Cloudflare，而 Cloudflare 本身基本上扛得住任何規模的 DDoS。

這篇文章是我自己跑了一段時間後的整理，從架設、架好之後該調的安全設定，到日常使用發現的技巧。

---

## 為什麼選 Cloudflare Tunnel

### 不推薦 nginx 反向代理

很多教學會教你架 nginx + Let's Encrypt 處理 HTTPS。這對大部分人不是一個好選擇，原因如下：

1. **憑證要自己管。** Certbot 雖然能自動續期，但出狀況（DNS challenge 壞掉、rate limit 觸發）你得自己 debug。

2. **多一層服務要維護。** nginx 設定檔、log rotation、版本更新都要自己做。

3. **要設定公網訪問、開公網 port，還要做好防火牆規則。** Port 443 必須對外開放，等於把你的 server 直接掛在公網上，需要面對被 botnet 掃 port、DDoS 的風險。

### 不推薦 Tailscale Funnel

Tailscale 在分散組網、純內網使用的場景下非常好用，但要用它**對外暴露服務**（Funnel）有幾個痛點：

1. 只有 `443`、`8443`、`10000` 三個 port 可用，沒做反向代理的話你只能公開三個 web 服務。

2. 開 443 funnel 會佔用主機本身的 443 port，跟 Cloudflare Tunnel 完全不同。

3. 不支援自訂域名，只能用 `*.ts.net` 子域名。

4. Tailscale daemon 會動 iptables，跟 Docker 網路偶爾會衝突。

### Cloudflare Tunnel 的優點

`cloudflared` 是**主動發起連線**到 Cloudflare 邊緣的，所以你的 server：

- 不需要公網 IP
- 不需要 DDNS
- 不需要開任何 inbound port
- 不需要防火牆規則調整
- 不會被掃 port，主機不會被 DDoS

Cloudflare 自動幫你維護憑證。申請一個免費子域名（有興趣可看我之前的[教學](https://blog.allenspace.de/2025/11/08/deploying-openwebui-for-free-with-cloudflare-tunnel/)）或買一個域名託管到 Cloudflare 就能用。

但 Cloudflare 看得到 HTTP 明文怎麼辦？這是合理的擔憂，**但實際影響比想像中小**。

TLS 終止點是 CF edge，所以 Cloudflare 確實在 edge 那一端能看到完整 HTTP 請求內容，任何反向代理架構都有這個問題。但 Bitwarden 協議的核心設計是**零知識**，因此：

- 主密碼永遠不會離開你的客戶端
- 金庫資料在客戶端用 master key（從 password 推導出來）加密成 blob，**已加密的 blob** 才上傳到 server
- 認證送的是 hash 過兩輪的 auth hash，不是密碼本身

所以即使 Cloudflare 把所有流量錄下來，他們看到的是一坨密文，沒有主密碼就解不開。連 Bitwarden 自己的 server 都解不開託管的金庫。

如果你用瀏覽器開 `https://vw.your-domain.com` 輸入主密碼登入，Cloudflare 理論上可以在 edge 修改回應內容、塞惡意 JS 偷你的主密碼。能力上是存在的，但 Cloudflare 有強烈動機不這樣做（這樣會毀掉整個生意）。

緩解方法也很簡單，只用原生客戶端就沒問題。桌面 app、瀏覽器 extension、手機 app，這些 Cloudflare 完全動不了。原生客戶端跟 server 之間只交換加密 blob 跟 auth hash，被 MITM 也沒用。

---

## 前置步驟：取得 TUNNEL_TOKEN

1. 進 Cloudflare Zero Trust → Networks → Connectors → **Create a tunnel**
2. Select your tunnel type 選 **Cloudflared**
3. 給 tunnel 命名
4. 下一步選安裝方式 **Docker**，會跳出一行命令，裡面 `--token` 後面那串 `eyJhIjoi...` 就是 token，存起來備用

## 前置步驟：設定 Public Hostname

Tunnel 建好後，在那條 tunnel 的 **Public Hostname** 加一條：

| 欄位         | 值                        |
| ------------ | ------------------------- |
| Subdomain    | `vw`（填你想設定的名稱）  |
| Domain       | `your-domain.com`         |
| Service Type | `HTTP`                    |
| URL          | `vaultwarden:80`          |

![Public Hostname 設定](https://img.allenspace.de/Fasa-file-37E7CFD8-DD51-433E-B464-CA87EFE001B2.6ldt1rfu9jk0.webp)

設定好以後現在網頁還不能通，因為容器還沒啟動。可以先複製網址存起來備用，如圖所示。

## 部署 Vaultwarden

最簡單的方式是把 Vaultwarden 跟 cloudflared 放在同一個 Portainer stack 裡，也可以用 docker compose，那麼你需要再建一個 `.env` 把環境變數填進去。這裡用 Portainer stack 來示範。

```yaml
services:
  vaultwarden:
    image: vaultwarden/server:latest
    container_name: vaultwarden
    restart: unless-stopped
    environment:
      DOMAIN: "https://vw.your-domain.com"
      SIGNUPS_ALLOWED: "true"        # 第一次先選 true，註冊好後改成 false 然後 update stack
      SHOW_PASSWORD_HINT: "false"
      ROCKET_PORT: "80"
      LOG_LEVEL: "warn"
      TZ: "Asia/Taipei"
    volumes:
      - vw-data:/data
    # 完全不暴露 port

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared-vw
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${TUNNEL_TOKEN}
    depends_on:
      - vaultwarden

volumes:
  vw-data:
```

進入 Portainer，點擊 stacks 按鈕，點擊 Add stack 按鈕。

![Portainer Add stack](https://img.allenspace.de/Fasa-file-D030E061-1CC5-48EA-814D-0614D1579594.63l0446erwo0.webp)

進入編輯頁面，照著圖片設置。

![Portainer stack 編輯頁面](https://img.allenspace.de/Fasa-file-8D0E5A0D-192A-41EF-9CF4-5B6A0387EB4F.14lm7wbk1b28.webp)

![Portainer stack 內容](https://img.allenspace.de/Fasa-file-2AFBFCFC-EAC3-40E8-920D-A1CFEB17F52B.3elymmqgs580.webp)

DOMAIN 這裡填上剛剛複製的網址。

![DOMAIN 環境變數](https://img.allenspace.de/Fasa-file-8D01E41B-3802-42E9-9D4E-1961CFCD19AF.359t0b91m1a0.webp)

往下滑看到 Environment variables，點擊 Add an environment variable，`name` 填上 `TUNNEL_TOKEN`，`value` 就是剛剛複製的 Cloudflared token，將它貼上，點擊 Deploy the stack。

---

## 初始設定：註冊與關閉公開註冊

如果你的 Vaultwarden 是要個人使用，要防止其它人用你的伺服器註冊帳號，那麼第一次部署完請做以下步驟：

1. 用瀏覽器進設定好的網址應該就能看到登入頁，註冊你自己的帳號
2. 回到 Portainer，把 stack env 裡 `SIGNUPS_ALLOWED` 改成 `false`
3. Update the stack 重新拉起

如果你只給自己用，**完全不需要設 `ADMIN_TOKEN`**。設定 `ADMIN_TOKEN` 後會多一個 `/admin` 路徑，這是管理用戶的介面，有需要這個功能請查找其它文章，這裡不再贅述。

---

## 強化主密碼與 Argon2id

進金庫 → Account Settings → Security → Keys，把 KDF 從預設的 PBKDF2 改成 **Argon2id**。Argon2id 是現在公認最強的 password hashing 函數，對 GPU 跟 ASIC 的暴力破解抵抗力比 PBKDF2 強得多。

### Argon2id 在 iOS AutoFill 上的問題

如果你會在 iOS 上用 AutoFill（自動填入密碼）：**Argon2id 預設的 64MB 記憶體可能會讓 AutoFill 出問題**。因為 [iOS AutoFill extension 的記憶體上限是 **120MB**](https://community.bitwarden.com/t/unable-to-autofill-on-ios/51041/6)，Argon2id 佔太多記憶體就可能讓 AutoFill 報錯甚至終止。[GitHub 上有用戶回報](https://github.com/bitwarden/mobile/issues/2389)即使設 64MB 也不見得穩定（90–105MB 則是穩定失敗），如果你平時會**輸入主密碼解鎖**，那麼應該把 Argon2id 記憶體下調到 **48MB**；如果平時用 **FaceID / TouchID / PIN 解鎖**，它們都不用 Argon2，因此[不受 120MB 的限制](https://community.bitwarden.com/t/important-psa-for-ios-and-argon2-users/51034)。

### 密碼熵比 KDF 參數重要

很多人會拚命把 Argon2id iterations 跟 memory 拉滿，**但其實[提高密碼熵](https://community.bitwarden.com/t/pbkdf2-vs-argon2-which-is-better/59187)才是最能提升安全性的因素。**

[KDF 參數的作用是讓單次嘗試變慢](https://bitwarden.com/help/kdf-algorithms/)，但如果你的主密碼只有 40 bits 熵，再強的 Argon2id 參數也只能拖延幾天到幾年；反過來如果你密碼有 100+ bits 熵，連 MD5（無 salt）暴力破解都是幾乎不可能的任務。

用 Bitwarden 內建密碼產生器產生的 20 字元密碼（混合大小寫、數字、符號，字元集共 70 個），密碼熵大約是 122.6 bits。假設攻擊者每秒能計算十億個雜湊值（Argon2id 實際上遠遠達不到這個速度，就算用 GPU 農場每秒也只有幾千次，這裡是誇飾），在第 50 年放棄破解，這組密碼被破解的機率是 **$0.0000000000000000198\%$**，100 年是 **$0.0000000000000000395\%$**，就算算滿 1000 年也只有 **$0.000000000000000395\%$**，攻擊者能探索的密碼空間連總數的一億億分之一都不到。被破解的機率趨近於 $0\%$。

| 攻擊持續時間 | 假設總嘗試運算次數    | 破解機率 (嘗試次數 / 總組合數)        |
| ------------ | --------------------- | ------------------------------------- |
| **50年**     | $1.58 \times 10^{18}$ | $2.0 \times 10^{-17}\% (\approx 0\%)$ |
| **100年**    | $3.16 \times 10^{18}$ | $4.0 \times 10^{-17}\% (\approx 0\%)$ |
| **1000年**   | $3.16 \times 10^{19}$ | $4.0 \times 10^{-16}\% (\approx 0\%)$ |

因此設定一個高熵的主密碼，然後把 Argon2id 記憶體調到 48MB，能保證安全性和相容性，是比較好的作法。

但請注意主密碼一旦忘記，金庫**真的就解不開了**。主密碼應該寫在實體紙本鎖在抽屜或保險箱，給自己留一條後路。

---

## 兩步驟驗證（2FA）

自架 Vaultwarden 的好處之一是能夠解鎖很多 Bitwarden 付費版的功能，其中一個功能是 **authenticator TOTP 整合**：網站的兩步驟驗證金鑰（TOTP Secret）可以直接存進 vault。Bitwarden 查詢密碼後，不需要跳出 app 打開其它的 authenticator，直接看驗證碼輸入就好，也不用額外備份 authenticator。換裝置只要在 Bitwarden 中輸入 Vaultwarden 網址、登錄帳號，authenticator 和密碼就會同步到裝置上了。

![Bitwarden 內建 TOTP](https://img.allenspace.de/IMG_2671.7hm0aq93eco0.webp)

### 例外：vault 自己的 2FA

既然 Vaultwarden 本身存放著所有密碼與驗證碼，那麼 Vaultwarden 帳號更應該啟用兩步驟驗證保護。但 **Vaultwarden 自己的登入 2FA** 需要另外的 authenticator 來存放，不然雞生蛋蛋生雞，登不進去就解不開。所以至少需要一個獨立的 Authenticator app 來保存 Vaultwarden 的登入驗證碼。

設定路徑：Account Settings → Security → Two-step Login → **Authenticator app**，啟用後會跳出 QR code。

![Vaultwarden 兩步驟登入設定](https://img.allenspace.de/Fasa-file-CA70F310-7A6D-4257-B89C-538B92924B4C.22mpffc7g75s.webp)

### 好用的 pattern：同一個 QR code 掃兩次

1. 用獨立 Authenticator app 掃一次（這是**主要登入用**的，必須有）
2. **同一個 QR 也用 Bitwarden 手機 app 掃一次存進 vault**

第二次掃進 vault 是為了「已登入裝置的便利性」——當你要在新筆電登入 Vaultwarden 時，可以從手機上**已經解鎖的 vault** 直接看到 TOTP，不用每次都掏出獨立 Authenticator app。同時也達到「兩個獨立位置互為備份」的效果，獨立 Authenticator 壞了還有 vault 那份，反之亦然。安全性、便利性、備份能力一次到位。

### 推薦的獨立 Authenticator app

**不要再用 Authy 了。** 桌面版 2024 年 3 月停止服務，手機版進入維護模式不再開發，2024 年 7 月還爆出 3300 萬筆使用者電話號碼外洩。

目前比較推薦的選擇：

- **Ente Auth**：開源，端對端加密雲端同步，跨平台（桌面/手機/瀏覽器）。最像當年的 Authy。
- **2FAS**：開源，可用 iCloud / Google Drive 備份，有瀏覽器 extension。
- **Bitwarden Authenticator**：Bitwarden 自家獨立 app，可選擇跟 vault 雙向同步（同一支裝置內透過 OS IPC 同步，不走 server 同步）。
- **Aegis**（Android only）：純本地加密備份。

### Recovery code 一定要印出來

啟用 2FA 後系統會提供一組 recovery code。**這組碼不要存在 vault 裡**，印出來放實體保險箱或抽屜。所有 Authenticator 裝置都無法使用時，這是唯一能進 vault 的方法。

---

## 日常使用：讓子域名分開比對

預設情況下 Bitwarden 會把同一個主域名下的子域名當成同一個目標，所以 `a.example.com` 跟 `b.example.com` 的登入會被一起列出來。如果你部署了很多服務並劃分了子域名，`a.example.com` 的帳號會出現在 `b.example.com` 的自動填入中；如果想讓 Bitwarden 對它們分開比對，請依照以下步驟設定：

**操作路徑**：Vault → 該筆登入項目 → Website (URI) → 右側齒輪 → **Match detection** → **Host**

幾種 match detection 模式的差異：

- **Base domain**（預設）：比對到主網域，子域名一視同仁
- **Host**：依主機名比對，`a.example.com` 跟 `b.example.com` 是不同目標
- **Starts with** / **Regular expression**：更精細的控制
- **Exact**：連協定、主機、路徑都鎖死，最嚴格

子域名很多的服務（Google、AWS、Atlassian 等）改成 **Host** 會讓 auto-fill 體驗精準很多。Bitwarden 也支援每個登入項目單獨設定，不用整個帳號改。

![Match detection 設定](https://img.allenspace.de/Fasa-file-4D0D8BDD-E6F1-4EA3-A80D-243858E5F0C7.5okms0bf40g0.webp)

---

## 小結

使用 Vaultwarden + Cloudflare Tunnel 自架密碼管理服務，架設一次之後幾乎不用維護，憑證自動續期、沒有對外暴露的 port，配合 Bitwarden 協議的零知識設計，安全性很高。

幾個值得記住的原則：

1. **建議用 native client**，性能更有優勢；如果你怕 web vault 在 reverse proxy 架構下的 MITM 風險，用客戶端可以放心很多
2. Vaultwarden 可以設 `ADMIN_TOKEN` 開啟 `/admin` 管理介面，但一般個人用戶沒必要。**註冊完立刻關 `SIGNUPS_ALLOWED`**，就不用怕有人在你的伺服器上註冊帳號
3. **20 字元高熵主密碼 > 調高 KDF 參數**
4. **iOS AutoFill 使用者注意 Argon2id 記憶體別超過 48MB**
5. **Recovery code 印出來放實體保險箱**，零知識架構沒有「忘記密碼可以救援」這回事

最後兩件事：定期備份 `vw-data` volume、記得更新 Vaultwarden 容器。

---

封面圖片來源：[https://pixabay.com/photos/door-bell-door-knob-bell-ring-498392/](https://pixabay.com/photos/door-bell-door-knob-bell-ring-498392/)

參考資料：

- [使用 Bitwarden 與自架後端 Vaultwarden 來管理密碼與 2FA Authenticator | omegaatt](https://www.omegaatt.com/blogs/develop/2023/bitwarden_with_self_hosted_password_backend/)
- [自架Bitwarden伺服器「Vaultwarden」備份現有帳號密碼 · Ivon的部落格](https://ivonblog.com/posts/self-host-vaultwarden/)
- [Best Argon2id settings? - Bitwarden Community Forums](https://community.bitwarden.com/t/best-argon2id-settings/58542/4)
- [PBKDF2 vs Argon2 - which is better? - Bitwarden Community Forums](https://community.bitwarden.com/t/pbkdf2-vs-argon2-which-is-better/59187)
- [Encryption Key Derivation | Bitwarden](https://bitwarden.com/help/kdf-algorithms/)
- [Unable to autofill on iOS - Bitwarden Community Forums](https://community.bitwarden.com/t/unable-to-autofill-on-ios/51041/6)
- [Important PSA for iOS and Argon2 users - Bitwarden Community Forums](https://community.bitwarden.com/t/important-psa-for-ios-and-argon2-users/51034)
- [iOS not auto-filling properly with argon2id · bitwarden/mobile #2389](https://github.com/bitwarden/mobile/issues/2389)
- [Integrated Authenticator | Bitwarden](https://bitwarden.com/help/integrated-authenticator/)
- [Forming URIs for Autofill | Bitwarden](https://bitwarden.com/help/uri-match-detection/)
- [搭建自己的密码库Vaultwarden | ByteJog](https://bytejog.com/posts/soft/vaultwarden/)
- [Ubuntu 上的 Bitwarden/Vaultwarden 從零開始安裝教學 | Trent's Blog](https://www.trentbe.dev/how-to-build-a-vaultwarden-on-oracle-cloud-VPS)
