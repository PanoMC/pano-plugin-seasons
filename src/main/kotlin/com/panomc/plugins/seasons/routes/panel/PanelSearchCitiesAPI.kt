package com.panomc.plugins.seasons.routes.panel

import com.panomc.platform.annotation.Endpoint
import com.panomc.platform.auth.AuthProvider
import com.panomc.platform.model.*
import com.panomc.platform.schema.dsl.ValidationHandlerBuilder
import com.panomc.plugins.seasons.SeasonsPlugin
import com.panomc.plugins.seasons.permission.ManageSeasonsPermission
import io.vertx.ext.web.RoutingContext
import io.vertx.ext.web.validation.ValidationHandler
import com.panomc.platform.schema.dsl.Parameters.optionalParam
import com.panomc.platform.schema.dsl.Parameters.param
import io.vertx.json.schema.SchemaRepository
import io.vertx.json.schema.common.dsl.Schemas.stringSchema

/** City search for "the weather outside" (Open-Meteo geocoding). */
@Endpoint
class PanelSearchCitiesAPI(
    private val plugin: SeasonsPlugin,
) : PanelApi() {
    override val paths = listOf(Path("/cities", RouteType.GET))

    private val authProvider by lazy { plugin.applicationContext.getBean(AuthProvider::class.java) }

    override fun getValidationHandler(schemaRepository: SchemaRepository): ValidationHandler =
        ValidationHandlerBuilder.create(schemaRepository)
            .queryParameter(param("q", stringSchema()))
            .queryParameter(optionalParam("lang", stringSchema()))
            .build()

    override suspend fun handle(context: RoutingContext): Result {
        authProvider.requirePermission(ManageSeasonsPermission(), context)

        val params = getParameters(context)
        val query = params.queryParameter("q")?.string?.trim().orEmpty().take(80)
        val lang = params.queryParameter("lang")?.string?.takeIf { Regex("^[a-z]{2}$").matches(it) } ?: "en"

        if (query.length < 2) return Successful(mapOf("items" to emptyList<Any>()))

        return Successful(mapOf("items" to plugin.openMeteo.search(query, lang).list))
    }
}
