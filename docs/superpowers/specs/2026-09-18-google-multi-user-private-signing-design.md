# ACTIVE — private deployment with zero JSON steps per installation

> Reconfirmed on 2026-09-21. WeekCal remains a private/small-group application, but OAuth application credentials are configured once in the build pipeline. Installed users never select, upload, or store an OAuth JSON file manually.

# Diseño: cuentas Google por usuario y firma privada para WeekCal

Fecha: 2026-09-18

## Objetivo

Permitir que un pequeño grupo de personas conocidas instale la misma aplicación WeekCal en sus propias computadoras, inicie sesión con su propia cuenta de Google y vea/edite únicamente sus propios calendarios. Al mismo tiempo, reducir la advertencia de "editor desconocido" de Windows mediante una firma Authenticode privada confiable en las computadoras autorizadas.

Este diseño no crea un servicio de cuentas propio, no sincroniza datos entre usuarios y no convierte WeekCal en un producto público.

## Alcance

Incluido:

- Un único cliente OAuth de Google para WeekCal.
- Inicio de sesión independiente por instalación.
- Una cuenta Google activa por instalación.
- Mostrar el correo de la cuenta conectada.
- Acciones de Cambiar cuenta y Desconectar.
- Tokens OAuth almacenados localmente con Electron safeStorage.
- La integración reutiliza el OAuth Desktop client existente de WeekCal. Solo el Client ID se suministra una vez al build como GitHub Actions variable; no se requiere Client Secret ni se distribuye el JSON original a los usuarios.
- Firma Authenticode del instalador y ejecutables con un certificado privado de código.
- Instalación manual del certificado público como confiable únicamente en las computadoras conocidas.
- Pruebas de regresión para aislamiento de cuenta, cambio de cuenta, cierre de sesión y configuración de firma.

Fuera de alcance:

- Registro con usuario/contraseña propio.
- Backend de autenticación.
- Base de datos central de usuarios.
- Uso simultáneo de varias cuentas Google dentro de una misma instalación.
- Publicación en Microsoft Store.
- Certificado comercial OV/EV.
- Distribución pública a usuarios desconocidos.
- Reserva de espacio para iconos del escritorio; el usuario decidió dejar de priorizar esa función.

## Arquitectura de autenticación

### Identidad de la aplicación

WeekCal tendrá un único OAuth Client de tipo Desktop app en Google Cloud.

Las credenciales de ese cliente pertenecen a la aplicación, no al usuario. El flujo actual que obliga al usuario a seleccionar un archivo JSON se eliminará de la interfaz normal.

El build recibirá únicamente:

- WEEKCAL_GOOGLE_CLIENT_ID

como GitHub Actions variable. Durante el empaquetado se generará una configuración con ese Client ID.

WeekCal usa Authorization Code + PKCE S256 y autenticación de cliente pública para el flujo de escritorio. No se necesita recuperar ni almacenar el antiguo Client Secret.

La PC original conserva una ruta de migración: si todavía existe `google-credentials.secure.json`, WeekCal puede recuperar de ese archivo cifrado el Client ID del OAuth Desktop client anterior sin volver a pedir el JSON.

### Identidad del usuario

Cada instalación tendrá exactamente una cuenta Google activa.

El flujo será:

1. El usuario abre Configuración > Google Calendar.
2. Pulsa Conectar con Google.
3. WeekCal abre el navegador con el flujo OAuth.
4. Google muestra el selector de cuentas.
5. El usuario autoriza Calendar y acceso básico a identidad.
6. Google redirige al callback local de WeekCal.
7. WeekCal almacena localmente los tokens de esa cuenta.
8. WeekCal obtiene el correo autorizado y lo muestra en Configuración.
9. Calendarios y eventos se cargan exclusivamente con ese token.

Los scopes serán los mínimos necesarios para la función existente:

- openid
- email
- https://www.googleapis.com/auth/calendar.events
- https://www.googleapis.com/auth/calendar.calendarlist.readonly

No se pedirá acceso a Gmail, Drive, Contacts ni otros servicios.

### Datos locales por instalación

Los archivos de configuración permanecen bajo app.getPath('userData') en cada perfil de Windows.

Se separarán conceptualmente:

- Configuración visual y del widget.
- Token OAuth de la cuenta activa.
- Metadatos mínimos de identidad de la cuenta activa, principalmente email.
- Estado de calendarios seleccionados.

El token se guardará usando safeStorage. No se copiarán tokens entre computadoras y no se subirán a GitHub.

