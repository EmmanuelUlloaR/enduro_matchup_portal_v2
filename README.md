# Enduro Evolution 2026 — Match Up en Llamas (Versión Producción Vercel)

Portal web de cronometraje y Live Timing en tiempo real para el enfrentamiento estelar entre:
- **Fabio "La Polinada" Silvestri**
- **Luis "Don Gata" Peña**

Diseñado con estética enduro de alta fidelidad, bosque oscuro, acentos en naranja fuego y oro, y arquitectura lista para producción en Vercel con persistencia y sincronización multiusuario en **Supabase Realtime**.

---

## Estructura del Proyecto

```
enduro_matchup_portal_v2/
├── index.html                  # Live Timing público oficial (Espectadores)
├── admin/
│   └── index.html              # Panel de Control de Carrera (Protegido por PIN)
├── assets/
│   ├── css/
│   │   └── main.css            # Estilos globales, diseño responsive y animaciones
│   ├── js/
│   │   ├── config.js           # Credenciales de Supabase y PIN administrativo
│   │   └── supabase-service.js # Cliente Supabase Realtime, cálculo de tiempos y fallback
│   ├── event-poster.png        # Fondo cinematográfico del evento
│   ├── fabio.png               # Fotografía oficial de Fabio Silvestri
│   └── luis.png                # Fotografía oficial de Luis Peña
├── supabase-schema.sql         # Script SQL con tablas, RLS, Realtime y seed data
├── vercel.json                 # Configuración de rutas y despliegue en Vercel
└── README.md                   # Documentación técnica
```

---

## Características Principales

1. **Separación de Vistas**:
   - `/` o `/index.html`: Pantalla limpia para espectadores y transmisiones en vivo con contador de etapas ganadas, tiempo acumulado, glow del líder, tarjetas de las 4 etapas y pantalla del ganador con confetti animado.
   - `/admin`: Panel de dirección de carrera para registrar y corregir tiempos (`mm:ss.mmm`), alternar estado de carrera (`PRE-RACE`, `EN CURSO`, `FINALIZADA`), reabrir etapas o reiniciar el matchup.
2. **Supabase Realtime**:
   - Tiempos almacenados en milisegundos (`time_ms`).
   - Los espectadores reciben actualizaciones instantáneas sin recargar la página mediante canales `postgres_changes`.
   - Soporte de contingencia local si la base de datos no está configurada o se encuentra sin conexión.
3. **Seguridad Administrativa**:
   - Pantalla de acceso protegida por código PIN (por defecto: `enduro2026`).
   - Persistencia de sesión y modal de configuración rápida desde la propia interfaz web.
4. **Visualización y Animaciones**:
   - Formato visual estricto `mm:ss.mmm` (ejemplo: `02:31.420`).
   - Indicador visual del líder y cálculo dinámico de la diferencia acumulada.
   - Animaciones `.stage.flash`, `.time.changed` y modal del trofeo con efecto de rotación y confetti.

---

## Configuración de Supabase (Paso a Paso)

### 1. Crear las Tablas y Habilitar Realtime
1. Ingresa a tu panel en [Supabase](https://supabase.com) y selecciona o crea tu proyecto.
2. Ve a la sección **SQL Editor** en el menú lateral.
3. Abre el archivo [`supabase-schema.sql`](supabase-schema.sql) de este repositorio, copia todo su contenido, pégalo en el editor de Supabase y presiona **Run**.
4. Este script creará las tablas `matchups`, `participants`, `stages`, `stage_times`, configurará las políticas RLS de lectura y escritura para el portal, habilitará `supabase_realtime` e insertará los corredores Fabio y Luis con las 4 etapas iniciales.

### 2. Configurar las Credenciales en el Portal
Tienes dos opciones:

- **Opción A (Desde el Panel Web)**:
  1. Abre el portal en tu navegador y ve a `/admin` (PIN: `enduro2026`).
  2. Haz clic en el botón superior **⚙ CONFIG**.
  3. Pega tu `SUPABASE PROJECT URL` y tu `SUPABASE ANON PUBLIC KEY` (disponibles en *Project Settings > API* en Supabase).
  4. Haz clic en **Guardar y Conectar**.

- **Opción B (En el código fuente)**:
  Edita el archivo [`assets/js/config.js`](assets/js/config.js) y coloca tus valores en `DEFAULT_CONFIG`:
  ```javascript
  const DEFAULT_CONFIG = {
    supabaseUrl: 'https://tu-proyecto.supabase.co',
    supabaseAnonKey: 'tu-anon-key-aqui...',
    adminPin: 'enduro2026',
    matchupTitle: 'Enduro Evolution 2026 — Match Up en Llamas'
  };
  ```

---

## Despliegue en Vercel

El archivo [`vercel.json`](vercel.json) ya está configurado para manejar la ruta `/admin` de forma limpia.

### Despliegue con Vercel CLI:
```bash
npx vercel
```

### Despliegue con GitHub:
1. Sube este proyecto a tu repositorio de GitHub.
2. Importa el repositorio en el panel de [Vercel](https://vercel.com).
3. Selecciona **Other** como Framework Preset y haz clic en **Deploy**.

---

## Formato de Tiempos
Todos los tiempos se ingresan en formato `mm:ss.mmm`:
- `02:31.420` = 2 minutos, 31 segundos, 420 milisegundos.
- Se almacenan internamente como milisegundos enteros: `151420 ms`.
