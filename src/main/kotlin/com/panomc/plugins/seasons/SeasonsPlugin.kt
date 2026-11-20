package com.panomc.plugins.seasons

import com.panomc.platform.api.PanoPlugin
import com.panomc.platform.api.config.PluginConfigManager
import com.panomc.plugins.seasons.config.SeasonsConfig
import com.panomc.plugins.seasons.weather.OpenMeteo
import io.vertx.ext.web.client.WebClient

/** Seasons for Pano: snow, rain, cherry blossom, autumn leaves, fireflies and shooting stars on the site. */
class SeasonsPlugin : PanoPlugin() {
    lateinit var configManager: PluginConfigManager<SeasonsConfig>
        private set

    val openMeteo by lazy { OpenMeteo(applicationContext.getBean(WebClient::class.java)) }

    val config: SeasonsConfig get() = configManager.config

    override suspend fun onStart() {
        configManager = PluginConfigManager(this, SeasonsConfig::class.java)
        pluginBeanContext.beanFactory.registerSingleton(PluginConfigManager::class.java.name, configManager)
    }
}
