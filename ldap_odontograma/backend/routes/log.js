// backend/routes/log.js
// Endpoint para exponer estadísticas y registros de la tabla log
// Cumple la regla de documentación exhaustiva del proyecto

import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/**
 * GET /api/log/stats
 * Devuelve todos los registros de la tabla log para análisis estadístico en frontend.
 * - No pagina, retorna todo el dataset (ajustar si la tabla crece mucho).
 * - El frontend espera un array de objetos con los campos de la tabla log.
 * - Se documenta cada paso para trazabilidad y estudio.
 */
router.get("/stats", async (req, res) => {
  try {
    // Consulta todos los registros de la tabla log usando el pool pg compartido
    const result = await pool.query("SELECT * FROM log ORDER BY logfecha DESC");
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener logs:", error);
    res.status(500).json({ error: "Error al obtener logs" });
  }
});

export default router;

/*
Documentación didáctica:
- Este archivo define un endpoint GET /api/log/stats que expone todos los registros de la tabla log.
- Usa Prisma Client para acceder a la base de datos y obtener los datos.
- El endpoint está pensado para ser consumido por el panel de estadísticas del frontend.
- Si la tabla log crece mucho, se recomienda agregar paginación, filtros o un endpoint resumido.
- El código está documentado paso a paso para facilitar el estudio y la extensión.
*/
