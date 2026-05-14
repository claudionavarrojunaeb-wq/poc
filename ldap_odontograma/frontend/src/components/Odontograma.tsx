/**
 * Odontograma.tsx
 *
 * Componente React que renderiza un odontograma dental interactivo.
 * Un odontograma es el esquema gráfico que representa el estado de todas
 * las piezas dentales de un paciente. Se usa en odontología para registrar
 * diagnósticos, tratamientos y condiciones de cada diente.
 *
 * Estructura del odontograma:
 * - Se organizan 32 piezas dentales en 4 cuadrantes (según numeración FDI/ISO):
 *   - Cuadrante 1 (superior derecho): piezas 11-18 (del central al tercer molar)
 *   - Cuadrante 2 (superior izquierdo): piezas 21-28
 *   - Cuadrante 3 (inferior izquierdo): piezas 31-38
 *   - Cuadrante 4 (inferior derecho): piezas 41-48
 *
 * Cada pieza dental se dibuja como un SVG con 5 zonas clickeables:
 *   top (oclusal/incisal superior), bottom (oclusal inferior), left, right, center
 *
 * El usuario puede hacer clic en cada zona para cambiar su estado (color/condición).
 */

import React, { useState, useCallback } from "react";
import { getCsrfToken } from "../csrf";
import { useNavigate } from "react-router-dom";

// Importación estática de imágenes de piezas dentales.
// Vite resuelve las rutas en tiempo de build y devuelve la URL del asset.
import imgPieza11 from "../assets/pieza11.png";
import imgPieza12 from "../assets/pieza12.png";
import imgPieza13 from "../assets/pieza13.png";
import imgPieza14 from "../assets/pieza14.png";
import imgPieza15 from "../assets/pieza15.png";
import imgPieza16 from "../assets/pieza16.png";
import imgPieza17 from "../assets/pieza17.png";
import imgPieza18 from "../assets/pieza18.png";

import imgPieza21 from "../assets/pieza21.png";
import imgPieza22 from "../assets/pieza22.png";
import imgPieza23 from "../assets/pieza23.png";
import imgPieza24 from "../assets/pieza24.png";
import imgPieza25 from "../assets/pieza25.png";
import imgPieza26 from "../assets/pieza26.png";
import imgPieza27 from "../assets/pieza27.png";
import imgPieza28 from "../assets/pieza28.png";

import imgPieza31 from "../assets/pieza31.png";
import imgPieza32 from "../assets/pieza32.png";
import imgPieza33 from "../assets/pieza33.png";
import imgPieza34 from "../assets/pieza34.png";
import imgPieza35 from "../assets/pieza35.png";
import imgPieza36 from "../assets/pieza36.png";
import imgPieza37 from "../assets/pieza37.png";
import imgPieza38 from "../assets/pieza38.png";

import imgPieza41 from "../assets/pieza41.png";
import imgPieza42 from "../assets/pieza42.png";
import imgPieza43 from "../assets/pieza43.png";
import imgPieza44 from "../assets/pieza44.png";
import imgPieza45 from "../assets/pieza45.png";
import imgPieza46 from "../assets/pieza46.png";
import imgPieza47 from "../assets/pieza47.png";
import imgPieza48 from "../assets/pieza48.png";

import imgPieza51 from "../assets/pieza51.png";
import imgPieza52 from "../assets/pieza52.png";
import imgPieza53 from "../assets/pieza53.png";
import imgPieza54 from "../assets/pieza54.png";
import imgPieza55 from "../assets/pieza55.png";

import imgPieza61 from "../assets/pieza61.png";
import imgPieza62 from "../assets/pieza62.png";
import imgPieza63 from "../assets/pieza63.png";
import imgPieza64 from "../assets/pieza64.png";
import imgPieza65 from "../assets/pieza65.png";

import imgPieza71 from "../assets/pieza71.png";
import imgPieza72 from "../assets/pieza72.png";
import imgPieza73 from "../assets/pieza73.png";
import imgPieza74 from "../assets/pieza74.png";
import imgPieza75 from "../assets/pieza75.png";

import imgPieza81 from "../assets/pieza81.png";
import imgPieza82 from "../assets/pieza82.png";
import imgPieza83 from "../assets/pieza83.png";
import imgPieza84 from "../assets/pieza84.png";
import imgPieza85 from "../assets/pieza85.png";
/**
 * Mapa de imagen por número de pieza: asocia cada número FDI a un objeto con:
 * - url: la URL de la imagen PNG
 * - size: el tamaño recomendado para la pieza (porcentaje string, ej: '50%')
 *
 * El tamaño se define según los criterios visuales actuales del odontograma.
 */
