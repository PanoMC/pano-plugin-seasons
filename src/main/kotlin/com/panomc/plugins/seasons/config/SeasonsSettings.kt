package com.panomc.plugins.seasons.config

import io.vertx.core.json.JsonArray
import io.vertx.core.json.JsonObject

/**
 * Converts between the stored [SeasonsConfig] (flat, HOCON friendly) and the settings object the site and the
 * panel use (`city` as one object or null), and checks a panel update.
 */
object SeasonsSettings {
    val WEATHERS = listOf("snow", "rain", "sakura", "leaves", "fireflies", "starfall")
    private val WINDS = setOf("none", "gentleLeft", "strongLeft", "gentleRight", "strongRight", "changing")
    private val ENUMS = mapOf(
        "schedule" to setOf("ALWAYS", "WINTER", "DATES"),
        "source" to setOf("MANUAL", "OUTSIDE", "RANDOM", "SEASON"),
        "weather" to WEATHERS.toSet(),
        "wind" to WINDS,
        "layer" to setOf("FRONT", "BEHIND"),
    )
    private val RANGES = mapOf(
        "density" to (0.2 to 3.0),
        "speed" to (0.3 to 2.0),
        "pileSpeed" to (0.2 to 3.0),
        "maxPlaced" to (1.0 to 200.0),
        "panelAmount" to (0.1 to 1.0),
    )
    private val TEXT_LIMITS = mapOf("surfaces" to 500, "excludeSurfaces" to 500, "excludedPaths" to 2000)
    private val DATE = Regex("^(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$")
    private val CITY_KEYS = listOf("cityName", "cityAdmin", "cityCountry", "cityLatitude", "cityLongitude")

    /** The settings as the site and the panel see them. */
    fun toPublic(config: SeasonsConfig): Map<String, Any?> {
        val json = JsonObject.mapFrom(config)
        json.remove("version")
        CITY_KEYS.forEach { json.remove(it) }
        json.put(
            "city",
            if (config.cityName.isBlank()) null else JsonObject()
                .put("name", config.cityName)
                .put("admin", config.cityAdmin)
                .put("country", config.cityCountry)
                .put("latitude", config.cityLatitude)
                .put("longitude", config.cityLongitude)
        )
        return json.map
    }

    /**
     * Applies a panel update on top of the stored config. Unknown keys are ignored.
     *
     * @return the new stored form, or null when a value is invalid.
     */
    fun merge(current: SeasonsConfig, body: JsonObject): JsonObject? {
        val out = JsonObject.mapFrom(current)
        val defaults = JsonObject.mapFrom(SeasonsConfig())

        for (key in body.fieldNames()) {
            val value = body.getValue(key)

            when {
                key == "city" -> {
                    if (value == null) {
                        out.put("cityName", "").put("cityAdmin", "").put("cityCountry", "")
                            .put("cityLatitude", 0.0).put("cityLongitude", 0.0)
                        continue
                    }
                    val city = value as? JsonObject ?: return null
                    val name = city.getValue("name") as? String ?: return null
                    val lat = (city.getValue("latitude") as? Number)?.toDouble() ?: return null
                    val lon = (city.getValue("longitude") as? Number)?.toDouble() ?: return null
                    if (name.isBlank() || name.length > 120 || lat !in -90.0..90.0 || lon !in -180.0..180.0) return null
                    out.put("cityName", name)
                        .put("cityAdmin", (city.getValue("admin") as? String ?: "").take(120))
                        .put("cityCountry", (city.getValue("country") as? String ?: "").take(120))
                        .put("cityLatitude", lat)
                        .put("cityLongitude", lon)
                }

                key == "randomPool" -> {
                    val list = value as? JsonArray ?: return null
                    val pool = WEATHERS.filter { list.contains(it) }
                    if (pool.isEmpty()) return null
                    out.put("randomPool", JsonArray(pool))
                }

                key == "startDate" || key == "endDate" -> {
                    val text = value as? String ?: return null
                    if (!DATE.matches(text)) return null
                    out.put(key, text)
                }

                ENUMS.containsKey(key) -> {
                    if (value !is String || value !in ENUMS.getValue(key)) return null
                    out.put(key, value)
                }

                RANGES.containsKey(key) -> {
                    val number = (value as? Number)?.toDouble() ?: return null
                    val (lo, hi) = RANGES.getValue(key)
                    if (number.isNaN() || number < lo || number > hi) return null
                    out.put(key, if (key == "maxPlaced") number.toInt() else number)
                }

                TEXT_LIMITS.containsKey(key) -> {
                    val text = value as? String ?: return null
                    if (text.length > TEXT_LIMITS.getValue(key)) return null
                    out.put(key, text)
                }

                defaults.getValue(key) is Boolean -> {
                    if (value !is Boolean) return null
                    out.put(key, value)
                }
            }
        }

        return out
    }
}
