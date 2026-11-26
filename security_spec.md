# Especificación de Seguridad Firestore (Privacidad de Menores) — AlbumEscolar

## 1. Invariantes de Datos
1. Solo el superadministrador verificado (`environmentcesar@gmail.com` con `email_verified == true`) puede crear, modificar o eliminar administradores en `/admins/{uid}` o listar `/admins`. Un administrador delegado solo puede leer su propio documento `/admins/{uid}`.
2. Solo los administradores verificados (`isAdmin()`) pueden leer o escribir en `/albums` y `/albums/{albumId}/students`.
3. Los números telefónicos de los padres (`parentPhone`, PII) existen únicamente dentro de `/albums/{albumId}/students/{studentId}` y están prohibidos en `/albumAccess`.
4. Las familias sin cuenta acceden **únicamente** mediante `get` directo a `/albumAccess/{accessToken}` donde `accessToken` es un token aleatorio de 32–64 caracteres (`^[A-Za-z0-9_-]{32,64}$`), con `revoked == false`, `albumStatus == 'publicado'` y (`scope == 'album'` o `studentStatus == 'publicado'`).
5. **Prohibición absoluta de listado público**: Ningún usuario no administrador puede ejecutar `list` sobre `/albumAccess`, `/albums` ni `/admins`. La colección heredada `/publishedAlbums` queda totalmente denegada.
6. Todos los documentos validan `keys().hasAll(...)`, `keys().hasOnly(...)`, límites `.size()` en cadenas y listas, patrones regex en IDs/tokens, inmutabilidad de `createdAt`/`ownerUid` y marcas de tiempo `request.time`.

## 2. "Dirty Dozen" Payloads (Casos que deben devolver PERMISSION_DENIED)
1. Lectura anónima a `/albums/{albumId}` (borrador privado).
2. Lectura anónima a `/albums/{albumId}/students/{studentId}` (exposición de `parentPhone` PII).
3. Listado anónimo de `/albumAccess` (intento de enumeración de tokens/familias).
4. Lectura anónima (`get`) a `/albumAccess/{shortSlug}` con longitud menor a 32 caracteres (slug predecible).
5. Lectura anónima (`get`) a `/albumAccess/{accessToken}` cuando `albumStatus == 'borrador'` o `revoked == true`.
6. Lectura anónima (`get`) a `/albumAccess/{accessToken}` con `scope == 'student'` cuando `studentStatus == 'borrador'`.
7. Creación o modificación de `/admins/{uid}` por un administrador delegado que no es `environmentcesar@gmail.com` (escalada de privilegios).
8. Creación de `/albums/{albumId}` con `ownerUid` distinto a `request.auth.uid` o con campo fantasma `isVerified: true`.
9. Creación de `/albums/{albumId}/students/{studentId}` sin documento padre o con `accessToken` inválido (<32 chars).
10. Escritura en `/albumAccess/{accessToken}` enviando `parentPhone` como campo fantasma.
11. Lectura anónima de `/publishedAlbums/{slug}` o `/publishedAlbums/{slug}/students/{studentSlug}` (colección heredada cerrada).
12. Escritura por administrador con `email_verified == false` (Email Spoofing).
