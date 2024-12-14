# realtime-api-web-console（バックエンド）

AIとのリアルタイムなやり取りを行う為の実験用リポジトリのバックエンド側の実装です。

主にWebSocketでリアルタイムにAIとやり取りをする為のエンドポイントが実装されています。

## Getting Started

MacOSを利用する前提の手順になります。

### 環境変数の設定

環境変数の設定を行います。

[direnv](https://github.com/direnv/direnv) を利用すると既存の環境変数に影響を与えないので便利です。

```bash
export GEMINI_API_KEY="https://aistudio.google.com/ で発行したAPIキー"
```

### uvのインストール

Homebrew でインストールを実施します。

```bash
brew install uv
```

### 依存packageのインストール & 仮想環境の作成

```bash
uv sync --frozen
```

### IDEにPythonのインタープリターを設定（任意）

開発を効率的に進める為にご自身がお使いのIDEやエディタにPythonインタープリターを設定します。

uvはPythonのインタープリターも含めてバージョン管理を行う事が可能なのでローカル環境で別途Pythonをインストールする必要はなく `./venv/bin/python` を指定すればOKです。

### アプリケーションの起動

以下のコマンドを実行してアプリケーションサーバーを起動します。

```bash
make run
```

`make` コマンドが利用出来ない場合は以下を実行します。

```bash
brew install make
```

ここまで出来たら [フロントエンドのアプリケーション](https://github.com/keitakn/realtime-api-web-console/tree/main/frontend) を起動して動作確認をします。

フロント側の環境変数は以下の通りに設定します。

```
NEXT_PUBLIC_GEMINI_REALTIME_API_SERVER_URL=ws://localhost:8000/realtime-apis/gemini
```

フロント側で正常にレスポンスが表示されれば問題なく動作しています。

## コンテナでの環境構築

[Docker Desktop](https://www.docker.com/products/docker-desktop/) もしくは [OrbStack](https://orbstack.dev/) がインストールされている場合はDockerによる環境構築も可能です。

以下のコマンドでコンテナを起動します。

```bash
docker compose up --build -d
```

※ 2回目以降は `docker compose up -d` だけで大丈夫です。

[フロントエンドのアプリケーション](https://github.com/keitakn/realtime-api-web-console/tree/main/frontend) の `NEXT_PUBLIC_GEMINI_REALTIME_API_SERVER_URL` を以下のように設定します。

```
NEXT_PUBLIC_GEMINI_REALTIME_API_SERVER_URL=ws://localhost:5555/realtime-apis/gemini
```

フロント側で正常にレスポンスが表示されれば問題なく動作しています。

コンテナの中に入る場合は以下を実行します。

```bash
docker compose exec realtime-api-web-console-backend bash
```

これでコンテナ内でテスト等のコマンドを実行可能です。

### コンテナ内での `make` コマンド利用の注意点

一点注意点があります。

コンテナ内のカレントディレクトリは `/src` になっています。

その為、ここで `make test` 等を実行しても上手く行きません。

以下のコマンドで `/` に移動します。

```bash
cd /
```

その上で `make test` 等を実行する必要があります。

これは結構面倒だと思うのでコンテナ内で各タスクを実行する為のタスクを用意しました。

```bash
# コンテナ内でLinterを実行
make lint-container

# コンテナ内でFormatterを実行
make format-container

# コンテナ内でtestを実行
make test-container

# コンテナ内でtypecheckを実行
make typecheck-container
```

## 各コマンドの説明

`Makefile` に定義されているコマンドについて説明します。

### Linterを実行

```bash
make lint
```

コンテナ内では `make lint-container`

### Formatterを実行

```bash
make format
```

コンテナ内では `make format-container`

### テストコードの実行

```bash
make test
```

コンテナ内では `make test-container`

### typecheckの実行

```bash
make typecheck
```

コンテナ内では `make typecheck-container`
