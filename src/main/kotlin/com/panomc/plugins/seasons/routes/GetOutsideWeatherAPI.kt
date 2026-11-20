package com.panomc.plugins.seasons.routes

import com.panomc.platform.annotation.Endpoint
import com.panomc.platform.model.*
import com.panomc.platform.schema.EndpointDoc
import com.panomc.platform.schema.dsl.ValidationHandlerBuilder
import com.panomc.plugins.seasons.SeasonsPlugin
import io.vertx.ext.web.RoutingContext
import io.vertx.ext.web.validation.ValidationHandler
import io.vertx.json.schema.SchemaRepository
import io.vertx.json.schema.common.dsl.Schemas.booleanSchema
import io.vertx.json.schema.common.dsl.Schemas.objectSchema
import io.vertx.json.schema.common.dsl.Schemas.stringSchema

/**
 * The weather outside in the configured city, as a Seasons effect (`weather` is null when the source is not
 * OUTSIDE, no city is set or the lookup failed).
 */
@Endpoint
class GetOutsideWeatherAPI(
    private val plugin: SeasonsPlugin,
) : Api() {
    override val paths = listOf(Path("/weather", RouteType.GET))

    override val doc = EndpointDoc(
        summary = "The weather outside in the configured city.",
        tag = "seasons",
        response = objectSchema()
            .optionalProperty("weather", stringSchema())
            .requiredProperty("heavy", booleanSchema())
            .requiredProperty("lightning", booleanSchema())
    )

    override fun getValidationHandler(schemaRepository: SchemaRepository): ValidationHandler =
        ValidationHandlerBuilder.create(schemaRepository).build()

    override suspend fun handle(context: RoutingContext): Result {
        val config = plugin.config
        val outside = if (config.source == "OUTSIDE" && config.cityName.isNotBlank()) {
            plugin.openMeteo.outside(config.cityLatitude, config.cityLongitude)
        } else null

        return Successful(
            mapOf(
                "weather" to outside?.weather,
                "heavy" to (outside?.heavy ?: false),
                "lightning" to (outside?.lightning ?: false),
            )
        )
    }
}
