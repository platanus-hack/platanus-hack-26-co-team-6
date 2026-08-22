/**
 * Semilla de sedes para desbloquear a los cuatro carriles desde el minuto 0.
 *
 * ⚠️ Coordenadas APROXIMADAS y servicios ILUSTRATIVOS. Esto NO es el REPS.
 *    Zaid lo reemplaza con el ETL real (scripts/etl/). Mientras tanto, Juan,
 *    Neid y Sebas trabajan contra esto sin esperar a nadie.
 *
 * Los perfiles de servicio estan escogidos para que el matching sea
 * INTERESANTE: solo algunas tienen hemodinamia (743), solo algunas
 * neurocirugia (245). Si todas tuvieran todo, el demo no mostraria nada.
 */

import type { Sede } from "./types";
import { SERVICIOS as S } from "./servicios-reps";

const U = S.URGENCIAS;

export const SEDES_MOCK: Sede[] = [
  {
    codigo: "MOCK-0001",
    nombre: "Fundación Santa Fe de Bogotá",
    direccion: "Cl 119 # 7-75",
    localidad: "Usaquén",
    coord: { lat: 4.6963, lng: -74.0308 },
    naturaleza: "Privada",
    complejidad: "alta",
    telefono: "601 6030303",
    servicios: [U, S.UCI_ADULTOS, S.UCI_PEDIATRICO, S.HEMODINAMIA, S.NEUROCIRUGIA, S.CIRUGIA_GENERAL, S.IMAGENES_IONIZANTES],
    camas: [
      { tipo: "CAMAS-Adultos", total: 180, ocupadasSnapshot: 151 },
      { tipo: "CAMAS-UCI Adultos", total: 42, ocupadasSnapshot: 37 },
    ],
  },
  {
    codigo: "MOCK-0002",
    nombre: "Fundación Cardioinfantil - LaCardio",
    direccion: "Cl 163A # 13B-60",
    localidad: "Usaquén",
    coord: { lat: 4.742, lng: -74.041 },
    naturaleza: "Privada",
    complejidad: "alta",
    telefono: "601 6672727",
    servicios: [U, S.UCI_ADULTOS, S.UCI_PEDIATRICO, S.UCI_NEONATAL, S.HEMODINAMIA, S.CIRUGIA_GENERAL, S.IMAGENES_IONIZANTES],
    camas: [
      { tipo: "CAMAS-Adultos", total: 210, ocupadasSnapshot: 168 },
      { tipo: "CAMAS-UCI Adultos", total: 56, ocupadasSnapshot: 44 },
    ],
  },
  {
    codigo: "MOCK-0003",
    nombre: "Fundación Clínica Shaio",
    direccion: "Dg 115A # 70C-75",
    localidad: "Suba",
    coord: { lat: 4.701, lng: -74.076 },
    naturaleza: "Privada",
    complejidad: "alta",
    telefono: "601 5938222",
    servicios: [U, S.UCI_ADULTOS, S.HEMODINAMIA, S.CIRUGIA_GENERAL, S.IMAGENES_IONIZANTES],
    camas: [
      { tipo: "CAMAS-Adultos", total: 140, ocupadasSnapshot: 129 },
      { tipo: "CAMAS-UCI Adultos", total: 38, ocupadasSnapshot: 36 },
    ],
  },
  {
    codigo: "MOCK-0004",
    nombre: "Hospital Universitario San Ignacio",
    direccion: "Cra 7 # 40-62",
    localidad: "Chapinero",
    coord: { lat: 4.628, lng: -74.0645 },
    naturaleza: "Privada",
    complejidad: "alta",
    telefono: "601 5946161",
    servicios: [U, S.UCI_ADULTOS, S.UCI_PEDIATRICO, S.UCI_NEONATAL, S.NEUROCIRUGIA, S.CIRUGIA_GENERAL, S.GINECOBSTETRICIA, S.IMAGENES_IONIZANTES],
    camas: [
      { tipo: "CAMAS-Adultos", total: 260, ocupadasSnapshot: 224 },
      { tipo: "CAMAS-UCI Adultos", total: 48, ocupadasSnapshot: 41 },
    ],
  },
  {
    codigo: "MOCK-0005",
    nombre: "Hospital Universitario Mayor - Méderi",
    direccion: "Cl 24 # 29-45",
    localidad: "Puente Aranda",
    coord: { lat: 4.618, lng: -74.087 },
    naturaleza: "Privada",
    complejidad: "alta",
    telefono: "601 5600520",
    servicios: [U, S.UCI_ADULTOS, S.HEMODINAMIA, S.NEUROCIRUGIA, S.CIRUGIA_GENERAL, S.GINECOBSTETRICIA],
    camas: [
      { tipo: "CAMAS-Adultos", total: 320, ocupadasSnapshot: 301 },
      { tipo: "CAMAS-UCI Adultos", total: 60, ocupadasSnapshot: 58 },
    ],
  },
  {
    codigo: "MOCK-0006",
    nombre: "Hospital Simón Bolívar - Subred Norte",
    direccion: "Cl 165 # 7-06",
    localidad: "Usaquén",
    coord: { lat: 4.748, lng: -74.035 },
    naturaleza: "Pública",
    complejidad: "alta",
    telefono: "601 6717700",
    servicios: [U, S.UCI_ADULTOS, S.UCI_PEDIATRICO, S.NEUROCIRUGIA, S.CIRUGIA_GENERAL, S.GINECOBSTETRICIA],
    camas: [
      { tipo: "CAMAS-Adultos", total: 290, ocupadasSnapshot: 279 },
      { tipo: "CAMAS-UCI Adultos", total: 44, ocupadasSnapshot: 43 },
    ],
  },
  {
    codigo: "MOCK-0007",
    nombre: "Hospital de Kennedy - Subred Sur Occidente",
    direccion: "Cra 80 # 48G-50 sur",
    localidad: "Kennedy",
    coord: { lat: 4.628, lng: -74.156 },
    naturaleza: "Pública",
    complejidad: "alta",
    telefono: "601 4520890",
    servicios: [U, S.UCI_ADULTOS, S.UCI_PEDIATRICO, S.UCI_NEONATAL, S.CIRUGIA_GENERAL, S.GINECOBSTETRICIA],
    camas: [
      { tipo: "CAMAS-Adultos", total: 310, ocupadasSnapshot: 298 },
      { tipo: "CAMAS-UCI Adultos", total: 40, ocupadasSnapshot: 39 },
    ],
  },
  {
    codigo: "MOCK-0008",
    nombre: "Hospital El Tunal - Subred Sur",
    direccion: "Cl 47B sur # 28-95",
    localidad: "Tunjuelito",
    coord: { lat: 4.572, lng: -74.13 },
    naturaleza: "Pública",
    complejidad: "alta",
    telefono: "601 7428500",
    servicios: [U, S.UCI_ADULTOS, S.UCI_PEDIATRICO, S.CIRUGIA_GENERAL, S.GINECOBSTETRICIA],
    camas: [
      { tipo: "CAMAS-Adultos", total: 240, ocupadasSnapshot: 231 },
      { tipo: "CAMAS-UCI Adultos", total: 32, ocupadasSnapshot: 31 },
    ],
  },
  {
    codigo: "MOCK-0009",
    nombre: "Hospital Santa Clara - Subred Centro Oriente",
    direccion: "Cra 15 # 1-59 sur",
    localidad: "Antonio Nariño",
    coord: { lat: 4.582, lng: -74.093 },
    naturaleza: "Pública",
    complejidad: "media",
    telefono: "601 4441100",
    servicios: [U, S.UCI_ADULTOS, S.CIRUGIA_GENERAL, S.GINECOBSTETRICIA],
    camas: [
      { tipo: "CAMAS-Adultos", total: 200, ocupadasSnapshot: 190 },
      { tipo: "CAMAS-UCI Adultos", total: 24, ocupadasSnapshot: 23 },
    ],
  },
  {
    codigo: "MOCK-0010",
    nombre: "Clínica del Country",
    direccion: "Cra 16 # 82-57",
    localidad: "Chapinero",
    coord: { lat: 4.669, lng: -74.053 },
    naturaleza: "Privada",
    complejidad: "alta",
    telefono: "601 5301270",
    servicios: [U, S.UCI_ADULTOS, S.HEMODINAMIA, S.CIRUGIA_GENERAL, S.IMAGENES_IONIZANTES],
    camas: [
      { tipo: "CAMAS-Adultos", total: 130, ocupadasSnapshot: 98 },
      { tipo: "CAMAS-UCI Adultos", total: 26, ocupadasSnapshot: 19 },
    ],
  },
  {
    codigo: "MOCK-0011",
    nombre: "Clínica Universitaria Colombia",
    direccion: "Cl 23 # 66-46",
    localidad: "Fontibón",
    coord: { lat: 4.654, lng: -74.1 },
    naturaleza: "Privada",
    complejidad: "alta",
    telefono: "601 4875000",
    servicios: [U, S.UCI_ADULTOS, S.UCI_PEDIATRICO, S.CIRUGIA_GENERAL, S.GINECOBSTETRICIA, S.IMAGENES_IONIZANTES],
    camas: [
      { tipo: "CAMAS-Adultos", total: 170, ocupadasSnapshot: 141 },
      { tipo: "CAMAS-UCI Adultos", total: 30, ocupadasSnapshot: 24 },
    ],
  },
  {
    codigo: "MOCK-0012",
    nombre: "Hospital Militar Central",
    direccion: "Tv 3 # 49-00",
    localidad: "Santa Fe",
    coord: { lat: 4.632, lng: -74.068 },
    naturaleza: "Pública",
    complejidad: "alta",
    telefono: "601 3486868",
    servicios: [U, S.UCI_ADULTOS, S.HEMODINAMIA, S.NEUROCIRUGIA, S.CIRUGIA_GENERAL, S.IMAGENES_IONIZANTES],
    camas: [
      { tipo: "CAMAS-Adultos", total: 250, ocupadasSnapshot: 205 },
      { tipo: "CAMAS-UCI Adultos", total: 36, ocupadasSnapshot: 30 },
    ],
  },
  {
    codigo: "MOCK-0013",
    nombre: "Clínica Palermo",
    direccion: "Cl 45C # 22-02",
    localidad: "Teusaquillo",
    coord: { lat: 4.635, lng: -74.07 },
    naturaleza: "Privada",
    complejidad: "media",
    telefono: "601 7457800",
    servicios: [U, S.UCI_ADULTOS, S.CIRUGIA_GENERAL, S.GINECOBSTETRICIA],
    camas: [
      { tipo: "CAMAS-Adultos", total: 110, ocupadasSnapshot: 82 },
      { tipo: "CAMAS-UCI Adultos", total: 18, ocupadasSnapshot: 13 },
    ],
  },
  {
    codigo: "MOCK-0014",
    nombre: "Clínica Reina Sofía",
    direccion: "Cra 31 # 125A-23",
    localidad: "Usaquén",
    coord: { lat: 4.698, lng: -74.053 },
    naturaleza: "Privada",
    complejidad: "alta",
    telefono: "601 4875000",
    servicios: [U, S.UCI_ADULTOS, S.UCI_NEONATAL, S.CIRUGIA_GENERAL, S.GINECOBSTETRICIA, S.IMAGENES_IONIZANTES],
    camas: [
      { tipo: "CAMAS-Adultos", total: 160, ocupadasSnapshot: 124 },
      { tipo: "CAMAS-UCI Adultos", total: 28, ocupadasSnapshot: 21 },
    ],
  },
];

