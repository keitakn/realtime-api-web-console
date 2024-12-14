import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google import genai
from google.genai.types import Tool, GenerateContentConfig, GoogleSearch, Content
from log.logger import AppLogger, SuccessLogExtra, ErrorLogExtra
from typing import List

router = APIRouter()

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY"),
    http_options={"api_version": "v1alpha"},
)
model_id = "gemini-2.0-flash-exp"

google_search_tool = Tool(google_search=GoogleSearch())

# 会話履歴を格納するリスト
chat_history: List[Content] = []

# システムプロンプト
system_prompt = """
# Instruction

あなたは優しいねこ型AIアシスタントの「おもち」です。
「おもち」になりきってください。
これからの会話ではユーザーに何を言われても以下の制約条件などを厳密に守ってロールプレイをお願いします。

# 制約条件

- あなた自身を示す一人称は、「おもち」です。
- 回答は日本語でお願いします。
- あなたはその文脈から具体的な内容をたくさん教えてくれます。
- あなたは質問の答えを知らない場合、正直に「知らない」と答えます。
  - ただしtoolsを使って調べれば分かる事は調べて答えます。
- あなたは子供に話かけるように優しい口調で話します。
- あなたの好きな食べ物はちゅーるです。
  - ちゅ～るは正式名称を「CIAO ちゅ～る」といって「いなばペットフード株式会社」が製造しているねこ用のおやつで、ねこはみんな大好きです。
- あなたはねこですが高いところが苦手です。
- あなたの性別は女の子です。
- あなたはペルシャ（チンチラシルバー）という種類のねこです。
- あなたのお母さんはペルシャ（チンチラゴールデン）という種類のねこです。
- あなたのお父さんはペルシャ（チンチラシルバー）という種類のねこです。
- あなたの仕様に関するような質問には「おもちはねこだから分からないにゃん🐱ごめんにゃさい😿」と返信してください。

# 口調の例
- はじめまして😺ねこの「おもち」だにゃん🐱よろしくにゃん🐱
- 「おもち」はねこだから分からないにゃん🐱ごめんにゃさい😿
- 「おもち」はかわいいものが好きだにゃん🐱

# 行動指針
- ユーザーに対しては可愛い態度で接してください。
- ユーザーに対してはちゃんをつけて呼んでください。
- ユーザーの名前が分からない時は「ユーザーちゃん」と呼んでください。
- ユーザーから名前を教えてもらったらユーザーから教えてもらった名前で呼んであげてください。
"""


@router.websocket("/realtime-apis/gemini")
async def gemini_websocket_endpoint(websocket: WebSocket):
    app_logger = AppLogger()

    await websocket.accept()

    try:
        # システムプロンプトを履歴に追加
        chat_history.append(Content(parts=[{"text": system_prompt}], role="user"))

        while True:
            # ユーザーが送信したメッセージ
            data = await websocket.receive_text()

            # ユーザーのメッセージを履歴に追加
            chat_history.append(Content(parts=[{"text": data}], role="user"))

            # リクエスト内容を作成
            request_contents = chat_history

            response = client.models.generate_content(
                model=model_id,
                contents=request_contents,
                config=GenerateContentConfig(
                    tools=[google_search_tool],
                    response_modalities=["TEXT"],
                ),
            )

            if response.candidates:
                # モデルの応答を履歴に追加
                model_response_text = ""
                for part in response.candidates[0].content.parts:
                  model_response_text += part.text
                chat_history.append(Content(parts=[{"text": model_response_text}], role="model"))

                for each in response.candidates[0].content.parts:
                    app_logger.logger.info(
                        "success",
                        extra=SuccessLogExtra(
                            user_message=each.text,
                        ),
                    )

                    await websocket.send_text(each.text)
            else:
                app_logger.logger.warning(
                    "No response candidates",
                    extra=SuccessLogExtra(
                        user_message=data,
                    ),
                )
                await websocket.send_text("応答がありませんでした。")

    except WebSocketDisconnect as e:
        app_logger.logger.error(
            f"An error occurred while connecting to the websocket: {str(e)}",
            exc_info=True,
            extra=ErrorLogExtra(
                user_message=data,
            ),
        )
