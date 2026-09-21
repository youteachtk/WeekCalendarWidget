# WeekCal Widget — alcance

## Objetivo
Un widget de escritorio de Windows centrado en la **vista semanal**, de lectura rápida, colorido y siempre disponible, sincronizado con la misma fuente de calendario que usa Business Calendar en Android.

## Primera versión
- Semana de lunes a domingo.
- Alternativa de 5 días.
- Horas configurables.
- Colores por calendario/evento.
- Eventos superpuestos.
- Todo el día.
- Hoy / semana anterior / siguiente.
- Refresh manual + automático cada 5 minutos.
- Google Calendar (lectura).
- Inicio con Windows.
- Sin barra de tareas.
- Pin encima opcional.
- Opacidad.

## Segunda versión
- Crear/editar eventos desde Windows.
- Drag & drop para cambiar hora/día.
- Recordatorios del sistema.
- Tareas.
- Bloqueo del widget para evitar moverlo por accidente.
- Modo escritorio (anclado detrás de las aplicaciones, encima del fondo) usando integración Win32 específica.

## Calendarios detectados en Google
En la conexión de Google Calendar disponible durante el desarrollo se detectaron únicamente el calendario principal y Festivos en México. Los calendarios que Business Calendar muestra como Local deben migrarse a Google para sincronizarse con Windows.


## Regla para actualizaciones en Windows
- El instalador debe detectar si **WeekCal Widget** está abierto antes de reemplazar archivos.
- Si está abierto, debe informar al usuario y ofrecer **cerrar/terminar WeekCal desde el propio instalador y continuar** o **cancelar**.
- No se debe depender de un botón visible de “Cerrar” dentro del widget para poder actualizarlo.
- Después de una actualización normal, el instalador puede volver a abrir WeekCal.
- La conexión de Google Calendar y la configuración del usuario deben conservarse entre versiones.


## Integración con iconos del escritorio
- Opción **Reservar espacio entre los iconos** disponible cuando WeekCal está fijado al escritorio.
- Los iconos que ocupen el rectángulo del widget se desplazan a la celda libre más cercana alrededor del widget.
- Si el usuario mueve o redimensiona WeekCal, la reserva se recalcula automáticamente.
- Al desactivar la opción o salir del modo escritorio se intentan restaurar las posiciones anteriores.
- Si Windows tenía activado el autoacomodo de iconos, WeekCal lo suspende mientras la reserva está activa y lo restaura al desactivarla.


## Editor de eventos integrado (0.4)
- El botón **+** ya no abre Google Calendar en el navegador.
- WeekCal abre su propio editor compacto sobre el widget.
- Campos: actividad, calendario, fecha, todo el día, hora de inicio/fin, repetición, recordatorio, lugar, color y notas.
- Los eventos existentes se abren en el mismo editor al hacer clic y se pueden modificar o eliminar.
- Los cambios se escriben directamente en Google Calendar y se sincronizan con Android/iPhone.
- WeekCal guarda el color exacto en `BC2-Color` y asigna el color de evento Google más cercano para mejorar la consistencia visual en otros clientes.
- La primera vez que se use edición, Google pedirá ampliar el permiso OAuth a eventos de lectura/escritura; no vuelve a pedir el archivo JSON.


## 0.4.2 startup migration
- A previous 0.4.x build could persist `reserveIconSpace: true` before the user explicitly enabled the feature.
- Changing only the default to `false` was insufficient for upgrades because persisted settings override defaults.
- On startup, WeekCal now treats icon reservation as disabled unless the current user has explicitly configured the option.
- This prevents the native desktop-icon reservation helper from running automatically on upgraded installations.


## 0.4.3 icon positioning fix
- Root cause of the Explorer/WeekCal crash when enabling **Reservar espacio entre los iconos** was identified in the native helper.
- `LVM_SETITEMPOSITION32` requires `lParam` to point to a `POINT` structure in the Explorer process.
- Previous code incorrectly packed x/y into an integer and passed that value as if it were the pointer.
- WeekCal now allocates remote memory in Explorer, writes the 32-bit x/y POINT there, sends that pointer to `LVM_SETITEMPOSITION32`, then frees the memory.
- Regression test: `tests/desktop-host-protocol.test.js`.


