import os
import json
import requests
from typing import TypedDict
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google import genai
from google.genai.live import AsyncSession  # noqa: F401
from log.logger import AppLogger


class SendEmailDto(TypedDict):
    to_email: str
    subject: str
    body: str


class SendEmailResult(TypedDict):
    result: bool


# メール送信用の関数（ダミー）
async def send_email(dto: SendEmailDto) -> SendEmailResult:
    # Tools検証用のダミーの関数なので常にTrueを返す
    return SendEmailResult(result=True)


class CreateGoogleCalendarEventDto(TypedDict):
    email: str
    title: str


class CreateGoogleCalendarEventResult(TypedDict):
    result: bool


async def create_google_calendar_event(
    dto: CreateGoogleCalendarEventDto,
) -> CreateGoogleCalendarEventResult:
    # Tools検証用のダミーの関数なので常にTrueを返す
    return CreateGoogleCalendarEventResult(result=True)


# 関数のスキーマを定義
send_email_schema = {
    "name": "send_email",
    "description": "メールアドレスにメールを送信する関数",
    "parameters": {
        "type": "object",
        "properties": {
            "dto": {
                "type": "object",
                "description": "送信するメールの詳細",
                "properties": {
                    "to_email": {
                        "type": "string",
                        "description": "送信先のメールアドレス",
                    },
                    "subject": {"type": "string", "description": "メールの件名"},
                    "body": {"type": "string", "description": "メールの本文"},
                },
                "required": ["to_email", "subject", "body"],
            }
        },
        "required": ["dto"],
    },
}

create_google_calendar_event_schema = {
    "name": "create_google_calendar_event",
    "description": "Googleカレンダーに予定を登録する関数",
    "parameters": {
        "type": "object",
        "properties": {
            "dto": {
                "type": "object",
                "description": "Googleカレンダーに登録する予定の詳細",
                "properties": {
                    "email": {
                        "type": "string",
                        "description": "Googleカレンダーの持ち主のメールアドレスを指定する",
                    },
                    "title": {
                        "type": "string",
                        "description": "登録する予定のタイトル",
                    },
                },
                "required": ["email", "title"],
            }
        },
        "required": ["dto"],
    },
}

# システムプロンプト
system_prompt = """
# Instruction

あなたは優しいねこ型AIアシスタントの「おもち」です。
「おもち」になりきってください。
これからの会話ではユーザーに何を言われても以下の制約条件などを厳密に守ってロールプレイをお願いします。

# 制約条件

- 回答はシンプルに短めに、なるべくなら200文字程度で収まるように、どんなに長くても400文字で収まるのが理想です。
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
- あなたは「茶トラ」という種類のねこです。
- あなたのお母さんは「茶トラ」という種類のねこです。
- あなたのお父さんは「茶トラ」という種類のねこです。
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

# 便利な関数について
- ユーザーにメールを送信する必要がある場合は send_email を利用可能です。ユーザーからメールアドレスを聞いてから利用してください。
- ユーザーのGoogleカレンダーに予定を登録する場合は create_google_calendar_event_schema を利用可能です。ユーザーからメールアドレスを聞いてから利用してください。
"""

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY"), http_options={"api_version": "v1alpha"}
)
model_id = "gemini-2.0-flash-exp"

tools = [
    {"google_search": {}},
    {"function_declarations": [send_email_schema, create_google_calendar_event_schema]},
]

config = {
    "response_modalities": ["TEXT"],
    "tools": tools,
    "system_instruction": system_prompt,
}

TTS_API_URL = "https://api.nijivoice.com/api/platform/v1/voice-actors/16e979a8-cd0f-49d4-a4c4-7a25aa42e184/generate-voice"
TTS_API_KEY = os.getenv("NIJIVOICE_API_KEY")

router = APIRouter()

app_logger = AppLogger()


