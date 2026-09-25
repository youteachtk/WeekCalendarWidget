# WeekCal Auth Worker

Worker independiente para WeekCal. No comparte Firebase ni datos con Classroom Games.

Funciones:
- valida identidad de Google antes de pedir permisos de Calendar;
- consulta la allowlist en Cloudflare KV;
- vuelve a validar cuentas conectadas;
- permite que administradores autorizados agreguen o retiren usuarios desde WeekCal.

Binding KV requerido: `WEEKCAL_AUTH`.
