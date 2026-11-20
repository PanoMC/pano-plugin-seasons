package com.panomc.plugins.seasons.weather

import io.vertx.core.json.JsonArray
import io.vertx.core.json.JsonObject
import io.vertx.ext.web.client.WebClient
import io.vertx.kotlin.coroutines.coAwait
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.LocalDate
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

/**
 * The weather outside (Open-Meteo, no key needed; data CC BY 4.0). Pano asks it, never the visitor's browser, so no
 * visitor address reaches a third party. One forecast per city is cached for [TTL_MS].
 *
 * The condition mapping is Frostpane's (`fp-sources` `openmeteo::map_condition`).
 */
class OpenMeteo(private val http: WebClient) {
    data class Outside(val weather: String, val heavy: Boolean, val lightning: Boolean)

    private data class Cached(val at: Long, val value: Outside)

    private val cache = ConcurrentHashMap<String, Cached>()

    suspend fun outside(latitude: Double, longitude: Double): Outside? {
        val key = String.format(Locale.ROOT, "%.3f,%.3f", latitude, longitude)
        val now = System.currentTimeMillis()
        cache[key]?.let { if (now - it.at < TTL_MS) return it.value }

        val url = String.format(
            Locale.ROOT,
            "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&current=weather_code,is_day,snowfall",
            latitude, longitude
        )
        val body = try {
            val response = http.getAbs(url).timeout(8_000).send().coAwait()
            if (response.statusCode() != 200) null else response.bodyAsJsonObject()
        } catch (_: Exception) {
            null
        }
        // A failed lookup keeps the last answer for a while instead of asking again on every page view.
        val current = body?.getJsonObject("current") ?: return cache[key]?.value
        val code = (current.getValue("weather_code") as? Number)?.toInt() ?: return cache[key]?.value
        val isDay = when (val v = current.getValue("is_day")) {
            is Boolean -> v
            is Number -> v.toInt() != 0
            else -> true
        }
        val interval = (current.getValue("interval") as? Number)?.toDouble() ?: 0.0
        val snowfall = ((current.getValue("snowfall") as? Number)?.toDouble() ?: 0.0) *
                (if (interval > 0) 3600.0 / interval else 1.0)

        val value = map(code, isDay, snowfall, LocalDate.now().monthValue, latitude < 0)
        cache[key] = Cached(now, value)
        return value
    }

    /** City search for the panel: `{ name, admin, country, latitude, longitude }` items. */
    suspend fun search(query: String, language: String): JsonArray {
        val url = "https://geocoding-api.open-meteo.com/v1/search?name=" +
                URLEncoder.encode(query.trim(), StandardCharsets.UTF_8) +
                "&count=10&format=json&language=" + URLEncoder.encode(language, StandardCharsets.UTF_8)
        val body = try {
            val response = http.getAbs(url).timeout(8_000).send().coAwait()
            if (response.statusCode() != 200) null else response.bodyAsJsonObject()
        } catch (_: Exception) {
            null
        }
        val items = JsonArray()
        val results = body?.getJsonArray("results") ?: return items
        for (i in 0 until results.size()) {
            val r = results.getValue(i) as? JsonObject ?: continue
            val name = r.getString("name") ?: continue
            val lat = (r.getValue("latitude") as? Number)?.toDouble() ?: continue
            val lon = (r.getValue("longitude") as? Number)?.toDouble() ?: continue
            items.add(
                JsonObject()
                    .put("name", name)
                    .put("admin", r.getString("admin1") ?: "")
                    .put("country", r.getString("country") ?: "")
                    .put("latitude", lat)
                    .put("longitude", lon)
            )
        }
        return items
    }

    companion object {
        const val TTL_MS = 15 * 60 * 1000L
        private const val HEAVY_SNOWFALL_CM = 1.0
        private val NORTH = listOf(
            "snow", "snow", "sakura", "sakura", "sakura", "rain",
            "fireflies", "starfall", "leaves", "leaves", "leaves", "snow"
        )

        /** Season pick for a 1-based month; the south is six months off. */
        fun season(month: Int, south: Boolean): String = NORTH[(month - 1 + if (south) 6 else 0) % 12]

        fun map(code: Int, isDay: Boolean, snowfallCm: Double, month: Int, south: Boolean): Outside = when (code) {
            in 71..77, 85, 86 -> Outside("snow", code == 75 || code == 86 || snowfallCm >= HEAVY_SNOWFALL_CM, false)
            in 51..67, in 80..82 -> Outside("rain", false, false)
            in 95..99 -> Outside("rain", false, true)
            in 0..3 -> if (isDay) Outside(season(month, south), false, false) else Outside("starfall", false, false)
            else -> Outside(season(month, south), false, false)
        }
    }
}
