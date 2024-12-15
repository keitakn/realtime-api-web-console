import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google import genai
import json
import requests

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY"), http_options={"api_version": "v1alpha"}
)
model_id = "gemini-2.0-flash-exp"
search_tool = {"google_search": {}}
config = {"response_modalities": ["TEXT"], "tools": [search_tool]}

# TTS API の設定
TTS_API_URL = "https://api.nijivoice.com/api/platform/v1/voice-actors/16e979a8-cd0f-49d4-a4c4-7a25aa42e184/generate-voice"
TTS_API_KEY = os.getenv("NIJIVOICE_API_KEY")

router = APIRouter()


@router.websocket("/realtime-apis/gemini")
async def gemini_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_text()

            async with client.aio.live.connect(
                model=model_id, config=config
            ) as session:
                print("> ", data, "\n")
                await session.send(data, end_of_turn=True)

                combined_text = ""
                async for response in session.receive():
                    if response.text != None:
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
