# WeekCal Widget

Widget semanal de escritorio para Windows inspirado en la claridad y el uso de color de Business Calendar, pero diseñado como una ventana flotante propia.

## Estado actual

- Vista semanal de 7 o 5 días.
- Horario configurable.
- Eventos de colores, eventos superpuestos y fila de todo el día.
- Línea de hora actual.
- Ventana sin bordes, reposicionable, redimensionable y sin entrada en la barra de tareas.
- Opción para mantener el widget encima de otras ventanas.
- Inicio automático con Windows.
- Opacidad configurable.
- Sincronización de lectura con Google Calendar.
- Calendarios seleccionables.
- Tokens y credenciales almacenados con `safeStorage` de Electron.
- Actualización automática cada 5 minutos.
- Modo demo cuando Google aún no está conectado.

## Por qué Google Calendar es la fuente común

Business Calendar en Android puede mostrar calendarios de Google y calendarios locales. Para que los mismos eventos aparezcan en Android y Windows, los calendarios que deban sincronizarse tienen que existir en Google Calendar (o en otra fuente común futura).

## Configuración de Google

Google exige que una aplicación de escritorio use un cliente OAuth propio. El widget ya implementa el flujo local de autorización; solo necesita un JSON de credenciales tipo **Desktop app**.

1. Crear/usar un proyecto de Google Cloud.
2. Habilitar Google Calendar API.
3. Configurar Google Auth Platform.
4. Crear un OAuth Client de tipo **Desktop app**.
5. Descargar el JSON.
6. En WeekCal: Configuración → Google Calendar → Conectar y seleccionar ese JSON.

El widget solicita únicamente `calendar.readonly` en esta primera versión.

## Desarrollo

```bash
npm install
npm start
```

## Compilar para Windows

```bash
npm install
npm run dist:win
```

También existe un workflow de GitHub Actions que compila automáticamente el instalador y la versión portable en Windows.
