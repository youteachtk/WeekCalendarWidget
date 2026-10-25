# Eva Dock — rama independiente `eva-dock`

Mascota de escritorio para Windows. Código fuente sin imágenes personales.

## Instalación única
El instalador inicial `EvaDock_Instalar_Una_Vez.exe` incluye seis imágenes aprobadas de Eva y las copia una sola vez a `%APPDATA%\EvaDock\assets` antes de instalarse en `%LOCALAPPDATA%\EvaDock\EvaDock.exe`. Queda un acceso directo en Inicio.

## Actualizaciones
El programa consulta las publicaciones de GitHub con etiqueta `eva-dock-vX.Y.Z` al iniciar y cada ocho horas. Descarga `EvaDock.exe`, verifica SHA-256 con `EvaDock.sha256`, sustituye la copia instalada y se reinicia. Los seis PNG locales **nunca se sobrescriben**, ni se publican en GitHub.

## Publicación
Al actualizar la carpeta `eva-dock/` y aumentar `eva-dock/version.txt`, GitHub Actions compila una versión Windows y crea la publicación correspondiente. El código no consume créditos de IA ni contacta servicios de terceros, salvo GitHub para las actualizaciones.

## Construir

```bash
cd eva-dock
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags='-H=windowsgui -s -w' -o EvaDock.exe .
```

La primera instalación se construye de manera local con `-tags eva_assets`, para incorporar las imágenes aprobadas sin enviarlas a repositorios públicos.


## Instalacion permanente

Descarga EvaDock.exe desde la ultima publicacion de esta rama. En el primer inicio se instala automaticamente en LOCALAPPDATA\EvaDock, crea acceso directo en Inicio y se actualiza mediante futuras publicaciones en GitHub. Las seis poses de arte generado se incluyen en el ejecutable y no contienen fotografias originales del usuario.