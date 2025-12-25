# Playwright 自動化実行基盤

## これは何ですか？
PC上で自動操作ジョブを安全かつ確実に実行するための基盤システムです。
Web操作（Playwright）、RSS収集、LLM連携、そしてAndroid端末管理までをカバーします。

## 必要なもの
*   **Node.js**: LTS推奨 (v18以上)
*   **Git**: 任意
*   **Adb**: Android操作を行う場合はPATHに通しておく必要があります。

## セットアップ
1.  **ライブラリインストール**
    ```powershell
    npm install
    ```
2.  **ブラウザ準備**
    ```powershell
    npx playwright install
    ```
3.  **環境変数 (`.env`)**
    ```
    OPENAI_API_KEY=sk-xxxx
    DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx
    ```

## 実行可能なジョブ一覧

### 1. Web自動化・監視

#### スクリーンショット監視 (watchScreenshot)
URLを開き、前回のスクリーンショットとの差分を検知します。
```powershell
npm run run -- --job watchScreenshot --url https://newrona.jp/
```

#### リンク切れチェック (linkCheck)
サイト内のリンクを巡回し、ステータスコードを確認します。
```powershell
npm run run -- --job linkCheck --url https://newrona.jp/
```

### 2. 情報収集・AI・通知パイプライン

#### RSS/Atom 収集 (rssWatch)
`config.json` に設定されたRSS（例: MIT News）から新着記事を収集・重複排除して保存します。
```powershell
npm run run -- --job rssWatch
```

#### 投稿文生成 (composePost)
収集した新着記事を読み、OpenAI (gpt-4o-mini) を使って「専門アナリスト視点」の解説文を生成します。
```powershell
npm run run -- --job composePost
```

#### Discord 投稿 (postToDiscord)
生成された解説文（なければ原文）をDiscordに投稿します。
```powershell
npm run run -- --job postToDiscord
```

### 3. Android端末管理 (Phase 3)

#### 生存確認 (androidPing)
接続されているAndroid端末に対してADBコマンドを実行し、生存確認を行います。
configの `android.devices` に設定されたIDに対して `get-state` や `echo ping` を試みます。
```powershell
npm run run -- --job androidPing
```
**出力**: `runs/<ID>/artifacts/android_ping.json`, `summary.json`

## 設定 (config/config.json)
```json
{
  "concurrency": 1,
  "rssWatch": { ... },
  "android": {
    "devices": [
      { "id": "320135998138", "name": "Android-12" },
      { "id": "320326957525", "name": "Android-13" }
    ],
    "timeouts": { "adbMs": 8000 }
  }
}
```

## 実行ログ
`runs/YYYY-MM-DD_HH-mm-ss/` フォルダに全てのログと成果物が保存されます。
