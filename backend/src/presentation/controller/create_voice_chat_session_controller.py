import os
import requests
from starlette import status
from starlette.responses import JSONResponse
from presentation.error_response import create_unexpected_error_body
from log.logger import AppLogger

app_logger = AppLogger()

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
"""


class CreateVoiceChatSessionController:
    async def exec(self) -> JSONResponse:
        """OpenAI Realtime APIのセッションを作成する"""
        try:
            if not os.getenv("OPENAI_API_KEY"):
                return JSONResponse(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    content=create_unexpected_error_body(),
                )

            response = requests.post(
                "https://api.openai.com/v1/realtime/sessions",
                headers={
                    "Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-realtime-preview-2024-12-17",
                    "modalities": ["text"],
                    "instructions": system_prompt,
                    "tool_choice": "auto",
                },
            )

            if not response.ok:
                app_logger.logger.error(f"OpenAI APIエラー: {response.text}")
                return JSONResponse(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    content=create_unexpected_error_body(),
                )

            response_body = response.json()

            app_logger.logger.info("created session")

            return JSONResponse(
                status_code=status.HTTP_201_CREATED,
                content={
                    "ephemeralToken": response_body["client_secret"]["value"],
                },
            )

        except Exception as e:
            app_logger.logger.error(f"セッション作成エラー: {str(e)}")
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content=create_unexpected_error_body(),
            )
