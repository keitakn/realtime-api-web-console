from typing import TypedDict, Literal


class UnexpectedErrorBody(TypedDict):
    type: Literal["INTERNAL_SERVER_ERROR"]
    title: Literal["an unexpected error has occurred."]


db_error_response_body = {
    "type": "INTERNAL_SERVER_ERROR",
    "title": "an unexpected error has occurred.",
}


def create_unexpected_error_body() -> UnexpectedErrorBody:
    return UnexpectedErrorBody(
        type="INTERNAL_SERVER_ERROR",
        title="an unexpected error has occurred.",
    )


class RateLimitedErrorBody(TypedDict):
    type: Literal["TOO_MANY_REQUESTS"]
    title: Literal["Usage limit has been exceeded."]


def create_rate_limited_error_body() -> RateLimitedErrorBody:
    return RateLimitedErrorBody(
        type="TOO_MANY_REQUESTS",
        title="Usage limit has been exceeded.",
    )
