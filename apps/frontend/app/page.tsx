/**
 * Landing de PULSO — lenguaje visual Pulsewave sobre los tokens de Sebas.
 *
 * La vieja "puerta de entrada" (selector de rol) no desapareció: los links
 * a /campo, /hospital y /crue viven en el menú del header, en la sección
 * "Pantallas" y en el footer.
 *
 * Estructura del efecto cortina: <main> con z-10 y el footer sticky con
 * z-0 — el contenido se desliza y revela el footer al llegar al final.
 */

import { Geist, Geist_Mono } from "next/font/google";
import { HeaderLanding } from "@/components/landing/HeaderLanding";
import { Hero } from "@/components/landing/Hero";
import { ComoFunciona } from "@/components/landing/ComoFunciona";
import { FraseAnclada } from "@/components/landing/FraseAnclada";
import { Pantallas } from "@/components/landing/Pantallas";
import { Impacto } from "@/components/landing/Impacto";
import { Preguntas } from "@/components/landing/Preguntas";
import { PieCortina } from "@/components/landing/PieCortina";

const geist = Geist({ subsets: ["latin"] });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export default function Home() {
  return (
    <div
      className={`${geist.className} ${geistMono.variable} overflow-x-clip bg-fondo text-texto antialiased`}
    >
      <HeaderLanding />
      <main className="bg-fondo lg:relative lg:z-10">
        <Hero />
        <ComoFunciona />
        <FraseAnclada />
        <Pantallas />
        <Impacto />
        <Preguntas />
      </main>
      <PieCortina />
    </div>
  );
}
