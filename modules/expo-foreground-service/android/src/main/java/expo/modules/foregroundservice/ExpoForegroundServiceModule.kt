package expo.modules.foregroundservice

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoForegroundServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoForegroundService")

    AsyncFunction<Unit>("startTimelapseForeground") { options: Map<String, Any?> ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      TimelapseForegroundService.start(ctx, options)
    }

    AsyncFunction<Unit>("stopTimelapseForeground") {
      val ctx = appContext.reactContext ?: return@AsyncFunction
      TimelapseForegroundService.stop(ctx)
    }
  }
}