Cuando cambie la cuenta activa, la selección de calendarios de la cuenta anterior se limpiará para evitar conservar IDs que no pertenecen a la nueva cuenta.

## Experiencia de usuario

### Estado desconectado

La sección Google Calendar mostrará:

- "No hay cuenta conectada"
- Botón "Conectar con Google"

No habrá selector de archivos JSON.

### Estado conectado

Mostrará:

- "Conectado como"
- correo de la cuenta, por ejemplo persona@gmail.com
- Botón "Cambiar cuenta"
- Botón "Desconectar"
- selector de calendarios de esa cuenta

### Cambiar cuenta

Cambiar cuenta realizará esta secuencia:

1. Cerrar la sesión local actual de WeekCal.
2. Borrar token y metadatos locales de la cuenta anterior.
3. Limpiar calendarios seleccionados.
4. Iniciar un nuevo flujo OAuth con selector de cuenta.
5. Guardar únicamente la nueva sesión si el OAuth termina correctamente.

Si el usuario cancela el nuevo OAuth, WeekCal quedará desconectado. No se restaurará silenciosamente la sesión anterior.

### Desconectar

Desconectar eliminará:

- token OAuth local
- email/metadatos de identidad local
- selección de calendarios de esa cuenta
- cliente OAuth en memoria

No borrará datos de Google Calendar.

## Aislamiento y seguridad

WeekCal no tendrá una lista global de usuarios. Cada instalación solo conoce la cuenta que esa persona autorizó en esa computadora.

Principios:

- Nunca almacenar tokens en el repositorio.
- Nunca escribir tokens en logs.
- Nunca mostrar access_token o refresh_token en la interfaz.
- Nunca compartir el directorio userData entre perfiles de Windows.
- Usar safeStorage siempre que esté disponible.
- Si safeStorage no está disponible, WeekCal no debe guardar un refresh token en texto claro; debe mostrar un error de seguridad y dejar la cuenta desconectada.
- El callback OAuth local solo aceptará la respuesta esperada del flujo en curso y se cerrará al terminar.
- Se usará state aleatorio por flujo OAuth para reducir riesgo de callback no solicitado.
- El cambio de cuenta invalidará el cliente OAuth en memoria antes de iniciar la nueva sesión.

## Estado del proyecto OAuth de Google

Como el uso será de un grupo pequeño y conocido, la app puede mantenerse restringida a usuarios autorizados en el proyecto de Google mientras se valida el flujo.

No se diseñará en esta fase una experiencia para distribución pública. Si más adelante WeekCal se distribuye a usuarios desconocidos, se abrirá un proyecto separado para revisar publicación, pantalla de consentimiento, verificación de scopes y política de privacidad.

## Firma privada de Windows

### Objetivo

Evitar que las computadoras conocidas vean WeekCal únicamente como un ejecutable de editor desconocido, sin pagar todavía un certificado comercial.

### Certificado

Se generará un certificado de code signing privado para WeekCal con:

- nombre de editor estable, por ejemplo "YouTeach"
- clave privada exportable a PFX protegida con contraseña
- certificado público CER separado

La clave privada nunca se guardará en el repositorio.

GitHub Actions Secrets almacenará:

- WEEKCAL_SIGNING_PFX_BASE64
- WEEKCAL_SIGNING_PFX_PASSWORD

El workflow reconstruirá temporalmente el PFX durante el job de Windows, firmará los binarios y eliminará el archivo temporal al finalizar.

### Confianza en las computadoras autorizadas

En cada computadora conocida se instalará solamente el certificado público como confiable para firma de código.

La instalación del certificado se hará manualmente una sola vez con privilegios apropiados. Después de eso, Windows podrá validar que las nuevas versiones de WeekCal fueron firmadas por el mismo certificado privado.

El instalador de WeekCal no instalará automáticamente su propio certificado de confianza. Hacerlo anularía el propósito de la confianza explícita.

### Qué se firma

Como mínimo:

- WeekCal-Widget-<version>-x64.exe
- ejecutable principal empaquetado
- DesktopHost.exe, si el proceso de empaquetado permite firmarlo antes de incluirlo

La verificación del pipeline deberá comprobar la firma con herramientas de Windows antes de publicar el artifact.

## GitHub Actions

El workflow Build Windows se ampliará con estas fases:

1. Checkout.
2. Build de DesktopHost.
3. Preparar configuración OAuth desde secrets.
4. Instalar dependencias.
5. Ejecutar pruebas.
6. Preparar certificado PFX desde secret.
7. Firmar DesktopHost antes de empaquetar.
8. Empaquetar WeekCal.
9. Firmar ejecutable/instalador resultante cuando corresponda.
10. Verificar firma.
11. Subir artifact solamente si pruebas, build y verificación de firma pasan.