## 0.4.4 desktop behavior
- **Esc** closes the open settings panel; when the event editor is open, Esc closes the editor first.
- Windows 11 24H2+ changed the desktop window hierarchy. WeekCal now detects that layout and uses the Shell/Progman host instead of the old WorkerW path, matching the compatibility strategy used by mature desktop-widget software.
- Desktop-host attachment now converts screen coordinates into the selected parent's client coordinates before positioning the widget.
- When Windows icon auto-arrange was enabled, WeekCal now reflows the complete icon sequence through free desktop grid cells while skipping the widget rectangle, rather than moving only icons whose original anchor point happened to intersect the widget.
- Manual icon layouts remain conservative: only icons intersecting the reserved widget area are moved.


## 0.4.5 full icon reflow
- Enabling **Reservar espacio entre los iconos** now reflows the complete saved desktop icon sequence through the available Windows icon grid while skipping WeekCal's reserved rectangle.
- This applies whether Windows Auto Arrange was originally on or off, so the result is not limited to a single overlapping column.
- The original icon positions and Auto Arrange state are still kept in the snapshot so disabling the reservation can restore the previous layout as closely as Windows allows.


## 0.4.6 Win+D and icon bounds
- The previous Windows 11 desktop mode still attached WeekCal to the Shell/Progman host. On current Windows 11, Show Desktop / Win+D can cloak or hide shell-hosted top-level windows without producing the normal Electron minimize/hide events, so the existing JavaScript protection could not reliably restore the widget.
- Desktop mode now changes architecture: WeekCal is parented directly to the desktop SysListView32 / FolderView surface. This makes it a real desktop child instead of a normal shell-hosted window and is intended to keep it present when Win+D is used.
- Existing Electron protections (setMinimizable(false), minimize/hide restoration) remain as a second layer.
- Icon reservation previously tested only an icon's anchor point against the widget area. LVM_GETITEMPOSITION gives the item position, while the icon/label occupies a full grid cell. This allowed an anchor to sit just outside WeekCal while part of the icon cell still overlapped the widget.
- Candidate positions now reject the entire icon grid cell (spacing.X x spacing.Y) when any part of that cell intersects WeekCal's full mapped width/height.


## 0.5.0 account sign-in and verified icon reservation
- A disconnected installation no longer renders the old hardcoded demo timetable. The weekly grid remains empty until a Google account is connected.
- The Google Calendar section uses a normal **Conectar con Google** flow. End users do not select OAuth JSON files.
- The Windows build injects WeekCal's application OAuth client from GitHub Actions secrets; user tokens stay local to each PC.
- The connected Google account email is shown in Settings, with **Cambiar cuenta** and **Desconectar** actions.
- Changing or disconnecting the Google account clears the locally selected calendar IDs so data from different accounts is not mixed.
- OAuth now uses a random state value and requests only identity plus Calendar scopes needed by WeekCal.
- Persisted Google tokens require Electron safeStorage.
- Icon reservation now adds a safety margin, re-reads the positions Explorer actually applied, retries remaining overlaps, and only reports success when zero icon cells remain inside the reserved area.


## Private Google Calendar deployment direction (2026-09-21)
- WeekCal remains a private/small-group application.
- End users never provide OAuth JSON files or configure Google Cloud.
- The existing WeekCal OAuth Desktop client is reused; it is not recreated per installation.
- The build receives only the existing Client ID as a GitHub Actions variable and packages it automatically.
- The old Client Secret/JSON is not required. On the original PC, WeekCal can recover the legacy Client ID from the encrypted `google-credentials.secure.json` left by the previous version.
- Each installation stores only that user's own encrypted Google token locally.
- The user experience is: install → Conectar con Google → choose authorized account → use WeekCal.
- Disconnected installs remain empty until the user connects Google.