// vertical: controla la alineación vertical de la imagen dentro del bloque.
// 'top' = flex-start, 'center' = center, 'bottom' = flex-end (base del bloque).
type ImagenPieza = { url: string, size: string, vertical?: 'top' | 'center' | 'bottom' };
const IMAGENES_PIEZAS: Record<number, ImagenPieza> = {
  11: { url: imgPieza11, size: '60%' },
  12: { url: imgPieza12, size: '50%' },
  13: { url: imgPieza13, size: '50%' },
  14: { url: imgPieza14, size: '50%' },
  15: { url: imgPieza15, size: '50%' },
  16: { url: imgPieza16, size: '60%' },
  17: { url: imgPieza17, size: '60%' },
  18: { url: imgPieza18, size: '60%' },

  21: { url: imgPieza21, size: '60%' },
  22: { url: imgPieza22, size: '50%' },
  23: { url: imgPieza23, size: '50%' },
  24: { url: imgPieza24, size: '50%' },
  25: { url: imgPieza25, size: '50%' },
  26: { url: imgPieza26, size: '60%' },
  27: { url: imgPieza27, size: '60%' },
  28: { url: imgPieza28, size: '60%' },

  31: { url: imgPieza31, size: '50%' },
  32: { url: imgPieza32, size: '50%' },
  33: { url: imgPieza33, size: '50%' },
  34: { url: imgPieza34, size: '50%' },
  35: { url: imgPieza35, size: '50%' },
  36: { url: imgPieza36, size: '60%' },
  37: { url: imgPieza37, size: '60%' },
  38: { url: imgPieza38, size: '60%' },

  41: { url: imgPieza41, size: '50%' },
  42: { url: imgPieza42, size: '50%' },
  43: { url: imgPieza43, size: '50%' },
  44: { url: imgPieza44, size: '50%' },
  45: { url: imgPieza45, size: '50%' },
  46: { url: imgPieza46, size: '60%' },
  47: { url: imgPieza47, size: '60%' },
  48: { url: imgPieza48, size: '60%' },

  // Temporal superior: vertical 'bottom' = imagen alineada en la base del bloque (pegada al SVG)
  51: { url: imgPieza51, size: '50%' },
  52: { url: imgPieza52, size: '40%' },
  53: { url: imgPieza53, size: '40%' },
  54: { url: imgPieza54, size: '40%' },
  55: { url: imgPieza55, size: '40%' },

  // Temporal superior izquierdo: ídem
  61: { url: imgPieza61, size: '50%' },
  62: { url: imgPieza62, size: '40%' },
  63: { url: imgPieza63, size: '40%' },
  64: { url: imgPieza64, size: '40%' },
  65: { url: imgPieza65, size: '40%' },

  71: { url: imgPieza71, size: '40%' },
  72: { url: imgPieza72, size: '40%' },
  73: { url: imgPieza73, size: '40%' },
  74: { url: imgPieza74, size: '40%' },
  75: { url: imgPieza75, size: '40%' },

  81: { url: imgPieza81, size: '40%' },
  82: { url: imgPieza82, size: '40%' },
  83: { url: imgPieza83, size: '40%' },
  84: { url: imgPieza84, size: '40%' },
  85: { url: imgPieza85, size: '40%' },
};

// ---------------------------------------------------------------------------
// TIPOS Y CONSTANTES
// ---------------------------------------------------------------------------

/**
 * Zonas de una pieza dental que pueden marcarse individualmente.
 * Representan las 5 caras del diente en vista esquemática.
 */
type ZonaDiente = "top" | "bottom" | "left" | "right" | "center";

/**
 * Estado de color/condición de una zona dental.
 * Cada condición tiene un color asociado que se usa al pintar el SVG.
 */
type Condicion = "sano" | "caries" | "restaurado" | "ausente" | "corona" | "extraccion";

/**
 * Mapa de condiciones disponibles con su color de representación.
 * Permite al usuario seleccionar qué condición quiere marcar antes de
 * hacer clic sobre una pieza dental.
 */
const CONDICIONES: Record<Condicion, { color: string; label: string }> = {
  sano:       { color: "transparent", label: "Sano" },
  caries:     { color: "#ef4444",     label: "Caries" },
  restaurado: { color: "#3b82f6",     label: "Restaurado" },
  ausente:    { color: "#6b7280",     label: "Ausente" },
  corona:     { color: "#f59e0b",     label: "Corona" },
  extraccion: { color: "#7c3aed",     label: "Extracción indicada" },
};

