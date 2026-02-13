# Multicuenta Test

Este archivo describe la implementación inicial del sistema multicuenta para SocialRadar.

## Cambios realizados:
1. **lib/accountManager.ts**: Nueva lógica para gestionar múltiples perfiles en almacenamiento local y sincronizar con Supabase.
2. **lib/instagramApi.ts**: Refactorización de la detección de usuario activo para facilitar el cambio entre cuentas.

## Lógica:
- La extensión ahora puede almacenar una lista de nombres de usuario.
- Al iniciar, detecta cuál de las cuentas tiene una sesión activa en Instagram (vía cookies/headers).
- Se prepara el terreno para que el Dashboard muestre un selector de cuentas.

## Próximos pasos:
- Integrar el selector visual en `tabs/dashboard.tsx`.
- Asegurar que el bot use la cuenta seleccionada si hay múltiples sesiones (o avisar si la sesión activa no coincide con la seleccionada).

*Reporte generado por Manu - Turno Noche 2026-02-13*
