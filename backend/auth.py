import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pydantic import BaseModel

from database import get_connection, get_or_create_user, get_user_by_id

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-change-me-kanban-secret").strip()
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 14

bearer_scheme = HTTPBearer(auto_error=False)


class GoogleAuthRequest(BaseModel):
    credential: str


class AuthUser(BaseModel):
    id: int
    email: str
    name: str
    picture: Optional[str] = None


class AuthResponse(BaseModel):
    token: str
    user: AuthUser


def create_access_token(user_id: int, email: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_google_credential(credential: str) -> Dict[str, Any]:
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="GOOGLE_CLIENT_ID is not configured on the server",
        )
    try:
        return id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid Google credential") from exc


def authenticate_with_google(credential: str) -> AuthResponse:
    claims = verify_google_credential(credential)
    google_sub = claims.get("sub")
    email = claims.get("email")
    if not google_sub or not email:
        raise HTTPException(status_code=401, detail="Google account is missing email")

    with get_connection() as conn:
        user = get_or_create_user(
            conn,
            google_sub=google_sub,
            email=email,
            name=claims.get("name") or email,
            picture=claims.get("picture"),
        )

    return AuthResponse(
        token=create_access_token(user["id"], user["email"]),
        user=AuthUser(**user),
    )


def user_from_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        return None

    with get_connection() as conn:
        return get_user_by_id(conn, user_id)


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[dict]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        return None
    return user_from_access_token(credentials.credentials)


def require_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    user = get_optional_user(credentials)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user