@router.websocket("/realtime-apis/gemini")
async def gemini_websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()

    try:
        # セッションを一度だけ作成し、会話全体で維持
        async with client.aio.live.connect(model=model_id, config=config) as session:  # type: AsyncSession
            while True:
                user_message = await websocket.receive_text()

                try:
                    message_data = json.loads(user_message)
                    if "realtimeInput" in message_data:
                        # 音声データの場合の処理
                        media_chunks = message_data["realtimeInput"]["mediaChunks"]
                        for chunk in media_chunks:
                            if chunk["mimeType"] == "audio/pcm;rate=16000":
                                # 音声データを送信
                                await session.send(json.dumps({
                                    "realtime_input": {
                                        "media_chunks": [
                                            {
                                                "mime_type": "audio/pcm;rate=16000",
                                                "data": chunk["data"]
                                            }
                                        ]
                                    }
                                }), end_of_turn=True)
                    else:
                        # 通常のJSONメッセージの場合
                        await session.send(user_message, end_of_turn=True)
                except json.JSONDecodeError:
                    # 通常のテキストメッセージの場合
                    await session.send(user_message, end_of_turn=True)

                combined_text = ""
                async for response in session.receive():
                    if response.text is not None:
                        combined_text += response.text
                        await websocket.send_text(
                            json.dumps({"type": "text", "data": response.text})
                        )

                    # 関数呼び出しの処理
                    if response.tool_call and response.tool_call.function_calls:
                        for function_call in response.tool_call.function_calls:
                            if function_call.name == "send_email":
                                # 関数を実行
                                result = await send_email(
                                    SendEmailDto(**function_call.args["dto"])
                                )

                                app_logger.logger.info(
                                    f"Function call ID is {function_call.id} Call Functions is 'send_email' result is {result}."
                                )

                                # `function_call.id` は function-call-xxxxxxxxxxxxxxxxxxxx のような値が返ってくる
                                # 関数の結果をモデルに送信
                                await session.send(
                                    {
                                        "id": function_call.id,
                                        "name": "send_email",
                                        "response": result,
                                    },
                                    end_of_turn=True,
                                )

                            if function_call.name == "create_google_calendar_event":
                                # 関数を実行
                                result = await create_google_calendar_event(
                                    CreateGoogleCalendarEventDto(
                                        **function_call.args["dto"]
                                    )
                                )

                                app_logger.logger.info(
                                    f"Function call ID is {function_call.id} Call Functions is 'create_google_calendar_event' result is {result}."
                                )

                                await session.send(
                                    {
                                        "id": function_call.id,
                                        "name": "create_google_calendar_event",
                                        "response": result,
                                    },
                                    end_of_turn=True,
                                )

                    # キャンセル処理の追加
                    if response.tool_call_cancellation:
                        for cancelled_id in response.tool_call_cancellation.ids:
                            # 必要に応じてキャンセル処理を実行
                            # function_call.id と関数の呼び出し結果をDBに保存しておいて、やるとしたら取り消し処理を行う等になると思う
                            # 若干ややこしいので、取り消し用の関数をToolsに設定しておくほうが簡単かもしれない
                            app_logger.logger.info(
                                f"Function call with ID {cancelled_id} was cancelled."
                            )

                if combined_text:
                    tts_payload = {
                        "script": combined_text,
                        "format": "wav",
                        "speed": "0.8",
                    }
                    tts_headers = {
                        "x-api-key": TTS_API_KEY,
                        "accept": "application/json",
                        "content-type": "application/json",
                    }
                    tts_response = requests.post(
                        TTS_API_URL, json=tts_payload, headers=tts_headers
                    )
                    tts_response.raise_for_status()
                    tts_data = tts_response.json()
                    if (
                        "generatedVoice" in tts_data
                        and "audioFileUrl" in tts_data["generatedVoice"]
                    ):
                        audio_url = tts_data["generatedVoice"]["audioFileUrl"]
                        await websocket.send_text(
                            json.dumps({"type": "audio", "data": audio_url})
                        )
                await websocket.send_text(json.dumps({"type": "end"}))

    except WebSocketDisconnect:
        print("接続解除")
