# WeekCal para iPhone

Versión nativa en SwiftUI + WidgetKit.

## Diseño
- Vista semanal inspirada en el widget de Business Calendar.
- Tema oscuro y cuadrícula semanal.
- Conserva los colores originales importados desde Business Calendar cuando el evento contiene la marca `BC2-Color`.
- Usa EventKit: en iPhone no hace falta seleccionar el JSON OAuth de Google. WeekCal lee los calendarios que ya estén configurados en Calendario de iOS.
- La app guarda una instantánea de la semana en un App Group para que el widget de inicio pueda mostrarla.

## Widget de iPhone
iOS controla los tamaños y la frecuencia de actualización de los widgets. La primera versión admite tamaños **mediano** y **grande**. El tamaño grande es el más cercano a la vista semanal de Business Calendar.

## Compilar
El proyecto se genera con XcodeGen:

```bash
cd ios
xcodegen generate
open WeekCalIOS.xcodeproj
```

Para instalarlo en un iPhone real hará falta firmarlo con una cuenta de Apple Developer y habilitar el App Group `group.tk.youteach.weekcal` para la app y la extensión. La compilación automática de GitHub valida el proyecto para el simulador sin firma.
