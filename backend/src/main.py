import uvicorn
from fastapi import FastAPI, Request, status, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from presentation.router import realtime_apis

app = FastAPI(
    title="realtime-api-web-console-backend",
)

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://realtime-api-web-console.vercel.app",
        "https://local-keitakn.ai-meow-cat.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(status.HTTP_401_UNAUTHORIZED)
def unauthorized_exception_handler(
    request: Request,
    exception: HTTPException,
) -> JSONResponse:
    return JSONResponse(
        content={
            "type": "UNAUTHORIZED",
            "title": "invalid Authorization Header.",
        },
        status_code=status.HTTP_401_UNAUTHORIZED,
    )


@app.exception_handler(status.HTTP_404_NOT_FOUND)
def not_found_exception_handler(
    request: Request,
    exception: HTTPException,
) -> JSONResponse:
    return JSONResponse(
        content={
            "type": "NOT_FOUND",
            "title": "Resource not found.",
            "detail": f"{str(request.url)} not found.",
        },
        status_code=status.HTTP_404_NOT_FOUND,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    invalid_params = []

    errors = exc.errors()

    for error in errors:
        invalid_params.append({"name": error["loc"][1], "reason": error["msg"]})

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=jsonable_encoder(
            {
                "type": "UNPROCESSABLE_ENTITY",
                "title": "validation Error.",
                "invalidParams": invalid_params,
            }
        ),
    )


app.include_router(realtime_apis.router)


def start() -> None:
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    start()
