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
