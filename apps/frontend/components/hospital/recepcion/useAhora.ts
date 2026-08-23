"use client";

/**
 * El reloj de la pantalla, en un solo sitio.
 *
 * Los tres relojes del prearribo cuentan contra instantes distintos (la
 * llegada estimada, el primer contacto médico, la hora de cada confirmación),
 * pero todos necesitan la MISMA lectura de "ahora". Con un `Date.now()` suelto
 * en cada componente, dos números que deberían cuadrar se separan por unos
 * milisegundos y en pantalla se ve como si uno estuviera atrasado.
 *
 * Tick de 1 s: los relojes se muestran en mm:ss y en minutos. Más fino sería
 * repintar la pantalla entera para no cambiar ni un dígito — y esto vive
 * encendido en una pared 24 horas.
 *
 * `prefers-reduced-motion` no lo apaga: un cronómetro que avanza no es una
 * animación decorativa, es el dato.
 *
 * NO es `useCuentaAtras`, y no se reusa a propósito: aquel cuenta el plazo de
 * UN handshake entre `enviadoEn` y `expiraEn` —dos instantes que sella el
 * servidor— y devuelve la fracción de esa barra. Aquí hay tres cuentas contra
 * tres orígenes distintos y ninguna es un handshake. Lo que sí se respeta es
 * su regla de fondo: los instantes vienen del servidor y el cliente solo los
 * resta. Ningún plazo se inventa aquí.
 */

import { useEffect, useState } from "react";

export function useAhora(intervaloMs = 1000): number {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);

  return ahora;
}
