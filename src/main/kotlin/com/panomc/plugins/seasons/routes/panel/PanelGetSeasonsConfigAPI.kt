package com.panomc.plugins.seasons.routes.panel

import com.panomc.platform.annotation.Endpoint
import com.panomc.platform.auth.AuthProvider
import com.panomc.platform.model.*
import com.panomc.platform.schema.dsl.ValidationHandlerBuilder
import com.panomc.plugins.seasons.SeasonsPlugin
import com.panomc.plugins.seasons.config.SeasonsSettings
import com.panomc.plugins.seasons.permission.ManageSeasonsPermission
import io.vertx.ext.web.RoutingContext
import io.vertx.ext.web.validation.ValidationHandler
import io.vertx.json.schema.SchemaRepository

@Endpoint
class PanelGetSeasonsConfigAPI(
    private val plugin: SeasonsPlugin,
) : PanelApi() {
    override val paths = listOf(Path("/config", RouteType.GET))

    private val authProvider by lazy { plugin.applicationContext.getBean(AuthProvider::class.java) }

    override fun getValidationHandler(schemaRepository: SchemaRepository): ValidationHandler =
        ValidationHandlerBuilder.create(schemaRepository).build()

    override suspend fun handle(context: RoutingContext): Result {
        authProvider.requirePermission(ManageSeasonsPermission(), context)

        return Successful(SeasonsSettings.toPublic(plugin.config))
    }
}
