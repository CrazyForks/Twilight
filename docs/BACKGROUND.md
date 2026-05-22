# Background And Avatar Assets

The Go backend serves uploaded user assets through authenticated API routes instead of exposing the upload directory directly.

## Configuration

```toml
upload_dir = "./uploads"
max_upload_size = 5242880
```

## API

- `POST /api/v1/users/me/avatar/upload`
- `DELETE /api/v1/users/me/avatar`
- `GET /api/v1/users/{uid}/avatar`
- `POST /api/v1/users/me/background/upload`
- `PUT /api/v1/users/me/background`
- `DELETE /api/v1/users/me/background`
- `GET /api/v1/users/{uid}/background`
- `GET /api/v1/users/assets/{kind}/{filename}`

## Security Rules

- Uploads are capped with `http.MaxBytesReader`.
- Only image MIME types are accepted.
- Asset filenames are generated server-side.
- `kind` is restricted to `avatar` and `background`.
- The API serves assets through authenticated routes; do not expose `uploads/` directly from Nginx.
