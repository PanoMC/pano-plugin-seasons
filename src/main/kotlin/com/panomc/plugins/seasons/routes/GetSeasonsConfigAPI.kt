package com.panomc.plugins.seasons.routes

import com.panomc.platform.annotation.Endpoint
import com.panomc.platform.model.*
import com.panomc.platform.schema.EndpointDoc
import com.panomc.platform.schema.dsl.ValidationHandlerBuilder
import com.panomc.plugins.seasons.SeasonsPlugin
import com.panomc.plugins.seasons.config.SeasonsSettings
import io.vertx.ext.web.RoutingContext
import io.vertx.ext.web.validation.ValidationHandler
import io.vertx.json.schema.SchemaRepository
import io.vertx.json.schema.common.dsl.Schemas.objectSchema

@Endpoint
class GetSeasonsConfigAPI(
    private val plugin: SeasonsPlugin,
) : Api() {
    override val paths = listOf(Path("/config", RouteType.GET))

    override val doc = EndpointDoc(
        summary = "The Seasons settings the site runs with.",
        tag = "seasons",
        response = objectSchema()
    )

    override fun getValidationHandler(schemaRepository: SchemaRepository): ValidationHandler =
        ValidationHandlerBuilder.create(schemaRepository).build()

    override suspend fun handle(context: RoutingContext): Result =
        Successful(SeasonsSettings.toPublic(plugin.config))
}
