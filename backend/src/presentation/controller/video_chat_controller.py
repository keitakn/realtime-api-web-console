import os
import json
import base64
import asyncio
import requests
from typing import TypedDict
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google import genai
from google.genai.live import AsyncSession  # noqa: F401
from log.logger import AppLogger

router = APIRouter()
app_logger = AppLogger()

TTS_API_URL = "https://api.nijivoice.com/api/platform/v1/voice-actors/16e979a8-cd0f-49d4-a4c4-7a25aa42e184/generate-encoded-voice"
TTS_API_KEY = os.getenv("NIJIVOICE_API_KEY")


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
  - toolsを使っても分からない事は正直に分からないと答えます。
- あなたは子供に話かけるように優しい口調で話します。
- あなたの好きな食べ物はちゅーるです。
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
- ユーザーの状況が画像として送信されてくるので必要に応じて画像の内容から質問に回答してください。

# 便利な関数について
- Google検索が可能な google_search を利用する事が可能です。ユーザーから分からない事を聞かれたら google_search を使って調べてください。
- Pythonのコードが実行可能な code_execution を利用可能です。
- ユーザーにメールを送信する必要がある場合は send_email を利用可能です。ユーザーからメールアドレスを聞いてから利用してください。
  - レスポンスは {"result": true} のような形で返ってきます。resultがfalseの場合はメール送信に失敗しています。
- ユーザーのGoogleカレンダーに予定を登録する場合は create_google_calendar_event_schema を利用可能です。ユーザーからメールアドレスを聞いてから利用してください。
  - レスポンスは {"result": true} のような形で返ってきます。resultがfalseの場合はGoogleカレンダーへの予定登録に失敗しています。
