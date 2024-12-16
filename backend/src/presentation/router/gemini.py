import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google import genai
import json
import requests

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
"""

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY"), http_options={"api_version": "v1alpha"}
)
model_id = "gemini-2.0-flash-exp"
search_tool = {"google_search": {}}
config = {
    "response_modalities": ["TEXT"],
    "tools": [search_tool],
    "system_instruction": system_prompt,
}

# TTS API の設定
TTS_API_URL = "https://api.nijivoice.com/api/platform/v1/voice-actors/16e979a8-cd0f-49d4-a4c4-7a25aa42e184/generate-voice"
TTS_API_KEY = os.getenv("NIJIVOICE_API_KEY")

router = APIRouter()


@router.websocket("/realtime-apis/gemini")
async def gemini_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    try:
        # セッションを一度だけ作成し、会話全体で維持
        async with client.aio.live.connect(model=model_id, config=config) as session:
            while True:
                data = await websocket.receive_text()
                print("> ", data, "\n")

                # メッセージを送信
                await session.send(data, end_of_turn=True)

                combined_text = ""
                async for response in session.receive():
                    if response.text is not None:
                        print(response.text)
                        combined_text += response.text
                        await websocket.send_text(
                            json.dumps({"type": "text", "data": response.text})
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
