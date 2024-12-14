import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google import genai
from google.genai.types import Tool, GenerateContentConfig, GoogleSearch
from log.logger import AppLogger, SuccessLogExtra, ErrorLogExtra

router = APIRouter()

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY"),
    http_options={"api_version": "v1alpha"},
)
model_id = "gemini-2.0-flash-exp"

google_search_tool = Tool(google_search=GoogleSearch())


@router.websocket("/realtime-apis/gemini")
async def gemini_websocket_endpoint(websocket: WebSocket):
    app_logger = AppLogger()

    await websocket.accept()

    try:
        while True:
            # ユーザーが送信したメッセージ
            data = await websocket.receive_text()

            response = client.models.generate_content(
                model=model_id,
                contents=data,
                config=GenerateContentConfig(
                    tools=[google_search_tool],
                    response_modalities=["TEXT"],
                ),
            )

            for each in response.candidates[0].content.parts:
                app_logger.logger.info(
                    "success",
                    extra=SuccessLogExtra(
                        user_message=each.text,
                    ),
                )

                await websocket.send_text(each.text)
    except WebSocketDisconnect as e:
        app_logger.logger.error(
            f"An error occurred while connecting to the websocket: {str(e)}",
            exc_info=True,
            extra=ErrorLogExtra(
                user_message=data,
            ),
        )
