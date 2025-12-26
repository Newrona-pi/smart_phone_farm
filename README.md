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
*   `run.json`: 実行ステータス、リトライ回数、失敗時のエラーメッセージ
*   `artifacts/`: 各ジョブの出力ファイル（.json, .png等）
*   `artifacts/summary.json`: Android系ジョブの簡易集計結果

---

## 運用マニュアル (2025-12-25更新)

### ⚠️ 重要: ソースコードの正本について
*   **Playwright_old は参照しないでください。**
*   本番コードは **GitHub の `Newrona-pi/smart_phone_farm` リポジトリ (mainブランチ)** が常に正本です。
*   変更を加える際は、必ずFeatureブランチを作成→PR→mainへマージの手順を踏んでください。

### スマホファーム運用 (Android)

#### 1. タスクスケジューラによる自動運用
以下のタスクが10分間隔で登録され、自動実行されます。
*   **Playwright\AndroidPing**: 毎時 00, 10, 20...分 実行（生存確認）
*   **Playwright\AndroidRecover**: 毎時 02, 12, 22...分 実行（PINGから2分後、復旧試行）

**タスクの有効/無効化**:
*   管理者権限のコマンドプロンプトやPowerShellで以下を実行、またはGUI「タスクスケジューラ」から操作してください。
    *   無効化: `schtasks /Change /TN "Playwright\AndroidPing" /DISABLE`
    *   有効化: `schtasks /Change /TN "Playwright\AndroidPing" /ENABLE`

#### 2. エラー判断手順
*   **Discord通知**: 失敗時はWebhook URLへ通知が飛びます。
*   **ログ確認**: `runs` 以下の最新フォルダを確認します。
    *   **Attempt 1/2 success**: 正常。1回目で復旧成功、または最初から正常。
    *   **Attempt x/2 failed**: リトライ中。
*   **手動介入が必要なケース**:
    *   `UNAUTHORIZED` (認証切れ): 実機の画面でUSBデバッグを許可してください。
    *   `NOT_FOUND` (認識不可): USBケーブルの抜け、ハブの電源などを確認してください。
    *   これらは `run.json` の `error` フィールドや、Runnerログに **"Requesting noRetry"** と表示され、無駄なリトライは行われません。

#### 3. 手動実行（検証用）
タスクスケジューラとは別に、任意のタイミングで実行可能です。
CMD/PSでルートディレクトリ (`C:\Users\se_pi\Desktop\Playwright`) に移動し、以下のコマンドを実行します。

```

#### 4. 運用者向けツール (1クリック操作)
PowerShellを使用せず、ダブルクリックだけで運用操作が可能です。

**A. 端末入れ替え時 (`tools\devices\update_devices.bat`)**
*   接続されたAndroid端末を自動検知し、`config\config.json` を更新します。
*   `unauthorized` や `offline` の端末は除外されます。
*   実行後、更新された端末一覧が表示されます。

**B. 動作確認時 (`tools\check_runs.bat`)**
*   `androidPing` → `androidRecover` を順番に実行し、最新の結果 (`run.json`) を表示します。
*   結果が正常なら緑色で `SUCCESS`、失敗なら赤色で `FAILED` が表示されます。

