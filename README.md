# Mi Dinero

Aplicación independiente y responsive para registrar y analizar gastos e ingresos personales. No comparte código, datos ni infraestructura con el dashboard de inversiones.

## Funciones incluidas

- Alta rápida de gastos e ingresos con fecha, concepto, categoría, naturaleza, cuenta, importe y nota.
- Resumen y tasa de ahorro por mes.
- Gráficos de evolución, categorías, gasto fijo/variable y cuentas.
- Presupuestos mensuales por categoría.
- Buscador, filtros, borrado y exportación CSV.
- Diseño móvil instalable como PWA.
- Persistencia local cifrada con AES-256-GCM.
- Pantalla de acceso mediante clave privada conservada únicamente en el fragmento del enlace.

## Probar en local

Ejecuta un servidor estático desde esta carpeta, por ejemplo:

```bash
python3 -m http.server 8080
```

Abre `http://localhost:8080`.

## Privacidad y sincronización

La versión de prueba guarda los datos en el navegador. Para sincronizar ordenador y móvil, la versión publicada debe usar autenticación y base de datos privada (Supabase con Row Level Security). La interfaz ya está separada de la capa de almacenamiento para conectar esa fase sin rehacer el diseño.