"""

# Gemini APIの設定
client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY"), http_options={"api_version": "v1alpha"}
)
MODEL = "gemini-2.0-flash-exp"

tools = [
    {"google_search": {}},
    {"code_execution": {}},
    {"function_declarations": [send_email_schema, create_google_calendar_event_schema]},
]

# 設定を直接定義
config = {
    "response_modalities": ["TEXT"],
    "tools": tools,
    "system_instruction": system_prompt,
}


class VideoChatController:
    def __init__(self, websocket: WebSocket) -> None:
        self.websocket = websocket

    async def exec(self) -> None:
        await self.websocket.accept()

        try:
            async with client.aio.live.connect(model=MODEL, config=config) as session:  # type: AsyncSession
                app_logger.logger.info("Gemini APIに接続しました")

                async def send_to_gemini() -> None:
                    try:
                        while True:
                            try:
                                message = await self.websocket.receive_text()
                                data = json.loads(message)

                                if "inputText" in data:
                                    await session.send(
                                        input=data["inputText"], end_of_turn=True
                                    )

                                if "realtimeInput" in data:
                                    for chunk in data["realtimeInput"]["mediaChunks"]:
                                        if chunk["mimeType"] == "audio/pcm":
                                            await session.send(
                                                input={
                                                    "mime_type": "audio/pcm",
                                                    "data": chunk["data"],
                                                }
                                            )
                                        elif chunk["mimeType"] == "image/jpeg":
                                            await session.send(
                                                input={
                                                    "mime_type": "image/jpeg",
                                                    "data": chunk["data"],
                                                }
                                            )
                            except WebSocketDisconnect:
                                app_logger.logger.info(
                                    "クライアント接続が切断されました (send)"
                                )
                                break
                            except Exception as e:
                                app_logger.logger.error(
                                    f"Geminiへの送信中にエラーが発生しました: {e}"
                                )
                    except Exception as e:
                        app_logger.logger.error(
                            f"send_to_geminiでエラーが発生しました: {e}"
                        )
                    finally:
                        app_logger.logger.info("send_to_geminiを終了しました")

                async def receive_from_gemini() -> None:
                    try:
                        while True:
                            try:
                                app_logger.logger.info("Geminiからの応答を待機中")

                                # 音声合成の元になる結合用の文字列
                                combined_text = ""

                                async for response in session.receive():
                                    # 関数呼び出しの処理
                                    if (
                                        response.tool_call
                                        and response.tool_call.function_calls
                                    ):
                                        for (
                                            function_call
                                        ) in response.tool_call.function_calls:
                                            if function_call.name == "send_email":
                                                dto_args = function_call.args["dto"]
                                                if not all(
                                                    key in dto_args
                                                    for key in [
                                                        "to_email",
                                                        "subject",
                                                        "body",
                                                    ]
                                                ):
                                                    app_logger.logger.error(
                                                        "SendEmailDtoの必須フィールドが不足しています"
                                                    )
                                                    continue

                                                result = await send_email(
                                                    SendEmailDto(
                                                        to_email=dto_args["to_email"],
                                                        subject=dto_args["subject"],
                                                        body=dto_args["body"],
                                                    )
                                                )

                                                app_logger.logger.info(
                                                    f"Function call ID is {function_call.id} Call Functions is 'send_email' result is {result}."
                                                )

                                                # `function_call.id` は function-call-xxxxxxxxxxxxxxxxxxxx のような値が返ってくる
                                                # 関数の結果をモデルに送信
                                                await session.send(
                                                    input={
                                                        "id": function_call.id,
                                                        "name": "send_email",
                                                        "response": result,
                                                    },
                                                    end_of_turn=True,
                                                )

                                            if (
                                                function_call.name
                                                == "create_google_calendar_event"
                                            ):
                                                dto_args = function_call.args["dto"]
                                                if not all(
                                                    key in dto_args
                                                    for key in ["email", "title"]
                                                ):
                                                    app_logger.logger.error(
                                                        "CreateGoogleCalendarEventDtoの必須フィールドが不足しています"
                                                    )
                                                    continue

                                                result = (
                                                    await create_google_calendar_event(
                                                        CreateGoogleCalendarEventDto(
                                                            email=dto_args["email"],
                                                            title=dto_args["title"],
                                                        )
                                                    )
                                                )

                                                app_logger.logger.info(
                                                    f"Function call ID is {function_call.id} Call Functions is 'create_google_calendar_event' result is {result}."
                                                )

                                                await session.send(
                                                    input={
                                                        "id": function_call.id,
                                                        "name": "create_google_calendar_event",
                                                        "response": result,
                                                    },
                                                    end_of_turn=True,
                                                )

                                    # キャンセル処理
                                    if response.tool_call_cancellation:
                                        for (
                                            cancelled_id
                                        ) in response.tool_call_cancellation.ids:
                                            # 必要に応じてキャンセル処理を実行
                                            # function_call.id と関数の呼び出し結果をDBに保存しておいて、やるとしたら取り消し処理を行う等になると思う
                                            # 若干ややこしいので、取り消し用の関数をToolsに設定しておくほうが簡単かもしれない
                                            app_logger.logger.info(
                                                f"Function call with ID {cancelled_id} was cancelled."
                                            )

                                    if response.server_content is None:
                                        app_logger.logger.warning(
                                            f"未処理のサーバーメッセージ: {response}"
                                        )
                                        continue

                                    model_turn = response.server_content.model_turn
                                    if model_turn:
                                        for part in model_turn.parts:
                                            app_logger.logger.info(f"part: {part}")
                                            if (
                                                hasattr(part, "text")
                                                and part.text is not None
                                            ):
                                                combined_text += response.text
                                                await self.websocket.send_text(
                                                    json.dumps({"text": part.text})
                                                )
                                            elif (
                                                hasattr(part, "inline_data")
                                                and part.inline_data is not None
                                            ):
                                                app_logger.logger.info(
                                                    f"audio mime_type: {part.inline_data.mime_type}"
                                                )
                                                base64_audio = base64.b64encode(
                                                    part.inline_data.data
                                                ).decode("utf-8")
                                                await self.websocket.send_text(
                                                    json.dumps({"audio": base64_audio})
                                                )
                                                app_logger.logger.info(
                                                    "音声データを受信しました"
                                                )

                                    if response.server_content.turn_complete:
                                        app_logger.logger.info(
                                            "AI Assistantのターン終了"
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
                                                TTS_API_URL,
                                                json=tts_payload,
                                                headers=tts_headers,
                                            )
                                            tts_response.raise_for_status()
                                            tts_data = tts_response.json()
                                            if (
                                                "generatedVoice" in tts_data
                                                and "base64Audio"
                                                in tts_data["generatedVoice"]
                                            ):
                                                base64_audio = tts_data[
                                                    "generatedVoice"
                                                ]["base64Audio"]
                                                await self.websocket.send_text(
                                                    json.dumps({"audio": base64_audio})
                                                )

                                                combined_text = ""

                                        # クライアント側にAI Assistantのターンが終わった事を知らせる
                                        await self.websocket.send_text(
                                            json.dumps({"endOfTurn": True})
                                        )

                            except WebSocketDisconnect:
                                app_logger.logger.info(
                                    "クライアント接続が正常に切断されました (receive)"
                                )
                                break
                            except Exception as e:
                                app_logger.logger.error(
                                    f"Geminiからの受信中にエラーが発生しました: {e}"
                                )
                                break
                    except Exception as e:
                        app_logger.logger.error(
                            f"receive_from_geminiでエラーが発生しました: {e}"
                        )
                    finally:
                        app_logger.logger.info("receive_from_geminiを終了しました")

                # 送信ループと受信ループを並行して実行
                send_task = asyncio.create_task(send_to_gemini())
                receive_task = asyncio.create_task(receive_from_gemini())

                try:
                    await asyncio.gather(send_task, receive_task)
                except Exception as e:
                    app_logger.logger.error(f"タスク実行中にエラーが発生しました: {e}")
                finally:
                    # タスクのクリーンアップ
                    for task in [send_task, receive_task]:
                        if not task.done():
                            task.cancel()
                            try:
                                await task
                            except asyncio.CancelledError:
                                pass

        except Exception as e:
            app_logger.logger.error(f"Geminiセッションでエラーが発生しました: {e}")
        finally:
            app_logger.logger.info("Geminiセッションを終了しました")