/**
 * Estado de un diente completo: para cada zona guarda la condición marcada.
 */
type EstadoDiente = Record<ZonaDiente, Condicion>;

/**
 * Estado global del odontograma: un mapa de número de pieza → EstadoDiente.
 */
type EstadoOdontograma = Record<number, EstadoDiente>;

/**
 * Estado inicial (vacío) para una pieza dental: todas las zonas están "sanas".
 */
const estadoInicialDiente = (): EstadoDiente => ({
  top: "sano", bottom: "sano", left: "sano", right: "sano", center: "sano",
});

// ---------------------------------------------------------------------------
// DEFINICIÓN DE CUADRANTES Y NUMERACIÓN FDI
// ---------------------------------------------------------------------------

/**
 * Los 4 cuadrantes permanentes + 4 cuadrantes deciduos (temporales) del
 * odontograma según la numeración FDI internacional.
 *
 * Dentición permanente (adulto):
 *   Cuadrante 1 (superior derecho del paciente): 18→11 (izquierda en pantalla)
 *   Cuadrante 2 (superior izquierdo del paciente): 21→28 (derecha en pantalla)
 *   Cuadrante 3 (inferior izquierdo del paciente): 31→38 (derecha en pantalla)
 *   Cuadrante 4 (inferior derecho del paciente): 48→41 (izquierda en pantalla)
 *
 * Dentición temporal (decidua / de leche):
 *   Cuadrante 5 (superior derecho temporal): 55→51 (izquierda en pantalla)
 *   Cuadrante 6 (superior izquierdo temporal): 61→65 (derecha en pantalla)
 *   Cuadrante 7 (inferior izquierdo temporal): 71→75 (derecha en pantalla)
 *   Cuadrante 8 (inferior derecho temporal): 85→81 (izquierda en pantalla)
 *
 * Los arrays están en el orden en que se dibujan de izquierda a derecha.
 */
const CUADRANTES = {
  // --- Dentición permanente ---
  superiorDerecho:   [18, 17, 16, 15, 14, 13, 12, 11],
  superiorIzquierdo: [21, 22, 23, 24, 25, 26, 27, 28],
  inferiorDerecho:   [48, 47, 46, 45, 44, 43, 42, 41],
  inferiorIzquierdo: [31, 32, 33, 34, 35, 36, 37, 38],
  // --- Dentición temporal (decidua) ---
  // Superior derecho temporal: de la más distal al central (55→51)
  temporalSuperiorDerecho:   [55, 54, 53, 52, 51],
  // Superior izquierdo temporal: del central al más distal (61→65)
  temporalSuperiorIzquierdo: [61, 62, 63, 64, 65],
  // Inferior derecho temporal: de la más distal al central (85→81)
  temporalInferiorDerecho:   [85, 84, 83, 82, 81],
  // Inferior izquierdo temporal: del central al más distal (71→75)
  temporalInferiorIzquierdo: [71, 72, 73, 74, 75],
};

// ---------------------------------------------------------------------------
// SUBCOMPONENTE: PiezaDental
// ---------------------------------------------------------------------------

/**
 * Props del componente PiezaDental.
 * Ahora recibe imageData: { url, size } para permitir tamaño dinámico por pieza.
 */
interface PiezaDentalProps {
  numero: number;
  estado: EstadoDiente;
  onZonaClick: (numero: number, zona: ZonaDiente) => void;
  numeroArriba: boolean;
  imageData?: ImagenPieza;
}

/**
 * PiezaDental
 *
 * Dibuja una pieza dental individual como un SVG de 40×40 px.
 * La pieza está dividida en 5 zonas clickeables:
 * - 4 trapecios (top, bottom, left, right) entre el borde exterior y el cuadrado central
 * - 1 rectángulo central (center)
 *
 * La geometría de trapecios evita cualquier línea diagonal sobre el cuadrado
 * central: cada trapecio tiene sus bordes alineados horizontal o verticalmente
 * con los lados del cuadrado interior.
 *
 *   ┌─────────────────┐
 *   │  ──── TOP ────  │
 *   │ L│  CENTER  │R  │
 *   │  ─── BOTTOM ─── │
 *   └─────────────────┘
 */
