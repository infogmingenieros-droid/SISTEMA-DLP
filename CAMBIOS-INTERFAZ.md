# Cambios de interfaz: opción B con modo oscuro (15/10/2026)

Solo se cambió la apariencia. No se modificó ningún archivo de lógica:
- `app.js`, `dashboard.js` y `subordinate.js` siguen igual.
- `base.css`, `dashboard.css`, `subordinate.css` y `utilities.css` siguen igual.
- `main.py` y la carpeta `datavault/` siguen igual.

## Archivos nuevos
- `images/ui/theme.css`: la capa visual de la opción B, con tema claro y tema oscuro. Usa variables de color.
- `images/ui/theme-dark.css`: versión oscura de los colores fijos de los CSS existentes, para que modales, paneles y tablas antiguas también se vean oscuros. Es un archivo generado y solo se activa en modo oscuro.
- `images/ui/theme-settings.js`: controla la pantalla de Configuración. Solo cambia atributos visuales (`data-theme`, `data-density`, `data-reduce-motion`) y guarda las preferencias en el navegador.

## Cambios en `index.html` (solo marcado)
1. Un script de 1 línea en `<head>` aplica el tema guardado antes de pintar la página, para que no parpadee.
2. Se cargan `theme-dark.css`, `theme.css` y `theme-settings.js`.
3. Botón luna/sol en la barra superior para cambiar de tema rápido.
4. Opción "Configuración" en el menú lateral, dentro de Otros.
5. Nueva vista `#view-configuracion` con:
   - Tema: Claro, Oscuro o Sistema (sigue al equipo y cambia solo si el equipo cambia).
   - Densidad de tablas: Compacta, Normal o Amplia.
   - Reducir animaciones.
   - Menú lateral contraído al iniciar (en computadoras).
6. Se mantienen los cambios anteriores: texto de marca junto al logo y títulos de grupo en el menú.

## Diseño
- Verde de la marca como color principal: botones, opción activa del menú con barra lateral y enlaces.
- Indicadores con un ícono pequeño junto a la etiqueta y el número grande debajo.
- Tablas limpias, estados en forma de píldora y nombres largos recortados con "…".
- Los logos siempre van sobre fondo blanco para que se lean en ambos temas.
- El cambio de tema es instantáneo, sin animación. Los botones se achican levemente al presionarlos. Menús y ventanas aparecen en 180–200 ms.
- Se respeta "reducir movimiento" del sistema y también la opción de Configuración.

## Nota
Las preferencias se guardan por navegador (`localStorage`), no en la base de datos.

## Cómo revertir
En `index.html`, borra:
- el `<script>` del tema en `<head>`;
- las líneas que cargan `theme-dark.css`, `theme.css` y `theme-settings.js`.