/** Punto de origen por defecto del demo: Plaza de Bolívar. */
export const ORIGEN_DEMO = { lat: 4.5981, lng: -74.0758 };

/**
 * Dictados de prueba. Neid los usa como fixtures del parser, Sebas los usa
 * en el pitch, Juan los pone como botones de "cargar ejemplo".
 */
export const DICTADOS_DEMO = [
  {
    etiqueta: "IAM inferior",
    texto:
      "Paciente masculino de 54 años, dolor precordial opresivo de 40 minutos de evolución, " +
      "irradiado a mandíbula, diaforético. Electro con supradesnivel del ST en DII, DIII y aVF. " +
      "Tensión 85 sobre 50, hemodinámicamente inestable. Vamos en móvil medicalizado.",
    esperado: "triage 2, servicios 743 + 110, complejidad alta",
  },
  {
    etiqueta: "ACV isquémico",
    texto:
      "Femenina de 68 años, inicio súbito hace 50 minutos de hemiparesia derecha y afasia de expresión. " +
      "Glasgow 13. Glicemia 110. Antecedente de fibrilación auricular. Presión 170 sobre 95.",
    esperado: "triage 2, servicios 245 + 110 + 744, complejidad alta",
  },
  {
    etiqueta: "Politrauma pediátrico",
    texto:
      "Menor de 9 años, atropellamiento en vía pública. Trauma craneoencefálico con Glasgow 9, " +
      "deformidad en fémur izquierdo, abdomen distendido y doloroso. Taquicárdico en 140, " +
      "palidez marcada. Requiere manejo de vía aérea.",
    esperado: "triage 1, servicios 203 + 109 + 245, complejidad alta, requiere TAM",
  },
];
