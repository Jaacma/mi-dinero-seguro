# Mi Dinero

Aplicación independiente y responsive para registrar y analizar gastos e ingresos personales. No comparte código, datos ni infraestructura con el dashboard de inversiones.

## Funciones incluidas

- Alta rápida de gastos e ingresos con fecha, concepto, categoría, naturaleza, cuenta, importe y nota.
- Resumen y tasa de ahorro por mes.
- Gráficos de evolución, categorías, gasto fijo/variable y cuentas.
- Presupuestos mensuales por categoría.
- Buscador, filtros, borrado y exportación CSV.
- Diseño móvil instalable como PWA.
- Cifrado AES-256-GCM en el dispositivo antes de guardar o sincronizar.
- Acceso limitado al correo autorizado mediante enlace de un solo uso.
- Sincronización cifrada entre ordenador y móvil mediante Supabase.
- Row Level Security: cada lectura y escritura exige el usuario autorizado.
- Registro inteligente desde texto libre o capturas de tiques y operaciones bancarias.
- OCR ejecutado en el propio dispositivo: la imagen no se sube ni se guarda.
- Detección de importe, fecha, concepto, gasto/ingreso, categoría, cuenta y naturaleza, siempre con confirmación previa.

## Probar en local

Ejecuta un servidor estático desde esta carpeta, por ejemplo:

```bash
python3 -m http.server 8080
```

Abre `http://localhost:8080`.

## Privacidad y sincronización

La base remota solo recibe un bloque cifrado. La clave privada se usa localmente y nunca se envía a Supabase. También se mantiene una copia cifrada en el dispositivo para poder recuperarse de cortes de conexión. El repositorio no contiene movimientos, saldos ni credenciales privilegiadas; la clave publicable de Supabase está diseñada para clientes web y queda protegida por las políticas RLS.
