package com.panomc.plugins.seasons.routes.panel

import com.panomc.platform.annotation.Endpoint
import com.panomc.platform.auth.AuthProvider
import com.panomc.platform.db.DatabaseManager
import com.panomc.platform.error.BadRequest
import com.panomc.platform.model.*
import com.panomc.platform.schema.dsl.Bodies
import com.panomc.platform.schema.dsl.ValidationHandlerBuilder
import com.panomc.plugins.seasons.SeasonsPlugin
import com.panomc.plugins.seasons.config.SeasonsSettings
import com.panomc.plugins.seasons.log.UpdatedSeasonsConfigLog
import com.panomc.plugins.seasons.permission.ManageSeasonsPermission
import io.vertx.ext.web.RoutingContext
import io.vertx.ext.web.validation.ValidationHandler
import io.vertx.json.schema.SchemaRepository
import io.vertx.json.schema.common.dsl.Schemas.objectSchema

/** Saves the settings. The body may hold any subset of the settings; every value is checked in [SeasonsSettings.merge]. */
@Endpoint
class PanelUpdateSeasonsConfigAPI(
    private val plugin: SeasonsPlugin,
) : PanelApi() {
    override val paths = listOf(Path("/config", RouteType.PUT))

    private val authProvider by lazy { plugin.applicationContext.getBean(AuthProvider::class.java) }

    private val databaseManager by lazy { plugin.applicationContext.getBean(DatabaseManager::class.java) }

    override fun getValidationHandler(schemaRepository: SchemaRepository): ValidationHandler =
        ValidationHandlerBuilder.create(schemaRepository)
            .body(Bodies.json(objectSchema().allowAdditionalProperties(true)))
            .build()

    override suspend fun handle(context: RoutingContext): Result {
        authProvider.requirePermission(ManageSeasonsPermission(), context)

        val body = context.body().asJsonObject() ?: throw BadRequest()
        val merged = SeasonsSettings.merge(plugin.config, body) ?: throw BadRequest()

        plugin.configManager.saveConfig(merged)

        val userId = authProvider.getUserIdFromRoutingContext(context)
        val sqlClient = databaseManager.getSqlClient()
        val username = databaseManager.userDao.getUsernameFromUserId(userId, sqlClient) ?: "Unknown"

        databaseManager.panelActivityLogDao.add(UpdatedSeasonsConfigLog(userId, username, plugin.pluginId), sqlClient)

        return Successful(SeasonsSettings.toPublic(plugin.config))
    }
}