const PiezaDental: React.FC<PiezaDentalProps> = ({
  numero,
  estado,
  onZonaClick,
  numeroArriba,
  imageData,
}) => {
  // Dimensiones del SVG de la pieza
  const SIZE = 40;
  const MARGIN = 4;       // margen interior para los triángulos
  const CENTER_PAD = 12;  // padding del rectángulo central

  /**
   * Devuelve el color de relleno para una zona determinada.
   * Si la condición es "sano", el fondo es transparente (sin marca).
   */
  const colorZona = (zona: ZonaDiente): string =>
    CONDICIONES[estado[zona]].color;

  /**
   * Determina si una zona tiene una condición marcada (distinta de "sano").
   * Se usa para añadir un stroke más visible cuando hay marca.
   */
  const marcada = (zona: ZonaDiente): boolean => estado[zona] !== "sano";

  // Puntos de los 5 polígonos que forman la pieza dental
  // El SVG tiene coordenadas de 0,0 a SIZE,SIZE (40x40)

  // Bloque imagen+número de altura fija: 34px = imagen 22px + número 12px
  // Se usa en ambas arcadas para garantizar alineación vertical entre superior e inferior
  const IMG_H = 40;
  const LABEL_H = 16;
  const BLOCK_H = IMG_H + LABEL_H;

  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // El tamaño de la imagen ahora viene de imageData.size (porcentaje string)
  // -------------------------------------------------------------------------
  const widthImg = imageData?.size || '50%';
  // Formatea el número de pieza para mostrar un punto entre los dígitos (ej: 46 → 4.6)
  const numeroFormateado = numero >= 10 && numero <= 99 ? `${String(numero)[0]}.${String(numero)[1]}` : numero;

  return (
    <div className="flex flex-col items-center" style={{ gap: 0 }}>
      {/* ARCADA SUPERIOR: imagen arriba, número abajo, luego SVG.
          Estructura: bloque fijo BLOCK_H → wrapper imagen (BLOCK_H-LABEL_H) → label.
          El wrapper controla la alineación vertical con justifyContent según 'vertical'.
          La imagen usa height:auto igual que en la arcada inferior, sin restricciones.
      */}
      {numeroArriba && (
        <div style={{ height: (numero >= 11 && numero <= 28) ? 86 : BLOCK_H, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{
            height: (numero >= 11 && numero <= 28) ? 70 : (BLOCK_H - LABEL_H),
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent:
              imageData?.vertical === 'top' ? 'flex-start' :
              imageData?.vertical === 'center' ? 'center' :
              'flex-end',
            overflow: 'hidden',
          }}>
            {imageData?.url
              ? <img
                  src={imageData.url}
                  alt={`Diente ${numero}`}
                  style={{ width: widthImg, height: 'auto', display: 'block', margin: '0 auto' }}
                />
              : <div style={{ height: (numero >= 11 && numero <= 28) ? 70 : (BLOCK_H - LABEL_H) }} />}
          </div>
          <span className="text-[9px] font-mono text-gray-500 leading-none" style={{ height: LABEL_H, display: 'flex', alignItems: 'flex-end' }}>{numeroFormateado}</span>
        </div>
      )}

      {/* SVG de la pieza dental */}
      <svg
        width={IMG_H}
        height={IMG_H}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="cursor-pointer"
        style={{ display: "block" }}
      >
        {/* Borde exterior del diente */}
        <rect
          x={MARGIN}
          y={MARGIN}
          width={SIZE - MARGIN * 2}
          height={SIZE - MARGIN * 2}
          fill="transparent"
          stroke="#374151"
          strokeWidth="1.5"
        />

        {/* ZONA TOP: trapecio superior
            Vértices: esquina-sup-izq exterior → esquina-sup-der exterior
                      → esquina-sup-der interior → esquina-sup-izq interior
            No hay diagonal cruzando el centro; el borde inferior del trapecio
            coincide exactamente con el borde superior del rectángulo central.
        */}
        <polygon
          points={`${MARGIN},${MARGIN} ${SIZE - MARGIN},${MARGIN} ${SIZE - CENTER_PAD},${CENTER_PAD} ${CENTER_PAD},${CENTER_PAD}`}
          fill={colorZona("top")}
          stroke={marcada("top") ? "#1f2937" : "#9ca3af"}
          strokeWidth="0.5"
          onClick={() => onZonaClick(numero, "top")}
          className="hover:opacity-80 transition-opacity"
        />

        {/* ZONA BOTTOM: trapecio inferior */}
        <polygon
          points={`${MARGIN},${SIZE - MARGIN} ${SIZE - MARGIN},${SIZE - MARGIN} ${SIZE - CENTER_PAD},${SIZE - CENTER_PAD} ${CENTER_PAD},${SIZE - CENTER_PAD}`}
          fill={colorZona("bottom")}
          stroke={marcada("bottom") ? "#1f2937" : "#9ca3af"}
          strokeWidth="0.5"
          onClick={() => onZonaClick(numero, "bottom")}
          className="hover:opacity-80 transition-opacity"
        />

        {/* ZONA LEFT: trapecio izquierdo */}
        <polygon
          points={`${MARGIN},${MARGIN} ${MARGIN},${SIZE - MARGIN} ${CENTER_PAD},${SIZE - CENTER_PAD} ${CENTER_PAD},${CENTER_PAD}`}
          fill={colorZona("left")}
          stroke={marcada("left") ? "#1f2937" : "#9ca3af"}
          strokeWidth="0.5"
          onClick={() => onZonaClick(numero, "left")}
          className="hover:opacity-80 transition-opacity"
        />

        {/* ZONA RIGHT: trapecio derecho */}
        <polygon
          points={`${SIZE - MARGIN},${MARGIN} ${SIZE - MARGIN},${SIZE - MARGIN} ${SIZE - CENTER_PAD},${SIZE - CENTER_PAD} ${SIZE - CENTER_PAD},${CENTER_PAD}`}
          fill={colorZona("right")}
          stroke={marcada("right") ? "#1f2937" : "#9ca3af"}
          strokeWidth="0.5"
          onClick={() => onZonaClick(numero, "right")}
          className="hover:opacity-80 transition-opacity"
        />

        {/* ZONA CENTER: rectángulo central independiente.
            Sus bordes coinciden exactamente con los bordes interiores de los
            4 trapecios, por lo que no aparecen líneas diagonales sobre él.
        */}
        <rect
          x={CENTER_PAD}
          y={CENTER_PAD}
          width={SIZE - CENTER_PAD * 2}
          height={SIZE - CENTER_PAD * 2}
          fill={colorZona("center")}
          stroke={marcada("center") ? "#1f2937" : "#9ca3af"}
          strokeWidth="0.5"
          onClick={() => onZonaClick(numero, "center")}
          className="hover:opacity-80 transition-opacity cursor-pointer"
        />
      </svg>

      {/* ARCADA INFERIOR: SVG arriba, luego número, luego imagen */}
      {!numeroArriba && (
        <div style={{ height: BLOCK_H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start' }}>
          <span className="text-[9px] font-mono text-gray-500 leading-none" style={{ height: LABEL_H, display: 'flex', alignItems: 'flex-start' }}>{numeroFormateado}</span>
          {imageData?.url
            ? <img
                src={imageData.url}
                alt={`Diente ${numero}`}
                style={{
                  width: widthImg,
                  height: 'auto',
                  display: 'block',
                  margin: '0 auto'
                }}
              />
            : <div style={{ height: IMG_H }} />}
        </div>
      )}
    </div>
  );
};

// COMPONENTE PRINCIPAL: Odontograma
// ---------------------------------------------------------------------------

/**
 * Odontograma
 *
 * Componente principal que orquesta el odontograma completo.
 *
 * Estructura visual:
 *
 *   [C5: 55→51] | [C6: 61→65]   ← dentición temporal superior
 *   [C1: 18→11] | [C2: 21→28]   ← arcada permanente superior
 *   ──────────────────────────────────────────────────────────
 *   [C4: 48→41] | [C3: 31→38]   ← arcada permanente inferior
 *   [C8: 85→81] | [C7: 71→75]   ← dentición temporal inferior
 *
 * Estado:
 * - `estadoOdontograma`: mapa de número de pieza → EstadoDiente
 * - `condicionActiva`: condición que se marcará al hacer clic
 *
 * Al hacer clic en una zona de un diente, se actualiza el estado de esa
 * zona en esa pieza. Si la zona ya tenía esa condición, se resetea a "sano"
 * (toggle: clic doble desmarca).
 */
const Odontograma: React.FC = () => {
  // Estado para mostrar/ocultar la previsualización JSON
  const [showPreview, setShowPreview] = useState(false);
  // Hook de navegación para redirigir tras logout
  const navigate = useNavigate();
    // Handler de logout: elimina sesión, refresh y CSRF, limpia localStorage y recarga login
    const handleLogout = async () => {
      try {
        const headers: Record<string, string> = {};
        const csrf = getCsrfToken();
        if (csrf) headers["X-CSRF-Token"] = csrf;
        await fetch("/api/logout", { method: "POST", credentials: "include", headers });
      } catch {
        /* ignore */
      }
      try { if (window && window.localStorage) window.localStorage.removeItem('ssmm_csrf') } catch { /* ignore */ }
      navigate("/login");
      setTimeout(() => window.location.reload(), 100);
    };
  // -------------------------------------------------------------------------
  // Estado del odontograma
  // -------------------------------------------------------------------------

  /**
   * estadoOdontograma: objeto que contiene el estado de cada pieza dental.
   * Se inicializa con todas las piezas en estado "sano" en todas las zonas.
   */
  const [estadoOdontograma, setEstadoOdontograma] = useState<EstadoOdontograma>(() => {
    // Genera el estado inicial para las 32 piezas permanentes y las 20 deciduas
    const todasLasPiezas = [
      ...CUADRANTES.superiorDerecho,
      ...CUADRANTES.superiorIzquierdo,
      ...CUADRANTES.inferiorDerecho,
      ...CUADRANTES.inferiorIzquierdo,
      ...CUADRANTES.temporalSuperiorDerecho,
      ...CUADRANTES.temporalSuperiorIzquierdo,
      ...CUADRANTES.temporalInferiorDerecho,
      ...CUADRANTES.temporalInferiorIzquierdo,
    ];
    return Object.fromEntries(
      todasLasPiezas.map((n) => [n, estadoInicialDiente()])
    );
  });

  /**
   * condicionActiva: la condición que se aplicará al hacer clic en una zona.
   * El usuario la selecciona desde la paleta de condiciones.
   */
  const [condicionActiva, setCondicionActiva] = useState<Condicion>("caries");

  // -------------------------------------------------------------------------
  // Handler de clic en zona de pieza
  // -------------------------------------------------------------------------

  /**
   * handleZonaClick
   *
   * Se ejecuta cuando el usuario hace clic en una zona de una pieza dental.
   * Aplica la condición activa a esa zona. Si ya tenía esa condición (toggle),
   * la resetea a "sano".
   *
   * @param numero - Número FDI de la pieza dental
   * @param zona   - Zona que fue clicada (top, bottom, left, right, center)
   */
  const handleZonaClick = useCallback((numero: number, zona: ZonaDiente) => {
    setEstadoOdontograma((prev) => {
      const estadoPieza = prev[numero] ?? estadoInicialDiente();
      const condicionActual = estadoPieza[zona];
      // Toggle: si ya tiene esta condición, vuelve a "sano"
      const nuevaCondicion: Condicion =
        condicionActual === condicionActiva ? "sano" : condicionActiva;
      return {
        ...prev,
        [numero]: {
          ...estadoPieza,
          [zona]: nuevaCondicion,
        },
      };
    });
  }, [condicionActiva]);

  // -------------------------------------------------------------------------
  // Handler de reset
  // -------------------------------------------------------------------------

  /**
   * handleReset
   *
   * Limpia todo el odontograma, volviendo todas las piezas a estado "sano".
   */
  const handleReset = () => {
    setEstadoOdontograma((prev) => {
      const reseteado: EstadoOdontograma = {};
      for (const key of Object.keys(prev)) {
        reseteado[Number(key)] = estadoInicialDiente();
      }
      return reseteado;
    });
  };


  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-xl shadow-md w-fit mx-auto">
      {/* Botón de logout en la parte superior derecha */}
      <div className="w-full flex justify-end mb-2">
        <button
          onClick={handleLogout}
          className="px-3 py-1 text-xs rounded border border-gray-300 text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>

      {/* Título */}
      <h2 className="text-lg font-bold text-gray-700 tracking-wide">Odontograma</h2>

      {/* ----------------------------------------------------------------- */}
      {/* PALETA DE CONDICIONES                                              */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-wrap gap-2 justify-center">
        {(Object.keys(CONDICIONES) as Condicion[]).map((cond) => (
          <button
            key={cond}
            onClick={() => setCondicionActiva(cond)}
            className={`
              flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-all
              ${condicionActiva === cond
                ? "border-gray-800 shadow-md scale-105"
                : "border-gray-300 opacity-70 hover:opacity-100"}
            `}
            title={CONDICIONES[cond].label}
          >
            {/* Muestra un círculo del color de la condición */}
            <span
              className="inline-block w-3 h-3 rounded-full border border-gray-400"
              style={{
                backgroundColor: CONDICIONES[cond].color === "transparent"
                  ? "#e5e7eb"
                  : CONDICIONES[cond].color,
              }}
            />
            {CONDICIONES[cond].label}
          </button>
        ))}
      </div>

      {/* ================================================================= */}
      {/* BLOQUE CENTRAL DEL ODONTOGRAMA                                    */}
      {/* Orden visual (de arriba a abajo):                                 */}
      {/*   1. Dentición temporal superior (C5 + C6)                        */}
      {/*   2. Dentición permanente superior (C1 + C2)                      */}
      {/*   3. Línea media horizontal                                        */}
      {/*   4. Dentición permanente inferior (C4 + C3)                      */}
      {/*   5. Dentición temporal inferior (C8 + C7)                        */}
      {/* ================================================================= */}
      <div className="flex flex-col items-center gap-0">

        {/* ---------------------------------------------------------------- */}
        {/* DENTICIÓN TEMPORAL SUPERIOR (cuadrantes 5 y 6)                  */}
        {/* Enmarcada con borde punteado para distinguirla de la permanente  */}
        {/* ---------------------------------------------------------------- */}
        {/*
          Se aumenta el margen inferior (mb-8) para separar la arcada temporal superior
          de la definitiva superior y evitar solapamiento visual.
        */}
        <div className="flex flex-row gap-1 items-end border border-dashed border-blue-300 rounded px-2 py-1 mb-8 bg-blue-50/40">
          <div className="flex flex-col items-center">
            <span className="text-[8px] text-blue-400 mb-0.5">Temp. Sup. Der.</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 42px)', columnGap: 2 }}>
              {CUADRANTES.temporalSuperiorDerecho.map(n => (
                <PiezaDental
                  key={`tempsup-der-${n}`}
                  numero={n}
                  estado={estadoOdontograma[n] ?? estadoInicialDiente()}
                  onZonaClick={handleZonaClick}
                  numeroArriba={true}
                  imageData={IMAGENES_PIEZAS[n]}
                />
              ))}
            </div>
          </div>
          <div className="w-px h-8 bg-blue-300 self-center mx-1" />
          <div className="flex flex-col items-center">
            <span className="text-[8px] text-blue-400 mb-0.5">Temp. Sup. Izq.</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 42px)', columnGap: 2 }}>
              {CUADRANTES.temporalSuperiorIzquierdo.map(n => (
                <PiezaDental
                  key={`tempsup-izq-${n}`}
                  numero={n}
                  estado={estadoOdontograma[n] ?? estadoInicialDiente()}
                  onZonaClick={handleZonaClick}
                  numeroArriba={true}
                  imageData={IMAGENES_PIEZAS[n]}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* ARCADAS PERMANENTES: dos grids con el mismo gridTemplateColumns  */}
        {/* garantiza alineación perfecta columna a columna.                 */}
        {/* ---------------------------------------------------------------- */}
        {/* Constante compartida: 8 columnas de 42px, separador 14px, 8 cols */}
        {(() => {
          const COLS = "repeat(8, 42px) 14px repeat(8, 42px)";
          const SEP = (
            <div
              style={{
                gridColumn: 9,
                alignSelf: "stretch",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <div style={{ width: 2, height: "100%", minHeight: 40, background: "#bdbdbd", borderRadius: 1 }} />
            </div>
          );
          return (
            <>
              {/* ARCADA SUPERIOR */}
              <div style={{ display: "grid", gridTemplateColumns: COLS, columnGap: 2, alignItems: "end" }}>
                {CUADRANTES.superiorDerecho.map(n => (
                  <PiezaDental key={`sup-${n}`} numero={n}
                    estado={estadoOdontograma[n] ?? estadoInicialDiente()}
                    onZonaClick={handleZonaClick} numeroArriba={true}
                    imageData={IMAGENES_PIEZAS[n]} />
                ))}
                {SEP}
                {CUADRANTES.superiorIzquierdo.map(n => (
                  <PiezaDental key={`sup-${n}`} numero={n}
                    estado={estadoOdontograma[n] ?? estadoInicialDiente()}
                    onZonaClick={handleZonaClick} numeroArriba={true}
                    imageData={IMAGENES_PIEZAS[n]} />
                ))}
              </div>
              {/* Línea horizontal */}
              <div style={{ height: 1, background: "#d1d5db", margin: "3px 0" }} />
              {/* ARCADA INFERIOR */}
              <div style={{ display: "grid", gridTemplateColumns: COLS, columnGap: 2, alignItems: "start" }}>
                {CUADRANTES.inferiorDerecho.map(n => (
                  <PiezaDental key={`inf-${n}`} numero={n}
                    estado={estadoOdontograma[n] ?? estadoInicialDiente()}
                    onZonaClick={handleZonaClick} numeroArriba={false}
                    imageData={IMAGENES_PIEZAS[n]} />
                ))}
                {SEP}
                {CUADRANTES.inferiorIzquierdo.map(n => (
                  <PiezaDental key={`inf-${n}`} numero={n}
                    estado={estadoOdontograma[n] ?? estadoInicialDiente()}
                    onZonaClick={handleZonaClick} numeroArriba={false}
                    imageData={IMAGENES_PIEZAS[n]} />
                ))}
              </div>
            </>
          );
        })()}

        {/* ---------------------------------------------------------------- */}
        {/* DENTICIÓN TEMPORAL INFERIOR (cuadrantes 8 y 7)                  */}
        {/* Enmarcada con borde punteado, análoga a la temporal superior     */}
        {/* ---------------------------------------------------------------- */}
        {/*
          Se aumenta el margen superior (mt-8) para separar la arcada temporal inferior
          de la definitiva inferior y evitar solapamiento visual.
        */}
        <div className="flex flex-row gap-1 items-start border border-dashed border-blue-300 rounded px-2 py-1 mt-8 bg-blue-50/40">
          <div className="flex flex-col items-center">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 42px)', columnGap: 2 }}>
              {CUADRANTES.temporalInferiorDerecho.map(n => (
                <PiezaDental
                  key={`tempinf-der-${n}`}
                  numero={n}
                  estado={estadoOdontograma[n] ?? estadoInicialDiente()}
                  onZonaClick={handleZonaClick}
                  numeroArriba={false}
                  imageData={IMAGENES_PIEZAS[n]}
                />
              ))}
            </div>
            <span className="text-[8px] text-blue-400 mt-0.5">Temp. Inf. Der.</span>
          </div>
          <div className="w-px h-8 bg-blue-300 self-center mx-1" />
          <div className="flex flex-col items-center">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 42px)', columnGap: 2 }}>
              {CUADRANTES.temporalInferiorIzquierdo.map(n => (
                <PiezaDental
                  key={`tempinf-izq-${n}`}
                  numero={n}
                  estado={estadoOdontograma[n] ?? estadoInicialDiente()}
                  onZonaClick={handleZonaClick}
                  numeroArriba={false}
                  imageData={IMAGENES_PIEZAS[n]}
                />
              ))}
            </div>
            <span className="text-[8px] text-blue-400 mt-0.5">Temp. Inf. Izq.</span>
          </div>
        </div>

      </div>

      {/* ----------------------------------------------------------------- */}
      {/* LEYENDA DE COLORES                                                 */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-wrap gap-3 justify-center pt-2 border-t border-gray-100 w-full">
        {(Object.keys(CONDICIONES) as Condicion[]).filter(c => c !== "sano").map((cond) => (
          <div key={cond} className="flex items-center gap-1 text-xs text-gray-600">
            <span
              className="inline-block w-3 h-3 rounded-sm border border-gray-300"
              style={{ backgroundColor: CONDICIONES[cond].color }}
            />
            {CONDICIONES[cond].label}
          </div>
        ))}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* BOTÓN RESET y PREVISUALIZAR SALIDA */}
      <div className="flex flex-row gap-2 mt-1">
        <button
          onClick={handleReset}
          className="px-4 py-1.5 text-xs rounded border border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
        >
          Limpiar odontograma
        </button>
        <button
          onClick={() => setShowPreview(true)}
          className="px-4 py-1.5 text-xs rounded border border-blue-300 text-blue-600 hover:bg-blue-50 hover:text-blue-800 transition-colors"
        >
          Previsualizar salida
        </button>
      </div>
      {/* MODAL DE PREVISUALIZACIÓN DE SALIDA */}
      {showPreview && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.2)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 2px 16px #0002', padding: 24, maxWidth: 600, maxHeight: '80vh', overflow: 'auto' }}>
            <div className="flex flex-row justify-between items-center mb-2">
              <span className="font-bold text-gray-700">Previsualización de salida JSON</span>
              <button onClick={() => setShowPreview(false)} className="ml-4 px-2 py-0.5 rounded text-xs border border-gray-300 text-gray-500 hover:bg-gray-100">Cerrar</button>
            </div>
            <pre style={{ fontSize: 12, background: '#f3f4f6', padding: 12, borderRadius: 4, maxHeight: 400, overflow: 'auto' }}>{JSON.stringify(estadoOdontograma, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default Odontograma;
