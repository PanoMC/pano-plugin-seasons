package com.panomc.plugins.seasons.config

import com.panomc.platform.api.config.PluginConfig

/**
 * Every setting of the plugin. The site and panel see it through [SeasonsSettings] (the city as one object);
 * keep it in step with `src/theme/seasons/config.js`.
 */
class SeasonsConfig(
    val enabled: Boolean = true,
    val schedule: String = "ALWAYS",
    val startDate: String = "12-01",
    val endDate: String = "01-15",

    val source: String = "MANUAL",
    val weather: String = "snow",
    val randomPool: List<String> = SeasonsSettings.WEATHERS,
    val cityName: String = "",
    val cityAdmin: String = "",
    val cityCountry: String = "",
    val cityLatitude: Double = 0.0,
    val cityLongitude: Double = 0.0,

    val heavySnow: Boolean = false,
    val lightning: Boolean = true,
    val wind: String = "none",
    val density: Double = 1.0,
    val speed: Double = 1.0,

    val settle: Boolean = true,
    val groundSnow: Boolean = true,
    val pileSpeed: Double = 1.5,
    val surfaces: String = "",
    val excludeSurfaces: String = "",

    val snowballs: Boolean = true,
    val snowmen: Boolean = true,
    val dressUp: Boolean = true,
    val trees: Boolean = true,
    val decorations: Boolean = true,
    val maxPlaced: Int = 20,

    val visitors: Boolean = true,
    val santa: Boolean = true,
    val snowmenFight: Boolean = true,
    val yeti: Boolean = true,
    val plough: Boolean = true,
    val oftenVisits: Boolean = false,

    val wallpaper: Boolean = false,
    val wallpaperDayNight: Boolean = true,

    val layer: String = "FRONT",
    val panel: Boolean = true,
    val panelAmount: Double = 0.3,
    val mobile: Boolean = true,
    val reducedMotion: Boolean = true,
    val visitorControls: Boolean = true,
    val excludedPaths: String = "",
    version: Int = 1
) : PluginConfig(version)
