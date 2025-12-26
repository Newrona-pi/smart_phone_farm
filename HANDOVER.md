
# 運用者向け：このリポジトリで出来ること（概要）

このプロジェクトは **Windows PC を親**として、複数 Android 端末を **ADB 前提**で管理し、

- 監視（androidPing）
- 自動復旧（androidRecover）
- 復旧不能時のみ通知（Discord）

を **無人で定期運用**するための仕組みです。

> 重要：USBデバッグOFF / 電源OFF / 物理切断 は仕様上自動復旧できません。  
> その場合は「通知 → 人が物理対応」が正解です。

---

## フォルダ構成（正本）

- 正本（運用ルート）  
  `C:\Users\se_pi\Desktop\Playwright`

- 端末リスト（正本）  
  `config\config.json`  
  端末入れ替えは基本ここを更新するだけで対応します（下記の1クリックツールあり）。

---

## 端末リスト：config/config.json

このファイルが「対象端末（ID/表示名）」の唯一の正本です。

- 主に `tools\devices\update_devices.bat` で自動更新します（手編集不要）。
- scrcpy表示ツール / Ping・Recover が参照します。

> ※デバッグログに `Warning: Using legacy 'android.devices' schema.` が出る場合は、
> configのスキーマが旧形式の可能性があります。
> 運用上は動作していればOKですが、将来的にはスキーマ統一を推奨します。

---

## 1クリックツール（端末入れ替え／動作確認）

### 端末入れ替え（ADBに見えている端末をconfigへ反映）
- `tools\devices\update_devices.bat`  
  - ADBで `device` と認識されている端末のみを抽出
  - `config\config.json` を更新
  - Android-01.. のように自動採番して表示

補助スクリプト：
- `tools\devices\update_config_from_adb.ps1`（実体。batから呼ばれる）

---

### 動作確認（Ping→Recover→最新run.jsonの結果表示）
- `tools\check_runs.bat`  
  - `run_androidPing.bat` 実行
  - `run_androidRecover.bat` 実行
  - 最新の `run.json` を表示し、SUCCESS/FAILED を出す

補助スクリプト：
- `tools\show_latest_run.ps1`（最新runの抽出・表示）

---

## 監視・復旧ジョブ（バッチ）

### 監視（Ping）
- `run_androidPing.bat`  
  端末の生存確認を実行し、結果を `runs/` に保存します。

### 復旧（Recover）
- `run_androidRecover.bat`  
  実行時に precheck を必ず行い、端末状態を分類します。

状態（例）：
- `UP`：正常
- `UNSTABLE`：自動復旧対象（唯一）
- `UNAUTHORIZED`：USBデバッグ未許可（手動対応）
- `NOT_FOUND`：ADBから見えない（手動対応）

> NOT_FOUND / UNAUTHORIZED は retry しても成功率0%のため、無駄な再試行は抑止します。

---

## ログ（runs/）

実行ログは `runs/<runId>/` に保存されます。

主なファイル：
- `runs/<runId>/run.json`  
  - status / retryCount / error などの要点
- `runs/<runId>/console.log`  
  - 実行のコンソール出力
- `runs/<runId>/artifacts/*`  
  - precheck/postcheck/詳細ログ

運用者が最初に見るのは **run.json** でOKです。

---

## 画面表示（scrcpy）ツール

### 通常版（運用者用）
- `tools\views\start_views.bat`  
  - configに定義された端末のうち、ADBで `device` のものだけ scrcpy を起動
  - 端末ごとに **別ポート**を割り当て（例：27183+index）同時起動の競合を回避

- `tools\views\stop_views.bat`  
  - 起動中の scrcpy を終了

実体（batから呼ばれる）：
- `tools\views\start_views.ps1`
- `tools\views\stop_views.ps1`

---

### デバッグ版（原因切り分け用）
- `tools\views\start_views_debug.bat`
- `tools\views\stop_views_debug.bat`

ログ出力先：
- `tools\views\logs\`

デバッグログに含まれる内容：
- config読み込みパス/件数
- adb devices の生出力
- online端末判定
- 端末ごとの起動ポート/起動コマンド
- 起動後の scrcpy プロセス数チェック（不一致ならFAILED）

---

## 推奨運用フロー（入れ替えが多い前提）

1. 端末を接続して USBデバッグ許可
2. `tools\devices\update_devices.bat`（端末リスト更新）
3. `tools\check_runs.bat`（Ping/Recover動作確認）
4. 必要なら `tools\views\start_views.bat`（画面表示）
5. トラブル時は `start_views_debug.bat` のログで原因切り分け

---

## よくある原因と対処

- scrcpyが1台しか出ない / 10061エラー
  - ポート競合の可能性  
  → 通常版は別ポートで起動する設計。debugログで確認。

- adb devices に unauthorized が出る
  - 端末側でUSBデバッグ許可が必要（手動対応）

- NOT_FOUND が出る
  - 物理切断/ケーブル/ポート/電源OFF（手動対応）

---

## Git運用（重要）

- ユーザー環境は **mainブランチを正本**とする
- 変更は GitHub 経由で反映し、ユーザーは `git pull origin main` で取り込む
