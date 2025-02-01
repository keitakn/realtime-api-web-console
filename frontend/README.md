# realtime-api-web-console（フロントエンド）

AIとのリアルタイムなやり取りを行う為の実験用リポジトリのWebフロント側の実装です。

## Getting Started

環境構築手順はMacOSを前提としています。

### Node.js のインストール（既に終わっている場合は省略）

20 系の最新安定版を利用する。

[asdf](https://asdf-vm.com/) などを使ってバージョン管理を出来るようにする事を推奨します。

### 依存packageのインストール

以下を実行します。

```bash
npm ci
```

### 環境変数の設定

`.env.local` を以下の内容で作成します。

```
NEXT_PUBLIC_VIDEO_CHAT_API_SERVER_URL=ws://localhost:8000/realtime-apis/video-chat
NEXT_PUBLIC_API_SERVER_URL=http://localhost:8000
NIJIVOICE_API_KEY="https://platform.nijivoice.com/ で発行したAPIキー"
```

### バックエンドのAPIサーバーを起動

[realtime-api-web-console（バックエンド）](https://github.com/keitakn/realtime-api-web-console/tree/main/backend) を参考にバックエンドのサーバーを起動します。

### 開発環境の起動

以下を実行します。

```bash
npm run dev
```

以下のURLでアクセス可能です。

http://localhost:3000/

## Linter、Formatterについて

それぞれ以下のコマンドを実行します。

Linter, Formatterが未実行の場合はCIが通らないようになっています。

### Linterの実行

```bash
npm run lint
```

### Formatterの実行

```bash
npm run format
```
