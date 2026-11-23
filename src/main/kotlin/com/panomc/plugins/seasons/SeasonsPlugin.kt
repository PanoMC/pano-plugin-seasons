package com.panomc.plugins.seasons

import com.panomc.platform.api.PanoPlugin
import com.panomc.platform.api.config.PluginConfigManager
import com.panomc.plugins.seasons.config.SeasonsConfig
import com.panomc.plugins.seasons.weather.OpenMeteo
import io.vertx.ext.web.client.WebClient

/** Seasons for Pano: snow, rain, cherry blossom, autumn leaves, fireflies and shooting stars on the site. */
class SeasonsPlugin : PanoPlugin() {
    private var currentConfigManager: PluginConfigManager<SeasonsConfig>? = null

    val configManager: PluginConfigManager<SeasonsConfig>
        get() = currentConfigManager ?: error("Seasons is not started")

    val openMeteo by lazy { OpenMeteo(applicationContext.getBean(WebClient::class.java)) }

    val config: SeasonsConfig get() = configManager.config

    override suspend fun onStart() {
        // A stop / start in the same context keeps the manager: a second one would leak its config watcher.
        if (currentConfigManager == null) {
            currentConfigManager = PluginConfigManager(this, SeasonsConfig::class.java)
        }
    }

    override suspend fun onDisable() {
        currentConfigManager?.close()
        currentConfigManager = null
    }
}
