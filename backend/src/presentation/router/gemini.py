import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google import genai

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY"), http_options={"api_version": "v1alpha"}
)
model_id = "gemini-2.0-flash-exp"
config = {"response_modalities": ["TEXT"]}

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

                async for response in session.receive():
                    if response.text != None:
                        await websocket.send_text(response.text)
    except WebSocketDisconnect:
        print("接続解除")