Los secretos no se imprimirán en logs.

Si faltan secrets de firma, el workflow de desarrollo podrá compilar un artifact no firmado solo cuando se ejecute explícitamente en modo de desarrollo. El build destinado a entrega a las otras personas deberá fallar si la firma no está disponible.

## Cambios esperados en el código

### electron/main.js

Responsabilidades nuevas:

- cargar credenciales OAuth de la aplicación desde configuración empaquetada
- eliminar selección manual de JSON
- añadir scopes openid/email
- generar y verificar state de OAuth
- obtener email de la cuenta conectada
- limpiar estado al cambiar/desconectar cuenta
- impedir persistencia insegura si safeStorage no está disponible

### electron/preload.js

Exponer de forma limitada:

- estado de cuenta
- conectar
- cambiar cuenta
- desconectar

No exponer tokens ni credenciales.

### renderer/index.html y renderer/app.js

Cambiar la sección Google Calendar para reflejar:

- desconectado
- conectado como <email>
- cambiar cuenta
- desconectar

### package.json

Añadir configuración de firma compatible con electron-builder cuando corresponda y mantener el instalador NSIS.

### .github/workflows/build-windows.yml

Añadir:

- generación del archivo de configuración OAuth a partir del Client ID existente
- reconstrucción temporal del PFX
- firma
- verificación
- limpieza de secretos temporales

### tests

Añadir pruebas para:

- conexión sin selector de JSON
- email visible después de OAuth
- cambio de cuenta borra sesión anterior
- desconexión borra token y selección de calendarios
- ningún token aparece en IPC/UI
- el código rechaza persistencia insegura cuando safeStorage no está disponible
- el workflow exige firma para builds de entrega
- el artifact firmado pasa verificación de firma

## Migración desde instalaciones actuales

Las instalaciones existentes pueden contener:

- google-credentials.secure.json
- google-token.secure.json

Migración:

1. Si existe un token válido actual, WeekCal puede conservarlo.
2. Si existe `google-credentials.secure.json` en la PC original, WeekCal extraerá internamente su `client_id` para reutilizar la integración existente.
3. El Client Secret antiguo no es necesario.
4. Una vez que ese mismo Client ID se configure en GitHub Actions, todos los instaladores futuros lo incluirán automáticamente.
5. Si el token existente no es compatible o fue revocado, WeekCal pedirá reconectar la cuenta, pero nunca volverá a pedir un JSON.

## Manejo de errores

- OAuth cancelado: mostrar "Conexión cancelada" y mantener un estado coherente.
- Cuenta sin Calendar accesible: mostrar error sin guardar una sesión incompleta.
- Token revocado: marcar desconectado y pedir reconexión.
- Cambio de cuenta fallido: quedar desconectado, sin mezclar datos de la cuenta anterior.
- safeStorage no disponible: no persistir refresh token y mostrar error de seguridad.
- Firma ausente en build de entrega: fallar el workflow.
- Firma inválida: no publicar artifact.

## Pruebas de aceptación

La función se considera terminada cuando:

1. Dos PCs pueden instalar la misma versión de WeekCal.
2. PC A inicia sesión con Cuenta A y solo ve calendarios/eventos de Cuenta A.
3. PC B inicia sesión con Cuenta B y solo ve calendarios/eventos de Cuenta B.
4. Ambas pueden crear y editar eventos en sus propias cuentas.
5. Configuración muestra correctamente el correo de cada cuenta.
6. Cambiar cuenta no mezcla eventos ni selección de calendarios de la cuenta anterior.
7. Desconectar elimina la sesión local sin borrar datos de Google.
8. Ningún token aparece en logs, renderer o repositorio.
9. El instalador de entrega está firmado.
10. En una PC donde el certificado público fue instalado como confiable, Windows muestra el editor configurado para WeekCal en lugar de tratar el binario únicamente como editor desconocido.

## Decisiones explícitas

- Usuarios: grupo pequeño de personas conocidas.
- Una cuenta Google activa por instalación.
- Sin backend propio.
- Sin distribución pública en esta fase.
- OAuth compartido de la aplicación, tokens aislados por PC.
- safeStorage obligatorio para persistencia de sesión.
- Firma privada Authenticode para las PCs conocidas.
- Clave privada de firma solo en GitHub Actions Secrets.
- Certificado público instalado manualmente en cada PC autorizada.
- La reserva de espacio de iconos deja de ser una prioridad del proyecto.
